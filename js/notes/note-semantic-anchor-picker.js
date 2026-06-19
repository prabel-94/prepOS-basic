/**
 * Semantic anchor picker for draft preview wiki-link insertion.
 */

import { getClient } from "../core/get-client.js";
import { openModal, closeModal } from "../ui/modal-system.js";
import { normalizeLanguage } from "./note-variants.js";

let anchorPickerOverlay = null;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function searchAnchorsForPicker(sb, query = "", language = "english", limit = 25) {
  const lang = normalizeLanguage(language);
  let request = sb
    .from("anchor_variants")
    .select("display_name, normalized_name, language, anchors ( id, anchor_type )")
    .eq("language", lang)
    .order("display_name")
    .limit(limit);

  const trimmed = String(query ?? "").trim();
  if (trimmed) {
    request = request.ilike("display_name", `%${trimmed}%`);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function ensureAnchorPickerOverlay() {
  if (anchorPickerOverlay) {
    return anchorPickerOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-semantic-anchor-picker-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-topic-link-picker-modal">
      <div class="prepos-modal-header">
        <div class="h2">Insert semantic anchor</div>
        <p class="text-muted mt-5">Search governed anchors. Inserts <code>[[Anchor Name]]</code> in markdown.</p>
      </div>
      <div class="prepos-modal-body">
        <input type="search" id="noteSemanticAnchorSearch" class="note-topic-link-search" placeholder="Search anchors…" autocomplete="off">
        <ul id="noteSemanticAnchorResults" class="note-topic-link-results"></ul>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-anchor-picker-cancel>Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  anchorPickerOverlay = overlay;
  return overlay;
}

/**
 * @param {{ language?: string, initialQuery?: string }} [options]
 * @returns {Promise<string|null>}
 */
export function pickSemanticAnchorName(options = {}) {
  const overlay = ensureAnchorPickerOverlay();
  const searchEl = overlay.querySelector("#noteSemanticAnchorSearch");
  const resultsEl = overlay.querySelector("#noteSemanticAnchorResults");
  const cancelBtn = overlay.querySelector("[data-anchor-picker-cancel]");

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
      resultsEl.innerHTML = `<li class="text-muted">Searching…</li>`;

      try {
        const sb = await getClient();
        const anchors = await searchAnchorsForPicker(
          sb,
          query,
          options.language ?? "english"
        );

        if (!anchors.length) {
          resultsEl.innerHTML = `<li class="text-muted">No anchors found for this language.</li>`;
          return;
        }

        resultsEl.innerHTML = anchors
          .map(
            (anchor) => `
          <li>
            <button type="button" class="note-topic-link-option" data-anchor-name="${escapeHTML(anchor.display_name)}">
              ${escapeHTML(anchor.display_name)}
            </button>
          </li>
        `
          )
          .join("");

        resultsEl.querySelectorAll(".note-topic-link-option").forEach((btn) => {
          btn.addEventListener("click", () => {
            finish(btn.dataset.anchorName ?? null);
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
  });
}
