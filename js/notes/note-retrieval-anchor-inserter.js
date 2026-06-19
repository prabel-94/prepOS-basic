/**
 * Modal to insert retrieval anchor MSMDF blocks.
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import { formatRetrievalAnchorBlock } from "./note-source-transforms.js";

let retrievalOverlay = null;

function ensureRetrievalOverlay() {
  if (retrievalOverlay) {
    return retrievalOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-retrieval-anchor-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-chronology-editor-modal">
      <div class="prepos-modal-header">
        <div class="h2">Insert retrieval anchor</div>
        <p class="text-muted mt-5">One step per line. Use <code>↓</code> on its own line between steps (added automatically).</p>
      </div>
      <div class="prepos-modal-body">
        <label class="note-add-section-field" for="noteRetrievalSteps">
          <span class="note-add-section-label">Retrieval chain</span>
          <textarea
            id="noteRetrievalSteps"
            class="note-add-section-textarea"
            rows="8"
            spellcheck="false"
            placeholder="[[Cause event]]&#10;[[Consequence]]&#10;Third step"
          ></textarea>
        </label>
        <p class="note-add-section-error error hidden" data-retrieval-error></p>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-retrieval-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-retrieval-save>Insert</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  retrievalOverlay = overlay;
  return overlay;
}

/**
 * @returns {Promise<string|null>}
 */
export function openRetrievalAnchorInserter() {
  const overlay = ensureRetrievalOverlay();
  const stepsEl = overlay.querySelector("#noteRetrievalSteps");
  const errorEl = overlay.querySelector("[data-retrieval-error]");
  const cancelBtn = overlay.querySelector("[data-retrieval-cancel]");
  const saveBtn = overlay.querySelector("[data-retrieval-save]");

  stepsEl.value = "";
  errorEl.textContent = "";
  errorEl.classList.add("hidden");

  return new Promise((resolve) => {
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      closeModal(overlay);
      cleanup();
      resolve(result);
    }

    function onSave() {
      try {
        const steps = String(stepsEl.value ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const block = formatRetrievalAnchorBlock(steps);
        finish(block);
      } catch (err) {
        errorEl.textContent = err.message || "Invalid retrieval anchor.";
        errorEl.classList.remove("hidden");
      }
    }

    function onCancel() {
      finish(null);
    }

    function cleanup() {
      cancelBtn.removeEventListener("click", onCancel);
      saveBtn.removeEventListener("click", onSave);
    }

    cancelBtn.addEventListener("click", onCancel);
    saveBtn.addEventListener("click", onSave);

    openModal(overlay, { overlayType: "modal", onClose: () => finish(null) });
    stepsEl.focus();
  });
}
