/**
 * Lightweight anchor note rendering (markdown-lite, no MSMDF).
 */

import { normalizeAnchorName } from "./anchor-normalization.js";

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

/** Known structured-section headers (EN + ML), compared case-insensitively. */
const KNOWN_SECTION_HEADERS = new Set(
  [
    "context",
    "key identity markers",
    "historical identity markers",
    "identity markers",
    "main features",
    "main provisions",
    "key ideas",
    "historical significance",
    "പശ്ചാത്തലം",
    "പ്രധാന ആശയങ്ങൾ",
    "പ്രധാന ആശയ",
    "പ്രധാന വ്യവസ്ഥകൾ",
    "പ്രധാന വ്യവസ്ഥ",
    "ചരിത്രപ്രാധാന്യം",
    "ചരിത്രപരമായ പ്രാധാന്യം",
    "ചരിത്രപരമായ തിരിച്ചറിയൽ ഘടകങ്ങൾ",
    "പ്രധാന തിരിച്ചറിയൽ സൂചകങ്ങൾ",
    "പ്രധാന സംഭവങ്ങൾ",
    "പ്രധാന സംഭാവനകൾ",
    "പ്രത്യേകതകൾ",
    "രചയിതാക്കൾ",
    "പ്രധാന കൃതികൾ",
    "പ്രധാന ലേഖനങ്ങൾ",
    "ആശയപരമായ അടിത്തറ",
    "വിപ്ലവത്തിന്റെ പ്രധാന കാരണങ്ങൾ",
  ].map((label) => label.toLowerCase())
);

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHTML(value);
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractWikiLinkNames(markdown = "") {
  const names = [];
  const seen = new Set();

  WIKI_LINK_PATTERN.lastIndex = 0;
  let match;

  while ((match = WIKI_LINK_PATTERN.exec(markdown)) !== null) {
    const name = match[1].trim();
    const key = normalizeAnchorName(name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }

  return names;
}

function lookupLinkEntry(linkMap, label) {
  if (!linkMap || !label) {
    return null;
  }

  const trimmed = String(label).trim();
  if (linkMap[trimmed]) {
    return linkMap[trimmed];
  }

  const normalized = normalizeAnchorName(trimmed);

  if (linkMap[normalized]) {
    return linkMap[normalized];
  }

  for (const key of Object.keys(linkMap)) {
    const entry = linkMap[key];
    if (normalizeAnchorName(key) === normalized) {
      return entry;
    }
    if (entry?.display_name && normalizeAnchorName(entry.display_name) === normalized) {
      return entry;
    }
  }

  return null;
}

/**
 * Inline [[...]] → inspector gateway controls (not canonical note jumps).
 */
export function renderAnchorNoteLinks(text, linkMap = {}) {
  if (!text) {
    return "";
  }

  const parts = [];
  let lastIndex = 0;

  WIKI_LINK_PATTERN.lastIndex = 0;
  let match;

  while ((match = WIKI_LINK_PATTERN.exec(text)) !== null) {
    parts.push(escapeHTML(text.slice(lastIndex, match.index)));

    const label = match[1].trim();
    const entry = lookupLinkEntry(linkMap, label);
    const display = entry?.display_name ?? label;

    if (entry?.anchor_id) {
      parts.push(
        `<button type="button" class="semantic-anchor existing-anchor anchor-note-semantic-link" data-anchor-id="${escapeAttr(entry.anchor_id)}" data-normalized-name="${escapeAttr(entry.normalized_name ?? normalizeAnchorName(label))}" data-source-text="${escapeAttr(label)}">${escapeHTML(display)}</button>`
      );
    } else {
      parts.push(
        `<span class="anchor-note-unresolved">${escapeHTML(label)}</span>`
      );
    }

    lastIndex = WIKI_LINK_PATTERN.lastIndex;
  }

  parts.push(escapeHTML(text.slice(lastIndex)));
  return parts.join("");
}

function renderInlineLine(line, linkMap) {
  return renderAnchorNoteLinks(line, linkMap);
}

function isBulletLine(line) {
  return /^\s*([-*•])\s+/.test(line);
}

function normalizeSectionHeaderLabel(line = "") {
  return String(line)
    .trim()
    .replace(/\s*:\s*$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * @param {string} line
 * @param {string[]} followingLines
 */
export function isAnchorNoteSectionHeader(line, followingLines = []) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || trimmed.length > 80) {
    return false;
  }

  if (!/^.+\s*:\s*$/u.test(trimmed)) {
    return false;
  }

  const label = normalizeSectionHeaderLabel(trimmed);
  if (!label || label.length < 2) {
    return false;
  }

  if (KNOWN_SECTION_HEADERS.has(label)) {
    return true;
  }

  // Heuristic: unknown "Title :" line followed soon by bullets → structured section.
  const upcoming = followingLines
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .slice(0, 6);

  return upcoming.some(isBulletLine);
}

/**
 * Split new-format notes into prose intro + structured details.
 * Old plain notes return the full text as intro with empty details.
 *
 * @param {string} noteContent
 * @returns {{ intro: string, details: string, hasDetails: boolean }}
 */
export function splitAnchorNoteSections(noteContent = "") {
  const text = String(noteContent ?? "").trim();
  if (!text) {
    return { intro: "", details: "", hasDetails: false };
  }

  const lines = text.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const following = lines.slice(index + 1);
    if (!isAnchorNoteSectionHeader(lines[index], following)) {
      continue;
    }

    const intro = lines.slice(0, index).join("\n").trim();
    const details = lines.slice(index).join("\n").trim();

    if (!details) {
      return { intro: text, details: "", hasDetails: false };
    }

    return {
      intro: intro || "",
      details,
      hasDetails: true,
    };
  }

  return { intro: text, details: "", hasDetails: false };
}

/**
 * @param {string} noteContent
 * @param {Record<string, { anchor_id?: string, display_name?: string, normalized_name?: string }>} [linkMap]
 * @returns {string}
 */
export function renderAnchorNoteBlocks(noteContent = "", linkMap = {}) {
  const text = String(noteContent ?? "").trim();

  if (!text) {
    return "";
  }

  const blocks = text.split(/\n{2,}/);
  const html = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length);

    if (!lines.length) {
      continue;
    }

    if (lines.length === 1 && /^\S.+\s*:\s*$/u.test(lines[0].trim()) && lines[0].trim().length <= 80) {
      const label = lines[0].trim().replace(/\s*:\s*$/, "");
      html.push(
        `<p class="anchor-note-section-heading">${renderInlineLine(label, linkMap)}</p>`
      );
      continue;
    }

    if (lines.every(isBulletLine)) {
      const items = lines
        .map((line) => {
          const itemText = line.replace(/^\s*([-*•])\s+/, "");
          return `<li>${renderInlineLine(itemText, linkMap)}</li>`;
        })
        .join("");
      html.push(`<ul class="anchor-note-list">${items}</ul>`);
      continue;
    }

    // Mixed block: header line + bullets in one paragraph chunk.
    if (
      lines.length > 1 &&
      isAnchorNoteSectionHeader(lines[0], lines.slice(1)) &&
      lines.slice(1).every(isBulletLine)
    ) {
      const label = lines[0].trim().replace(/\s*:\s*$/, "");
      html.push(
        `<p class="anchor-note-section-heading">${renderInlineLine(label, linkMap)}</p>`
      );
      const items = lines
        .slice(1)
        .map((line) => {
          const itemText = line.replace(/^\s*([-*•])\s+/, "");
          return `<li>${renderInlineLine(itemText, linkMap)}</li>`;
        })
        .join("");
      html.push(`<ul class="anchor-note-list">${items}</ul>`);
      continue;
    }

    const paragraph = lines.map((line) => renderInlineLine(line, linkMap)).join("<br>");
    html.push(`<p class="anchor-note-paragraph">${paragraph}</p>`);
  }

  return html.join("");
}

/**
 * @param {string} noteContent
 * @param {Record<string, { anchor_id?: string, display_name?: string, normalized_name?: string }>} [linkMap]
 * @param {{ collapseSections?: boolean }} [options]
 * @returns {string}
 */
export function renderAnchorNote(
  noteContent = "",
  linkMap = {},
  { collapseSections = true } = {}
) {
  const text = String(noteContent ?? "").trim();

  if (!text) {
    return "";
  }

  if (!collapseSections) {
    return renderAnchorNoteBlocks(text, linkMap);
  }

  const { intro, details, hasDetails } = splitAnchorNoteSections(text);

  if (!hasDetails) {
    return renderAnchorNoteBlocks(intro || text, linkMap);
  }

  const introHtml = renderAnchorNoteBlocks(intro, linkMap);
  const detailsHtml = renderAnchorNoteBlocks(details, linkMap);

  return `
    ${introHtml}
    <details class="anchor-note-details">
      <summary class="anchor-note-details-summary">More about this anchor</summary>
      <div class="anchor-note-details-body">
        ${detailsHtml}
      </div>
    </details>
  `.trim();
}
