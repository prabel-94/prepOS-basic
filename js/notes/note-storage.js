/**
 * Canonical note storage pipeline.
 * Draft refinement updates source markdown and regenerates derived blocks.
 */

import { getClient } from "../core/get-client.js";
import { parseMapMarkdown } from "./map-parser.js";
import {
  buildTopicLinkRows,
  resolveTopicNamesForStorage,
} from "./note-topic-links.js";

const REPRESENTATION_TYPES = [
  "narrative",
  "structural",
  "revision",
  "timeline",
  "interpretations",
];

function flattenBlocks(parsed) {
  const rows = [];

  for (const representationType of REPRESENTATION_TYPES) {
    const blocks = parsed?.representations?.[representationType] ?? [];
    for (const block of blocks) {
      rows.push({
        representation_type: representationType,
        block_type: block.block_type,
        heading: block.heading ?? null,
        content: block.content ?? null,
        hierarchy_level: block.hierarchy_level ?? null,
        sequence_order: block.sequence_order ?? 0,
        metadata_json: block.metadata_json ?? {},
      });
    }
  }

  return rows;
}

function validateParsed(parsed, rawMarkdown) {
  const markdown = String(rawMarkdown ?? "").trim();
  if (!markdown) {
    throw new Error("Semantic markdown cannot be empty.");
  }

  const reps = parsed?.representations ?? {};
  const blockCount = Object.values(reps).reduce(
    (sum, blocks) => sum + (blocks?.length ?? 0),
    0
  );

  if (blockCount === 0) {
    throw new Error(
      "No semantic sections detected. Add anchors such as # [NARRATIVE] before saving."
    );
  }

  return parsed;
}

async function insertBlocksAndLinks(sb, noteId, parsed) {
  const blockRows = flattenBlocks(parsed).map((row) => ({
    note_id: noteId,
    ...row,
  }));

  let blockCount = 0;

  if (blockRows.length) {
    const { data: blocks, error: blocksError } = await sb
      .from("note_blocks")
      .insert(blockRows)
      .select("id");

    if (blocksError) {
      throw new Error(blocksError.message);
    }

    blockCount = blocks?.length ?? 0;
  }

  const topicNames = (parsed?.topic_links ?? []).map((l) => l.name);
  const resolvedTopics = await resolveTopicNamesForStorage(sb, topicNames, {
    createMissing: true,
  });

  const linkRows = buildTopicLinkRows(
    noteId,
    parsed?.topic_links ?? [],
    resolvedTopics
  );

  if (linkRows.length) {
    const { error: linksError } = await sb
      .from("note_topic_links")
      .insert(linkRows);

    if (linksError) {
      console.warn("note_topic_links insert:", linksError.message);
    }
  }

  return {
    blockCount,
    topicLinkCount: linkRows.length,
  };
}

async function clearDerivedStructures(sb, noteId) {
  const { error: linksError } = await sb
    .from("note_topic_links")
    .delete()
    .eq("note_id", noteId);

  if (linksError) {
    throw new Error(linksError.message);
  }

  const { error: blocksError } = await sb
    .from("note_blocks")
    .delete()
    .eq("note_id", noteId);

  if (blocksError) {
    throw new Error(blocksError.message);
  }
}

/**
 * Rebuild blocks + topic links from semantic markdown (draft save).
 */
export async function regenerateDraftFromMarkdown({
  noteId,
  rawMarkdown,
  title,
  language,
}) {
  if (!noteId) {
    throw new Error("noteId is required");
  }

  const markdown = String(rawMarkdown ?? "").trim();
  let parsed;

  try {
    parsed = parseMapMarkdown(markdown);
    validateParsed(parsed, markdown);
  } catch (err) {
    throw new Error(err.message || "Failed to parse semantic markdown.");
  }

  const sb = await getClient();
  const meta = parsed.metadata ?? {};

  const notePatch = {
    map_version: parsed?.source?.map_version ?? meta.map_version ?? null,
    canonical_version:
      parsed?.source?.canonical_version ?? meta.canonical_version ?? null,
    status: "draft",
  };

  if (title?.trim()) {
    notePatch.title = title.trim();
  } else if (meta.title) {
    notePatch.title = meta.title;
  }

  if (language) {
    notePatch.language = language;
  } else if (meta.language) {
    notePatch.language = meta.language;
  }

  const { error: noteError } = await sb
    .from("notes")
    .update(notePatch)
    .eq("id", noteId);

  if (noteError) {
    throw new Error(noteError.message);
  }

  const { data: sources, error: sourceFetchError } = await sb
    .from("note_sources")
    .select("id")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (sourceFetchError) {
    throw new Error(sourceFetchError.message);
  }

  const sourceId = sources?.[0]?.id;

  if (!sourceId) {
    throw new Error("Note source record not found.");
  }

  const { error: sourceUpdateError } = await sb
    .from("note_sources")
    .update({ raw_markdown: markdown })
    .eq("id", sourceId);

  if (sourceUpdateError) {
    throw new Error(sourceUpdateError.message);
  }

  await clearDerivedStructures(sb, noteId);
  const counts = await insertBlocksAndLinks(sb, noteId, parsed);

  return {
    noteId,
    parsed,
    ...counts,
  };
}

/**
 * Persist a parsed canonical note and related rows.
 */
export async function saveCanonicalNote({
  topicId,
  title,
  language = "english",
  status = "draft",
  parsed,
  rawMarkdown,
}) {
  if (!topicId) {
    throw new Error("topicId is required");
  }

  if (!title?.trim()) {
    throw new Error("title is required");
  }

  if (!parsed?.source?.raw_markdown && !rawMarkdown) {
    throw new Error("raw markdown is required");
  }

  const sb = await getClient();
  const markdown = rawMarkdown ?? parsed.source.raw_markdown;
  const meta = parsed?.metadata ?? {};

  const { data: note, error: noteError } = await sb
    .from("notes")
    .insert({
      topic_id: topicId,
      title: title.trim(),
      language: language || meta.language || "english",
      map_version: parsed?.source?.map_version ?? meta.map_version ?? null,
      canonical_version:
        parsed?.source?.canonical_version ?? meta.canonical_version ?? null,
      status,
    })
    .select("id, topic_id, title, language, status, created_at")
    .single();

  if (noteError) {
    throw new Error(noteError.message);
  }

  const { error: sourceError } = await sb.from("note_sources").insert({
    note_id: note.id,
    source_type: parsed?.source?.source_type || "map",
    raw_markdown: markdown,
    raw_html: null,
    immutable: true,
  });

  if (sourceError) {
    await sb.from("notes").delete().eq("id", note.id);
    throw new Error(sourceError.message);
  }

  try {
    validateParsed(parsed, markdown);
  } catch (err) {
    await sb.from("notes").delete().eq("id", note.id);
    throw err;
  }

  const counts = await insertBlocksAndLinks(sb, note.id, parsed);

  return {
    note,
    blockCount: counts.blockCount,
    topicLinkCount: counts.topicLinkCount,
  };
}