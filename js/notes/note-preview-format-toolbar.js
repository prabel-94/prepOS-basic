/**
 * Floating formatting toolbar for draft preview editing.
 */

import {
  applyQuoteHighlight,
  convertTextToHeading,
  insertDividerAt,
  insertWikiLinkAt,
  prefixSelectionAsBulletList,
  wrapSelectionAsWikiLink,
} from "./note-source-transforms.js";
import { pickTopicLinkName } from "./note-topic-link-picker.js";

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
 */
export function createPreviewFormatToolbar(options) {
  const toolbar = document.createElement("div");
  toolbar.className = "note-preview-format-toolbar hidden";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Format selection");
  toolbar.innerHTML = `
    <button type="button" class="note-preview-format-btn" data-format="link" title="Wiki link">Link</button>
    <button type="button" class="note-preview-format-btn" data-format="h2" title="Heading 2">H2</button>
    <button type="button" class="note-preview-format-btn" data-format="h3" title="Heading 3">H3</button>
    <button type="button" class="note-preview-format-btn" data-format="bullet" title="Bullet list">• List</button>
    <button type="button" class="note-preview-format-btn" data-format="quote" title="Highlight quote" hidden>Quote</button>
    <button type="button" class="note-preview-format-btn" data-format="divider" title="Insert divider">Divider</button>
  `;

  document.body.appendChild(toolbar);

  function hide() {
    toolbar.classList.add("hidden");
  }

  function show() {
    toolbar.classList.remove("hidden");
  }

  function updateQuoteButton() {
    const quoteBtn = toolbar.querySelector('[data-format="quote"]');
    if (!quoteBtn) {
      return;
    }

    const isQuotes = options.getActiveRepresentation?.() === "quotes";
    quoteBtn.hidden = !isQuotes;
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

    updateQuoteButton();

    const selection = getSelectionOffsets(activeEl);
    if (!selection) {
      hide();
      return;
    }

    positionToolbar(selection.range);
    show();
  }

  function applyUpdatedText(activeEl, nextText) {
    activeEl.textContent = nextText;
    options.applyText(nextText);
    hide();
  }

  function handleFormat(action) {
    const activeEl = options.getActiveElement?.();
    if (!activeEl) {
      return;
    }

    const currentText = activeEl.textContent.replace(/\r\n/g, "\n");
    const selection = getSelectionOffsets(activeEl);
    const start = selection?.start ?? 0;
    const end = selection?.end ?? currentText.length;
    const offset = selection?.start ?? currentText.length;

    let nextText = currentText;

    switch (action) {
      case "link": {
        if (selection && !selection.collapsed) {
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
      case "h2":
        if (selection && !selection.collapsed) {
          nextText = `${currentText.slice(0, start)}${convertTextToHeading(currentText.slice(start, end), 2)}${currentText.slice(end)}`;
        } else {
          nextText = convertTextToHeading(currentText, 2);
        }
        break;
      case "h3":
        if (selection && !selection.collapsed) {
          nextText = `${currentText.slice(0, start)}${convertTextToHeading(currentText.slice(start, end), 3)}${currentText.slice(end)}`;
        } else {
          nextText = convertTextToHeading(currentText, 3);
        }
        break;
      case "bullet":
        if (selection && !selection.collapsed) {
          nextText = prefixSelectionAsBulletList(currentText, start, end);
        } else {
          nextText = prefixSelectionAsBulletList(currentText, 0, currentText.length);
        }
        break;
      case "quote":
        if (options.getActiveRepresentation?.() !== "quotes") {
          return;
        }
        if (selection && !selection.collapsed) {
          nextText = applyQuoteHighlight(currentText, start, end);
        } else {
          nextText = applyQuoteHighlight(currentText, 0, currentText.length);
        }
        break;
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

  function onToolbarClick(event) {
    const button = event.target.closest("[data-format]");
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
    event.preventDefault();
  });
  toolbar.addEventListener("click", onToolbarClick);
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
      options.contentEl?.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onDocumentMouseDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    },
  };
}
