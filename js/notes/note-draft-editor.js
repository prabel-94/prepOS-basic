/**
 * Draft knowledge workspace — semantic markdown refinement (not WYSIWYG).
 */

import { parseMapMarkdown } from "./map-parser.js";
import { regenerateVariantFromMarkdown } from "./note-storage.js";
import { confirmPublish, publishCanonicalVariant } from "./note-publish.js";
import { fetchNoteSource, loadVariantBundle, buildTraversalTopicMap } from "./note-selectors.js";
import {
  bindStructuralCollapse,
  getAvailableTabs,
  renderRepresentationTab,
} from "./note-renderer.js";
import { resolveAppPath } from "../core/access.js";
import { getLanguageLabel, normalizeLanguage } from "./note-variants.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

function parseForPreview(rawMarkdown) {
  const markdown = String(rawMarkdown ?? "").trim();
  if (!markdown) {
    throw new Error("Semantic markdown is empty.");
  }

  return parseMapMarkdown(markdown);
}

/**
 * @param {object} options
 * @param {object} options.variant — note_variants row with notes join
 * @param {HTMLElement} options.toolbarEl
 * @param {HTMLElement} options.headerEl
 * @param {HTMLElement} options.tabsEl
 * @param {HTMLElement} options.contentEl
 * @param {HTMLElement} options.sourcePanelEl
 * @param {HTMLTextAreaElement} options.sourceEditorEl
 * @param {HTMLElement} options.statusEl
 * @param {HTMLElement} [options.backlinksEl]
 */
export function initDraftWorkspace({
  variant,
  toolbarEl,
  headerEl,
  tabsEl,
  contentEl,
  sourcePanelEl,
  sourceEditorEl,
  statusEl,
  backlinksEl,
}) {
  let viewMode = "preview";
  let activeTab = "narrative";
  let previewParsed = null;
  let previewTopicMap = {};

  const note = variant?.notes ?? {};
  const topicName = note?.topics?.name ?? note?.title ?? "Topic";
  const preferLanguage = normalizeLanguage(variant?.language);
  const renderOptions = { preferLanguage };

  function setStatus(message, isError = false) {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  }

  function renderDraftHeader() {
    if (!headerEl) {
      return;
    }

    headerEl.innerHTML = `
      <h2>${escapeHTML(topicName)}</h2>
      <div class="exam-subtitle">${escapeHTML(variant.title)}</div>
      <div class="draft-meta">
        <span class="draft-badge">DRAFT · ${escapeHTML(getLanguageLabel(variant.language))}</span>
        <span class="draft-meta-item">Last updated: ${escapeHTML(formatDate(variant.updated_at))}</span>
      </div>
    `;
  }

  function renderToolbar() {
    if (!toolbarEl) {
      return;
    }

    toolbarEl.classList.remove("hidden");
    toolbarEl.innerHTML = `
      <button type="button" class="secondary-btn" data-draft-action="edit">Edit Source</button>
      <button type="button" class="secondary-btn" data-draft-action="preview">Preview</button>
      <button type="button" class="primary-btn" data-draft-action="save">Save Draft</button>
      <button type="button" class="primary-btn" data-draft-action="publish">Publish Language Variant</button>
    `;

    toolbarEl.querySelectorAll("[data-draft-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.draftAction;
        if (action === "edit") {
          showEditMode();
        } else if (action === "preview") {
          showPreviewMode();
        } else if (action === "save") {
          handleSaveDraft();
        } else if (action === "publish") {
          handlePublish();
        }
      });
    });
  }

  function setToolbarActive(action) {
    toolbarEl?.querySelectorAll("[data-draft-action]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.draftAction === action);
    });
  }

  function showEditMode() {
    viewMode = "edit";
    setToolbarActive("edit");

    if (sourcePanelEl) {
      sourcePanelEl.classList.remove("hidden");
    }

    if (tabsEl) {
      tabsEl.classList.add("hidden");
    }

    if (contentEl) {
      contentEl.classList.add("hidden");
    }

    setStatus("Editing semantic markdown source.");
  }

  function renderPreviewTabs(representations, options) {
    const tabs = getAvailableTabs(representations);

    if (!tabs.length) {
      tabsEl.innerHTML = "";
      contentEl.innerHTML =
        '<p class="canonical-empty">No representation blocks in preview. Check section anchors.</p>';
      return;
    }

    if (!tabs.some((t) => t.key === activeTab)) {
      activeTab = tabs[0].key;
    }

    tabsEl.innerHTML = tabs
      .map(
        (tab) =>
          `<button type="button" class="canonical-tab${tab.key === activeTab ? " active" : ""}" data-tab="${tab.key}">${tab.label}</button>`
      )
      .join("");

    tabsEl.querySelectorAll(".canonical-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        tabsEl
          .querySelectorAll(".canonical-tab")
          .forEach((b) => b.classList.toggle("active", b === btn));
        renderPreviewContent();
      });
    });

    renderPreviewContent();
  }

  function renderPreviewContent() {
    if (!previewParsed) {
      return;
    }

    const representations = previewParsed.representations ?? {};
    contentEl.innerHTML = renderRepresentationTab(
      activeTab,
      representations,
      previewTopicMap,
      renderOptions
    );

    if (activeTab === "structural") {
      bindStructuralCollapse(contentEl);
    }
  }

  function showPreviewMode() {
    viewMode = "preview";
    setToolbarActive("preview");

    try {
      previewParsed = parseForPreview(sourceEditorEl?.value ?? "");
      previewTopicMap = buildTraversalTopicMap(previewParsed.topic_links ?? []);

      if (sourcePanelEl) {
        sourcePanelEl.classList.add("hidden");
      }

      if (tabsEl) {
        tabsEl.classList.remove("hidden");
      }

      if (contentEl) {
        contentEl.classList.remove("hidden");
      }

      renderPreviewTabs(previewParsed.representations, renderOptions);
      setStatus("Preview from current source (not saved).");
    } catch (err) {
      setStatus(err.message || "Preview failed.", true);
    }
  }

  async function handleSaveDraft() {
    try {
      setStatus("Saving draft…");

      await regenerateVariantFromMarkdown({
        variantId: variant.id,
        rawMarkdown: sourceEditorEl?.value ?? "",
        title: variant.title,
        language: variant.language,
        status: "draft",
      });

      const bundle = await loadVariantBundle(variant.id);
      if (bundle?.variant) {
        variant.updated_at = bundle.variant.updated_at;
        renderDraftHeader();
      }

      previewParsed = parseForPreview(sourceEditorEl?.value ?? "");
      previewTopicMap = bundle?.topicMap ?? {};
      setStatus("Draft saved. Blocks and topic links regenerated.");
      showPreviewMode();
    } catch (err) {
      setStatus(err.message || "Save failed. Source was not replaced.", true);
    }
  }

  async function handlePublish() {
    if (!confirmPublish()) {
      return;
    }

    try {
      setStatus("Publishing…");

      await publishCanonicalVariant(variant.id, {
        rawMarkdown: sourceEditorEl?.value ?? "",
        title: variant.title,
        language: variant.language,
      });

      window.location.href = resolveAppPath(
        `note.html?variant=${encodeURIComponent(variant.id)}`
      );
    } catch (err) {
      setStatus(err.message || "Publish failed.", true);
    }
  }

  async function loadSource() {
    const source = await fetchNoteSource(variant.id);

    if (!source?.raw_markdown) {
      throw new Error("No semantic markdown source found for this note.");
    }

    if (sourceEditorEl) {
      sourceEditorEl.value = source.raw_markdown;
    }
  }

  renderDraftHeader();
  renderToolbar();

  if (backlinksEl) {
    backlinksEl.innerHTML = "";
  }

  return loadSource().then(() => {
    showPreviewMode();
  });
}
