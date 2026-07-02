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

  let match = trimmed.match(/^(\d{3,4}(?:\s*[–-]\s*\d{3,4})?)\s*[—–-]\s*(.+)$/);
  if (!match) {
    match = trimmed.match(/^(\d{3,4}(?:\s*[–-]\s*\d{3,4})?)\s+(.+)$/);
  }

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

const TIMELINE_MILESTONE_DATE_PATTERN =
  /^\d{3,4}(?:\s*[–-]\s*\d{3,4})?(?:\s*(?:BCE|CE|AD|BC))?$/i;

const TIMELINE_MILESTONE_PERIOD_PATTERN =
  /^(?:(?:late|early|mid)\s+)?\d{1,2}(?:st|nd|rd|th)?(?:\s*[–-]\s*\d{1,2}(?:st|nd|rd|th)?)?\s+centur(?:y|ies)|\d{3,4}s$/i;

const TIMELINE_MILESTONE_MONTH_PATTERN =
  /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{3,4}$/i;

const TIMELINE_MILESTONE_MALAYALAM_MONTH_PATTERN =
  /^(?:ജനുവരി|ഫെബ്രുവരി|മാർച്ച്|ഏപ്രിൽ|മേയ്|ജൂൺ|ജൂലൈ|ഓഗസ്റ്റ്|സെപ്റ്റംബർ|ഒക്ടോബർ|നവംബർ|ഡിസംബർ)\s+\d{3,4}$/u;

/**
 * MSMDF-LX timeline period labels (Malayalam centuries, decades, ranges).
 * @param {string} candidate
 * @returns {boolean}
 */
function isMsmdfLxTimelineMilestoneLabel(candidate) {
  if (TIMELINE_MILESTONE_MALAYALAM_MONTH_PATTERN.test(candidate)) {
    return true;
  }

  if (/\d/.test(candidate) && /(?:നൂറ്റാണ്ട്|കൾ)/u.test(candidate)) {
    return true;
  }

  return false;
}

/**
 * Standalone timeline milestone labels (v3 date headers without divider nodes).
 * @param {string} text
 * @returns {string|null}
 */
export function parseTimelineMilestoneLabel(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed || trimmed === "↓" || trimmed === "→" || trimmed === "->") {
    return null;
  }

  if (isSemanticDividerLine(trimmed)) {
    return null;
  }

  const boldMatch = trimmed.match(/^\*\*(.+)\*\*$/);
  const candidate = (boldMatch ? boldMatch[1] : trimmed).trim();

  if (!candidate || candidate.length > 56) {
    return null;
  }

  if (TIMELINE_MILESTONE_DATE_PATTERN.test(candidate)) {
    return candidate;
  }

  if (TIMELINE_MILESTONE_PERIOD_PATTERN.test(candidate)) {
    return candidate;
  }

  if (TIMELINE_MILESTONE_MONTH_PATTERN.test(candidate)) {
    return candidate;
  }

  if (/^(late|early|mid)\s+\d/i.test(candidate) && !candidate.includes(".")) {
    return candidate;
  }

  if (isMsmdfLxTimelineMilestoneLabel(candidate)) {
    return candidate;
  }

  return null;
}

/**
 * Split legacy inline divider leaks (single-line or multi-line) into chronology nodes.
 * @param {string} paragraphText
 * @returns {Array<{ divider: string, event: { date: string, label: string }, annotation: string|null }>}
 */
export function parseLegacyDividedChronologySegments(paragraphText) {
  const trimmed = String(paragraphText ?? "").trim();
  if (!trimmed || !/[━─]{3,}/.test(trimmed)) {
    return [];
  }

  const inlineParts = trimmed
    .split(/\s*(?:━{3,}|─{3,})\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (inlineParts.length < 2) {
    return [];
  }

  const nodes = [];

  for (const part of inlineParts) {
    const event = parseChronologyEventLine(part);
    if (!event) {
      return [];
    }

    nodes.push({
      divider: "━━━━━━━━━━",
      event,
      annotation: null,
    });
  }

  return nodes;
}

/**
 * Walk multi-line paragraphs that interleave dividers and milestone events.
 * @param {string} paragraphText
 * @returns {Array<{ divider: string, event: { date: string, label: string }, annotation: string|null }>}
 */
export function parseInterleavedChronologySegments(paragraphText) {
  const lines = String(paragraphText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3 || !lines.some(isSemanticDividerLine)) {
    return [];
  }

  const nodes = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!isSemanticDividerLine(lines[i])) {
      continue;
    }

    if (i + 2 >= lines.length || !isSemanticDividerLine(lines[i + 2])) {
      continue;
    }

    const event = parseChronologyEventLine(lines[i + 1]);
    if (!event) {
      continue;
    }

    nodes.push({
      divider: lines[i],
      event,
      annotation: lines.slice(i + 3).join(" ").trim() || null,
    });

    return nodes;
  }

  return [];
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
