/**
 * Anchor lookup helpers (read-only).
 */

import {
  normalizeLanguage,
  getLanguageLabel,
  SUPPORTED_LANGUAGES,
} from "../notes/note-variants.js";
import { normalizeAnchorName } from "./anchor-normalization.js";
import { extractWikiLinkNames } from "./anchor-note-renderer.js";
import { ANCHOR_NOTE_STATUSES, ANCHOR_VARIANT_STATUSES } from "./anchor-types.js";
import { fetchVariantsForNote } from "../notes/note-selectors.js";
import {
  ensureAnchorVariantForLanguage,
  fetchActiveAnchorNote,
} from "./anchor-storage.js";

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

export async function fetchActiveAnchorVariantsForAnchor(sb, anchorId) {
  if (!anchorId) {
    return [];
  }

  const { data, error } = await sb
    .from("anchor_variants")
    .select("id, anchor_id, language, display_name, normalized_name, status")
    .eq("anchor_id", anchorId)
    .eq("status", ANCHOR_VARIANT_STATUSES.ACTIVE)
    .order("language");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function resolveNoteIdForEditor(sb, { noteId = null, variantId = null } = {}) {
  if (noteId) {
    return noteId;
  }

  if (!variantId) {
    return null;
  }

  const { data, error } = await sb
    .from("note_variants")
    .select("note_id")
    .eq("id", variantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.note_id ?? null;
}

/**
 * Cross-language editor context for a single anchor.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {object} options
 */
export async function loadAnchorNoteEditorContext(
  sb,
  {
    anchorId,
    preferLanguage = "english",
    noteId = null,
    variantId = null,
    displayName = null,
  } = {}
) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  const selectedLanguage = normalizeLanguage(preferLanguage);
  const resolvedNoteId = await resolveNoteIdForEditor(sb, { noteId, variantId });
  const anchorVariants = await fetchActiveAnchorVariantsForAnchor(sb, anchorId);
  const variantByLanguage = new Map(
    anchorVariants.map((variant) => [normalizeLanguage(variant.language), variant])
  );

  const languageSet = new Set(
    anchorVariants.map((variant) => normalizeLanguage(variant.language))
  );

  if (resolvedNoteId) {
    const noteVariants = await fetchVariantsForNote(resolvedNoteId);
    for (const noteVariant of noteVariants) {
      languageSet.add(normalizeLanguage(noteVariant.language));
    }
  }

  if (!languageSet.size) {
    languageSet.add(selectedLanguage);
  }

  let languages = [...languageSet]
    .filter((lang) => SUPPORTED_LANGUAGES.includes(lang))
    .sort((a, b) => getLanguageLabel(a).localeCompare(getLanguageLabel(b)));

  if (!languages.length) {
    languages = [
      SUPPORTED_LANGUAGES.includes(selectedLanguage)
        ? selectedLanguage
        : "english",
    ];
  }

  const fallbackDisplayName =
    String(displayName ?? "").trim() ||
    anchorVariants.find((row) => String(row.display_name ?? "").trim())
      ?.display_name ||
    "Anchor";

  const variants = [];

  for (const language of languages) {
    let variant = variantByLanguage.get(language) ?? null;

    if (!variant) {
      variant = await ensureAnchorVariantForLanguage(sb, {
        anchorId,
        language,
        displayName: fallbackDisplayName,
      });
      variantByLanguage.set(language, variant);
    }

    const note = await fetchActiveAnchorNote(sb, variant.id);
    const noteContent = note?.note_content ?? "";
    const hasNote = Boolean(String(noteContent).trim());

    variants.push({
      anchorVariantId: variant.id,
      language,
      hasVariant: true,
      hasNote,
      noteId: note?.id ?? null,
      noteContent,
    });
  }

  const context = {
    anchorId,
    displayName,
    selectedLanguage,
    variants,
  };

  if (normalizeAnchorName(displayName) === "william laud") {
    const currentEntry =
      variants.find((entry) => normalizeLanguage(entry.language) === selectedLanguage) ??
      null;

    console.log("[Anchor Note Editor Context] William Laud", {
      anchorId,
      currentVariantId: currentEntry?.anchorVariantId ?? null,
      siblingVariants: variants,
    });
  }

  return context;
}

/**
 * Read-only cross-language resolution audit (teacher console).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {string} [displayName]
 * @param {{ noteId?: string, variantId?: string }} [options]
 */
export async function auditCrossLanguageAnchorResolution(
  sb,
  displayName = "William Laud",
  { noteId = null, variantId = null } = {}
) {
  const normalized = normalizeAnchorName(displayName);
  const resolvedNoteId = await resolveNoteIdForEditor(sb, { noteId, variantId });

  const { data: anchorRows, error: anchorError } = await sb
    .from("anchors")
    .select("id, normalized_name, anchor_type, canonical_topic_id")
    .eq("normalized_name", normalized);

  if (anchorError) {
    throw new Error(anchorError.message);
  }

  const { data: variantsByName, error: variantNameError } = await sb
    .from("anchor_variants")
    .select("id, anchor_id, language, display_name, normalized_name, status")
    .eq("normalized_name", normalized)
    .eq("status", ANCHOR_VARIANT_STATUSES.ACTIVE);

  if (variantNameError) {
    throw new Error(variantNameError.message);
  }

  const anchorIds = [
    ...new Set([
      ...(anchorRows ?? []).map((row) => row.id),
      ...(variantsByName ?? []).map((row) => row.anchor_id),
    ]),
  ];

  let siblingVariants = [];
  if (anchorIds.length) {
    const { data, error } = await sb
      .from("anchor_variants")
      .select("id, anchor_id, language, display_name, normalized_name, status")
      .in("anchor_id", anchorIds)
      .eq("status", ANCHOR_VARIANT_STATUSES.ACTIVE)
      .order("language");

    if (error) {
      throw new Error(error.message);
    }

    siblingVariants = data ?? [];
  }

  const englishVariant =
    siblingVariants.find((row) => normalizeLanguage(row.language) === "english") ??
    null;
  const malayalamVariant =
    siblingVariants.find((row) => normalizeLanguage(row.language) === "malayalam") ??
    null;

  let noteAnchorLinks = [];
  if (resolvedNoteId) {
    const noteVariants = await fetchVariantsForNote(resolvedNoteId);
    const noteVariantIds = noteVariants.map((row) => row.id);

    if (noteVariantIds.length) {
      const { data, error } = await sb
        .from("note_anchor_links")
        .select(
          `
          id,
          variant_id,
          anchor_id,
          source_text,
          state,
          note_variants ( id, language, title, status )
        `
        )
        .in("variant_id", noteVariantIds)
        .eq("source_text", displayName);

      if (error) {
        throw new Error(error.message);
      }

      noteAnchorLinks = data ?? [];
    }
  }

  const englishLink = noteAnchorLinks.find(
    (link) => normalizeLanguage(link.note_variants?.language) === "english"
  );
  const malayalamLink = noteAnchorLinks.find(
    (link) => normalizeLanguage(link.note_variants?.language) === "malayalam"
  );

  const report = {
    displayName,
    normalizedName: normalized,
    noteId: resolvedNoteId,
    anchorRow: anchorRows?.[0] ?? null,
    anchorId: anchorRows?.[0]?.id ?? englishVariant?.anchor_id ?? malayalamVariant?.anchor_id ?? null,
    english: {
      anchor_id: englishVariant?.anchor_id ?? englishLink?.anchor_id ?? null,
      anchor_variant_id: englishVariant?.id ?? null,
      note_anchor_link_id: englishLink?.id ?? null,
      note_variant_id: englishLink?.variant_id ?? null,
    },
    malayalam: {
      anchor_id: malayalamVariant?.anchor_id ?? malayalamLink?.anchor_id ?? null,
      anchor_variant_id: malayalamVariant?.id ?? null,
      note_anchor_link_id: malayalamLink?.id ?? null,
      note_variant_id: malayalamLink?.variant_id ?? null,
    },
    siblingsShareSameAnchorId:
      englishVariant && malayalamVariant
        ? englishVariant.anchor_id === malayalamVariant.anchor_id
        : englishLink && malayalamLink
          ? englishLink.anchor_id === malayalamLink.anchor_id
          : null,
    siblingVariants,
    noteAnchorLinks,
  };

  console.log("[Cross-Language Anchor Audit]", report);
  return report;
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

/**
 * Batch lookup: anchor_id → whether an active note with content exists.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {string[]} anchorIds
 * @param {string} [language]
 * @returns {Promise<Map<string, boolean>>}
 */
export async function fetchAnchorNotePresenceByAnchorIds(
  sb,
  anchorIds = [],
  language = "english"
) {
  const presence = new Map();
  const uniqueIds = [...new Set(anchorIds.filter(Boolean))];

  if (!uniqueIds.length) {
    return presence;
  }

  const lang = normalizeLanguage(language);
  const { data: variants, error: variantError } = await sb
    .from("anchor_variants")
    .select("id, anchor_id")
    .in("anchor_id", uniqueIds)
    .eq("language", lang)
    .eq("status", ANCHOR_VARIANT_STATUSES.ACTIVE);

  if (variantError) {
    throw new Error(variantError.message);
  }

  const variantRows = variants ?? [];
  if (!variantRows.length) {
    uniqueIds.forEach((id) => presence.set(id, false));
    return presence;
  }

  const variantIds = variantRows.map((row) => row.id);
  const { data: notes, error: noteError } = await sb
    .from("anchor_notes")
    .select("anchor_variant_id, note_content")
    .in("anchor_variant_id", variantIds)
    .eq("status", ANCHOR_NOTE_STATUSES.ACTIVE);

  if (noteError) {
    throw new Error(noteError.message);
  }

  const variantHasNote = new Map();
  for (const note of notes ?? []) {
    if (String(note.note_content ?? "").trim()) {
      variantHasNote.set(note.anchor_variant_id, true);
    }
  }

  for (const variant of variantRows) {
    presence.set(variant.anchor_id, Boolean(variantHasNote.get(variant.id)));
  }

  for (const id of uniqueIds) {
    if (!presence.has(id)) {
      presence.set(id, false);
    }
  }

  return presence;
}

/**
 * @param {Record<string, object>} semanticMap
 * @param {Map<string, boolean>} presenceByAnchorId
 */
export function annotateSemanticMapWithAnchorNotePresence(
  semanticMap = {},
  presenceByAnchorId = new Map()
) {
  for (const entry of Object.values(semanticMap)) {
    if (!entry?.anchor_id) {
      continue;
    }
    entry.hasAnchorNote = presenceByAnchorId.get(entry.anchor_id) === true;
  }

  return semanticMap;
}

/**
 * Teacher-only enrichment for semantic preview / published read maps.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {Record<string, object>} semanticMap
 * @param {string} [language]
 */
export async function enrichSemanticMapWithAnchorNotePresence(
  sb,
  semanticMap = {},
  language = "english"
) {
  const anchorIds = [
    ...new Set(
      Object.values(semanticMap)
        .map((entry) => entry?.anchor_id)
        .filter(Boolean)
    ),
  ];

  const presence = await fetchAnchorNotePresenceByAnchorIds(
    sb,
    anchorIds,
    language
  );

  return annotateSemanticMapWithAnchorNotePresence(semanticMap, presence);
}
