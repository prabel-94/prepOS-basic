/**
 * Anchor CRUD + variant note_anchor_links sync (Phase 1 infrastructure).
 */

import { getClient } from "../core/get-client.js";
import { normalizeLanguage } from "../notes/note-variants.js";
import { normalizeAnchorName } from "./anchor-normalization.js";
import {
  ANCHOR_TYPES,
  ANCHOR_VARIANT_STATUSES,
  ANCHOR_NOTE_STATUSES,
  NOTE_ANCHOR_STATES,
} from "./anchor-types.js";
import { resolveAnchorCandidates, resolveNoteAnchorLinkState } from "./anchor-resolver.js";

export async function createAnchor(
  sb,
  {
    displayName,
    anchorType = ANCHOR_TYPES.MICRO,
    canonicalTopicId = null,
    createdBy = null,
  } = {}
) {
  const normalized_name = normalizeAnchorName(displayName);
  if (!normalized_name) {
    throw new Error("Anchor display name is required.");
  }

  const row = {
    normalized_name,
    anchor_type: anchorType,
    canonical_topic_id: canonicalTopicId,
  };

  if (createdBy) {
    row.created_by = createdBy;
  }

  const { data, error } = await sb
    .from("anchors")
    .insert(row)
    .select(
      "id, normalized_name, anchor_type, canonical_topic_id, created_by, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createAnchorVariant(
  sb,
  {
    anchorId,
    language = "english",
    displayName,
    status = ANCHOR_VARIANT_STATUSES.ACTIVE,
  } = {}
) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  const lang = normalizeLanguage(language);
  const display_name = String(displayName ?? "").trim();
  const normalized_name = normalizeAnchorName(display_name);

  if (!normalized_name) {
    throw new Error("Variant display name is required.");
  }

  const { data, error } = await sb
    .from("anchor_variants")
    .insert({
      anchor_id: anchorId,
      language: lang,
      display_name,
      normalized_name,
      status,
    })
    .select("id, anchor_id, language, display_name, normalized_name, status, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function ensureAnchorVariantForLanguage(
  sb,
  { anchorId, language = "english", displayName } = {}
) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  const lang = normalizeLanguage(language);

  const { data: existing, error: fetchError } = await sb
    .from("anchor_variants")
    .select("id, anchor_id, language, display_name, normalized_name, status")
    .eq("anchor_id", anchorId)
    .eq("language", lang)
    .eq("status", ANCHOR_VARIANT_STATUSES.ACTIVE)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing?.id) {
    return existing;
  }

  return createAnchorVariant(sb, {
    anchorId,
    language: lang,
    displayName: displayName ?? "Anchor",
  });
}

export async function fetchActiveAnchorNote(sb, anchorVariantId) {
  if (!anchorVariantId) {
    return null;
  }

  const { data, error } = await sb
    .from("anchor_notes")
    .select(
      "id, anchor_variant_id, note_content, note_format, version, status, created_at, updated_at"
    )
    .eq("anchor_variant_id", anchorVariantId)
    .eq("status", ANCHOR_NOTE_STATUSES.ACTIVE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Archive prior active note and insert new version.
 */
export async function saveAnchorNoteWithVersion(
  sb,
  { anchorVariantId, noteContent, noteFormat = "markdown" } = {}
) {
  if (!anchorVariantId) {
    throw new Error("anchorVariantId is required.");
  }

  const content = String(noteContent ?? "").trim();
  if (!content) {
    throw new Error("noteContent is required.");
  }

  const existing = await fetchActiveAnchorNote(sb, anchorVariantId);
  const nextVersion = (existing?.version ?? 0) + 1;

  if (existing?.id) {
    const { error: archiveError } = await sb
      .from("anchor_notes")
      .update({ status: ANCHOR_NOTE_STATUSES.ARCHIVED })
      .eq("id", existing.id);

    if (archiveError) {
      throw new Error(archiveError.message);
    }
  }

  return createAnchorNote(sb, {
    anchorVariantId,
    noteContent: content,
    noteFormat,
    version: nextVersion,
    status: ANCHOR_NOTE_STATUSES.ACTIVE,
  });
}

export async function createAnchorNote(
  sb,
  {
    anchorVariantId,
    noteContent,
    noteFormat = "markdown",
    version = 1,
    status = ANCHOR_NOTE_STATUSES.ACTIVE,
  } = {}
) {
  if (!anchorVariantId) {
    throw new Error("anchorVariantId is required.");
  }

  const content = String(noteContent ?? "").trim();
  if (!content) {
    throw new Error("noteContent is required.");
  }

  const { data, error } = await sb
    .from("anchor_notes")
    .insert({
      anchor_variant_id: anchorVariantId,
      note_content: content,
      note_format: noteFormat,
      version,
      status,
    })
    .select(
      "id, anchor_variant_id, note_content, note_format, version, status, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createAnchorAlias(
  sb,
  { anchorId, alias, language = "english" } = {}
) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  const aliasText = String(alias ?? "").trim();
  const normalized_alias = normalizeAnchorName(aliasText);
  if (!normalized_alias) {
    throw new Error("alias is required.");
  }

  const { data, error } = await sb
    .from("anchor_aliases")
    .insert({
      anchor_id: anchorId,
      alias: aliasText,
      normalized_alias,
      language: normalizeLanguage(language),
    })
    .select("id, anchor_id, alias, normalized_alias, language, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createAnchorRelationship(
  sb,
  { sourceAnchorId, targetAnchorId, relationshipType, metadataJson = {} } = {}
) {
  if (!sourceAnchorId || !targetAnchorId || !relationshipType) {
    throw new Error("sourceAnchorId, targetAnchorId, and relationshipType are required.");
  }

  const { data, error } = await sb
    .from("anchor_relationships")
    .insert({
      source_anchor_id: sourceAnchorId,
      target_anchor_id: targetAnchorId,
      relationship_type: relationshipType,
      metadata_json: metadataJson,
    })
    .select(
      "id, source_anchor_id, target_anchor_id, relationship_type, metadata_json, created_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Ensure a global anchor row exists for persistence (micro for unresolved candidates).
 */
export async function ensureAnchorForCandidate(sb, { displayName, createdBy = null } = {}) {
  const normalized_name = normalizeAnchorName(displayName);
  if (!normalized_name) {
    throw new Error("displayName is required.");
  }

  const { data: existing } = await sb
    .from("anchors")
    .select("id, normalized_name, anchor_type, canonical_topic_id")
    .eq("normalized_name", normalized_name)
    .maybeSingle();

  if (existing?.id) {
    return { ...existing, wasCreated: false };
  }

  const created = await createAnchor(sb, {
    displayName,
    anchorType: ANCHOR_TYPES.MICRO,
    createdBy,
  });

  return { ...created, wasCreated: true };
}

/**
 * Replace note_anchor_links for a variant from parsed semantic candidates.
 * Does not modify note_topic_links.
 */
export async function syncVariantAnchorLinks(
  sb,
  variantId,
  parsed,
  { language = "english", userId = null } = {}
) {
  if (!variantId || !parsed) {
    return { anchorLinkCount: 0, candidates: [] };
  }

  const candidates = await resolveAnchorCandidates(parsed, {
    sb,
    language,
  });

  const { data: existingLinks } = await sb
    .from("note_anchor_links")
    .select("id, anchor_id, state, source_text")
    .eq("variant_id", variantId);

  const existingByAnchor = new Map(
    (existingLinks ?? []).map((link) => [link.anchor_id, link])
  );

  const { error: deleteError } = await sb
    .from("note_anchor_links")
    .delete()
    .eq("variant_id", variantId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!candidates.length) {
    return { anchorLinkCount: 0, candidates };
  }

  const rows = [];

  for (const candidate of candidates) {
    let anchorId = candidate.anchor_id;
    let anchorPreexisted = Boolean(candidate.anchor_id);

    if (!anchorId) {
      const anchor = await ensureAnchorForCandidate(sb, {
        displayName: candidate.source_text,
        createdBy: userId,
      });
      anchorId = anchor.id;
      anchorPreexisted = anchorPreexisted || anchor.wasCreated === false;
    }

    const preserved = existingByAnchor.get(anchorId);
    const state = resolveNoteAnchorLinkState({
      candidate,
      preservedState: preserved?.state ?? null,
      anchorPreexisted,
    });

    rows.push({
      variant_id: variantId,
      anchor_id: anchorId,
      state,
      source_text: candidate.source_text,
      block_key: candidate.block_key,
    });
  }

  const { error: insertError } = await sb.from("note_anchor_links").insert(rows);

  if (insertError) {
    console.warn("note_anchor_links insert:", insertError.message);
    return { anchorLinkCount: 0, candidates };
  }

  return { anchorLinkCount: rows.length, candidates };
}

export async function clearVariantAnchorLinks(sb, variantId) {
  if (!variantId) {
    return;
  }

  const { error } = await sb
    .from("note_anchor_links")
    .delete()
    .eq("variant_id", variantId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Convenience: get authenticated client and run sync */
export async function syncVariantAnchorLinksWithClient(variantId, parsed, options = {}) {
  const sb = await getClient();
  return syncVariantAnchorLinks(sb, variantId, parsed, options);
}
