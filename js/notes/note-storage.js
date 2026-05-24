/**
 * Canonical note storage pipeline.
 * Source markdown is immutable once saved (note_sources.immutable).
 */

import { getClient } from "../core/get-client.js";
import { buildTopicLinkRows, resolveTopicLinks } from "./note-topic-links.js";

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

  const blockRows = flattenBlocks(parsed).map((row) => ({
    note_id: note.id,
    ...row,
  }));

  let insertedBlocks = [];

  if (blockRows.length) {
    const { data: blocks, error: blocksError } = await sb
      .from("note_blocks")
      .insert(blockRows)
      .select("id, representation_type, sequence_order");

    if (blocksError) {
      await sb.from("notes").delete().eq("id", note.id);
      throw new Error(blocksError.message);
    }

    insertedBlocks = blocks ?? [];
  }

  const topicNames = (parsed?.topic_links ?? []).map((l) => l.name);
  const resolvedTopics = await resolveTopicLinks(sb, topicNames, {
    createMissing: true,
  });

  const linkRows = buildTopicLinkRows(note.id, parsed?.topic_links ?? [], resolvedTopics);

  if (linkRows.length) {
    const { error: linksError } = await sb.from("note_topic_links").insert(linkRows);

    if (linksError) {
      console.warn("note_topic_links insert:", linksError.message);
    }
  }

  return {
    note,
    blockCount: insertedBlocks.length,
    topicLinkCount: linkRows.length,
  };
}

/**
 * Publish a draft note (student-readable).
 */
export async function publishNote(noteId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("notes")
    .update({ status: "published" })
    .eq("id", noteId)
    .select("id, status")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
