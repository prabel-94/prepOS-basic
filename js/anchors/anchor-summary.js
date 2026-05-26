/**
 * Semantic state summaries for draft preview and future publish review.
 * Pure functions — no DOM, no Supabase.
 */

import { normalizeAnchorName } from "./anchor-normalization.js";
import {
  ANCHOR_RESOLUTION_KINDS,
  ANCHOR_TYPES,
  NOTE_ANCHOR_STATES,
} from "./anchor-types.js";

/**
 * Visual state used by renderer and counters (kept in sync).
 * @param {object} candidate
 * @returns {"existing"|"canonical"|"candidate"|"dormant"}
 */
export function resolveSemanticVisualState(candidate = {}) {
  const localState =
    candidate.note_anchor_state ??
    candidate.link_state ??
    null;

  if (localState === NOTE_ANCHOR_STATES.DORMANT) {
    return "dormant";
  }

  if (localState === NOTE_ANCHOR_STATES.CANDIDATE) {
    return "candidate";
  }

  if (localState === NOTE_ANCHOR_STATES.ACTIVE) {
    if (
      candidate.anchor_type === ANCHOR_TYPES.CANONICAL ||
      candidate.canonical_topic_id
    ) {
      return "canonical";
    }
    return "existing";
  }

  if (candidate.state === NOTE_ANCHOR_STATES.DORMANT) {
    return "dormant";
  }

  if (
    candidate.resolution === ANCHOR_RESOLUTION_KINDS.CANONICAL ||
    candidate.anchor_type === ANCHOR_TYPES.CANONICAL ||
    candidate.canonical_topic_id
  ) {
    if (
      candidate.state === NOTE_ANCHOR_STATES.CANDIDATE ||
      !candidate.anchor_id
    ) {
      return candidate.canonical_topic_id ? "canonical" : "candidate";
    }
    return "canonical";
  }

  if (candidate.state === NOTE_ANCHOR_STATES.CANDIDATE || !candidate.anchor_id) {
    return "candidate";
  }

  return "existing";
}

/**
 * Count unique semantic entities by normalized_name + visual state.
 *
 * @param {Array} resolvedCandidates
 * @returns {{ existing: number, canonical: number, candidate: number, dormant: number, total: number }}
 */
export function buildSemanticStateSummary(resolvedCandidates = []) {
  const summary = {
    existing: 0,
    canonical: 0,
    candidate: 0,
    dormant: 0,
    total: 0,
  };

  const seen = new Set();

  for (const candidate of resolvedCandidates) {
    const normalized = normalizeAnchorName(
      candidate.normalized_name ?? candidate.source_text ?? ""
    );

    if (!normalized) {
      continue;
    }

    const visualState = resolveSemanticVisualState(candidate);
    const dedupeKey = `${normalized}:${visualState}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    summary[visualState] += 1;
    summary.total += 1;
  }

  return summary;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function buildSummaryFooter(summary) {
  const { candidate } = summary;

  if (candidate <= 0) {
    return "";
  }

  const label = pluralize(candidate, "candidate anchor", "candidate anchors");
  return `${candidate} ${label} remain unresolved.`;
}

/**
 * @param {{ existing: number, canonical: number, candidate: number, dormant: number, total: number }} summary
 * @returns {string}
 */
export function renderSemanticStateSummary(summary = {}) {
  const counts = {
    existing: summary.existing ?? 0,
    canonical: summary.canonical ?? 0,
    candidate: summary.candidate ?? 0,
    dormant: summary.dormant ?? 0,
  };

  const footer = buildSummaryFooter(counts);

  return `
    <section class="semantic-summary-panel" aria-label="Semantic summary">
      <div class="semantic-summary-header">Semantic Summary</div>
      <div class="semantic-summary-grid">
        <div class="semantic-summary-item">
          <span class="semantic-summary-label">Existing</span>
          <span class="semantic-summary-value">${escapeHTML(counts.existing)}</span>
        </div>
        <div class="semantic-summary-item">
          <span class="semantic-summary-label">Canonical</span>
          <span class="semantic-summary-value">${escapeHTML(counts.canonical)}</span>
        </div>
        <div class="semantic-summary-item">
          <span class="semantic-summary-label">Candidate</span>
          <span class="semantic-summary-value candidate-count">${escapeHTML(counts.candidate)}</span>
        </div>
        <div class="semantic-summary-item">
          <span class="semantic-summary-label">Dormant</span>
          <span class="semantic-summary-value dormant-count">${escapeHTML(counts.dormant)}</span>
        </div>
      </div>
      ${
        footer
          ? `<div class="semantic-summary-footer">${escapeHTML(footer)}</div>`
          : ""
      }
    </section>
  `;
}
