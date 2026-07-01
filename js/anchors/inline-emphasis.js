/**
 * Minimal inline markdown emphasis (**bold**) for semantic text segments.
 */

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const BOLD_PATTERN = /\*\*(.+?)\*\*/g;

/**
 * Render **bold** markers in plain text (HTML-safe).
 * @param {string} text
 * @returns {string}
 */
export function renderMarkdownEmphasis(text) {
  if (!text) {
    return "";
  }

  if (!text.includes("**")) {
    return escapeHTML(text);
  }

  const parts = [];
  let lastIndex = 0;
  let match;

  BOLD_PATTERN.lastIndex = 0;

  while ((match = BOLD_PATTERN.exec(text)) !== null) {
    parts.push(escapeHTML(text.slice(lastIndex, match.index)));
    parts.push(`<strong>${escapeHTML(match[1])}</strong>`);
    lastIndex = BOLD_PATTERN.lastIndex;
  }

  parts.push(escapeHTML(text.slice(lastIndex)));
  return parts.join("");
}
