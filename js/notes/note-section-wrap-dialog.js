/**
 * Modal to name a new collapsible section heading.
 */

import { openModal, closeModal } from "../ui/modal-system.js";

let sectionWrapOverlay = null;

function ensureSectionWrapOverlay() {
  if (sectionWrapOverlay) {
    return sectionWrapOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-section-wrap-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-section-wrap-modal">
      <div class="prepos-modal-header">
        <div class="h2">Wrap as section</div>
        <p class="text-muted mt-5">Creates a heading above the selection. On Revision, Expansion, Timeline, and similar tabs the section becomes collapsible in the reader.</p>
      </div>
      <div class="prepos-modal-body">
        <label class="note-add-section-field" for="noteSectionWrapTitle">
          <span class="note-add-section-label">Section title</span>
          <input id="noteSectionWrapTitle" class="note-add-section-input" type="text" placeholder="Section title">
        </label>
        <label class="note-add-section-field" for="noteSectionWrapLevel">
          <span class="note-add-section-label">Heading level</span>
          <select id="noteSectionWrapLevel" class="note-add-section-input" aria-label="Heading level">
            <option value="2">H2 — top-level section</option>
            <option value="3">H3 — nested section</option>
            <option value="4">H4</option>
            <option value="5">H5</option>
            <option value="6">H6</option>
          </select>
        </label>
        <p class="note-add-section-error error hidden" data-section-wrap-error></p>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-section-wrap-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-section-wrap-save>Wrap section</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  sectionWrapOverlay = overlay;
  return overlay;
}

/**
 * @param {{ defaultTitle?: string, defaultLevel?: number }} [options]
 * @returns {Promise<{ title: string, level: number }|null>}
 */
export function openSectionWrapDialog(options = {}) {
  const overlay = ensureSectionWrapOverlay();
  const titleEl = overlay.querySelector("#noteSectionWrapTitle");
  const levelEl = overlay.querySelector("#noteSectionWrapLevel");
  const errorEl = overlay.querySelector("[data-section-wrap-error]");
  const cancelBtn = overlay.querySelector("[data-section-wrap-cancel]");
  const saveBtn = overlay.querySelector("[data-section-wrap-save]");

  const defaultLevel = Math.min(Math.max(Number(options.defaultLevel) || 2, 2), 6);
  titleEl.value = String(options.defaultTitle ?? "").trim();
  levelEl.value = String(defaultLevel);
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
      const title = titleEl.value.trim();
      if (!title) {
        errorEl.textContent = "Enter a section title.";
        errorEl.classList.remove("hidden");
        return;
      }

      finish({
        title,
        level: Math.min(Math.max(Number(levelEl.value) || 2, 2), 6),
      });
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
    titleEl.focus();
    titleEl.select();
  });
}
