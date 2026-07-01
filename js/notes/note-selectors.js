/**
 * Read selectors for canonical notes + language variants.
 */

import { getClient } from "../core/get-client.js";
import { buildTopicMap } from "./note-topic-links.js";
import { parseMapMarkdown } from "./map-parser.js";
import {
  createRepresentationBuckets,
} from "./note-section-catalog.js";
import {
  buildLanguageFallbackChain,
  normalizeLanguage,
} from "./note-variants.js";

export async function fetchCanonicalNoteById(noteId) {
  if (!noteId) {
    return null;
  }

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
      created_at,
      updated_at,
      topics ( id, name )
    `
    )
    .eq("id", noteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchVariantById(variantId) {
  if (!variantId) {
    return null;
  }

  const sb = await getClient();

  const { data, error } = await sb
    .from("note_variants")
    .select(
      `
      id,
      note_id,
      language,
      title,
      status,
      created_at,
      updated_at,
      scheduled_delete_at,
      section_extensions,
      notes (
        id,
        topic_id,
        title,
        topics ( id, name )
      )
    `
    )
    .eq("id", variantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchVariantsForNote(noteId, { includeArchived = false } = {}) {
  const sb = await getClient();

  let query = sb
    .from("note_variants")
    .select("id, language, title, status, updated_at, scheduled_delete_at")
    .eq("note_id", noteId)
    .order("language")
    .order("updated_at", { ascending: false });

  if (!includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Archived variants for a canonical note, optionally filtered by language.
 * @param {string} noteId
 * @param {string} [language]
 */
export async function fetchArchivedVariantsForNote(noteId, language) {
  const variants = await fetchVariantsForNote(noteId, { includeArchived: true });
  const normalized = language ? normalizeLanguage(language) : null;

  return variants
    .filter((variant) => variant.status === "archived")
    .filter((variant) =>
      normalized ? normalizeLanguage(variant.language) === normalized : true
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at ?? 0).getTime() -
        new Date(a.updated_at ?? 0).getTime()
    );
}

export async function fetchNoteSource(variantId) {
  if (!variantId) {
    return null;
  }

  const sb = await getClient();

  const { data, error } = await sb
    .from("note_sources")
    .select("id, variant_id, raw_markdown, source_type, created_at")
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchNoteBlocks(variantId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("note_blocks")
    .select("*")
    .eq("variant_id", variantId)
    .order("representation_type")
    .order("sequence_order");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Load one MSMDF representation layer for a variant (bilingual section flip).
 *
 * @param {string} variantId
 * @param {string} representationType
 */
export async function fetchRepresentationLayer(variantId, representationType) {
  if (!variantId || !representationType) {
    return null;
  }

  const sb = await getClient();

  const [variant, blocksResult, topicLinks] = await Promise.all([
    fetchVariantById(variantId),
    sb
      .from("note_blocks")
      .select("*")
      .eq("variant_id", variantId)
      .eq("representation_type", representationType)
      .order("sequence_order"),
    fetchNoteTopicLinks(variantId),
  ]);

  if (!variant) {
    return null;
  }

  if (blocksResult.error) {
    throw new Error(blocksResult.error.message);
  }

  const blocks = blocksResult.data ?? [];
  const topicMap = buildTraversalTopicMap(topicLinks);
  const catalogContext = {
    customDefinitions: Array.isArray(variant.section_extensions)
      ? variant.section_extensions
      : [],
  };
  const representations = createRepresentationBuckets(catalogContext);
  representations[representationType] = blocks;

  return {
    variant,
    blocks,
    representations,
    topicMap,
    sectionExtensions: catalogContext.customDefinitions,
  };
}

export async function fetchNoteTopicLinks(variantId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("note_topic_links")
    .select(
      `
      id,
      linked_topic_id,
      linked_topic_name,
      topics ( id, name )
    `
    )
    .eq("variant_id", variantId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchTopicById(topicId) {
  if (!topicId) {
    return null;
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from("topics")
    .select("id, name")
    .eq("id", topicId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchCanonicalNoteByTopicId(topicId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("notes")
    .select("id, topic_id, title, topics ( id, name )")
    .eq("topic_id", topicId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Resolve published variant for a topic with language preference + fallback.
 */
export async function fetchPublishedVariantForTopic(topicId, preferLanguage = "english") {
  const canonical = await fetchCanonicalNoteByTopicId(topicId);
  if (!canonical?.id) {
    return null;
  }

  const chain = buildLanguageFallbackChain(preferLanguage);
  const sb = await getClient();

  for (const lang of chain) {
    const { data, error } = await sb
      .from("note_variants")
      .select("id, note_id, language, title, status, updated_at")
      .eq("note_id", canonical.id)
      .eq("language", lang)
      .eq("status", "published")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      return { canonical, variant: data };
    }
  }

  return null;
}

/** @deprecated alias */
export async function fetchNoteById(noteId) {
  return fetchCanonicalNoteById(noteId);
}

export function groupBlocksByRepresentation(blocks = [], context = {}) {
  const catalogContext = {
    customDefinitions: context.customDefinitions ?? [],
  };
  const grouped = createRepresentationBuckets(catalogContext);

  for (const block of blocks) {
    const key = block.representation_type;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(block);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort(
      (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)
    );
  }

  return grouped;
}

export function buildTraversalTopicMap(topicLinks = []) {
  const map = {};

  for (const link of topicLinks) {
    const name = (link.linked_topic_name ?? link.topics?.name ?? "").trim();
    const topicId = link.linked_topic_id ?? link.topics?.id;

    if (!name || !topicId) {
      continue;
    }

    map[name] = { id: topicId, topic_id: topicId, title: name };
  }

  return map;
}

function countBlocksPerRepresentation(representations = {}) {
  const counts = {};

  for (const [key, blocks] of Object.entries(representations)) {
    counts[key] = blocks?.length ?? 0;
  }

  return counts;
}

function representationsFromParsed(parsed, context = {}) {
  const grouped = createRepresentationBuckets(context);

  for (const [key, blocks] of Object.entries(parsed?.representations ?? {})) {
    grouped[key] = (blocks ?? []).map((block, index) => ({
      representation_type: key,
      block_type: block.block_type,
      heading: block.heading ?? null,
      content: block.content ?? null,
      hierarchy_level: block.hierarchy_level ?? null,
      sequence_order: index,
      metadata_json: block.metadata_json ?? {},
    }));
  }

  return grouped;
}

function representationsMismatch(stored = {}, parsed = {}) {
  const keys = new Set([...Object.keys(stored), ...Object.keys(parsed)]);

  for (const key of keys) {
    if ((stored[key]?.length ?? 0) !== (parsed[key]?.length ?? 0)) {
      return true;
    }
  }

  return false;
}

/**
 * Prefer parsed source when stored blocks are out of sync (draft preview vs DB drift).
 */
export function resolveRepresentationsFromSource({
  blocks = [],
  rawMarkdown,
  catalogContext = {},
}) {
  const stored = groupBlocksByRepresentation(blocks, catalogContext);
  const markdown = String(rawMarkdown ?? "").trim();

  if (!markdown) {
    return stored;
  }

  const parsed = parseMapMarkdown(markdown, {
    sectionExtensions: catalogContext.customDefinitions ?? [],
  });
  const fromSource = representationsFromParsed(parsed, catalogContext);

  if (!representationsMismatch(stored, fromSource)) {
    return stored;
  }

  console.warn("[loadVariantBundle] Stored blocks differ from semantic source; using parsed source.", {
    stored: countBlocksPerRepresentation(stored),
    parsed: countBlocksPerRepresentation(fromSource),
  });

  return fromSource;
}

export async function loadVariantBundle(variantId) {
  const variant = await fetchVariantById(variantId);

  if (!variant) {
    return null;
  }

  const [blocks, topicLinks, source] = await Promise.all([
    fetchNoteBlocks(variantId),
    fetchNoteTopicLinks(variantId),
    fetchNoteSource(variantId),
  ]);

  const topicMap = buildTraversalTopicMap(topicLinks);

  const catalogContext = {
    customDefinitions: Array.isArray(variant.section_extensions)
      ? variant.section_extensions
      : [],
  };

  const representations = resolveRepresentationsFromSource({
    blocks,
    rawMarkdown: source?.raw_markdown,
    catalogContext,
  });

  return {
    note: variant.notes,
    variant,
    blocks,
    representations,
    topicLinks,
    topicMap,
    sectionExtensions: catalogContext.customDefinitions,
    sourceMarkdown: source?.raw_markdown ?? null,
  };
}

/** @deprecated Use loadVariantBundle */
export async function loadCanonicalNoteBundle(noteId) {
  const sb = await getClient();
  const { data: variant } = await sb
    .from("note_variants")
    .select("id")
    .eq("note_id", noteId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!variant?.id) {
    return null;
  }

  return loadVariantBundle(variant.id);
}
