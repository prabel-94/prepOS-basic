/**
 * Shared anchor name normalization (mirrors public.normalize_anchor_name).
 */

export function normalizeAnchorName(input = "") {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildBlockKey(section = null, blockIndex = null) {
  if (section == null && blockIndex == null) {
    return "doc:whole";
  }

  return `${section ?? "doc"}:${blockIndex ?? "whole"}`;
}
