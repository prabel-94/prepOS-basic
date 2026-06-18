/**
 * Topic name picker for wiki links in the draft preview toolbar.
 */

import { getClient } from "../core/get-client.js";
import { searchTopicsForCanonical } from "../anchors/anchor-selectors.js";
import { openModal, closeModal } from "../ui/modal-system.js";

let topicLinkPickerOverlay = null;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureTopicLinkPickerOverlay() {
  if (topicLinkPickerOverlay) {
    return topicLinkPickerOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-topic-link-picker-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-topic-link-picker-modal">
      <div class="prepos-modal-header">
        <div class="h2">Link to topic</div>
        <p class="text-muted mt-5">Search existing topics. Inserts <code>[[Topic Name]]</code> in markdown.</p>
      </div>
      <div class="prepos-modal-body">
        <input
          type="search"
          id="noteTopicLinkSearch"
          class="note-topic-link-search"
          placeholder="Search topics…"
          autocomplete="off"
        >
        <ul id="noteTopicLinkResults" class="note-topic-link-results"></ul>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-topic-link-cancel>Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  topicLinkPickerOverlay = overlay;
  return overlay;
}

/**
 * @param {{ initialQuery?: string }} [options]
 * @returns {Promise<string|null>} topic display name for [[...]] or null if cancelled
 */
export function pickTopicLinkName(options = {}) {
  const overlay = ensureTopicLinkPickerOverlay();
  const searchEl = overlay.querySelector("#noteTopicLinkSearch");
  const resultsEl = overlay.querySelector("#noteTopicLinkResults");
  const cancelBtn = overlay.querySelector("[data-topic-link-cancel]");

  return new Promise((resolve) => {
    let settled = false;

    function finish(name) {
      if (settled) {
        return;
      }

      settled = true;
      closeModal(overlay);
      cleanup();
      resolve(name);
    }

    async function renderResults(query = "") {
      if (!resultsEl) {
        return;
      }

      resultsEl.innerHTML = `<li class="text-muted">Searching…</li>`;

      try {
        const sb = await getClient();
        const topics = await searchTopicsForCanonical(sb, query, 25);

        if (!topics.length) {
          resultsEl.innerHTML = `<li class="text-muted">No topics found.</li>`;
          return;
        }

        resultsEl.innerHTML = topics
          .map(
            (topic) => `
          <li>
            <button type="button" class="note-topic-link-option" data-topic-name="${escapeHTML(topic.name)}">
              ${escapeHTML(topic.name)}
            </button>
          </li>
        `
          )
          .join("");

        resultsEl.querySelectorAll(".note-topic-link-option").forEach((btn) => {
          btn.addEventListener("click", () => {
            finish(btn.dataset.topicName ?? null);
          });
        });
      } catch (err) {
        resultsEl.innerHTML = `<li class="text-muted">${escapeHTML(err.message || "Search failed.")}</li>`;
      }
    }

    function onSearchInput() {
      renderResults(searchEl?.value ?? "");
    }

    function onCancel() {
      finish(null);
    }

    function cleanup() {
      searchEl?.removeEventListener("input", onSearchInput);
      cancelBtn?.removeEventListener("click", onCancel);
    }

    if (searchEl) {
      searchEl.value = options.initialQuery ?? "";
      searchEl.addEventListener("input", onSearchInput);
    }

    cancelBtn?.addEventListener("click", onCancel);

    openModal(overlay, { overlayType: "modal", onClose: () => finish(null) });
    renderResults(searchEl?.value ?? "");
    searchEl?.focus();
    searchEl?.select();
  });
}
