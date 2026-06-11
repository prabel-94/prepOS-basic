/**
 * "+ Add section" modal for the draft note workspace.
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import {
  getAddableSectionDefinitions,
  mapDefinitionToRepresentationBucket,
} from "./note-section-catalog.js";
import { previewSectionAddition, validateSectionBody } from "./note-section-markdown.js";

let addSectionOverlay = null;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureAddSectionOverlay() {
  if (addSectionOverlay) {
    return addSectionOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-add-section-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-add-section-modal">
      <div class="prepos-modal-header">
        <div class="h2">Add section</div>
        <p class="text-muted mt-5">Paste section content — the MSMDF tag is added automatically.</p>
      </div>
      <div class="prepos-modal-body">
        <label class="note-add-section-field" for="noteAddSectionType">
          <span class="note-add-section-label">Section type</span>
          <select id="noteAddSectionType" class="note-add-section-select"></select>
        </label>
        <p class="note-add-section-hint text-muted" data-section-hint></p>
        <label class="note-add-section-field" for="noteAddSectionBody">
          <span class="note-add-section-label">Section content</span>
          <textarea
            id="noteAddSectionBody"
            class="note-add-section-textarea"
            rows="10"
            spellcheck="false"
            placeholder="Paste or type markdown for this section…"
          ></textarea>
        </label>
        <p class="note-add-section-preview text-muted" data-section-preview>
          Preview: enter content to validate.
        </p>
        <p class="note-add-section-error error hidden" data-section-error></p>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-add-section-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-add-section-save>Add section</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  addSectionOverlay = overlay;
  return overlay;
}

function setError(overlay, message = "") {
  const el = overlay.querySelector("[data-section-error]");
  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

function updatePreview(overlay, options) {
  const previewEl = overlay.querySelector("[data-section-preview]");
  const typeEl = overlay.querySelector("#noteAddSectionType");
  const bodyEl = overlay.querySelector("#noteAddSectionBody");

  if (!previewEl || !typeEl || !bodyEl) {
    return;
  }

  const definition = options.definitions.find((def) => def.id === typeEl.value);
  const body = bodyEl.value;

  if (!definition || !body.trim()) {
    previewEl.textContent = "Preview: enter content to validate.";
    return;
  }

  try {
    validateSectionBody(body);
    const result = previewSectionAddition(options.markdown, definition, body, {
      language: options.language,
      title: options.title,
    });

    const parts = [`✓ ${result.blockCount} block${result.blockCount === 1 ? "" : "s"}`];
    if (result.topicLinkCount) {
      parts.push(
        `${result.topicLinkCount} topic link${result.topicLinkCount === 1 ? "" : "s"}`
      );
    }

    previewEl.textContent = `Preview: ${parts.join(" · ")}`;
    setError(overlay, "");
  } catch (err) {
    previewEl.textContent = "Preview: fix errors before adding.";
    setError(overlay, err.message || "Invalid section content.");
  }
}

function updateHint(overlay, definitions, selectedId) {
  const hintEl = overlay.querySelector("[data-section-hint]");
  const definition = definitions.find((def) => def.id === selectedId);

  if (!hintEl || !definition) {
    return;
  }

  hintEl.textContent = `Will insert ${formatSectionBoundaryHint(definition)} in document order.`;
}

function formatSectionBoundaryHint(definition) {
  return `[${definition.boundaryTag}]`;
}

/**
 * @param {object} options
 * @param {string} options.markdown — current source markdown
 * @param {string} [options.language]
 * @param {string} [options.title]
 * @param {string} [options.preferSectionId] — pre-select section type
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [options.context]
 * @returns {Promise<{ markdown: string, definition: object, representationBucket: string }|null>}
 */
export function openAddSectionModal(options = {}) {
  const overlay = ensureAddSectionOverlay();
  const definitions = getAddableSectionDefinitions(options.context ?? {});
  const typeEl = overlay.querySelector("#noteAddSectionType");
  const bodyEl = overlay.querySelector("#noteAddSectionBody");
  const cancelBtn = overlay.querySelector("[data-add-section-cancel]");
  const saveBtn = overlay.querySelector("[data-add-section-save]");

  if (!definitions.length) {
    window.alert("No section types are available to add.");
    return Promise.resolve(null);
  }

  typeEl.innerHTML = definitions
    .map(
      (def) =>
        `<option value="${escapeHTML(def.id)}">${escapeHTML(def.label)}</option>`
    )
    .join("");

  const preferred =
    definitions.find((def) => def.id === options.preferSectionId)?.id ??
    definitions[0].id;

  typeEl.value = preferred;
  bodyEl.value = "";
  setError(overlay, "");
  updateHint(overlay, definitions, preferred);
  updatePreview(overlay, { ...options, definitions });

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

    function onTypeChange() {
      updateHint(overlay, definitions, typeEl.value);
      updatePreview(overlay, { ...options, definitions });
    }

    function onBodyInput() {
      updatePreview(overlay, { ...options, definitions });
    }

    function onCancel() {
      finish(null);
    }

    function onSave() {
      const definition = definitions.find((def) => def.id === typeEl.value);
      if (!definition) {
        setError(overlay, "Choose a section type.");
        return;
      }

      try {
        const result = previewSectionAddition(
          options.markdown ?? "",
          definition,
          bodyEl.value,
          {
            language: options.language,
            title: options.title,
          }
        );

        finish({
          markdown: result.markdown,
          definition,
          representationBucket: mapDefinitionToRepresentationBucket(definition),
        });
      } catch (err) {
        setError(overlay, err.message || "Could not add section.");
      }
    }

    function cleanup() {
      typeEl.removeEventListener("change", onTypeChange);
      bodyEl.removeEventListener("input", onBodyInput);
      cancelBtn.removeEventListener("click", onCancel);
      saveBtn.removeEventListener("click", onSave);
    }

    typeEl.addEventListener("change", onTypeChange);
    bodyEl.addEventListener("input", onBodyInput);
    cancelBtn.addEventListener("click", onCancel);
    saveBtn.addEventListener("click", onSave);

    openModal(overlay, { overlayType: "modal", onClose: () => finish(null) });
    bodyEl.focus();
  });
}
