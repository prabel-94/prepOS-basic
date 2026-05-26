/**
 * Anchor lookup helpers (read-only).
 */

import { normalizeAnchorName } from "./anchor-normalization.js";

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
