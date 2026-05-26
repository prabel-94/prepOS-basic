/**
 * Post-parse semantic candidate layer (does not modify map-parser.js).
 */

import { buildBlockKey } from "./anchor-normalization.js";

/**
 * Extract semantic [[...]] declarations from parseMapMarkdown output.
 * Mirrors topic_links shape with stable block_key for note_anchor_links.
 *
 * @param {object} parsed
 * @returns {Array<{ name, raw, section, block_index, block_key }>}
 */
export function extractSemanticCandidatesFromParsed(parsed) {
  const links = parsed?.topic_links ?? [];

  return links.map((link) => ({
    name: link.name,
    raw: link.raw,
    section: link.section ?? null,
    block_index: link.block_index ?? null,
    block_key: buildBlockKey(link.section, link.block_index),
  }));
}

/**
 * Attach semantic_candidates to a parsed object without mutating parseMapMarkdown.
 * Safe to call immediately after parseMapMarkdown().
 *
 * @param {object} parsed
 * @returns {object}
 */
export function attachSemanticCandidates(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  return {
    ...parsed,
    semantic_candidates: extractSemanticCandidatesFromParsed(parsed),
  };
}
