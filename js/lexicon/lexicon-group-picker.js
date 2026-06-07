import { LEXICAL_CLASS_OPTIONS } from "../generators/shared/lexicon-utils.js";
import {
  describeLexiconGroupRow,
  filterLexiconGroups,
  LEXICON_GROUP_SEARCH_LIMIT,
} from "./lexicon-group-search.js";

/**
 * @param {string} value
 */
function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * @param {HTMLElement} mountEl
 * @param {{
 *   placeholder?: string,
 *   showClassFilter?: boolean,
 *   allowClear?: boolean,
 *   variant?: "dropdown" | "panel",
 *   selectedGroupId?: string|null,
 *   getGroups: () => Array<object>,
 *   onSelect: (groupId: string|null) => void,
 * }} options
 */
export function mountLexiconGroupPicker(mountEl, options) {
  if (!mountEl) {
    return {
      refresh() {},
      setSelectedGroupId() {},
      getSelectedGroupId: () => null,
      destroy() {},
    };
  }

  const {
    placeholder = "Search primary or related words…",
    showClassFilter = true,
    allowClear = true,
    variant = "dropdown",
    getGroups,
    onSelect,
  } = options;

  let selectedGroupId = options.selectedGroupId ?? null;
  let query = "";
  let lexicalClass = "";
  let isOpen = variant === "panel";
  let highlightIndex = 0;
  let isEditing = false;

  mountEl.classList.add("lexicon-group-picker-root");
  mountEl.innerHTML = `
    <div class="lexicon-group-picker" data-variant="${variant}">
      <div class="lexicon-group-picker-controls">
        <input
          type="search"
          class="lexicon-group-picker-input"
          placeholder="${escapeHTML(placeholder)}"
          autocomplete="off"
          aria-autocomplete="list"
          aria-expanded="${isOpen}"
        />
        ${
          showClassFilter
            ? `<select class="lexicon-group-picker-class" aria-label="Filter by lexical class">
                <option value="">All classes</option>
                ${LEXICAL_CLASS_OPTIONS.map(
                  (type) => `<option value="${type}">${type}</option>`
                ).join("")}
              </select>`
            : ""
        }
      </div>
      <div class="lexicon-group-picker-results-wrap">
        <ul class="lexicon-group-picker-results" role="listbox"></ul>
        <div class="lexicon-group-picker-meta small text-muted"></div>
      </div>
    </div>
  `;

  const root = mountEl.querySelector(".lexicon-group-picker");
  const inputEl = mountEl.querySelector(".lexicon-group-picker-input");
  const classEl = mountEl.querySelector(".lexicon-group-picker-class");
  const resultsEl = mountEl.querySelector(".lexicon-group-picker-results");
  const metaEl = mountEl.querySelector(".lexicon-group-picker-meta");

  function findGroup(groupId) {
    return getGroups().find((group) => group.group_id === groupId) ?? null;
  }

  function syncInputFromSelection() {
    if (!inputEl || isEditing) {
      return;
    }

    if (!selectedGroupId) {
      inputEl.value = query;
      return;
    }

    const group = findGroup(selectedGroupId);
    inputEl.value = group ? describeLexiconGroupRow(group).headword : query;
  }

  function getVisibleEntries() {
    const { groups, totalMatches, truncated } = filterLexiconGroups(
      getGroups(),
      {
        query: isEditing ? query : query || "",
        lexicalClass,
        limit: LEXICON_GROUP_SEARCH_LIMIT,
      }
    );

    /** @type {Array<{ type: "clear"|"group", group?: object, groupId?: string|null }>} */
    const entries = [];

    if (
      allowClear &&
      selectedGroupId &&
      variant === "dropdown" &&
      !isEditing &&
      !query.trim()
    ) {
      entries.push({ type: "clear", groupId: null });
    }

    groups.forEach((group) => {
      entries.push({ type: "group", group, groupId: group.group_id });
    });

    return { entries, totalMatches, truncated };
  }

  function renderResults() {
    if (!resultsEl || !metaEl) {
      return;
    }

    const { entries, totalMatches, truncated } = getVisibleEntries();

    if (variant === "dropdown" && !isOpen) {
      resultsEl.innerHTML = "";
      metaEl.textContent = "";
      inputEl?.setAttribute("aria-expanded", "false");
      return;
    }

    inputEl?.setAttribute("aria-expanded", "true");

    if (!entries.length) {
      resultsEl.innerHTML = `<li class="lexicon-group-picker-empty">No groups match your search.</li>`;
      metaEl.textContent = "";
      highlightIndex = 0;
      return;
    }

    if (highlightIndex >= entries.length) {
      highlightIndex = entries.length - 1;
    }
    if (highlightIndex < 0) {
      highlightIndex = 0;
    }

    resultsEl.innerHTML = entries
      .map((entry, index) => {
        if (entry.type === "clear") {
          return `
            <li>
              <button
                type="button"
                class="lexicon-group-picker-option lexicon-group-picker-option--clear${
                  index === highlightIndex ? " is-highlighted" : ""
                }"
                data-action="clear"
                role="option"
              >
                Show all groups
              </button>
            </li>
          `;
        }

        const row = describeLexiconGroupRow(entry.group, query);
        const isSelected = entry.groupId === selectedGroupId;
        const isHighlighted = index === highlightIndex;

        return `
          <li>
            <button
              type="button"
              class="lexicon-group-picker-option${
                isSelected ? " is-selected" : ""
              }${isHighlighted ? " is-highlighted" : ""}"
              data-group-id="${escapeHTML(entry.groupId)}"
              role="option"
              aria-selected="${isSelected}"
            >
              <span class="lexicon-group-picker-option-title">${escapeHTML(
                row.headword
              )}</span>
              ${
                row.subtitle
                  ? `<span class="lexicon-group-picker-option-subtitle">${escapeHTML(
                      row.subtitle
                    )}</span>`
                  : ""
              }
            </button>
          </li>
        `;
      })
      .join("");

    const metaParts = [];
    if (truncated) {
      metaParts.push(
        `Showing ${entries.length} of ${totalMatches} matches (refine search to narrow)`
      );
    } else if (totalMatches) {
      metaParts.push(`${totalMatches} group${totalMatches === 1 ? "" : "s"}`);
    }
    metaEl.textContent = metaParts.join(" · ");
  }

  function selectGroup(groupId) {
    selectedGroupId = groupId;
    isEditing = false;
    query = "";
    isOpen = variant === "panel";
    highlightIndex = 0;
    syncInputFromSelection();
    renderResults();
    onSelect(groupId);
  }

  function openDropdown() {
    if (variant !== "dropdown") {
      return;
    }
    isOpen = true;
    renderResults();
  }

  function closeDropdown() {
    if (variant !== "dropdown") {
      return;
    }
    isOpen = false;
    isEditing = false;
    query = "";
    syncInputFromSelection();
    renderResults();
  }

  function selectHighlighted() {
    const { entries } = getVisibleEntries();
    const entry = entries[highlightIndex];
    if (!entry) {
      return;
    }

    if (entry.type === "clear") {
      selectGroup(null);
      closeDropdown();
      return;
    }

    selectGroup(entry.groupId ?? null);
    closeDropdown();
  }

  inputEl?.addEventListener("focus", () => {
    isEditing = true;
    if (selectedGroupId && !query) {
      inputEl.select();
    }
    openDropdown();
  });

  inputEl?.addEventListener("input", () => {
    isEditing = true;
    query = inputEl.value;
    highlightIndex = 0;
    openDropdown();
    renderResults();
  });

  inputEl?.addEventListener("keydown", (event) => {
    const { entries } = getVisibleEntries();

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openDropdown();
      highlightIndex = Math.min(highlightIndex + 1, entries.length - 1);
      renderResults();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
      renderResults();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectHighlighted();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      inputEl.blur();
    }
  });

  classEl?.addEventListener("change", () => {
    lexicalClass = classEl.value;
    highlightIndex = 0;
    openDropdown();
    renderResults();
  });

  resultsEl?.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  resultsEl?.addEventListener("click", (event) => {
    const button = event.target.closest(".lexicon-group-picker-option");
    if (!button) {
      return;
    }

    if (button.dataset.action === "clear") {
      selectGroup(null);
      closeDropdown();
      return;
    }

    selectGroup(button.dataset.groupId || null);
    closeDropdown();
  });

  document.addEventListener("click", onDocumentClick);

  function onDocumentClick(event) {
    if (!mountEl.contains(event.target)) {
      closeDropdown();
    }
  }

  function refresh() {
    syncInputFromSelection();
    renderResults();
  }

  function setSelectedGroupId(groupId) {
    selectedGroupId = groupId;
    refresh();
  }

  function getSelectedGroupIdValue() {
    return selectedGroupId;
  }

  function destroy() {
    document.removeEventListener("click", onDocumentClick);
    mountEl.innerHTML = "";
    mountEl.classList.remove("lexicon-group-picker-root");
  }

  refresh();

  return {
    refresh,
    setSelectedGroupId,
    getSelectedGroupId: getSelectedGroupIdValue,
    destroy,
  };
}
