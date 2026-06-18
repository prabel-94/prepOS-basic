/**
 * Section inventory strip for the draft note workspace.
 */

import { getSectionInventory } from "./note-section-markdown.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {string} options.markdown
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [options.context]
 * @param {boolean} [options.showActions]
 */
export function renderSectionInventory(container, options = {}) {
  if (!container) {
    return;
  }

  const inventory = getSectionInventory(options.markdown ?? "", options.context ?? {});
  const showActions = options.showActions !== false;

  if (!inventory.sections.length && !inventory.prelude) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");

  const chips = inventory.sections
    .map((section) => {
      const customMark =
        section.source === "custom"
          ? ' <span class="note-section-chip-custom">custom</span>'
          : "";
      const actions = showActions
        ? `
        <button type="button" class="note-section-chip-action" data-section-edit="${escapeHTML(section.id)}" title="Edit section" aria-label="Edit ${escapeHTML(section.label)}">✎</button>
        <button type="button" class="note-section-chip-action note-section-chip-delete" data-section-delete="${escapeHTML(section.id)}" title="Delete section" aria-label="Delete ${escapeHTML(section.label)}">×</button>
      `
        : "";

      return `
        <span class="note-section-chip" data-section-id="${escapeHTML(section.id)}">
          <span class="note-section-chip-label">${escapeHTML(section.label)}${customMark}</span>
          ${actions}
        </span>
      `;
    })
    .join("");

  const preludeNote = inventory.prelude
    ? '<span class="note-section-prelude-note text-muted">Prelude text preserved</span>'
    : "";

  container.innerHTML = `
    <div class="note-section-inventory">
      <span class="note-section-inventory-label">Sections</span>
      <div class="note-section-inventory-chips">${chips || '<span class="text-muted">None yet</span>'}</div>
      ${preludeNote}
    </div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {{ onEdit?: (sectionId: string) => void, onDelete?: (sectionId: string) => void }} handlers
 * @returns {() => void}
 */
export function bindSectionInventory(container, handlers = {}) {
  if (!container) {
    return () => {};
  }

  function onClick(event) {
    const editBtn = event.target.closest("[data-section-edit]");
    if (editBtn) {
      event.preventDefault();
      handlers.onEdit?.(editBtn.dataset.sectionEdit);
      return;
    }

    const deleteBtn = event.target.closest("[data-section-delete]");
    if (deleteBtn) {
      event.preventDefault();
      handlers.onDelete?.(deleteBtn.dataset.sectionDelete);
    }
  }

  container.addEventListener("click", onClick);

  return () => {
    container.removeEventListener("click", onClick);
  };
}
