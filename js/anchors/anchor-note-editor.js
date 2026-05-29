/**
 * Lightweight anchor note editor modal (micro cognition — not canonical draft).
 * Phase 1: cross-language sibling variant editing in one session.
 */

import { openModal, closeModal } from "../ui/modal-system.js";
import { getClient } from "../core/get-client.js";
import { getLanguageLabel, normalizeLanguage } from "../notes/note-variants.js";
import { saveAnchorNoteWithVersion } from "./anchor-storage.js";
import {
  buildAnchorNoteLinkMap,
  loadAnchorNoteEditorContext,
} from "./anchor-selectors.js";
import { renderAnchorNote } from "./anchor-note-renderer.js";

let editorOverlay = null;

/** @type {Map<string, string>} */
const draftContentByLanguage = new Map();

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
        <p class="text-muted mt-5 anchor-note-editor-subtitle"></p>
      </div>
      <div class="anchor-note-editor-language-tabs" role="tablist" aria-label="Anchor note languages"></div>
      <div class="prepos-modal-body anchor-note-editor-body">
        <p class="anchor-note-editor-status hidden" aria-live="polite"></p>
        <p class="anchor-note-editor-no-variant hidden">No anchor variant exists for this language yet.</p>
        <p class="anchor-note-empty anchor-note-editor-empty hidden">No anchor note has been created yet.</p>
        <label class="anchor-note-editor-label" for="anchor-note-editor-input">Anchor note</label>
        <textarea id="anchor-note-editor-input" class="anchor-note-editor-input" spellcheck="true" placeholder="Clarify, orient, and contextualize this anchor (50–250 words recommended)."></textarea>
        <div class="anchor-note-editor-preview-wrap mt-10">
          <div class="semantic-review-title">Preview</div>
          <div id="anchor-note-editor-preview" class="anchor-note-body anchor-note-editor-preview"></div>
        </div>
      </div>
      <div class="prepos-modal-footer semantic-governance-actions">
        <button type="button" class="secondary-btn" data-anchor-note-cancel>Close</button>
        <button type="button" class="primary-btn" data-anchor-note-save>Save Anchor Note</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  editorOverlay = overlay;
  return overlay;
}

function findVariantEntry(context, language) {
  const lang = normalizeLanguage(language);
  return context.variants.find((entry) => normalizeLanguage(entry.language) === lang) ?? null;
}

function renderLanguageTabStatus(entry) {
  if (!entry?.hasVariant) {
    return `<span class="anchor-note-editor-lang-meta">(No anchor variant)</span>`;
  }

  if (entry.hasNote) {
    return `<span class="anchor-note-lang-status anchor-note-lang-status--has" aria-hidden="true">✓</span>`;
  }

  return `<span class="anchor-note-lang-status anchor-note-lang-status--missing" aria-hidden="true"></span>`;
}

function renderLanguageTabs(context, selectedLanguage) {
  return context.variants
    .map((entry) => {
      const lang = normalizeLanguage(entry.language);
      const isActive = lang === normalizeLanguage(selectedLanguage);
      const activeClass = isActive ? " active" : "";
      const noVariantClass = !entry.hasVariant
        ? " anchor-note-editor-lang-tab--no-variant"
        : "";

      return `
        <button
          type="button"
          class="anchor-note-editor-lang-tab${activeClass}${noVariantClass}"
          role="tab"
          aria-selected="${isActive ? "true" : "false"}"
          data-language="${escapeHTML(lang)}"
        >
          ${escapeHTML(getLanguageLabel(lang))}
          ${renderLanguageTabStatus(entry)}
        </button>
      `;
    })
    .join("");
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

function setEditorStatus(overlay, message = "", isError = false) {
  const statusEl = overlay.querySelector(".anchor-note-editor-status");
  if (!statusEl) {
    return;
  }

  if (!message) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    statusEl.classList.remove("error");
    return;
  }

  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
  statusEl.classList.toggle("error", isError);
}

function persistDraft(session, textarea) {
  if (!session?.selectedLanguage || !textarea) {
    return;
  }

  draftContentByLanguage.set(session.selectedLanguage, textarea.value ?? "");
}

function resolveDraftContent(session, entry) {
  const lang = normalizeLanguage(entry.language);
  if (draftContentByLanguage.has(lang)) {
    return draftContentByLanguage.get(lang);
  }
  return entry.noteContent ?? "";
}

function refreshLanguageTabs(overlay, session) {
  const tabsEl = overlay.querySelector(".anchor-note-editor-language-tabs");
  if (!tabsEl) {
    return;
  }

  tabsEl.innerHTML = renderLanguageTabs(session.context, session.selectedLanguage);
}

function applyLanguageSelection(overlay, session) {
  const entry = findVariantEntry(session.context, session.selectedLanguage);
  const textarea = overlay.querySelector("#anchor-note-editor-input");
  const previewEl = overlay.querySelector("#anchor-note-editor-preview");
  const saveBtn = overlay.querySelector("[data-anchor-note-save]");
  const noVariantEl = overlay.querySelector(".anchor-note-editor-no-variant");
  const emptyHintEl = overlay.querySelector(".anchor-note-editor-empty");
  const labelEl = overlay.querySelector(".anchor-note-editor-label");
  const previewWrap = overlay.querySelector(".anchor-note-editor-preview-wrap");

  refreshLanguageTabs(overlay, session);
  setEditorStatus(overlay);

  if (!entry) {
    return;
  }

  const hasVariant = entry.hasVariant === true;
  const content = resolveDraftContent(session, entry);
  const hasContent = Boolean(String(content).trim());

  if (textarea) {
    textarea.value = content;
    textarea.disabled = !hasVariant;
  }

  if (saveBtn) {
    saveBtn.disabled = !hasVariant;
  }

  if (labelEl) {
    labelEl.classList.toggle("hidden", !hasVariant);
  }

  if (previewWrap) {
    previewWrap.classList.toggle("hidden", !hasVariant);
  }

  noVariantEl?.classList.toggle("hidden", hasVariant);
  emptyHintEl?.classList.toggle("hidden", !hasVariant || hasContent);

  if (hasVariant) {
    updatePreview(previewEl, content, entry.language);
    textarea?.focus();
  } else if (previewEl) {
    previewEl.innerHTML = "";
  }
}

function bindLanguageTabSwitching(overlay, session) {
  const tabsEl = overlay.querySelector(".anchor-note-editor-language-tabs");
  const textarea = overlay.querySelector("#anchor-note-editor-input");

  if (!tabsEl || tabsEl.dataset.bound === "true") {
    return;
  }

  tabsEl.dataset.bound = "true";
  tabsEl.addEventListener("click", (event) => {
    const tab = event.target.closest(".anchor-note-editor-lang-tab");
    if (!tab || !tabsEl.contains(tab)) {
      return;
    }

    const nextLanguage = tab.dataset.language;
    if (!nextLanguage || nextLanguage === session.selectedLanguage) {
      return;
    }

    persistDraft(session, textarea);
    session.selectedLanguage = normalizeLanguage(nextLanguage);
    applyLanguageSelection(overlay, session);
  });
}

/**
 * @param {object} options
 * @param {string} options.anchorId
 * @param {string} [options.anchorVariantId]
 * @param {string} options.displayName
 * @param {string} [options.language]
 * @param {string} [options.initialContent]
 * @param {string} [options.noteId]
 * @param {string} [options.variantId]
 * @param {() => void|Promise<void>} [options.onSave]
 * @param {() => void} [options.onCancel]
 */
export async function openAnchorNoteEditor({
  anchorId,
  anchorVariantId,
  displayName,
  language = "english",
  initialContent = "",
  noteId = null,
  variantId = null,
  onSave,
  onCancel,
} = {}) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  const lang = normalizeLanguage(language);
  const sb = await getClient();
  const overlay = ensureEditorOverlay();
  const textarea = overlay.querySelector("#anchor-note-editor-input");
  const previewEl = overlay.querySelector("#anchor-note-editor-preview");
  const subtitle = overlay.querySelector(".anchor-note-editor-subtitle");
  const saveBtn = overlay.querySelector("[data-anchor-note-save]");
  const cancelBtn = overlay.querySelector("[data-anchor-note-cancel]");

  const context = await loadAnchorNoteEditorContext(sb, {
    anchorId,
    preferLanguage: lang,
    noteId,
    variantId,
    displayName,
  });

  draftContentByLanguage.clear();

  const currentEntry = findVariantEntry(context, lang);
  if (currentEntry?.hasVariant && initialContent !== undefined) {
    draftContentByLanguage.set(lang, initialContent ?? "");
  }

  if (anchorVariantId && currentEntry?.anchorVariantId !== anchorVariantId) {
    const matched = context.variants.find((entry) => entry.anchorVariantId === anchorVariantId);
    if (matched) {
      context.selectedLanguage = normalizeLanguage(matched.language);
      if (initialContent !== undefined) {
        draftContentByLanguage.set(context.selectedLanguage, initialContent ?? "");
      }
    }
  }

  const session = {
    context,
    selectedLanguage: context.selectedLanguage,
    onSave,
    onCancel,
  };

  if (subtitle) {
    subtitle.textContent = displayName ?? "Anchor";
  }

  let previewTimer = null;

  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const entry = findVariantEntry(session.context, session.selectedLanguage);
      if (!entry?.hasVariant) {
        return;
      }
      updatePreview(previewEl, textarea?.value ?? "", entry.language);
    }, 200);
  };

  if (textarea) {
    textarea.oninput = () => {
      const entry = findVariantEntry(session.context, session.selectedLanguage);
      if (!entry?.hasVariant) {
        return;
      }

      persistDraft(session, textarea);
      const hasContent = Boolean(String(textarea.value ?? "").trim());
      overlay
        .querySelector(".anchor-note-editor-empty")
        ?.classList.toggle("hidden", hasContent);

      schedulePreview();
    };
  }

  cancelBtn.onclick = () => {
    draftContentByLanguage.clear();
    closeModal(overlay);
    onCancel?.();
  };

  saveBtn.onclick = async () => {
    const entry = findVariantEntry(session.context, session.selectedLanguage);
    if (!entry?.hasVariant || !entry.anchorVariantId) {
      return;
    }

    persistDraft(session, textarea);
    const content = String(textarea?.value ?? "").trim();

    if (!content) {
      window.alert("Anchor note cannot be empty.");
      return;
    }

    saveBtn.disabled = true;

    try {
      const saved = await saveAnchorNoteWithVersion(sb, {
        anchorVariantId: entry.anchorVariantId,
        noteContent: content,
      });

      entry.noteContent = saved.note_content ?? content;
      entry.hasNote = true;
      entry.noteId = saved.id ?? entry.noteId;
      draftContentByLanguage.set(session.selectedLanguage, entry.noteContent);

      applyLanguageSelection(overlay, session);
      setEditorStatus(overlay, `${getLanguageLabel(entry.language)} anchor note saved.`);

      await onSave?.();
    } catch (err) {
      setEditorStatus(overlay, err.message || "Failed to save anchor note.", true);
    } finally {
      const activeEntry = findVariantEntry(session.context, session.selectedLanguage);
      saveBtn.disabled = !activeEntry?.hasVariant;
    }
  };

  applyLanguageSelection(overlay, session);
  bindLanguageTabSwitching(overlay, session);
  openModal(overlay, { overlayType: "critical-dialog" });
}
