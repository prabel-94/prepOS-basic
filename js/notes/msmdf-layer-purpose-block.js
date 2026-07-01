/**
 * MSMDF v3.1 layer purpose callouts (blockquote intro blocks).
 */

/**
 * @param {string} text
 * @returns {{ title: string, body: string }|null}
 */
export function parseLayerPurposeBlock(text) {
  const contentLines = [];

  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^>\s?(.*)$/);
    if (!match) {
      return null;
    }

    contentLines.push(match[1].trim());
  }

  if (contentLines.length < 2) {
    return null;
  }

  const titleMatch = contentLines[0].match(/^\*\*(.+)\*\*$/);
  if (!titleMatch || !/purpose/i.test(titleMatch[1])) {
    return null;
  }

  const body = contentLines.slice(1).filter(Boolean).join(" ").trim();
  if (!body) {
    return null;
  }

  return {
    title: titleMatch[1].trim(),
    body,
  };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isLayerPurposeBlock(text) {
  return parseLayerPurposeBlock(text) !== null;
}
