/**
 * Chronology node parse/format helpers (Timeline + Narrative MSMDF).
 */

function normalizeDividerLine(line) {
  return String(line ?? "").trim();
}

export function isSemanticDividerLine(line) {
  const trimmed = normalizeDividerLine(line);
  if (!trimmed) {
    return false;
  }

  if (trimmed === "---") {
    return true;
  }

  return /^[━─—–-]{3,}$/.test(trimmed);
}

export function parseChronologyEventLine(line) {
  let trimmed = String(line ?? "").trim();
  trimmed = trimmed.replace(/^\*\*(.+)\*\*$/, "$1").trim();

  const match = trimmed.match(/^(\d{3,4}(?:\s*[–-]\s*\d{3,4})?)\s*[—–-]\s*(.+)$/);
  if (!match) {
    return null;
  }

  return {
    date: match[1].trim(),
    label: match[2].trim(),
  };
}

/**
 * @param {string} paragraphText
 * @returns {{ date: string, label: string, annotation: string|null }|null}
 */
export function parseChronologyParagraph(paragraphText) {
  const node = parseDividerWrappedChronologyNode(paragraphText);
  if (!node) {
    return null;
  }

  return {
    date: node.event.date,
    label: node.event.label,
    annotation: node.annotation,
  };
}

/**
 * @param {string} paragraphText
 * @returns {object|null}
 */
export function parseDividerWrappedChronologyNode(paragraphText) {
  const lines = String(paragraphText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 3) {
    return null;
  }

  if (!isSemanticDividerLine(lines[0]) || !isSemanticDividerLine(lines[2])) {
    return null;
  }

  const event = parseChronologyEventLine(lines[1]);
  if (!event) {
    return null;
  }

  const annotationLines = lines.slice(3);
  const annotation = annotationLines.join(" ").trim() || null;

  return {
    divider: lines[0],
    event,
    annotation,
  };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isChronologyParagraph(text) {
  return parseChronologyParagraph(text) !== null;
}

/**
 * @param {{ date: string, label: string, annotation?: string|null }} fields
 * @returns {string}
 */
export function formatChronologyParagraph({ date, label, annotation = null }) {
  const trimmedDate = String(date ?? "").trim();
  const trimmedLabel = String(label ?? "").trim();

  if (!trimmedDate || !trimmedLabel) {
    throw new Error("Date and event label are required.");
  }

  const lines = ["---", `${trimmedDate} — ${trimmedLabel}`, "---"];

  const note = String(annotation ?? "").trim();
  if (note) {
    lines.push(note);
  }

  return lines.join("\n");
}
