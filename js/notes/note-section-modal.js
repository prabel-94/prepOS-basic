/**
 * Section modal for the draft note workspace — add, edit, and custom sections.
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import {
  CUSTOM_RENDERER_PROFILES,
  getAddableSectionDefinitions,
  getDefinitionById,
  mapDefinitionToRepresentationBucket,
  sectionIdToBoundaryTag,
  slugifySectionLabel,
} from "./note-section-catalog.js";
import { bindMarkdownFileDrop } from "./note-import-file.js";
import {
  createCustomSectionDefinition,
  getSectionBody,
  previewSectionAddition,
  previewSectionEdit,
  validateSectionBody,
} from "./note-section-markdown.js";

let sectionModalOverlay = null;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureSectionModalOverlay() {
  if (sectionModalOverlay) {
    return sectionModalOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "note-section-modal-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content note-add-section-modal">
      <div class="prepos-modal-header">
        <div class="h2" data-section-modal-title>Add section</div>
        <p class="text-muted mt-5" data-section-modal-subtitle>
          Paste or drop a markdown file — the MSMDF tag is added automatically.
        </p>
      </div>
      <div class="prepos-modal-body">
        <fieldset class="note-section-kind-field hidden" data-section-kind-field>
          <legend class="note-section-kind-legend">Section kind</legend>
          <label class="note-section-kind-option">
            <input type="radio" name="noteSectionKind" value="builtin" checked>
            Standard MSMDF section
          </label>
          <label class="note-section-kind-option">
            <input type="radio" name="noteSectionKind" value="custom">
            Custom section
          </label>
        </fieldset>

        <label class="note-add-section-field" for="noteAddSectionType" data-builtin-type-field>
          <span class="note-add-section-label">Section type</span>
          <select id="noteAddSectionType" class="note-add-section-select"></select>
        </label>

        <label class="note-add-section-field hidden" for="noteCustomSectionName" data-custom-name-field>
          <span class="note-add-section-label">Custom section name</span>
          <input
            id="noteCustomSectionName"
            class="note-add-section-input"
            type="text"
            placeholder="e.g. Case Studies"
            autocomplete="off"
          >
        </label>

        <label class="note-add-section-field hidden" for="noteCustomSectionProfile" data-custom-profile-field>
          <span class="note-add-section-label">Render as</span>
          <select id="noteCustomSectionProfile" class="note-add-section-select"></select>
        </label>

        <p class="note-add-section-hint text-muted hidden" data-custom-tag-preview></p>
        <p class="note-add-section-hint text-muted" data-section-hint></p>

        <label class="note-add-section-field" for="noteAddSectionBody" data-section-body-field>
          <span class="note-add-section-label">Section content</span>
          <textarea
            id="noteAddSectionBody"
            class="note-add-section-textarea"
            rows="10"
            spellcheck="false"
            placeholder="Paste, type, or drop a .md file for this section…"
          ></textarea>
        </label>
        <p class="note-add-section-preview text-muted" data-section-preview>
          Preview: enter content to validate.
        </p>
        <p class="note-add-section-error error hidden" data-section-error></p>
      </div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-section-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-section-save>Save section</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  sectionModalOverlay = overlay;
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

function getSelectedKind(overlay) {
  const selected = overlay.querySelector('input[name="noteSectionKind"]:checked');
  return selected?.value === "custom" ? "custom" : "builtin";
}

function updateKindVisibility(overlay, mode) {
  const kindField = overlay.querySelector("[data-section-kind-field]");
  const builtinField = overlay.querySelector("[data-builtin-type-field]");
  const customNameField = overlay.querySelector("[data-custom-name-field]");
  const customProfileField = overlay.querySelector("[data-custom-profile-field]");
  const tagPreview = overlay.querySelector("[data-custom-tag-preview]");

  const isAdd = mode === "add";
  const kind = getSelectedKind(overlay);
  const isCustom = isAdd && kind === "custom";

  kindField?.classList.toggle("hidden", !isAdd);
  builtinField?.classList.toggle("hidden", !isAdd || isCustom);
  customNameField?.classList.toggle("hidden", !isCustom);
  customProfileField?.classList.toggle("hidden", !isCustom);
  tagPreview?.classList.toggle("hidden", !isCustom);
}

function updateCustomTagPreview(overlay) {
  const previewEl = overlay.querySelector("[data-custom-tag-preview]");
  const nameEl = overlay.querySelector("#noteCustomSectionName");

  if (!previewEl || !nameEl) {
    return;
  }

  const slug = slugifySectionLabel(nameEl.value);
  if (!slug) {
    previewEl.textContent = "Tag preview: enter a section name.";
    return;
  }

  try {
    const tag = sectionIdToBoundaryTag(slug);
    previewEl.textContent = `Will insert [${tag}] in document order.`;
  } catch {
    previewEl.textContent = "Tag preview: enter a valid section name.";
  }
}

function updateHint(overlay, options) {
  const hintEl = overlay.querySelector("[data-section-hint]");
  const typeEl = overlay.querySelector("#noteAddSectionType");

  if (options.mode === "edit") {
    const definition = getDefinitionById(options.sectionId, options.context ?? {});
    if (hintEl && definition) {
      hintEl.textContent = `Editing [${definition.boundaryTag}] — section tag is not shown below.`;
    }
    return;
  }

  if (getSelectedKind(overlay) === "custom") {
    if (hintEl) {
      hintEl.textContent = "Custom sections appear as their own reader tab.";
    }
    return;
  }

  const definition = options.definitions.find((def) => def.id === typeEl?.value);
  if (!hintEl || !definition) {
    return;
  }

  hintEl.textContent = `Will insert [${definition.boundaryTag}] in document order.`;
}

/**
 * @param {object} options
 * @param {'add'|'edit'} [options.mode]
 * @param {string} [options.sectionId]
 * @param {string} options.markdown
 * @param {string} [options.language]
 * @param {string} [options.title]
 * @param {string} [options.preferSectionId]
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [options.context]
 * @returns {Promise<object|null>}
 */
export function openSectionModal(options = {}) {
  const mode = options.mode === "edit" ? "edit" : "add";
  const overlay = ensureSectionModalOverlay();
  const definitions = getAddableSectionDefinitions(options.context ?? {});
  const typeEl = overlay.querySelector("#noteAddSectionType");
  const profileEl = overlay.querySelector("#noteCustomSectionProfile");
  const bodyEl = overlay.querySelector("#noteAddSectionBody");
  const cancelBtn = overlay.querySelector("[data-section-cancel]");
  const saveBtn = overlay.querySelector("[data-section-save]");
  const nameEl = overlay.querySelector("#noteCustomSectionName");

  if (mode === "add" && !definitions.length) {
    window.alert("No section types are available to add.");
    return Promise.resolve(null);
  }

  if (mode === "edit" && !options.sectionId) {
    throw new Error("sectionId is required for edit mode.");
  }

  const titleEl = overlay.querySelector("[data-section-modal-title]");
  const subtitleEl = overlay.querySelector("[data-section-modal-subtitle]");

  if (mode === "edit") {
    titleEl.textContent = "Edit section";
    subtitleEl.textContent =
      "Update section body — paste or drop a .md file; the section tag stays in source.";
    saveBtn.textContent = "Save changes";
  } else {
    titleEl.textContent = "Add section";
    subtitleEl.textContent =
      "Paste or drop a markdown file — the section tag is added automatically.";
    saveBtn.textContent = "Add section";
  }

  updateKindVisibility(overlay, mode);

  if (mode === "add") {
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

    profileEl.innerHTML = CUSTOM_RENDERER_PROFILES.map(
      (profile) =>
        `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.label)}</option>`
    ).join("");

    if (nameEl) {
      nameEl.value = "";
    }

    const builtinRadio = overlay.querySelector('input[name="noteSectionKind"][value="builtin"]');
    if (builtinRadio) {
      builtinRadio.checked = true;
    }
  }

  bodyEl.value =
    mode === "edit"
      ? getSectionBody(options.markdown ?? "", options.sectionId, options.context ?? "") ?? ""
      : "";

  setError(overlay, "");
  updateCustomTagPreview(overlay);
  updateHint(overlay, { ...options, mode, definitions });

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

    function updatePreviewLocal() {
      const previewEl = overlay.querySelector("[data-section-preview]");
      const body = bodyEl.value;

      if (!previewEl) {
        return;
      }

      if (!body.trim()) {
        previewEl.textContent = "Preview: enter content to validate.";
        return;
      }

      try {
        let definition;
        if (getSelectedKind(overlay) === "custom" && mode === "add") {
          definition = createCustomSectionDefinition({
            label: nameEl?.value ?? "",
            rendererProfile: profileEl?.value ?? "generic",
            context: options.context ?? {},
          });
        } else {
          definition =
            mode === "edit"
              ? getDefinitionById(options.sectionId, options.context ?? {})
              : definitions.find((def) => def.id === typeEl.value);
        }

        if (!definition) {
          previewEl.textContent = "Preview: choose a section type.";
          return;
        }

        validateSectionBody(body);

        const parseOptions = {
          language: options.language,
          title: options.title,
          sectionExtensions: options.context?.customDefinitions ?? [],
        };

        const result =
          mode === "edit"
            ? previewSectionEdit(options.markdown ?? "", options.sectionId, body, parseOptions)
            : previewSectionAddition(options.markdown ?? "", definition, body, {
                ...parseOptions,
                sectionExtensions:
                  getSelectedKind(overlay) === "custom"
                    ? [...(options.context?.customDefinitions ?? []), definition]
                    : parseOptions.sectionExtensions,
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
        previewEl.textContent = "Preview: fix errors before saving.";
        setError(overlay, err.message || "Invalid section content.");
      }
    }

    function onKindChange() {
      updateKindVisibility(overlay, mode);
      updateCustomTagPreview(overlay);
      updateHint(overlay, { ...options, mode, definitions });
      updatePreviewLocal();
    }

    function onTypeChange() {
      updateHint(overlay, { ...options, mode, definitions });
      updatePreviewLocal();
    }

    function onCustomNameInput() {
      updateCustomTagPreview(overlay);
      updatePreviewLocal();
    }

    function onCancel() {
      finish(null);
    }

    function onSave() {
      try {
        const body = bodyEl.value;
        const parseOptions = {
          language: options.language,
          title: options.title,
          sectionExtensions: options.context?.customDefinitions ?? [],
        };

        if (mode === "edit") {
          const definition = getDefinitionById(options.sectionId, options.context ?? {});
          if (!definition) {
            setError(overlay, "Section definition not found.");
            return;
          }

          const result = previewSectionEdit(
            options.markdown ?? "",
            options.sectionId,
            body,
            parseOptions
          );

          finish({
            mode: "edit",
            markdown: result.markdown,
            definition,
            representationBucket: mapDefinitionToRepresentationBucket(definition),
            sectionExtensions: options.context?.customDefinitions ?? [],
          });
          return;
        }

        const kind = getSelectedKind(overlay);
        let definition;
        let sectionExtensions = [...(options.context?.customDefinitions ?? [])];

        if (kind === "custom") {
          definition = createCustomSectionDefinition({
            label: nameEl?.value ?? "",
            rendererProfile: profileEl?.value ?? "generic",
            context: { customDefinitions: sectionExtensions },
          });
          sectionExtensions = [...sectionExtensions, definition];
        } else {
          definition = definitions.find((def) => def.id === typeEl.value);
        }

        if (!definition) {
          setError(overlay, "Choose a section type.");
          return;
        }

        const result = previewSectionAddition(options.markdown ?? "", definition, body, {
          ...parseOptions,
          sectionExtensions,
        });

        finish({
          mode: "add",
          markdown: result.markdown,
          definition,
          representationBucket: mapDefinitionToRepresentationBucket(definition),
          sectionExtensions,
          isCustom: kind === "custom",
        });
      } catch (err) {
        setError(overlay, err.message || "Could not save section.");
      }
    }

    function applyDroppedMarkdown(text) {
      if (bodyEl.value.trim()) {
        const confirmed = window.confirm(
          "Replace the current section content with the dropped file?"
        );
        if (!confirmed) {
          return;
        }
      }

      bodyEl.value = text;
      updatePreviewLocal();
    }

    const dropTarget =
      overlay.querySelector("[data-section-body-field]") ?? bodyEl;
    const unbindMarkdownDrop = bindMarkdownFileDrop(dropTarget, {
      dragOverClass: "note-section-drag-over",
      rejectMessage: "Drop a .md, .markdown, or .txt file into Section content.",
      onError: (message) => setError(overlay, message),
      onText: ({ text }) => {
        setError(overlay, "");
        applyDroppedMarkdown(text);
      },
    });

    function cleanup() {
      unbindMarkdownDrop();
      overlay.querySelectorAll('input[name="noteSectionKind"]').forEach((input) => {
        input.removeEventListener("change", onKindChange);
      });
      typeEl.removeEventListener("change", onTypeChange);
      profileEl.removeEventListener("change", onTypeChange);
      nameEl?.removeEventListener("input", onCustomNameInput);
      bodyEl.removeEventListener("input", updatePreviewLocal);
      cancelBtn.removeEventListener("click", onCancel);
      saveBtn.removeEventListener("click", onSave);
    }

    overlay.querySelectorAll('input[name="noteSectionKind"]').forEach((input) => {
      input.addEventListener("change", onKindChange);
    });
    typeEl.addEventListener("change", onTypeChange);
    profileEl.addEventListener("change", onTypeChange);
    nameEl?.addEventListener("input", onCustomNameInput);
    bodyEl.addEventListener("input", updatePreviewLocal);
    cancelBtn.addEventListener("click", onCancel);
    saveBtn.addEventListener("click", onSave);

    openModal(overlay, { overlayType: "modal", onClose: () => finish(null) });
    updatePreviewLocal();
    bodyEl.focus();
  });
}

/** @deprecated alias */
export function openAddSectionModal(options = {}) {
  return openSectionModal({ ...options, mode: "add" });
}
