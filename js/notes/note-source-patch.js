/**
 * Patch raw MSMDF markdown using editable unit character ranges.
 */

/**
 * @param {string} markdown
 * @param {{ start: number, end: number }} unit
 * @param {string} newText
 */
export function replaceUnitRange(markdown, unit, newText) {
  const start = Number(unit.start);
  const end = Number(unit.end);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    throw new Error("Invalid editable unit range.");
  }

  return markdown.slice(0, start) + newText + markdown.slice(end);
}

/**
 * Split a paragraph unit into two paragraphs (blank line between).
 * @param {string} markdown
 * @param {{ start: number, end: number, sourceText: string }} unit
 * @param {number} offset — caret offset within unit.sourceText
 */
export function splitParagraphUnitAt(markdown, unit, offset) {
  const text = String(unit.sourceText ?? "");
  const safeOffset = Math.min(Math.max(offset, 0), text.length);
  const before = text.slice(0, safeOffset).trimEnd();
  const after = text.slice(safeOffset).trimStart();

  let replacement = before;
  if (before && after) {
    replacement = `${before}\n\n${after}`;
  } else if (after) {
    replacement = after;
  }

  return replaceUnitRange(markdown, unit, replacement);
}

/**
 * Insert a soft line break within a paragraph unit.
 * @param {string} markdown
 * @param {{ start: number, end: number, sourceText: string }} unit
 * @param {number} offset
 */
export function insertLineBreakInUnit(markdown, unit, offset) {
  const text = String(unit.sourceText ?? "");
  const safeOffset = Math.min(Math.max(offset, 0), text.length);
  const replacement = `${text.slice(0, safeOffset)}\n${text.slice(safeOffset)}`;
  return replaceUnitRange(markdown, unit, replacement);
}
