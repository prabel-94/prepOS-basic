/**
 * Modal to insert or edit chronology MSMDF nodes.
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import {
  formatChronologyParagraph,
  parseChronologyParagraph,
} from "./note-chronology.js";

let chronologyOverlay = null;

function ensureChronologyOverlay() {
  if (chronologyOverlay) {
    return chronologyOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-chronology-editor-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-chronology-editor-modal">
      <div class="prepos-modal-header">
        <div class="h2" data-chronology-title>Chronology event</div>
        <p class="text-muted mt-5">Inserts a timeline node: divider / date — event / divider.</p>
      </div>
      <div class="prepos-modal-body">
        <label class="note-add-section-field" for="noteChronologyDate">
          <span class="note-add-section-label">Date or range</span>
          <input id="noteChronologyDate" class="note-add-section-input" type="text" placeholder="e.g. 1947 or 1939–1945">
        </label>
        <label class="note-add-section-field" for="noteChronologyLabel">
          <span class="note-add-section-label">Event label</span>
          <input id="noteChronologyLabel" class="note-add-section-input" type="text" placeholder="e.g. Independence">
        </label>
        <label class="note-add-section-field" for="noteChronologyAnnotation">
          <span class="note-add-section-label">Annotation (optional)</span>
          <textarea id="noteChronologyAnnotation" class="note-add-section-textarea" rows="3" placeholder="Optional context line…"></textarea>
        </label>
        <p class="note-add-section-error error hidden" data-chronology-error></p>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-chronology-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-chronology-save>Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  chronologyOverlay = overlay;
  return overlay;
}

/**
 * @param {{ initial?: { date?: string, label?: string, annotation?: string|null }, mode?: 'insert'|'edit' }} [options]
 * @returns {Promise<string|null>}
 */
export function openChronologyEditor(options = {}) {
  const overlay = ensureChronologyOverlay();
  const dateEl = overlay.querySelector("#noteChronologyDate");
  const labelEl = overlay.querySelector("#noteChronologyLabel");
  const annotationEl = overlay.querySelector("#noteChronologyAnnotation");
  const errorEl = overlay.querySelector("[data-chronology-error]");
  const cancelBtn = overlay.querySelector("[data-chronology-cancel]");
  const saveBtn = overlay.querySelector("[data-chronology-save]");
  const titleEl = overlay.querySelector("[data-chronology-title]");

  const mode = options.mode === "edit" ? "edit" : "insert";
  titleEl.textContent = mode === "edit" ? "Edit chronology event" : "Insert chronology event";

  const initial = options.initial ?? {};
  dateEl.value = initial.date ?? "";
  labelEl.value = initial.label ?? "";
  annotationEl.value = initial.annotation ?? "";
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
        const paragraph = formatChronologyParagraph({
          date: dateEl.value,
          label: labelEl.value,
          annotation: annotationEl.value,
        });
        finish(paragraph);
      } catch (err) {
        errorEl.textContent = err.message || "Invalid chronology event.";
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
    (dateEl.value ? labelEl : dateEl).focus();
  });
}

/**
 * @param {string} sourceParagraph
 * @returns {Promise<string|null>}
 */
export function editChronologyParagraph(sourceParagraph) {
  const parsed = parseChronologyParagraph(sourceParagraph);
  if (!parsed) {
    return Promise.resolve(null);
  }

  return openChronologyEditor({
    mode: "edit",
    initial: parsed,
  });
}
