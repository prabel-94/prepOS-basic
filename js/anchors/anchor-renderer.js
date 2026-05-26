/**
 * Pure semantic inline rendering ([[...]] → HTML).
 * No fetches, no DOM, no global state.
 */

import { normalizeAnchorName } from "./anchor-normalization.js";

const TOPIC_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

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
 * @param {Record<string, object>} semanticMap
 * @param {string} label
 */
export function lookupSemanticEntry(semanticMap, label) {
  if (!semanticMap || !label) {
    return null;
  }

  const trimmed = String(label).trim();
  if (!trimmed) {
    return null;
  }

  if (semanticMap[trimmed]) {
    return semanticMap[trimmed];
  }

  const normalized = normalizeAnchorName(trimmed);

  if (semanticMap[normalized]) {
    return semanticMap[normalized];
  }

  for (const key of Object.keys(semanticMap)) {
    const entry = semanticMap[key];
    if (!entry) {
      continue;
    }

    if (normalizeAnchorName(key) === normalized) {
      return entry;
    }

    if (entry.display_name && normalizeAnchorName(entry.display_name) === normalized) {
      return entry;
    }

    if (entry.source_text && normalizeAnchorName(entry.source_text) === normalized) {
      return entry;
    }
  }

  return null;
}

function anchorTag(options = {}) {
  return options.anchorElement === "span" ? "span" : "button";
}

function renderInteractiveAnchor(
  entry,
  display,
  interactive,
  options,
  className,
  anchorState,
  extra = ""
) {
  const tag = anchorTag(options);
  const attrs = [
    `class="semantic-anchor ${className}"`,
    `data-anchor-state="${anchorState}"`,
    `data-source-text="${escapeAttr(entry.source_text ?? display)}"`,
    `data-normalized-name="${escapeAttr(entry.normalized_name ?? "")}"`,
  ];

  if (tag === "button") {
    attrs.push(`type="button"`);
  } else {
    attrs.push(`role="button"`);
  }

  if (entry.anchor_id) {
    attrs.push(`data-anchor-id="${escapeAttr(entry.anchor_id)}"`);
  }

  if (entry.canonical_topic_id) {
    attrs.push(`data-canonical-topic-id="${escapeAttr(entry.canonical_topic_id)}"`);
  }

  if (interactive) {
    attrs.push(`tabindex="0"`);
  } else {
    attrs.push(`tabindex="-1"`);
  }

  return `<${tag} ${attrs.join(" ")}>${escapeHTML(display)}${extra}</${tag}>`;
}

function renderExistingAnchor(entry, display, interactive, options) {
  return renderInteractiveAnchor(
    entry,
    display,
    interactive,
    options,
    "existing-anchor",
    "existing"
  );
}

function renderCanonicalAnchor(entry, display, interactive, options) {
  return renderInteractiveAnchor(
    entry,
    display,
    interactive,
    options,
    "canonical-anchor",
    "canonical",
    `<span class="canonical-anchor-indicator" aria-hidden="true">↗</span>`
  );
}

function renderCandidateAnchor(entry, display, interactive, options) {
  return renderInteractiveAnchor(
    entry,
    display,
    interactive,
    options,
    "candidate-anchor",
    "candidate"
  );
}

function renderDormantAnchor(entry, display) {
  const attrs = [
    `class="semantic-anchor dormant-anchor"`,
    `data-anchor-state="dormant"`,
    `data-source-text="${escapeAttr(entry.source_text ?? display)}"`,
    `data-normalized-name="${escapeAttr(entry.normalized_name ?? "")}"`,
  ];

  if (entry.anchor_id) {
    attrs.push(`data-anchor-id="${escapeAttr(entry.anchor_id)}"`);
  }

  return `<span ${attrs.join(" ")}>${escapeHTML(display)}</span>`;
}

function renderSemanticToken(entry, label, options) {
  const interactive = options.interactive !== false;
  const display = entry.display_name ?? label;
  const state = entry.state ?? "existing";

  switch (state) {
    case "dormant":
      return renderDormantAnchor(entry, display);
    case "candidate":
      return renderCandidateAnchor(entry, display, interactive, options);
    case "canonical":
      return renderCanonicalAnchor(entry, display, interactive, options);
    case "existing":
    default:
      return renderExistingAnchor(entry, display, interactive, options);
  }
}

/**
 * Replace [[...]] with semantic anchor markup.
 *
 * @param {string} text
 * @param {Record<string, object>} semanticMap
 * @param {{ interactive?: boolean, previewMode?: boolean }} [options]
 * @returns {string}
 */
export function renderSemanticAnchors(text, semanticMap = {}, options = {}) {
  if (!text) {
    return "";
  }

  const parts = [];
  let lastIndex = 0;
  let match;

  TOPIC_LINK_PATTERN.lastIndex = 0;

  while ((match = TOPIC_LINK_PATTERN.exec(text)) !== null) {
    parts.push(escapeHTML(text.slice(lastIndex, match.index)));

    const label = match[1].trim();
    const entry = lookupSemanticEntry(semanticMap, label);

    if (entry) {
      parts.push(renderSemanticToken(entry, label, options));
    } else {
      parts.push(escapeHTML(label));
    }

    lastIndex = TOPIC_LINK_PATTERN.lastIndex;
  }

  parts.push(escapeHTML(text.slice(lastIndex)));
  return parts.join("");
}
