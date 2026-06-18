/**
 * Advisory semantic publish review (never blocks publishing).
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import {
  buildSemanticStateSummary,
  renderSemanticStateSummary,
  resolveSemanticVisualState,
} from "./anchor-summary.js";
import { normalizeAnchorName } from "./anchor-normalization.js";
import { prepareDraftSemanticPreview } from "./anchor-preview.js";

const MAX_LIST_ITEMS = 10;

let publishReviewOverlay = null;

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueDisplayNamesByVisualState(candidates = [], visualState) {
  const seen = new Set();
  const names = [];

  for (const candidate of candidates) {
    if (resolveSemanticVisualState(candidate) !== visualState) {
      continue;
    }

    const normalized = normalizeAnchorName(
      candidate.normalized_name ?? candidate.source_text ?? ""
    );

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    names.push(candidate.display_name ?? candidate.source_text ?? normalized);
  }

  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function buildRecommendations(summary = {}) {
  const recommendations = [];

  if (summary.candidate > 0) {
    recommendations.push(
      "This note contains unresolved semantic candidates."
    );
  }

  if (summary.existing > 0) {
    recommendations.push(
      "This note references recurring anchors that may deserve canonical promotion."
    );
  }

  if (summary.dormant > 0) {
    recommendations.push(
      "This note contains dormant anchors intentionally excluded from semantic interaction."
    );
  }

  if (summary.canonical > 0) {
    recommendations.push(
      "This note links to canonical topic anchors across the knowledge layer."
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "No specific semantic conditions to highlight before publishing."
    );
  }

  return recommendations;
}

/**
 * @param {object} input
 * @param {Array} input.resolvedCandidates
 * @param {object} [input.summary]
 * @param {object} [input.variant]
 * @param {Record<string, object>} [input.semanticMap]
 */
export function buildSemanticPublishReview({
  resolvedCandidates = [],
  summary = null,
  variant = null,
  semanticMap = {},
} = {}) {
  const builtSummary =
    summary ?? buildSemanticStateSummary(resolvedCandidates);

  return {
    summary: builtSummary,
    recommendations: buildRecommendations(builtSummary),
    unresolvedCandidates: uniqueDisplayNamesByVisualState(
      resolvedCandidates,
      "candidate"
    ),
    dormantAnchors: uniqueDisplayNamesByVisualState(
      resolvedCandidates,
      "dormant"
    ),
    canonicalAnchors: uniqueDisplayNamesByVisualState(
      resolvedCandidates,
      "canonical"
    ),
    existingAnchors: uniqueDisplayNamesByVisualState(
      resolvedCandidates,
      "existing"
    ),
    publishAllowed: true,
    variant,
    semanticMap,
  };
}

function renderNameList(items = [], { emptyLabel = "None" } = {}) {
  if (!items.length) {
    return `<p class="semantic-review-note">${escapeHTML(emptyLabel)}</p>`;
  }

  const shown = items.slice(0, MAX_LIST_ITEMS);
  const remaining = items.length - shown.length;

  const listItems = shown.map((name) => `<li>${escapeHTML(name)}</li>`).join("");

  const more =
    remaining > 0
      ? `<li class="semantic-review-more">+ ${escapeHTML(remaining)} more</li>`
      : "";

  return `<ul class="semantic-review-list">${listItems}${more}</ul>`;
}

/**
 * @param {ReturnType<typeof buildSemanticPublishReview>} review
 * @returns {string}
 */
export function renderSemanticPublishReview(review = {}) {
  const summaryHtml = renderSemanticStateSummary(review.summary ?? {}, {
    hideFooter: true,
    heading: "Semantic Summary",
  });

  const recommendationsHtml = (review.recommendations ?? [])
    .map((line) => `<li>${escapeHTML(line)}</li>`)
    .join("");

  const candidateSection =
    review.unresolvedCandidates?.length > 0
      ? `
    <div class="semantic-review-section">
      <div class="semantic-review-title">Unresolved Candidates</div>
      <p class="semantic-review-note">Editorially unresolved in this note — not errors.</p>
      ${renderNameList(review.unresolvedCandidates)}
    </div>
  `
      : "";

  const dormantSection =
    review.dormantAnchors?.length > 0
      ? `
    <div class="semantic-review-section">
      <div class="semantic-review-title">Dormant Anchors</div>
      <p class="semantic-review-note">Intentionally inactive in this note.</p>
      ${renderNameList(review.dormantAnchors)}
    </div>
  `
      : "";

  return `
    <div class="semantic-publish-review">
      <p class="semantic-review-note">
        Review semantic conditions before publishing. This is editorial guidance only — you may publish at any time.
      </p>
      <div class="semantic-review-section">
        ${summaryHtml}
      </div>
      <div class="semantic-review-section">
        <div class="semantic-review-title">Recommendations</div>
        <ul class="semantic-review-list">${recommendationsHtml}</ul>
      </div>
      ${candidateSection}
      ${dormantSection}
    </div>
  `;
}

function ensurePublishReviewOverlay() {
  if (publishReviewOverlay) {
    return publishReviewOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "semantic-publish-review-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content teacher-intel-inspector-content semantic-publish-review-modal">
      <div class="prepos-modal-header">
        <div class="h2">Semantic Publish Review</div>
        <p class="text-muted mt-5">Publication awareness · advisory only</p>
      </div>
      <div class="prepos-modal-body" data-publish-review-body></div>
      <div class="prepos-modal-footer semantic-review-footer">
        <button type="button" class="secondary-btn" data-publish-review-return>Return to Draft</button>
        <button type="button" class="primary-btn" data-publish-review-confirm>Publish Variant</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  publishReviewOverlay = overlay;
  return overlay;
}

/**
 * Open advisory publish review modal.
 * @param {{ review: object, onReturn?: () => void, onPublish?: () => void|Promise<void> }} options
 */
export function openSemanticPublishReview({ review, onReturn, onPublish } = {}) {
  const overlay = ensurePublishReviewOverlay();
  const bodyEl = overlay.querySelector("[data-publish-review-body]");
  const returnBtn = overlay.querySelector("[data-publish-review-return]");
  const publishBtn = overlay.querySelector("[data-publish-review-confirm]");

  if (bodyEl) {
    bodyEl.innerHTML = renderSemanticPublishReview(review);
  }

  if (publishBtn) {
    publishBtn.disabled = false;
    publishBtn.removeAttribute("aria-disabled");
  }

  if (returnBtn) {
    returnBtn.onclick = () => {
      closeModal(overlay);
      onReturn?.();
    };
  }

  if (publishBtn) {
    publishBtn.onclick = async () => {
      try {
        await onPublish?.();
      } catch (err) {
        console.error("[Semantic publish review]", err);
        window.alert(err.message || "Publish failed.");
      }
    };
  }

  openModal(overlay, { overlayType: "critical-dialog" });
}

/**
 * Build review from draft source and open modal.
 */
export async function openSemanticPublishReviewForDraft({
  variant,
  rawMarkdown,
  title,
  language,
  sectionExtensions,
  onReturn,
  onPublish,
} = {}) {
  const preview = await prepareDraftSemanticPreview(rawMarkdown, {
    language,
    title,
    variantId: variant?.id,
    sectionExtensions,
  });

  const review = buildSemanticPublishReview({
    resolvedCandidates: preview.resolvedCandidates,
    summary: preview.summary,
    variant,
    semanticMap: preview.semanticMap,
  });

  openSemanticPublishReview({ review, onReturn, onPublish });

  return review;
}
