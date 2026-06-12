/**
 * Draft preview editing — plain-text paragraph sync back to MSMDF source.
 */

import {
  insertLineBreakInUnit,
  replaceUnitRange,
  splitParagraphUnitAt,
} from "./note-source-patch.js";
import { createPreviewFormatToolbar } from "./note-preview-format-toolbar.js";

function getCaretOffset(element) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element) {
    return element?.textContent?.length ?? 0;
  }

  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

/**
 * @param {HTMLElement} contentEl
 * @param {object} options
 * @param {Map<string, object>} options.editableUnits
 * @param {() => string} options.getMarkdown
 * @param {(markdown: string) => void} options.setMarkdown
 * @param {() => void|Promise<void>} options.onPatched
 * @param {() => string} [options.getActiveRepresentation]
 */
export function bindPreviewEditor(contentEl, options) {
  if (!contentEl) {
    return () => {};
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
    getActiveElement: () => activeEl,
    applyText: (nextText) => {
      commitTextToSource(nextText);
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
      activeEl.textContent = unit.sourceText;
    }

    activeEl = null;
    activeUnitId = null;
    formatToolbar.hide();
  }

  function beginEditing(el) {
    const unitId = el?.dataset?.editableId;
    const unit = getUnit(unitId);

    if (!unit?.editable || el.classList.contains("note-preview-editable--editing")) {
      return;
    }

    if (activeEl && activeEl !== el) {
      commitActiveEdit();
    }

    activeEl = el;
    activeUnitId = unitId;
    el.classList.add("note-preview-editable--editing");
    el.textContent = unit.sourceText;
    el.contentEditable = "true";
    requestAnimationFrame(() => formatToolbar.refresh());
  }

  function commitActiveEdit() {
    if (!activeEl || !activeUnitId) {
      return;
    }

    const unit = getUnit(activeUnitId);
    if (!unit) {
      finishEditing();
      return;
    }

    const newText = activeEl.textContent.replace(/\r\n/g, "\n");
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

    if (event.target.closest(".note-preview-format-toolbar")) {
      return;
    }

    const next = event.relatedTarget;
    if (next && (activeEl.contains(next) || next.closest?.(".note-preview-format-toolbar"))) {
      return;
    }

    commitActiveEdit();
  }

  function onKeyDown(event) {
    if (!activeEl || !activeUnitId) {
      return;
    }

    const unit = getUnit(activeUnitId);
    if (!unit) {
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
      const updated = splitParagraphUnitAt(markdown, unit, offset);
      options.setMarkdown(updated);

      suppressBlurCommit = true;
      finishEditing();
      suppressBlurCommit = false;
      options.onPatched?.();
    }
  }

  function onClick(event) {
    if (event.target.closest(".semantic-anchor, .topic-link, .note-preview-format-toolbar")) {
      return;
    }

    const el = event.target.closest("[data-editable-id]");
    if (!el || !contentEl.contains(el)) {
      return;
    }

    if (!el.classList.contains("note-preview-editable--editing")) {
      beginEditing(el);
      el.focus();
    }
  }

  contentEl.addEventListener("focusin", onFocusIn);
  contentEl.addEventListener("focusout", onFocusOut);
  contentEl.addEventListener("keydown", onKeyDown);
  contentEl.addEventListener("click", onClick);

  return () => {
    contentEl.removeEventListener("focusin", onFocusIn);
    contentEl.removeEventListener("focusout", onFocusOut);
    contentEl.removeEventListener("keydown", onKeyDown);
    contentEl.removeEventListener("click", onClick);
    formatToolbar.destroy();
    finishEditing();
  };
}
