/**
 * Draft-edit helpers for empty paragraph placeholders.
 */

export const DRAFT_PARAGRAPH_PLACEHOLDER = "\u200b";

/**
 * @param {string} text
 */
export function isDraftParagraphPlaceholder(text) {
  return String(text ?? "").replace(/\u200b/g, "").trim() === "";
}

/**
 * Normalize paragraph text for saving to MSMDF source.
 * @param {string} text
 */
export function normalizeDraftParagraphForSave(text) {
  return String(text ?? "").replace(/\u200b/g, "").trim();
}
