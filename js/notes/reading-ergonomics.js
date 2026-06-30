/**
 * Semantic reading ergonomics — flow, density, progressive disclosure (Phase 2).
 * Pure helpers + lightweight reading-context restore (no parser changes).
 */

import { normalizeAnchorName } from "../anchors/anchor-normalization.js";
import { getReadingClassForRepresentation } from "./note-representations.js";

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

/** @type {{ scrollY: number, anchor: HTMLElement | null } | null} */
let pendingReadingRestore = null;
let suppressNextRestore = false;

/**
 * Per-paragraph anchor occurrence tracking for repeat softening.
 */
export function createAnchorOccurrenceTracker() {
  const perParagraph = new Map();

  return {
    resetParagraph() {
      perParagraph.clear();
    },

    /**
     * @param {string} label
     * @param {{ anchor_id?: string, normalized_name?: string }} [entry]
     * @returns {number} 0 = first in paragraph, 1+ = repeat
     */
    mark(label, entry = {}) {
      const key =
        entry.anchor_id ??
        normalizeAnchorName(entry.normalized_name ?? label) ??
        String(label).trim();

      const count = perParagraph.get(key) ?? 0;
      perParagraph.set(key, count + 1);
      return count;
    },
  };
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countWikiLinksInText(text = "") {
  let count = 0;
  WIKI_LINK_PATTERN.lastIndex = 0;
  while (WIKI_LINK_PATTERN.exec(text)) {
    count += 1;
  }
  return count;
}

/**
 * @param {number} anchorCount
 * @returns {boolean}
 */
export function isDenseParagraph(anchorCount) {
  return anchorCount >= 3;
}

/**
 * Structural tree: shallow-open bias (reading momentum).
 *
 * @param {number} depth
 * @param {number} semanticLevel
 */
export function defaultStructuralExpanded(depth, semanticLevel) {
  if (depth === 0) {
    return true;
  }

  if (depth === 1 && semanticLevel <= 3) {
    return true;
  }

  return false;
}

/**
 * Revision / interpretations / timeline collapsible defaults.
 *
 * @param {string} representationKey
 * @param {number} semanticLevel
 * @param {object} block
 */
export function defaultCollapsibleOpen(representationKey, semanticLevel, block = {}) {
  if (block.metadata_json?.default_open === true) {
    return true;
  }

  if (block.metadata_json?.default_open === false) {
    return false;
  }

  if (representationKey === "timeline") {
    return true;
  }

  if (representationKey === "revision" || representationKey === "interpretations" || representationKey === "quotes" || representationKey === "expansion") {
    return semanticLevel <= 2;
  }

  return semanticLevel <= 2;
}

/**
 * @param {string} representationKey
 * @returns {string}
 */
export function representationReadingClass(representationKey) {
  return getReadingClassForRepresentation(representationKey) ?? "semantic-representation-blocks";
}

/**
 * @param {object} [renderOptions]
 * @returns {object}
 */
export function withReadingErgonomics(renderOptions = {}) {
  return {
    ...renderOptions,
    readingErgonomics: true,
    anchorOccurrenceTracker:
      renderOptions.anchorOccurrenceTracker ?? createAnchorOccurrenceTracker(),
  };
}

/**
 * Preserve scroll + focus before opening cognition inspector.
 *
 * @param {HTMLElement} [anchorEl]
 */
export function captureReadingContext(anchorEl = null) {
  pendingReadingRestore = {
    scrollY: window.scrollY,
    anchor: anchorEl,
  };
}

/**
 * Restore reading position after inspector closes.
 */
export function restoreReadingContextIfNeeded() {
  if (suppressNextRestore) {
    suppressNextRestore = false;
    return;
  }

  if (!pendingReadingRestore) {
    return;
  }

  const { scrollY, anchor } = pendingReadingRestore;
  pendingReadingRestore = null;

  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    anchor?.focus?.({ preventScroll: true });
  });
}

/**
 * Use when an overlay is being closed as part of a workflow transition
 * (e.g. inspector → editor) where restoring scroll immediately would be disruptive.
 */
export function suppressNextReadingRestore() {
  suppressNextRestore = true;
}

/**
 * @param {string} [kind]
 * @returns {boolean}
 */
export function isCognitionInspectorKind(kind = "") {
  return kind === "anchor" || kind === "student-anchor" || kind === "candidate-anchor";
}
