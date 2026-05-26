/**
 * Lightweight anchor note rendering (markdown-lite, no MSMDF).
 */

import { normalizeAnchorName } from "./anchor-normalization.js";

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

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

/**
 * @param {string} noteContent
 * @param {Record<string, { anchor_id?: string, display_name?: string, normalized_name?: string }>} [linkMap]
 * @returns {string}
 */
export function renderAnchorNote(noteContent = "", linkMap = {}) {
  const text = String(noteContent ?? "").trim();

  if (!text) {
    return "";
  }

  const blocks = text.split(/\n{2,}/);
  const html = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.length);

    if (!lines.length) {
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

    const paragraph = lines.map((line) => renderInlineLine(line, linkMap)).join("<br>");
    html.push(`<p class="anchor-note-paragraph">${paragraph}</p>`);
  }

  return html.join("");
}
