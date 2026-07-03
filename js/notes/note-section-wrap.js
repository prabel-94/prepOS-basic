/**
 * Wrap editable preview units or source selections as collapsible section headings.
 */

import {
  deriveSectionTitle,
  wrapRangeAsSection,
} from "./note-source-transforms.js";

/** Representations where ## sections become collapsible in the reader. */
export const SECTION_WRAP_REPRESENTATIONS = new Set([
  "revision",
  "expansion",
  "interpretations",
  "quotes",
  "timeline",
  "structural",
  "narrative",
]);

/**
 * @param {Map<string, object>} units
 * @param {string} activeUnitId
 * @returns {object[]}
 */
export function collectUnitsForSectionWrap(units, activeUnitId) {
  const active = units.get(activeUnitId);
  if (!active) {
    return [];
  }

  const ordered = [...units.values()]
    .filter((unit) => unit.representation === active.representation)
    .sort((a, b) => a.start - b.start);

  const startIndex = ordered.findIndex((unit) => unit.id === activeUnitId);
  if (startIndex === -1) {
    return [];
  }

  const selected = [ordered[startIndex]];

  for (let index = startIndex + 1; index < ordered.length; index += 1) {
    const unit = ordered[index];
    if (unit.kind === "heading") {
      break;
    }
    selected.push(unit);
  }

  return selected;
}

/**
 * @param {string} markdown
 * @param {object[]} units
 * @param {{ level?: number, title?: string, demoteHeadings?: boolean }} [options]
 */
export function wrapUnitsAsSection(markdown, units, options = {}) {
  if (!units?.length) {
    return markdown;
  }

  const ordered = [...units].sort((a, b) => a.start - b.start);
  const start = ordered[0].start;
  const end = ordered[ordered.length - 1].end;
  const body = markdown.slice(start, end);

  return wrapRangeAsSection(markdown, start, end, {
    ...options,
    title: options.title?.trim() || deriveSectionTitle(body),
  });
}

/**
 * @param {string} markdown
 * @param {object} unit
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {{ level?: number, title?: string, demoteHeadings?: boolean }} [options]
 */
export function wrapUnitSelectionAsSection(
  markdown,
  unit,
  selectionStart,
  selectionEnd,
  options = {}
) {
  const unitTextLength = unit.end - unit.start;
  const relativeStart = Math.min(Math.max(Number(selectionStart) || 0, 0), unitTextLength);
  const relativeEnd = Math.min(Math.max(Number(selectionEnd) || 0, 0), unitTextLength);
  const absoluteStart = unit.start + Math.min(relativeStart, relativeEnd);
  const absoluteEnd = unit.start + Math.max(relativeStart, relativeEnd);
  const body = markdown.slice(absoluteStart, absoluteEnd);

  return wrapRangeAsSection(markdown, absoluteStart, absoluteEnd, {
    ...options,
    title: options.title?.trim() || deriveSectionTitle(body),
  });
}

/**
 * @param {HTMLTextAreaElement} sourceEditorEl
 * @param {{ onApplied?: (detail: { markdown?: string, error?: string }) => void }} [options]
 */
export function bindSourceSectionWrap(sourceEditorEl, options = {}) {
  if (!sourceEditorEl) {
    return { destroy() {} };
  }

  const panel = sourceEditorEl.closest("#noteSourcePanel");
  if (!panel) {
    return { destroy() {} };
  }

  let bar = panel.querySelector(".note-source-format-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "note-source-format-bar";
    bar.innerHTML =
      '<button type="button" class="secondary-btn" data-source-wrap-section>Wrap as section…</button>';
    panel.insertBefore(bar, sourceEditorEl);
  }

  async function onWrapClick() {
    const start = sourceEditorEl.selectionStart;
    const end = sourceEditorEl.selectionEnd;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) {
      options.onApplied?.({
        error: "Select one or more paragraphs in the source, then choose Wrap as section.",
      });
      return;
    }

    const markdown = sourceEditorEl.value;
    const body = markdown.slice(Math.min(start, end), Math.max(start, end));
    const { openSectionWrapDialog } = await import("./note-section-wrap-dialog.js");
    const dialogResult = await openSectionWrapDialog({
      defaultTitle: deriveSectionTitle(body),
      defaultLevel: 2,
    });

    if (!dialogResult) {
      return;
    }

    const updated = wrapRangeAsSection(markdown, start, end, dialogResult);
    if (updated === markdown) {
      return;
    }

    sourceEditorEl.value = updated;
    options.onApplied?.({ markdown: updated });
  }

  const button = bar.querySelector("[data-source-wrap-section]");
  button?.addEventListener("click", onWrapClick);

  return {
    destroy() {
      button?.removeEventListener("click", onWrapClick);
    },
  };
}
