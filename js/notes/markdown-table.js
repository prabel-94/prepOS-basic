/**
 * Minimal markdown pipe-table parse/render helpers.
 */

function splitTableRow(line) {
  let trimmed = String(line ?? "").trim();
  if (trimmed.startsWith("|")) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith("|")) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparatorLine(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }|null}
 */
export function parseMarkdownTable(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2 || !lines[0].includes("|")) {
    return null;
  }

  if (!isTableSeparatorLine(lines[1])) {
    return null;
  }

  const headers = splitTableRow(lines[0]);
  const rows = [];

  for (let i = 2; i < lines.length; i += 1) {
    if (!lines[i].includes("|")) {
      break;
    }

    rows.push(splitTableRow(lines[i]));
  }

  if (!headers.length || !rows.length) {
    return null;
  }

  return { headers, rows };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isMarkdownTable(text) {
  return parseMarkdownTable(text) !== null;
}
