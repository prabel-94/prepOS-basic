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
 * Detect `**` immediately wrapping a wiki-link span [matchStart, matchEnd).
 * Used because wiki links are extracted before bold runs, which would otherwise
 * leave orphan `**` markers around `**[[Label]]**`.
 *
 * @param {string} text
 * @param {number} matchStart
 * @param {number} matchEnd
 * @param {number} [alreadyConsumedThrough=0]
 * @returns {{ start: number, end: number, bold: boolean }}
 */
export function boldWrapAroundMatch(
  text,
  matchStart,
  matchEnd,
  alreadyConsumedThrough = 0
) {
  if (
    matchStart >= 2 &&
    alreadyConsumedThrough <= matchStart - 2 &&
    text.slice(matchStart - 2, matchStart) === "**" &&
    matchEnd + 2 <= text.length &&
    text.slice(matchEnd, matchEnd + 2) === "**"
  ) {
    return { start: matchStart - 2, end: matchEnd + 2, bold: true };
  }

  return { start: matchStart, end: matchEnd, bold: false };
}

/**
 * @param {string} html
 * @param {boolean} bold
 * @returns {string}
 */
export function maybeWrapBoldHtml(html, bold) {
  return bold ? `<strong>${html}</strong>` : html;
}

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
