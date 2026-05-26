/**
 * Canonical note + language variant storage pipeline.
 * Always: semantic markdown → parser → regenerate variant structures.
 */

import { getClient } from "../core/get-client.js";
import { parseMapMarkdown } from "./map-parser.js";
import { normalizeLanguage } from "./note-variants.js";
import {
  buildTopicLinkRows,
  resolveTopicNamesForStorage,
} from "./note-topic-links.js";
import { attachSemanticCandidates } from "../anchors/anchor-candidates.js";
import {
  clearVariantAnchorLinks,
  syncVariantAnchorLinks,
} from "../anchors/anchor-storage.js";

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

function resolveVariantMeta(parsed, overrides = {}) {
  const meta = parsed?.metadata ?? {};
  const variant = parsed?.variant ?? {};

  return {
    language: normalizeLanguage(
      overrides.language ?? variant.language ?? meta.language ?? "english"
    ),
    title:
      overrides.title?.trim() ||
      variant.title ||
      meta.title ||
      parsed?.canonical_note?.title ||
      "Untitled Note",
    map_version:
      parsed?.canonical_note?.map_version ??
      parsed?.source?.map_version ??
      meta.map_version ??
      null,
    canonical_version:
      parsed?.canonical_note?.canonical_version ??
      parsed?.source?.canonical_version ??
      meta.canonical_version ??
      null,
  };
}

export async function getCanonicalNoteByTopicId(topicId) {
  const sb = await getClient();
  const { data, error } = await sb
    .from("notes")
    .select(
      `
      id,
      topic_id,
      title,
      map_version,
      canonical_version,
      created_by,
      topics ( id, name )
    `
    )
    .eq("topic_id", topicId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getOrCreateCanonicalNote(topicId, { title, map_version, canonical_version } = {}) {
  const existing = await getCanonicalNoteByTopicId(topicId);
  if (existing) {
    return existing;
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from("notes")
    .insert({
      topic_id: topicId,
      title: title?.trim() || "Untitled Note",
      map_version: map_version ?? null,
      canonical_version: canonical_version ?? null,
    })
    .select(
      `
      id,
      topic_id,
      title,
      map_version,
      canonical_version,
      topics ( id, name )
    `
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchPublishedVariantByLanguage(noteId, language) {
  const sb = await getClient();
  const { data, error } = await sb
    .from("note_variants")
    .select("*")
    .eq("note_id", noteId)
    .eq("language", normalizeLanguage(language))
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchActiveDraftVariantByLanguage(noteId, language) {
  const sb = await getClient();
  const { data, error } = await sb
    .from("note_variants")
    .select("*")
    .eq("note_id", noteId)
    .eq("language", normalizeLanguage(language))
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/** @deprecated Use fetchPublishedVariantByLanguage or fetchActiveDraftVariantByLanguage */
export async function fetchVariantByLanguage(noteId, language) {
  const draft = await fetchActiveDraftVariantByLanguage(noteId, language);
  if (draft?.id) {
    return draft;
  }

  return fetchPublishedVariantByLanguage(noteId, language);
}

/**
 * Clone latest published variant source into a new draft revision (same language stream).
 */
export async function createDraftRevisionFromPublished({
  noteId,
  language,
  title,
} = {}) {
  if (!noteId) {
    throw new Error("noteId is required");
  }

  const normalized = normalizeLanguage(language);
  const published = await fetchPublishedVariantByLanguage(noteId, normalized);

  if (!published?.id) {
    throw new Error(
      `No published ${normalized} variant to revise. Import or publish a variant first.`
    );
  }

  const sb = await getClient();

  const { data: source, error: sourceError } = await sb
    .from("note_sources")
    .select("raw_markdown, source_type")
    .eq("variant_id", published.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  if (!source?.raw_markdown?.trim()) {
    throw new Error("Published variant has no semantic markdown source.");
  }

  const revisionTitle =
    title?.trim() || published.title || "Untitled Note";

  const { data: variant, error: variantError } = await sb
    .from("note_variants")
    .insert({
      note_id: noteId,
      language: normalized,
      title: revisionTitle,
      status: "draft",
    })
    .select("id, note_id, language, title, status, created_at")
    .single();

  if (variantError) {
    throw new Error(variantError.message);
  }

  const { error: insertSourceError } = await sb.from("note_sources").insert({
    variant_id: variant.id,
    source_type: source.source_type || "map",
    raw_markdown: source.raw_markdown,
    raw_html: null,
    immutable: true,
  });

  if (insertSourceError) {
    await sb.from("note_variants").delete().eq("id", variant.id);
    throw new Error(insertSourceError.message);
  }

  const result = await regenerateVariantFromMarkdown({
    variantId: variant.id,
    rawMarkdown: source.raw_markdown,
    title: revisionTitle,
    language: normalized,
    status: "draft",
  });

  return {
    variant: result.variant,
    noteId,
    clonedFromVariantId: published.id,
  };
}

async function insertBlocksAndLinks(sb, variantId, parsed) {
  const blockRows = flattenBlocks(parsed).map((row) => ({
    variant_id: variantId,
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
    variantId,
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

  let anchorLinkCount = 0;

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;
    const language = parsed?.variant?.language ?? parsed?.metadata?.language ?? "english";
    const anchorResult = await syncVariantAnchorLinks(sb, variantId, parsed, {
      language,
      userId,
    });
    anchorLinkCount = anchorResult.anchorLinkCount ?? 0;
  } catch (anchorErr) {
    console.warn("note_anchor_links sync:", anchorErr.message);
  }

  return {
    blockCount,
    topicLinkCount: linkRows.length,
    anchorLinkCount,
  };
}

async function clearDerivedStructures(sb, variantId) {
  try {
    await clearVariantAnchorLinks(sb, variantId);
  } catch (anchorClearErr) {
    console.warn("note_anchor_links clear:", anchorClearErr.message);
  }

  const { error: linksError } = await sb
    .from("note_topic_links")
    .delete()
    .eq("variant_id", variantId);

  if (linksError) {
    throw new Error(linksError.message);
  }

  const { error: blocksError } = await sb
    .from("note_blocks")
    .delete()
    .eq("variant_id", variantId);

  if (blocksError) {
    throw new Error(blocksError.message);
  }
}

/**
 * Rebuild variant blocks + links from semantic markdown.
 */
export async function regenerateVariantFromMarkdown({
  variantId,
  rawMarkdown,
  title,
  language,
  status,
}) {
  if (!variantId) {
    throw new Error("variantId is required");
  }

  const markdown = String(rawMarkdown ?? "").trim();
  let parsed;

  try {
    parsed = attachSemanticCandidates(
      parseMapMarkdown(markdown, { language, title })
    );
    validateParsed(parsed, markdown);
  } catch (err) {
    throw new Error(err.message || "Failed to parse semantic markdown.");
  }

  const sb = await getClient();
  const meta = resolveVariantMeta(parsed, { title, language });

  const variantPatch = {
    title: meta.title,
    language: meta.language,
  };

  if (status) {
    variantPatch.status = status;
  }

  const { data: variant, error: variantError } = await sb
    .from("note_variants")
    .update(variantPatch)
    .eq("id", variantId)
    .select("id, note_id, language, title, status")
    .single();

  if (variantError) {
    throw new Error(variantError.message);
  }

  await sb
    .from("notes")
    .update({
      map_version: meta.map_version,
      canonical_version: meta.canonical_version,
      title: meta.title,
    })
    .eq("id", variant.note_id);

  const { data: sources, error: sourceFetchError } = await sb
    .from("note_sources")
    .select("id")
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (sourceFetchError) {
    throw new Error(sourceFetchError.message);
  }

  const sourceId = sources?.[0]?.id;

  if (!sourceId) {
    throw new Error("Variant source record not found.");
  }

  const { error: sourceUpdateError } = await sb
    .from("note_sources")
    .update({ raw_markdown: markdown })
    .eq("id", sourceId);

  if (sourceUpdateError) {
    throw new Error(sourceUpdateError.message);
  }

  await clearDerivedStructures(sb, variantId);
  const counts = await insertBlocksAndLinks(sb, variantId, parsed);

  return {
    variant,
    parsed,
    ...counts,
  };
}

/**
 * Save or replace a language variant under the topic's canonical note.
 */
export async function saveNoteVariant({
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

  if (!parsed?.source?.raw_markdown && !rawMarkdown) {
    throw new Error("raw markdown is required");
  }

  const markdown = rawMarkdown ?? parsed.source.raw_markdown;
  const normalized = normalizeLanguage(language);
  const meta = resolveVariantMeta(parsed, { title, language: normalized });

  let parsedValidated;

  try {
    parsedValidated = attachSemanticCandidates(
      parseMapMarkdown(markdown, {
        language: normalized,
        title: meta.title,
      })
    );
    validateParsed(parsedValidated, markdown);
  } catch (err) {
    throw new Error(err.message || "Failed to parse semantic markdown.");
  }

  const canonical = await getOrCreateCanonicalNote(topicId, {
    title: meta.title,
    map_version: meta.map_version,
    canonical_version: meta.canonical_version,
  });

  const sb = await getClient();
  const existingDraft = await fetchActiveDraftVariantByLanguage(
    canonical.id,
    normalized
  );

  if (existingDraft?.id) {
    const result = await regenerateVariantFromMarkdown({
      variantId: existingDraft.id,
      rawMarkdown: markdown,
      title: meta.title,
      language: normalized,
      status: "draft",
    });

    if (status === "published") {
      const { publishCanonicalVariant } = await import("./note-publish.js");
      const published = await publishCanonicalVariant(result.variant.id);
      return {
        note: canonical,
        variant: published,
        blockCount: result.blockCount,
        topicLinkCount: result.topicLinkCount,
        isNewVariant: false,
        published: true,
      };
    }

    return {
      note: canonical,
      variant: result.variant,
      blockCount: result.blockCount,
      topicLinkCount: result.topicLinkCount,
      isNewVariant: false,
    };
  }

  const { data: variant, error: variantError } = await sb
    .from("note_variants")
    .insert({
      note_id: canonical.id,
      language: normalized,
      title: meta.title,
      status: "draft",
    })
    .select("id, note_id, language, title, status, created_at")
    .single();

  if (variantError) {
    const hint =
      variantError.code === "42501"
        ? " Permission denied (RLS). Confirm you are logged in as teacher/admin and migrations through 20260610000000 are applied."
        : "";
    throw new Error((variantError.message || "Failed to create language variant.") + hint);
  }

  const { error: sourceError } = await sb.from("note_sources").insert({
    variant_id: variant.id,
    source_type: parsedValidated?.source?.source_type || "map",
    raw_markdown: markdown,
    raw_html: null,
    immutable: true,
  });

  if (sourceError) {
    await sb.from("note_variants").delete().eq("id", variant.id);
    throw new Error(sourceError.message);
  }

  const counts = await insertBlocksAndLinks(sb, variant.id, parsedValidated);

  if (status === "published") {
    const { publishCanonicalVariant } = await import("./note-publish.js");
    const published = await publishCanonicalVariant(variant.id);
    return {
      note: canonical,
      variant: published,
      blockCount: counts.blockCount,
      topicLinkCount: counts.topicLinkCount,
      isNewVariant: true,
      published: true,
    };
  }

  return {
    note: canonical,
    variant,
    blockCount: counts.blockCount,
    topicLinkCount: counts.topicLinkCount,
    isNewVariant: true,
  };
}

/** @deprecated Use saveNoteVariant */
export async function saveCanonicalNote(options) {
  const result = await saveNoteVariant(options);
  return {
    note: result.variant,
    blockCount: result.blockCount,
    topicLinkCount: result.topicLinkCount,
  };
}

/** @deprecated Use regenerateVariantFromMarkdown */
export async function regenerateDraftFromMarkdown({
  noteId,
  rawMarkdown,
  title,
  language,
}) {
  const sb = await getClient();
  const lang = normalizeLanguage(language);

  const { data: variant, error } = await sb
    .from("note_variants")
    .select("id")
    .eq("note_id", noteId)
    .eq("language", lang)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !variant?.id) {
    throw new Error("No language variant found for this note.");
  }

  return regenerateVariantFromMarkdown({
    variantId: variant.id,
    rawMarkdown,
    title,
    language: lang,
    status: "draft",
  });
}
