/**
 * Draft knowledge workspace — semantic markdown refinement (not WYSIWYG).
 */

import { regenerateVariantFromMarkdown } from "./note-storage.js";
import {
  beginSemanticPublishReview,
  publishCanonicalVariant,
} from "./note-publish.js";
import { fetchNoteSource, loadVariantBundle } from "./note-selectors.js";
import {
  bindStructuralCollapse,
  getAvailableTabs,
  renderRepresentationTab,
} from "./note-renderer.js";
import { withReadingErgonomics } from "./reading-ergonomics.js";
import {
  bindSemanticPreviewInteractions,
  buildSemanticPreviewRenderOptions,
  prepareDraftSemanticPreview,
} from "../anchors/anchor-preview.js";
import { renderSemanticStateSummary } from "../anchors/anchor-summary.js";
import { runSemanticGovernanceAction } from "../anchors/anchor-governance.js";
import { getClient } from "../core/get-client.js";
import { closeModal } from "../ui/modal-system.js";
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
  let previewSemanticMap = {};
  let previewSummary = null;
  let previewRenderOptions = { preferLanguage: normalizeLanguage(variant?.language) };

  const note = variant?.notes ?? {};
  const topicName = note?.topics?.name ?? note?.title ?? "Topic";
  const preferLanguage = normalizeLanguage(variant?.language);

  const governanceContext = {
    variantId: variant.id,
    language: preferLanguage,
    async apply(action, entry, extra = {}) {
      const sb = await getClient();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData?.session?.user?.id ?? null;

      await runSemanticGovernanceAction(action, {
        sb,
        variantId: variant.id,
        anchorId: entry.anchor_id,
        sourceText: entry.source_text,
        displayName: entry.display_name ?? entry.source_text,
        language: preferLanguage,
        userId,
        noteAnchorLinkId: entry.note_anchor_link_id,
        canonicalTopicId: extra.canonicalTopicId,
      });

      const inspector = document.getElementById("teacher-inspector-overlay");
      if (inspector) {
        closeModal(inspector);
      }

      await refreshSemanticPreview();
      setStatus("Semantic state updated.");
    },
  };

  async function refreshSemanticPreview() {
    if (viewMode !== "preview") {
      return;
    }

    const preview = await prepareDraftSemanticPreview(sourceEditorEl?.value ?? "", {
      language: preferLanguage,
      title: variant.title,
      variantId: variant.id,
    });

    previewParsed = preview.parsed;
    previewSemanticMap = preview.semanticMap;
    previewSummary = preview.summary ?? null;
    previewRenderOptions = withReadingErgonomics(
      buildSemanticPreviewRenderOptions(previewSemanticMap, {
        preferLanguage,
      })
    );

    renderPreviewTabs(previewParsed.representations, previewRenderOptions);
  }

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
    if (contentEl) {
      contentEl.classList.add("semantic-reading-surface");
    }

    const tabs = getAvailableTabs(representations);

    if (!tabs.length) {
      tabsEl.innerHTML = "";
      const summaryHtml = previewSummary
        ? renderSemanticStateSummary(previewSummary)
        : "";
      contentEl.innerHTML = `${summaryHtml}<p class="canonical-empty">No representation blocks in preview. Check section anchors.</p>`;
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
    const summaryHtml = previewSummary
      ? renderSemanticStateSummary(previewSummary)
      : "";
    const representationHtml = renderRepresentationTab(
      activeTab,
      representations,
      {},
      previewRenderOptions
    );

    contentEl.innerHTML = `${summaryHtml}${representationHtml}`;

    if (activeTab === "structural") {
      bindStructuralCollapse(contentEl);
    }

    bindSemanticPreviewInteractions(contentEl, {
      semanticMap: previewSemanticMap,
      preferLanguage,
      governanceContext,
    });
  }

  async function showPreviewMode() {
    viewMode = "preview";
    setToolbarActive("preview");

    try {
      setStatus("Building semantic preview…");

      const preview = await prepareDraftSemanticPreview(sourceEditorEl?.value ?? "", {
        language: preferLanguage,
        title: variant.title,
        variantId: variant.id,
      });

      previewParsed = preview.parsed;
      previewSemanticMap = preview.semanticMap;
      previewSummary = preview.summary ?? null;
      previewRenderOptions = withReadingErgonomics(
        buildSemanticPreviewRenderOptions(previewSemanticMap, {
          preferLanguage,
        })
      );

      if (sourcePanelEl) {
        sourcePanelEl.classList.add("hidden");
      }

      if (tabsEl) {
        tabsEl.classList.remove("hidden");
      }

      if (contentEl) {
        contentEl.classList.remove("hidden");
      }

      renderPreviewTabs(previewParsed.representations, previewRenderOptions);
      setStatus("Semantic preview (not saved). Click anchors to inspect.");
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

      setStatus("Draft saved. Blocks and topic links regenerated.");
      await showPreviewMode();
    } catch (err) {
      setStatus(err.message || "Save failed. Source was not replaced.", true);
    }
  }

  async function handlePublish() {
    try {
      setStatus("Preparing semantic publish review…");

      await beginSemanticPublishReview({
        variant,
        rawMarkdown: sourceEditorEl?.value ?? "",
        title: variant.title,
        language: variant.language,
        onReturn: () => {
          setStatus("Returned to draft. Publish when ready.");
        },
        onPublish: async () => {
          const overlay = document.getElementById("semantic-publish-review-overlay");
          if (overlay) {
            closeModal(overlay);
          }

          setStatus("Publishing…");

          await publishCanonicalVariant(variant.id, {
            rawMarkdown: sourceEditorEl?.value ?? "",
            title: variant.title,
            language: variant.language,
          });

          window.location.href = resolveAppPath(
            `note.html?variant=${encodeURIComponent(variant.id)}`
          );
        },
      });
    } catch (err) {
      setStatus(err.message || "Publish review failed.", true);
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
