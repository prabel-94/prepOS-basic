/**
 * Lightweight anchor note editor modal (micro cognition — not canonical draft).
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import { getClient } from "../core/get-client.js";
import { getLanguageLabel, normalizeLanguage } from "../notes/note-variants.js";
import {
  ensureAnchorVariantForLanguage,
  saveAnchorNoteWithVersion,
} from "./anchor-storage.js";
import { buildAnchorNoteLinkMap } from "./anchor-selectors.js";
import { renderAnchorNote } from "./anchor-note-renderer.js";

let editorOverlay = null;

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureEditorOverlay() {
  if (editorOverlay) {
    return editorOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "anchor-note-editor-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content teacher-intel-inspector-content anchor-note-editor-modal">
      <div class="prepos-modal-header">
        <div class="h2">Anchor Note Editor</div>
        <p class="text-muted mt-5 anchor-note-editor-subtitle">Compact semantic cognition · markdown-lite</p>
      </div>
      <div class="prepos-modal-body anchor-note-editor-body">
        <label class="anchor-note-editor-label" for="anchor-note-editor-input">Anchor note</label>
        <textarea id="anchor-note-editor-input" class="anchor-note-editor-input" spellcheck="true" placeholder="Clarify, orient, and contextualize this anchor (50–250 words recommended)."></textarea>
        <div class="anchor-note-editor-preview-wrap mt-10">
          <div class="semantic-review-title">Preview</div>
          <div id="anchor-note-editor-preview" class="anchor-note-body anchor-note-editor-preview"></div>
        </div>
      </div>
      <div class="prepos-modal-footer semantic-governance-actions">
        <button type="button" class="secondary-btn" data-anchor-note-cancel>Cancel</button>
        <button type="button" class="primary-btn" data-anchor-note-save>Save Anchor Note</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  editorOverlay = overlay;
  return overlay;
}

async function updatePreview(previewEl, markdown, language) {
  if (!previewEl) {
    return;
  }

  const trimmed = String(markdown ?? "").trim();

  if (!trimmed) {
    previewEl.innerHTML = `<p class="anchor-note-empty">Nothing to preview yet.</p>`;
    return;
  }

  const sb = await getClient();
  const linkMap = await buildAnchorNoteLinkMap(sb, trimmed, language);
  previewEl.innerHTML = renderAnchorNote(trimmed, linkMap);
}

/**
 * @param {object} options
 * @param {string} options.anchorId
 * @param {string} [options.anchorVariantId]
 * @param {string} options.displayName
 * @param {string} [options.language]
 * @param {string} [options.initialContent]
 * @param {() => void|Promise<void>} [options.onSave]
 * @param {() => void} [options.onCancel]
 */
export async function openAnchorNoteEditor({
  anchorId,
  anchorVariantId,
  displayName,
  language = "english",
  initialContent = "",
  onSave,
  onCancel,
} = {}) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  const lang = normalizeLanguage(language);
  const sb = await getClient();

  const variant =
    anchorVariantId
      ? { id: anchorVariantId }
      : await ensureAnchorVariantForLanguage(sb, {
          anchorId,
          language: lang,
          displayName,
        });

  const overlay = ensureEditorOverlay();
  const textarea = overlay.querySelector("#anchor-note-editor-input");
  const previewEl = overlay.querySelector("#anchor-note-editor-preview");
  const subtitle = overlay.querySelector(".anchor-note-editor-subtitle");

  if (subtitle) {
    subtitle.textContent = `${escapeHTML(displayName ?? "Anchor")} · ${escapeHTML(getLanguageLabel(lang))}`;
  }

  if (textarea) {
    textarea.value = initialContent ?? "";
  }

  let previewTimer = null;

  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      updatePreview(previewEl, textarea?.value ?? "", lang);
    }, 200);
  };

  if (textarea) {
    textarea.oninput = schedulePreview;
  }

  await updatePreview(previewEl, initialContent, lang);

  const cancelBtn = overlay.querySelector("[data-anchor-note-cancel]");
  const saveBtn = overlay.querySelector("[data-anchor-note-save]");

  cancelBtn.onclick = () => {
    closeModal(overlay);
    onCancel?.();
  };

  saveBtn.onclick = async () => {
    const content = String(textarea?.value ?? "").trim();

    if (!content) {
      window.alert("Anchor note cannot be empty.");
      return;
    }

    saveBtn.disabled = true;

    try {
      await saveAnchorNoteWithVersion(sb, {
        anchorVariantId: variant.id,
        noteContent: content,
      });

      closeModal(overlay);
      await onSave?.();
    } catch (err) {
      window.alert(err.message || "Failed to save anchor note.");
    } finally {
      saveBtn.disabled = false;
    }
  };

  openModal(overlay, { overlayType: "critical-dialog" });
  textarea?.focus();
}
