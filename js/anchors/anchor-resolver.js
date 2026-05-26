/**
 * Semantic anchor resolution from [[...]] declarations (Phase 1).
 * Does not modify renderer, draft UI, or topic traversal.
 */

import { normalizeLanguage } from "../notes/note-variants.js";
import { buildBlockKey, normalizeAnchorName } from "./anchor-normalization.js";
import {
  ANCHOR_RESOLUTION_KINDS,
  ANCHOR_TYPES,
  NOTE_ANCHOR_STATES,
} from "./anchor-types.js";
import {
  fetchAnchorAliasesByNormalizedNames,
  fetchAnchorsByNormalizedNames,
  fetchAnchorVariantsByNormalizedNames,
  fetchTopicsByNormalizedNames,
} from "./anchor-selectors.js";

function mapResolutionToState(resolutionKind, anchorType) {
  if (resolutionKind === ANCHOR_RESOLUTION_KINDS.CANDIDATE) {
    return NOTE_ANCHOR_STATES.CANDIDATE;
  }

  if (anchorType === ANCHOR_TYPES.CANONICAL) {
    return NOTE_ANCHOR_STATES.ACTIVE;
  }

  return NOTE_ANCHOR_STATES.ACTIVE;
}

function indexByNormalized(rows = [], key) {
  const map = new Map();

  for (const row of rows) {
    const normalized = row[key];
    if (!normalized || map.has(normalized)) {
      continue;
    }
    map.set(normalized, row);
  }

  return map;
}

/**
 * Build lookup indexes for batch resolution.
 */
export async function buildAnchorResolutionIndexes(sb, declarations = [], language = "english") {
  const lang = normalizeLanguage(language);
  const normalizedNames = declarations.map((d) =>
    normalizeAnchorName(d.name ?? d.source_text ?? "")
  );

  const [anchors, variants, aliases, topics] = await Promise.all([
    fetchAnchorsByNormalizedNames(sb, normalizedNames),
    fetchAnchorVariantsByNormalizedNames(sb, normalizedNames, lang),
    fetchAnchorAliasesByNormalizedNames(sb, normalizedNames, lang),
    fetchTopicsByNormalizedNames(sb, normalizedNames),
  ]);

  return {
    language: lang,
    anchorsByName: indexByNormalized(anchors, "normalized_name"),
    variantsByName: indexByNormalized(variants, "normalized_name"),
    aliasesByName: indexByNormalized(aliases, "normalized_alias"),
    topicsByName: indexByNormalized(topics, "normalized_name"),
  };
}

/**
 * Resolve a single declaration against preloaded indexes.
 */
export function resolveDeclarationAgainstIndexes(declaration, indexes) {
  const source_text = String(declaration.name ?? declaration.source_text ?? "").trim();
  const normalized_name = normalizeAnchorName(source_text);
  const block_key = buildBlockKey(declaration.section, declaration.block_index);

  const base = {
    source_text,
    normalized_name,
    raw: declaration.raw ?? `[[${source_text}]]`,
    section: declaration.section ?? null,
    block_index: declaration.block_index ?? null,
    block_key,
    anchor_id: null,
    anchor_variant_id: null,
    canonical_topic_id: null,
    resolution: ANCHOR_RESOLUTION_KINDS.CANDIDATE,
    state: NOTE_ANCHOR_STATES.CANDIDATE,
    anchor_type: null,
    display_name: source_text,
  };

  if (!normalized_name) {
    return base;
  }

  const aliasRow = indexes.aliasesByName.get(normalized_name);
  if (aliasRow?.anchor_id) {
    const anchor = aliasRow.anchors ?? {};
    return {
      ...base,
      anchor_id: aliasRow.anchor_id,
      resolution: ANCHOR_RESOLUTION_KINDS.ALIAS,
      state: mapResolutionToState(ANCHOR_RESOLUTION_KINDS.ALIAS, anchor.anchor_type),
      anchor_type: anchor.anchor_type ?? null,
      canonical_topic_id: anchor.canonical_topic_id ?? null,
      display_name: aliasRow.alias ?? source_text,
    };
  }

  const anchorRow = indexes.anchorsByName.get(normalized_name);
  if (anchorRow?.id) {
    return {
      ...base,
      anchor_id: anchorRow.id,
      resolution: ANCHOR_RESOLUTION_KINDS.EXISTING,
      state: mapResolutionToState(ANCHOR_RESOLUTION_KINDS.EXISTING, anchorRow.anchor_type),
      anchor_type: anchorRow.anchor_type,
      canonical_topic_id: anchorRow.canonical_topic_id ?? null,
      display_name: source_text,
    };
  }

  const variantRow = indexes.variantsByName.get(normalized_name);
  if (variantRow?.anchor_id) {
    const anchor = variantRow.anchors ?? {};
    return {
      ...base,
      anchor_id: variantRow.anchor_id,
      anchor_variant_id: variantRow.id,
      resolution: ANCHOR_RESOLUTION_KINDS.VARIANT,
      state: mapResolutionToState(ANCHOR_RESOLUTION_KINDS.VARIANT, anchor.anchor_type),
      anchor_type: anchor.anchor_type ?? null,
      canonical_topic_id: anchor.canonical_topic_id ?? null,
      display_name: variantRow.display_name ?? source_text,
    };
  }

  const topicRow = indexes.topicsByName.get(normalized_name);
  if (topicRow?.id) {
    const linkedAnchor = [...indexes.anchorsByName.values()].find(
      (a) => a.canonical_topic_id === topicRow.id
    );

    if (linkedAnchor?.id) {
      return {
        ...base,
        anchor_id: linkedAnchor.id,
        resolution: ANCHOR_RESOLUTION_KINDS.CANONICAL,
        state: NOTE_ANCHOR_STATES.ACTIVE,
        anchor_type: linkedAnchor.anchor_type,
        canonical_topic_id: topicRow.id,
        display_name: topicRow.name ?? source_text,
      };
    }

    return {
      ...base,
      resolution: ANCHOR_RESOLUTION_KINDS.CANONICAL,
      state: NOTE_ANCHOR_STATES.CANDIDATE,
      canonical_topic_id: topicRow.id,
      display_name: topicRow.name ?? source_text,
    };
  }

  return base;
}

/**
 * Resolve [[...]] declarations from parser output into semantic metadata.
 *
 * @param {object} parsed — output of parseMapMarkdown (or enriched with semantic_candidates)
 * @param {{ sb: object, language?: string }} options
 * @returns {Promise<Array>}
 */
export async function resolveAnchorCandidates(parsed, { sb, language = "english" } = {}) {
  if (!sb) {
    throw new Error("Supabase client (sb) is required for resolveAnchorCandidates.");
  }

  const declarations = extractDeclarationsFromParsed(parsed);
  if (!declarations.length) {
    return [];
  }

  const indexes = await buildAnchorResolutionIndexes(sb, declarations, language);

  return declarations.map((declaration) =>
    resolveDeclarationAgainstIndexes(declaration, indexes)
  );
}

/**
 * Declarations source: post-parse semantic_candidates or topic_links.
 */
export function extractDeclarationsFromParsed(parsed) {
  if (Array.isArray(parsed?.semantic_candidates) && parsed.semantic_candidates.length) {
    return parsed.semantic_candidates;
  }

  return (parsed?.topic_links ?? []).map((link) => ({
    name: link.name,
    raw: link.raw,
    section: link.section,
    block_index: link.block_index,
  }));
}
