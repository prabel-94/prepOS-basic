/**
 * Read selectors for canonical notes + language variants.
 */

import { getClient } from "../core/get-client.js";
import { buildTopicMap } from "./note-topic-links.js";
import {
  createEmptyRepresentations,
} from "./note-representations.js";
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

export function groupBlocksByRepresentation(blocks = []) {
  const grouped = createEmptyRepresentations();

  for (const block of blocks) {
    const key = block.representation_type;
    if (grouped[key]) {
      grouped[key].push(block);
    }
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

export async function loadVariantBundle(variantId) {
  const variant = await fetchVariantById(variantId);

  if (!variant) {
    return null;
  }

  const [blocks, topicLinks] = await Promise.all([
    fetchNoteBlocks(variantId),
    fetchNoteTopicLinks(variantId),
  ]);

  const topicMap = buildTraversalTopicMap(topicLinks);

  return {
    note: variant.notes,
    variant,
    blocks,
    representations: groupBlocksByRepresentation(blocks),
    topicLinks,
    topicMap,
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
