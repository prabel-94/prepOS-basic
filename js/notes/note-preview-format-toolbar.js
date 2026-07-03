/**
 * Floating formatting toolbar for draft preview editing.
 */

import {
  applyQuoteHighlight,
  convertTextToHeading,
  insertBlockAt,
  insertDividerAt,
  insertWikiLinkAt,
  prefixSelectionAsBulletList,
  prefixSelectionAsNumberedList,
  wrapSelectionAsWikiLink,
} from "./note-source-transforms.js";
import { pickTopicLinkName } from "./note-topic-link-picker.js";
import { pickSemanticAnchorName } from "./note-semantic-anchor-picker.js";
import { openChronologyEditor } from "./note-chronology-editor.js";
import { openRetrievalAnchorInserter } from "./note-retrieval-anchor-inserter.js";

const CHRONOLOGY_REPS = new Set(["narrative", "timeline"]);
const RETRIEVAL_REPS = new Set(["narrative"]);

function getSelectionOffsets(element) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return null;
  }

  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;

  return { start, end, collapsed: start === end, range };
}

/**
 * @param {object} options
 * @param {HTMLElement} options.contentEl
 * @param {() => string} options.getActiveRepresentation
 * @param {() => HTMLElement|null} options.getActiveElement
 * @param {(text: string) => void} options.applyText
 * @param {() => string} [options.getMarkdown]
 * @param {(markdown: string) => void} [options.setMarkdown]
 * @param {() => void|Promise<void>} [options.onPatched]
 * @param {() => void} [options.onToolbarPointerDown]
 * @param {() => void} [options.onToolbarPointerUp]
 */
export function createPreviewFormatToolbar(options) {
  const toolbar = document.createElement("div");
  toolbar.className = "note-preview-format-toolbar hidden";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Format selection");
  toolbar.innerHTML = `
    <button type="button" class="note-preview-format-btn" data-format="link" title="Topic wiki link">Topic</button>
    <button type="button" class="note-preview-format-btn" data-format="anchor" title="Semantic anchor link">Anchor</button>
    <select class="note-preview-format-select" data-format="heading" title="Heading level" aria-label="Heading level">
      <option value="">Heading…</option>
      <option value="2">H2</option>
      <option value="3">H3</option>
      <option value="4">H4</option>
      <option value="5">H5</option>
      <option value="6">H6</option>
    </select>
    <button type="button" class="note-preview-format-btn" data-format="bullet" title="Bullet list">• List</button>
    <button type="button" class="note-preview-format-btn" data-format="numbered" title="Numbered list">1. List</button>
    <button type="button" class="note-preview-format-btn" data-format="quote" title="Highlight quote" hidden>Quote</button>
    <button type="button" class="note-preview-format-btn" data-format="chronology" title="Insert chronology event" hidden>Chrono</button>
    <button type="button" class="note-preview-format-btn" data-format="retrieval" title="Insert retrieval anchor" hidden>Retrieve</button>
    <button type="button" class="note-preview-format-btn" data-format="divider" title="Insert divider">Divider</button>
  `;

  document.body.appendChild(toolbar);

  const headingSelect = toolbar.querySelector("select[data-format='heading']");

  /** @type {{ start: number, end: number, collapsed: boolean, activeEl: HTMLElement } | null} */
  let savedSelection = null;

  function saveSelection(activeEl) {
    if (!activeEl) {
      return;
    }

    const selection = getSelectionOffsets(activeEl);
    if (selection) {
      savedSelection = {
        start: selection.start,
        end: selection.end,
        collapsed: selection.collapsed,
        activeEl,
      };
      return;
    }

    const text = activeEl.textContent.replace(/\r\n/g, "\n");
    savedSelection = {
      start: text.length,
      end: text.length,
      collapsed: true,
      activeEl,
    };
  }

  function getEffectiveSelection(activeEl) {
    const live = getSelectionOffsets(activeEl);
    if (live) {
      savedSelection = {
        start: live.start,
        end: live.end,
        collapsed: live.collapsed,
        activeEl,
      };
      return live;
    }

    if (savedSelection?.activeEl === activeEl) {
      return savedSelection;
    }

    return null;
  }

  function hide() {
    toolbar.classList.add("hidden");
  }

  function show() {
    toolbar.classList.remove("hidden");
  }

  function activeRepresentation() {
    return options.getActiveRepresentation?.() ?? "";
  }

  function updateSectionButtons() {
    const rep = activeRepresentation();
    const quoteBtn = toolbar.querySelector('[data-format="quote"]');
    const chronoBtn = toolbar.querySelector('[data-format="chronology"]');
    const retrievalBtn = toolbar.querySelector('[data-format="retrieval"]');

    if (quoteBtn) {
      quoteBtn.hidden = rep !== "quotes";
    }
    if (chronoBtn) {
      chronoBtn.hidden = !CHRONOLOGY_REPS.has(rep);
    }
    if (retrievalBtn) {
      retrievalBtn.hidden = !RETRIEVAL_REPS.has(rep);
    }
  }

  function positionToolbar(range) {
    if (!range) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;

    requestAnimationFrame(() => {
      const toolbarRect = toolbar.getBoundingClientRect();
      const maxLeft = window.scrollX + window.innerWidth - toolbarRect.width - 12;
      left = Math.max(window.scrollX + 12, Math.min(left, maxLeft));
      toolbar.style.left = `${left}px`;
    });
  }

  function refresh() {
    const activeEl = options.getActiveElement?.();
    if (!activeEl?.classList.contains("note-preview-editable--editing")) {
      hide();
      return;
    }

    updateSectionButtons();

    const selection = getSelectionOffsets(activeEl);
    if (!selection) {
      hide();
      return;
    }

    positionToolbar(selection.range);
    saveSelection(activeEl);
    show();
  }

  function applyUpdatedText(activeEl, nextText) {
    activeEl.textContent = nextText;
    options.applyText(nextText);
    hide();
  }

  function insertAtCaret(activeEl, blockText) {
    const currentText = activeEl.textContent.replace(/\r\n/g, "\n");
    const selection = getSelectionOffsets(activeEl);
    const offset = selection?.start ?? currentText.length;
    const nextText = insertBlockAt(currentText, offset, blockText);
    applyUpdatedText(activeEl, nextText);
  }

  function handleFormat(action, value = "") {
    const activeEl = options.getActiveElement?.();
    if (!activeEl) {
      return;
    }

    const currentText = activeEl.textContent.replace(/\r\n/g, "\n");
    const selection = getEffectiveSelection(activeEl);
    const start = selection?.start ?? 0;
    const end = selection?.end ?? currentText.length;
    const offset = selection?.start ?? currentText.length;
    const hasRange = selection && !selection.collapsed;

    let nextText = currentText;

    switch (action) {
      case "link": {
        if (hasRange) {
          nextText = wrapSelectionAsWikiLink(currentText, start, end);
          applyUpdatedText(activeEl, nextText);
          return;
        }

        pickTopicLinkName().then((topicName) => {
          if (!topicName?.trim()) {
            return;
          }

          const linked = insertWikiLinkAt(currentText, offset, offset, topicName.trim());
          applyUpdatedText(activeEl, linked);
        });
        return;
      }
      case "anchor": {
        if (hasRange) {
          nextText = wrapSelectionAsWikiLink(currentText, start, end);
          applyUpdatedText(activeEl, nextText);
          return;
        }

        pickSemanticAnchorName({
          language: options.getPreferLanguage?.() ?? "english",
        }).then((anchorName) => {
          if (!anchorName?.trim()) {
            return;
          }

          const linked = insertWikiLinkAt(currentText, offset, offset, anchorName.trim());
          applyUpdatedText(activeEl, linked);
        });
        return;
      }
      case "heading": {
        const level = Number(value) || 2;
        if (hasRange) {
          nextText = `${currentText.slice(0, start)}${convertTextToHeading(currentText.slice(start, end), level)}${currentText.slice(end)}`;
        } else {
          nextText = convertTextToHeading(currentText, level);
        }
        break;
      }
      case "bullet":
        if (hasRange) {
          nextText = prefixSelectionAsBulletList(currentText, start, end);
        } else {
          nextText = prefixSelectionAsBulletList(currentText, 0, currentText.length);
        }
        break;
      case "numbered":
        if (hasRange) {
          nextText = prefixSelectionAsNumberedList(currentText, start, end);
        } else {
          nextText = prefixSelectionAsNumberedList(currentText, 0, currentText.length);
        }
        break;
      case "quote":
        if (activeRepresentation() !== "quotes") {
          return;
        }
        if (hasRange) {
          nextText = applyQuoteHighlight(currentText, start, end);
        } else {
          nextText = applyQuoteHighlight(currentText, 0, currentText.length);
        }
        break;
      case "chronology":
        if (!CHRONOLOGY_REPS.has(activeRepresentation())) {
          return;
        }
        openChronologyEditor({ mode: "insert" }).then((paragraph) => {
          if (!paragraph) {
            return;
          }
          insertAtCaret(activeEl, paragraph);
        });
        return;
      case "retrieval":
        if (!RETRIEVAL_REPS.has(activeRepresentation())) {
          return;
        }
        openRetrievalAnchorInserter().then((block) => {
          if (!block) {
            return;
          }
          insertAtCaret(activeEl, block);
        });
        return;
      case "divider":
        nextText = insertDividerAt(currentText, offset);
        break;
      default:
        return;
    }

    if (nextText === currentText) {
      return;
    }

    applyUpdatedText(activeEl, nextText);
  }

  function onHeadingChange(event) {
    const level = event.target.value;
    if (!level) {
      return;
    }

    handleFormat("heading", level);
    event.target.value = "";
  }

  function onToolbarClick(event) {
    const button = event.target.closest("button[data-format]");
    if (!button || !toolbar.contains(button)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleFormat(button.dataset.format);
  }

  function onMouseUp(event) {
    if (toolbar.contains(event.target)) {
      return;
    }

    requestAnimationFrame(refresh);
  }

  function onSelectionChange() {
    requestAnimationFrame(refresh);
  }

  function onDocumentMouseDown(event) {
    if (toolbar.contains(event.target)) {
      return;
    }

    if (!options.getActiveElement?.()?.contains(event.target)) {
      hide();
    }
  }

  toolbar.addEventListener("mousedown", (event) => {
    const activeEl = options.getActiveElement?.();
    if (activeEl) {
      saveSelection(activeEl);
    }

    options.onToolbarPointerDown?.();

    // Allow <select> to open; preventDefault on buttons preserves text selection.
    if (!event.target.closest("select")) {
      event.preventDefault();
    }
  });
  toolbar.addEventListener("click", onToolbarClick);
  headingSelect?.addEventListener("change", onHeadingChange);
  toolbar.addEventListener("mouseup", () => {
    options.onToolbarPointerUp?.();
  });
  options.contentEl?.addEventListener("mouseup", onMouseUp);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mousedown", onDocumentMouseDown);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);

  return {
    refresh,
    hide,
    destroy() {
      hide();
      toolbar.remove();
      toolbar.removeEventListener("click", onToolbarClick);
      headingSelect?.removeEventListener("change", onHeadingChange);
      options.contentEl?.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onDocumentMouseDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    },
  };
}
