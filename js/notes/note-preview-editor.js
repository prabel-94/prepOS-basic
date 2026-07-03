/**
 * Draft preview editing — plain-text paragraph sync back to MSMDF source.
 */

import {
  insertLineBreakInUnit,
  replaceUnitRange,
  splitParagraphUnitAt,
} from "./note-source-patch.js";
import {
  isDraftParagraphPlaceholder,
  normalizeDraftParagraphForSave,
} from "./note-draft-paragraph.js";
import { createPreviewFormatToolbar } from "./note-preview-format-toolbar.js";
import { editChronologyParagraph } from "./note-chronology-editor.js";

function getCaretOffset(element) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element) {
    return element?.textContent?.length ?? 0;
  }

  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.startOffset);
  return preRange.toString().length;
}

/**
 * @param {HTMLElement} contentEl
 * @param {object} options
 * @param {Map<string, object>} options.editableUnits
 * @param {() => string} options.getMarkdown
 * @param {(markdown: string) => void} options.setMarkdown
 * @param {(detail?: { focusOffset?: number }) => void|Promise<void>} [options.onPatched]
 * @param {() => string} [options.getActiveRepresentation]
 * @param {() => string} [options.getPreferLanguage]
 */
export function bindPreviewEditor(contentEl, options) {
  if (!contentEl) {
    return { destroy: () => {}, focusUnit: () => {} };
  }

  let activeEl = null;
  let activeUnitId = null;
  let suppressBlurCommit = false;

  function getUnit(id) {
    return id ? options.editableUnits.get(id) ?? null : null;
  }

  function commitTextToSource(nextText) {
    const unit = getUnit(activeUnitId);
    if (!unit || !activeUnitId) {
      return;
    }

    if (nextText === unit.sourceText) {
      return;
    }

    const markdown = options.getMarkdown();
    const updated = replaceUnitRange(markdown, unit, nextText);
    options.setMarkdown(updated);
    options.onPatched?.();
  }

  const formatToolbar = createPreviewFormatToolbar({
    contentEl,
    getActiveRepresentation: () => options.getActiveRepresentation?.() ?? "",
    getPreferLanguage: () => options.getPreferLanguage?.() ?? "english",
    getActiveElement: () => activeEl,
    getEditableUnits: () => options.editableUnits,
    getActiveUnitId: () => activeUnitId,
    prepareMarkdown: () => {
      commitActiveEdit();
      return options.getMarkdown();
    },
    applyMarkdown: (markdown, detail = {}) => {
      options.setMarkdown(markdown);
      suppressBlurCommit = false;
      finishEditing();
      options.onPatched?.(detail);
    },
    onToolbarPointerDown: () => {
      suppressBlurCommit = true;
    },
    onToolbarPointerUp: () => {
      window.setTimeout(() => {
        if (!document.activeElement?.closest?.(".note-preview-format-toolbar")) {
          suppressBlurCommit = false;
        }
      }, 0);
    },
    applyText: (nextText) => {
      commitTextToSource(nextText);
      suppressBlurCommit = false;
    },
  });

  function finishEditing({ revert = false } = {}) {
    if (!activeEl || !activeUnitId) {
      return;
    }

    const unit = getUnit(activeUnitId);
    activeEl.contentEditable = "false";
    activeEl.classList.remove("note-preview-editable--editing");

    if (revert && unit) {
      if (unit.kind === "chronology") {
        activeEl.removeAttribute("data-editing");
      } else {
        activeEl.textContent = unit.sourceText;
      }
    }

    activeEl = null;
    activeUnitId = null;
    formatToolbar.hide();
  }

  async function beginChronologyEdit(el, unit) {
    activeEl = el;
    activeUnitId = unit.id;
    el.classList.add("note-preview-editable--editing");
    el.setAttribute("data-editing", "true");

    const nextParagraph = await editChronologyParagraph(unit.sourceText);
    finishEditing();

    if (!nextParagraph || nextParagraph === unit.sourceText) {
      return;
    }

    const markdown = options.getMarkdown();
    const updated = replaceUnitRange(markdown, unit, nextParagraph);
    options.setMarkdown(updated);
    options.onPatched?.();
  }

  function beginEditing(el) {
    const unitId = el?.dataset?.editableId;
    const unit = getUnit(unitId);

    if (!unit?.editable || el.classList.contains("note-preview-editable--editing")) {
      return;
    }

    if (unit.kind === "chronology") {
      beginChronologyEdit(el, unit);
      return;
    }

    if (activeEl && activeEl !== el) {
      commitActiveEdit();
    }

    activeEl = el;
    activeUnitId = unitId;
    el.classList.add("note-preview-editable--editing");
    el.textContent = isDraftParagraphPlaceholder(unit.sourceText) ? "" : unit.sourceText;
    el.contentEditable = "true";
    requestAnimationFrame(() => formatToolbar.refresh());
  }

  function commitActiveEdit() {
    if (!activeEl || !activeUnitId) {
      return;
    }

    const unit = getUnit(activeUnitId);
    if (!unit || unit.kind === "chronology") {
      finishEditing();
      return;
    }

    const newText = normalizeDraftParagraphForSave(
      activeEl.textContent.replace(/\r\n/g, "\n")
    );
    finishEditing();

    if (newText === unit.sourceText) {
      return;
    }

    const markdown = options.getMarkdown();
    const updated = replaceUnitRange(markdown, unit, newText);
    options.setMarkdown(updated);
    options.onPatched?.();
  }

  function onFocusIn(event) {
    const el = event.target.closest("[data-editable-id]");
    if (!el || !contentEl.contains(el)) {
      return;
    }
    beginEditing(el);
  }

  function onFocusOut(event) {
    if (!activeEl || suppressBlurCommit) {
      return;
    }

    const next = event.relatedTarget;
    if (next?.closest?.(".note-preview-format-toolbar")) {
      return;
    }

    window.setTimeout(() => {
      if (!activeEl?.classList.contains("note-preview-editable--editing")) {
        return;
      }

      if (document.activeElement?.closest?.(".note-preview-format-toolbar")) {
        return;
      }

      commitActiveEdit();
    }, 0);
  }

  function onKeyDown(event) {
    if (!activeEl || !activeUnitId) {
      return;
    }

    const unit = getUnit(activeUnitId);
    if (!unit || unit.kind === "chronology" || unit.kind === "list-item") {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      finishEditing({ revert: true });
      activeEl?.blur();
      return;
    }

    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      const offset = getCaretOffset(activeEl);
      const markdown = options.getMarkdown();
      const updated = insertLineBreakInUnit(markdown, unit, offset);
      options.setMarkdown(updated);

      suppressBlurCommit = true;
      finishEditing();
      suppressBlurCommit = false;
      options.onPatched?.();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const offset = getCaretOffset(activeEl);
      const markdown = options.getMarkdown();
      const { markdown: updated, focusOffset } = splitParagraphUnitAt(markdown, unit, offset);
      options.setMarkdown(updated);

      suppressBlurCommit = true;
      finishEditing();
      suppressBlurCommit = false;
      options.onPatched?.({ focusOffset });
    }
  }

  function focusUnitById(unitId) {
    if (!unitId) {
      return;
    }

    const el = contentEl.querySelector(`[data-editable-id="${CSS.escape(unitId)}"]`);
    if (!el) {
      return;
    }

    beginEditing(el);
    if (el.contentEditable !== "true") {
      return;
    }

    el.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    requestAnimationFrame(() => formatToolbar.refresh());
  }

  function onClick(event) {
    if (event.target.closest(".semantic-anchor, .topic-link, .note-preview-format-toolbar")) {
      return;
    }

    if (event.target.closest(".structural-toggle")) {
      return;
    }

    if (event.target.closest(".structural-heading[data-editable-id], summary [data-editable-id]")) {
      event.preventDefault();
      event.stopPropagation();
    }

    const el = event.target.closest("[data-editable-id]");
    if (!el || !contentEl.contains(el)) {
      return;
    }

    if (!el.classList.contains("note-preview-editable--editing")) {
      beginEditing(el);
      if (el.contentEditable === "true") {
        el.focus();
      }
    }
  }

  contentEl.addEventListener("focusin", onFocusIn);
  contentEl.addEventListener("focusout", onFocusOut);
  contentEl.addEventListener("keydown", onKeyDown);
  contentEl.addEventListener("click", onClick);

  return {
    destroy: () => {
      contentEl.removeEventListener("focusin", onFocusIn);
      contentEl.removeEventListener("focusout", onFocusOut);
      contentEl.removeEventListener("keydown", onKeyDown);
      contentEl.removeEventListener("click", onClick);
      formatToolbar.destroy();
      finishEditing();
    },
    focusUnit: focusUnitById,
  };
}
