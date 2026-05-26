/**
 * Anchor lookup helpers (read-only).
 */

import { normalizeAnchorName } from "./anchor-normalization.js";
import { extractWikiLinkNames } from "./anchor-note-renderer.js";

function uniqueNormalized(names = []) {
  const seen = new Set();
  const out = [];

  for (const name of names) {
    const normalized = normalizeAnchorName(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export async function fetchAnchorsByNormalizedNames(sb, normalizedNames = []) {
  const names = uniqueNormalized(normalizedNames);
  if (!names.length) {
    return [];
  }

  const { data, error } = await sb
    .from("anchors")
    .select(
      "id, normalized_name, anchor_type, canonical_topic_id, created_by, created_at, updated_at"
    )
    .in("normalized_name", names);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchAnchorVariantsByNormalizedNames(
  sb,
  normalizedNames = [],
  language
) {
  const names = uniqueNormalized(normalizedNames);
  if (!names.length) {
    return [];
  }

  let query = sb
    .from("anchor_variants")
    .select(
      `
      id,
      anchor_id,
      language,
      display_name,
      normalized_name,
      status,
      anchors (
        id,
        normalized_name,
        anchor_type,
        canonical_topic_id
      )
    `
    )
    .in("normalized_name", names)
    .eq("status", "active");

  if (language) {
    query = query.eq("language", language);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchAnchorAliasesByNormalizedNames(
  sb,
  normalizedNames = [],
  language
) {
  const names = uniqueNormalized(normalizedNames);
  if (!names.length) {
    return [];
  }

  let query = sb
    .from("anchor_aliases")
    .select(
      `
      id,
      anchor_id,
      alias,
      normalized_alias,
      language,
      anchors (
        id,
        normalized_name,
        anchor_type,
        canonical_topic_id
      )
    `
    )
    .in("normalized_alias", names);

  if (language) {
    query = query.eq("language", language);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchTopicsByNormalizedNames(sb, normalizedNames = []) {
  const names = uniqueNormalized(normalizedNames);
  if (!names.length) {
    return [];
  }

  const { data, error } = await sb
    .from("topics")
    .select("id, name, normalized_name")
    .in("normalized_name", names);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchNoteAnchorLinksForVariant(sb, variantId) {
  if (!variantId) {
    return [];
  }

  const { data, error } = await sb
    .from("note_anchor_links")
    .select(
      `
      id,
      variant_id,
      anchor_id,
      state,
      source_text,
      block_key,
      created_at,
      anchors (
        id,
        normalized_name,
        anchor_type,
        canonical_topic_id
      )
    `
    )
    .eq("variant_id", variantId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchNoteAnchorLink(sb, linkId) {
  if (!linkId) {
    return null;
  }

  const { data, error } = await sb
    .from("note_anchor_links")
    .select(
      `
      id,
      variant_id,
      anchor_id,
      state,
      source_text,
      block_key,
      anchors (
        id,
        normalized_name,
        anchor_type,
        canonical_topic_id
      )
    `
    )
    .eq("id", linkId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchAnchorVariantForLanguage(sb, anchorId, language) {
  if (!anchorId) {
    return null;
  }

  const { data, error } = await sb
    .from("anchor_variants")
    .select("id, anchor_id, language, display_name, normalized_name, status")
    .eq("anchor_id", anchorId)
    .eq("language", language)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateNoteAnchorLinkState(sb, linkId, state) {
  const { data, error } = await sb
    .from("note_anchor_links")
    .update({ state })
    .eq("id", linkId)
    .select("id, variant_id, anchor_id, state, source_text, block_key")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Search existing topics for canonical promotion (no creation).
 */
export async function searchTopicsForCanonical(sb, query = "", limit = 20) {
  const trimmed = String(query ?? "").trim();
  let request = sb
    .from("topics")
    .select("id, name, normalized_name")
    .order("name")
    .limit(limit);

  if (trimmed) {
    request = request.ilike("name", `%${trimmed}%`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Traversal map for [[...]] inside anchor notes (inspector gateway only).
 */
export async function buildAnchorNoteLinkMap(sb, markdown = "", language = "english") {
  const names = extractWikiLinkNames(markdown);

  if (!names.length) {
    return {};
  }

  const normalizedList = names.map((n) => normalizeAnchorName(n));
  const [anchors, variants] = await Promise.all([
    fetchAnchorsByNormalizedNames(sb, normalizedList),
    fetchAnchorVariantsByNormalizedNames(sb, normalizedList, language),
  ]);

  const map = {};

  for (const anchor of anchors) {
    const key = anchor.normalized_name;
    map[key] = {
      anchor_id: anchor.id,
      display_name: key,
      normalized_name: key,
      anchor_type: anchor.anchor_type,
      canonical_topic_id: anchor.canonical_topic_id,
    };
  }

  for (const variant of variants) {
    const key = variant.normalized_name;
    const anchor = variant.anchors ?? {};

    if (!map[key]) {
      map[key] = {
        anchor_id: variant.anchor_id,
        display_name: variant.display_name,
        normalized_name: key,
        anchor_type: anchor.anchor_type ?? null,
        canonical_topic_id: anchor.canonical_topic_id ?? null,
      };
    }
  }

  for (const name of names) {
    const key = normalizeAnchorName(name);
    if (!map[key]) {
      continue;
    }
    map[name] = map[key];
  }

  return map;
}

/**
 * Load anchor + variant + note for inspector rendering.
 */
export async function loadAnchorInspectorPayload(
  sb,
  semanticEntry = {},
  { preferLanguage = "english" } = {}
) {
  const anchorId = semanticEntry.anchor_id;
  if (!anchorId) {
    return {
      semanticEntry,
      anchor: null,
      variant: null,
      note: null,
      noteLinkMap: {},
    };
  }

  const { ensureAnchorVariantForLanguage, fetchActiveAnchorNote } = await import(
    "./anchor-storage.js"
  );

  const language = preferLanguage ?? "english";
  const variant = await ensureAnchorVariantForLanguage(sb, {
    anchorId,
    language,
    displayName: semanticEntry.display_name ?? semanticEntry.source_text,
  });

  const anchor = await fetchAnchorById(sb, anchorId);
  const note = await fetchActiveAnchorNote(sb, variant.id);
  const noteLinkMap = note?.note_content
    ? await buildAnchorNoteLinkMap(sb, note.note_content, language)
    : {};

  return {
    semanticEntry: {
      ...semanticEntry,
      anchor_id: anchorId,
      anchor_variant_id: variant.id,
      anchor_type: anchor?.anchor_type ?? semanticEntry.anchor_type,
      canonical_topic_id:
        anchor?.canonical_topic_id ?? semanticEntry.canonical_topic_id,
      display_name: variant.display_name ?? semanticEntry.display_name,
    },
    anchor,
    variant,
    note,
    noteLinkMap,
  };
}

export async function fetchAnchorById(sb, anchorId) {
  if (!anchorId) {
    return null;
  }

  const { data, error } = await sb
    .from("anchors")
    .select(
      "id, normalized_name, anchor_type, canonical_topic_id, created_by, created_at, updated_at"
    )
    .eq("id", anchorId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
