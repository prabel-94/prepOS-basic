/**
 * Shared anchor name normalization (mirrors public.normalize_anchor_name).
 */

/** Unicode apostrophe / prime variants folded to ASCII apostrophe. */
const APOSTROPHE_LIKE_PATTERN =
  /[\u0027\u2018\u2019\u201A\u201B\uFF07\u00B4\u2032\u02BB\u02BC\u02BD\u02C8\u02CA]/g;

/**
 * Fold typographic apostrophes to ASCII `'` before identity comparison.
 */
export function foldAnchorApostrophes(input = "") {
  return String(input ?? "").replace(APOSTROPHE_LIKE_PATTERN, "'");
}

export function normalizeAnchorName(input = "") {
  return foldAnchorApostrophes(input).trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildBlockKey(section = null, blockIndex = null) {
  if (section == null && blockIndex == null) {
    return "doc:whole";
  }

  return `${section ?? "doc"}:${blockIndex ?? "whole"}`;
}
