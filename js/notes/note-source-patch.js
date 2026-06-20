/**
 * Patch raw MSMDF markdown using editable unit character ranges.
 */

import {
  DRAFT_PARAGRAPH_PLACEHOLDER,
  isDraftParagraphPlaceholder,
} from "./note-draft-paragraph.js";

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
 * Appends or prepends a draft placeholder when splitting at the end or start.
 * @param {string} markdown
 * @param {{ start: number, end: number, sourceText: string, kind?: string, paraIndex?: number }} unit
 * @param {number} offset — caret offset within unit.sourceText
 * @returns {{ markdown: string, focusOffset: number }}
 */
export function splitParagraphUnitAt(markdown, unit, offset) {
  const text = String(unit.sourceText ?? "");
  const safeOffset = Math.min(Math.max(offset, 0), text.length);
  const before = text.slice(0, safeOffset).replace(/\u200b/g, "").trimEnd();
  const after = text.slice(safeOffset).replace(/\u200b/g, "").trimStart();

  let replacement = before;

  if (before && after) {
    replacement = `${before}\n\n${after}`;
  } else if (!before && after) {
    replacement = `${DRAFT_PARAGRAPH_PLACEHOLDER}\n\n${after}`;
  } else if (before && !after) {
    replacement = `${before}\n\n${DRAFT_PARAGRAPH_PLACEHOLDER}`;
  } else {
    replacement = DRAFT_PARAGRAPH_PLACEHOLDER;
  }

  const updatedMarkdown = replaceUnitRange(markdown, unit, replacement);
  let focusOffset = -1;

  if (before && after) {
    focusOffset = updatedMarkdown.indexOf(after, unit.start);
  } else if (replacement.includes(DRAFT_PARAGRAPH_PLACEHOLDER)) {
    focusOffset = updatedMarkdown.indexOf(DRAFT_PARAGRAPH_PLACEHOLDER, unit.start);
  }

  return {
    markdown: updatedMarkdown,
    focusOffset,
  };
}

/**
 * @param {Map<string, object>} units
 * @param {number} offset
 * @returns {string|null}
 */
export function findEditableUnitIdAtOffset(units, offset) {
  if (!Number.isFinite(offset) || offset < 0) {
    return null;
  }

  let match = null;
  for (const unit of units.values()) {
    if (offset < unit.start || offset >= unit.end) {
      continue;
    }

    if (!match || unit.start < match.start) {
      match = unit;
    }
  }

  return match?.id ?? null;
}

/**
 * @param {string} text
 */
export function isSplittableDraftUnitText(text) {
  const normalized = String(text ?? "").replace(/\u200b/g, "").trim();
  return Boolean(normalized) || isDraftParagraphPlaceholder(text);
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
