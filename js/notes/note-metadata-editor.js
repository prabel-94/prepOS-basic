/**
 * Metadata editor modal for [METADATA] MSMDF section.
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import { readMetadataFromMarkdown, writeMetadataToMarkdown } from "./note-metadata-markdown.js";

let metadataOverlay = null;

const METADATA_FIELDS = [
  { key: "title", label: "Title" },
  { key: "language", label: "Language" },
  { key: "map_version", label: "Map version" },
  { key: "canonical_version", label: "Canonical version" },
  { key: "source_type", label: "Source type" },
];

function ensureMetadataOverlay() {
  if (metadataOverlay) {
    return metadataOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-metadata-editor-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-chronology-editor-modal">
      <div class="prepos-modal-header">
        <div class="h2">Note metadata</div>
        <p class="text-muted mt-5">Edits the <code>[METADATA]</code> section in semantic markdown.</p>
      </div>
      <div class="prepos-modal-body" data-metadata-fields></div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-metadata-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-metadata-save>Save metadata</button>
      </div>
    </div>
  `;

  const fieldsEl = overlay.querySelector("[data-metadata-fields]");
  fieldsEl.innerHTML = METADATA_FIELDS.map(
    (field) => `
    <label class="note-add-section-field" for="noteMetadata_${field.key}">
      <span class="note-add-section-label">${field.label}</span>
      <input id="noteMetadata_${field.key}" class="note-add-section-input" type="text" data-metadata-key="${field.key}">
    </label>
  `
  ).join("");

  document.body.appendChild(overlay);
  metadataOverlay = overlay;
  return overlay;
}

/**
 * @param {string} markdown
 * @returns {Promise<string|null>}
 */
export function openMetadataEditor(markdown) {
  const overlay = ensureMetadataOverlay();
  const cancelBtn = overlay.querySelector("[data-metadata-cancel]");
  const saveBtn = overlay.querySelector("[data-metadata-save]");
  const current = readMetadataFromMarkdown(markdown);

  for (const field of METADATA_FIELDS) {
    const input = overlay.querySelector(`#noteMetadata_${field.key}`);
    if (input) {
      input.value = current[field.key] ?? "";
    }
  }

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
      const metadata = {};
      for (const field of METADATA_FIELDS) {
        const input = overlay.querySelector(`#noteMetadata_${field.key}`);
        const value = input?.value?.trim();
        if (value) {
          metadata[field.key] = value;
        }
      }

      finish(writeMetadataToMarkdown(markdown, metadata));
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
    overlay.querySelector("#noteMetadata_title")?.focus();
  });
}
