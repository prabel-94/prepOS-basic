/**
 * Detect and strip `>` prefixes for important quotes in [QUOTES].
 */

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isHighlightedQuoteText(text) {
  return stripHighlightedQuoteLines(text) !== null;
}

/**
 * @param {string} text
 * @returns {string[]|null}
 */
export function stripHighlightedQuoteLines(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length || !lines.every((line) => /^>\s?/.test(line))) {
    return null;
  }

  return lines.map((line) => line.replace(/^>\s?/, ""));
}
