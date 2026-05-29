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

/**
 * Restrict anchor-note [[...]] map to student-visible anchors only.
 */
export function filterNoteLinkMapForStudent(noteLinkMap = {}, studentSemanticMap = {}) {
  const filtered = {};

  for (const [key, entry] of Object.entries(noteLinkMap)) {
    if (!entry?.anchor_id) {
      continue;
    }

    const visible = lookupSemanticEntry(studentSemanticMap, key);
    if (visible?.anchor_id) {
      filtered[key] = entry;
    }
  }

  return filtered;
}

function anchorTag(options = {}) {
  return options.anchorElement === "span" ? "span" : "button";
}

function anchorHasNote(entry) {
  return entry?.hasAnchorNote === true || entry?.has_anchor_note === true;
}

function renderMissingAnchorNoteIndicator(entry, options) {
  if (!options.highlightEmptyAnchorNotes || !entry?.anchor_id) {
    return "";
  }

  if (anchorHasNote(entry)) {
    return "";
  }

  const state = entry.state ?? "existing";
  if (state === "dormant" || state === "candidate") {
    return "";
  }

  return `<span class="anchor-note-missing-indicator" aria-hidden="true" title="Anchor note not yet created"></span>`;
}

function renderInteractiveAnchor(
  entry,
  display,
  interactive,
  options,
  className,
  anchorState,
  extra = "",
  emphasisClass = ""
) {
  const tag = anchorTag(options);
  const emphasis = emphasisClass ? ` ${emphasisClass}` : "";
  const missingNoteIndicator = renderMissingAnchorNoteIndicator(entry, options);
  const attrs = [
    `class="semantic-anchor ${className}${emphasis}"`,
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

  return `<${tag} ${attrs.join(" ")}>${escapeHTML(display)}${missingNoteIndicator}${extra}</${tag}>`;
}

function resolveAnchorEmphasisClass(entry, label, options) {
  const tracker = options.anchorOccurrenceTracker;
  if (!tracker?.mark) {
    return "semantic-anchor--primary";
  }

  const occurrence = tracker.mark(label, entry);
  return occurrence === 0 ? "semantic-anchor--primary" : "semantic-anchor--repeat";
}

function renderExistingAnchor(entry, display, interactive, options, label = "") {
  const emphasis = resolveAnchorEmphasisClass(entry, label || display, options);
  return renderInteractiveAnchor(
    entry,
    display,
    interactive,
    options,
    "existing-anchor",
    "existing",
    "",
    emphasis
  );
}

function renderCanonicalAnchor(entry, display, interactive, options, label = "") {
  const emphasis = resolveAnchorEmphasisClass(entry, label || display, options);
  return renderInteractiveAnchor(
    entry,
    display,
    interactive,
    options,
    "canonical-anchor",
    "canonical",
    `<span class="canonical-anchor-indicator" aria-hidden="true">↗</span>`,
    emphasis
  );
}

function renderCandidateAnchor(entry, display, interactive, options, label = "") {
  const emphasis = resolveAnchorEmphasisClass(entry, label || display, options);
  return renderInteractiveAnchor(
    entry,
    display,
    interactive,
    options,
    "candidate-anchor",
    "candidate",
    "",
    emphasis
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

function renderPlainSemanticLabel(entry, label) {
  return escapeHTML(entry?.display_name ?? label);
}

function renderSemanticToken(entry, label, options) {
  const interactive = options.interactive !== false;
  const display = entry.display_name ?? label;
  const state = entry.state ?? "existing";

  if (options.studentMode) {
    if (state === "dormant" || state === "candidate") {
      return renderPlainSemanticLabel(entry, label);
    }

    return renderExistingAnchor(entry, display, interactive, options, label);
  }

  switch (state) {
    case "dormant":
      return renderDormantAnchor(entry, display);
    case "candidate":
      return renderCandidateAnchor(entry, display, interactive, options, label);
    case "canonical":
      return renderCanonicalAnchor(entry, display, interactive, options, label);
    case "existing":
    default:
      return renderExistingAnchor(entry, display, interactive, options, label);
  }
}

/**
 * Replace [[...]] with semantic anchor markup.
 *
 * @param {string} text
 * @param {Record<string, object>} semanticMap
 * @param {{ interactive?: boolean, previewMode?: boolean, studentMode?: boolean, anchorOccurrenceTracker?: { resetParagraph?: () => void, mark?: (label: string, entry?: object) => number } }} [options]
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
