/**
 * Canonical note reader + draft workspace (variant-aware).
 */

import { bootPage } from "../core/page-boot.js";
import { mountAppNav } from "../ui/app-nav.js";
import { TEACHER_ROLES } from "../core/access.js";
import { resolveAppPath } from "../core/access.js";
import {
  isStudentPreviewQuery,
} from "../core/student-preview.js";
import { isLinkedStudentMode } from "../core/learner-context.js";
import {
  fetchPublishedVariantForTopic,
  fetchTopicById,
  fetchVariantById,
  fetchVariantsForNote,
  fetchArchivedVariantsForNote,
  loadVariantBundle,
} from "./note-selectors.js";
import { fetchPublishedVariantByLanguage } from "./note-storage.js";
import {
  getAvailableTabs,
} from "./note-renderer.js";
import {
  getReferencedInTopics,
  renderReferencedInPanel,
} from "./note-backlinks.js";
import { initDraftWorkspace } from "./note-draft-editor.js";
import {
  getLanguageLabel,
  normalizeLanguage,
} from "./note-variants.js";
import {
  bindRestoreButtons,
  bindVersionHistoryPanel,
  renderArchivePreviewBanner,
  renderVersionHistoryPanel,
} from "./note-variant-history.js";
import { createLayerFlipReading } from "./layer-flip-reading.js";
import { initReadingBookmark } from "./reading-bookmark.js";
import { renderDashboardSkeleton } from "../student/student-dashboard-renderer.js";

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function isDraftModeRequested() {
  return getQueryParam("mode") === "draft";
}

function isTeacherStudentPreview(runtime) {
  if (isLinkedStudentMode(runtime)) {
    return true;
  }

  return (
    isStudentPreviewQuery() &&
    runtime?.role &&
    TEACHER_ROLES.includes(runtime.role)
  );
}

function canTeacherPreviewArchive(runtime, variant) {
  return (
    variant?.status === "archived" &&
    runtime?.role &&
    TEACHER_ROLES.includes(runtime.role)
  );
}

async function mountVersionHistory({
  versionHistoryEl,
  noteId,
  language,
  activeVariantId,
  statusEl,
}) {
  if (!versionHistoryEl || !noteId) {
    return () => {};
  }

  const archived = await fetchArchivedVariantsForNote(noteId, language);

  if (!archived.length) {
    versionHistoryEl.innerHTML = "";
    versionHistoryEl.classList.add("hidden");
    return () => {};
  }

  versionHistoryEl.classList.remove("hidden");
  versionHistoryEl.innerHTML = renderVersionHistoryPanel(archived, {
    activeVariantId,
  });

  return bindVersionHistoryPanel(versionHistoryEl, {
    onStatus: (message, isError = false) => {
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message;
      statusEl.classList.toggle("error", isError);
    },
  });
}

function canUseDraftWorkspace(runtime, variant) {
  return (
    variant?.status === "draft" &&
    runtime?.role &&
    TEACHER_ROLES.includes(runtime.role)
  );
}

function resolveReaderNav(runtime) {
  if (isLinkedStudentMode(runtime)) {
    return {
      title: "Topic Note",
      preset: "studentHome",
      back: "student-dashboard.html",
    };
  }

  if (isTeacherStudentPreview(runtime) && isStudentPreviewQuery()) {
    return {
      title: "Topic Note (preview)",
      preset: "studentHome",
      back: "teacher-student-preview.html",
    };
  }

  if (runtime?.role === "student") {
    return {
      title: "Topic Note",
      preset: "studentHome",
      back: "student-dashboard.html",
    };
  }

  return {
    title: "Topic Note",
    preset: "teacherKnowledge",
    back: "qb-manager.html",
  };
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countRecallBlocks(blocks = []) {
  return blocks.filter(
    (b) =>
      b.block_type === "recall" ||
      b.block_type === "recall_section" ||
      b.metadata_json?.source_section === "recall"
  ).length;
}

function logRevisionParityPublished(variantId, representations = {}) {
  const revisionBlocks = representations.revision ?? [];
  console.log("[Revision Parity] Published Reader", {
    draftVariantId: null,
    publishedVariantId: variantId ?? null,
    draftRevisionBlockCount: null,
    publishedRevisionBlockCount: revisionBlocks.length,
    draftRecallBlockCount: null,
    publishedRecallBlockCount: countRecallBlocks(revisionBlocks),
  });
}

function renderStudentPreviewBanner() {
  return `
    <div class="student-preview-banner student-preview-banner--inline mt-10" role="status">
      <span class="student-preview-banner-title">Student preview</span>
      <span class="student-preview-banner-text">Published read-only view — anchors open the student cognition inspector.</span>
    </div>
  `;
}

function renderLanguageTabs(container, variants, activeVariantId, isTeacher, studentPreview = false) {
  if (!container || variants.length < 2) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return normalizeLanguage(
      variants.find((v) => v.id === activeVariantId)?.language
    );
  }

  container.classList.remove("hidden");
  container.innerHTML = variants
    .map((v) => {
      const label = getLanguageLabel(v.language);
      const active = v.id === activeVariantId ? " active" : "";
      const statusMark =
        v.status === "published" ? "" : v.status === "draft" ? " ○" : "";
      const href = studentPreview
        ? resolveAppPath(
            `note.html?variant=${encodeURIComponent(v.id)}&preview=student`
          )
        : resolveAppPath(
            `note.html?variant=${encodeURIComponent(v.id)}${v.status === "draft" && isTeacher ? "&mode=draft" : ""}`
          );
      return `<a class="language-tab${active}" href="${escapeHTML(href)}">${escapeHTML(label)}${statusMark}</a>`;
    })
    .join("");

  return normalizeLanguage(
    variants.find((v) => v.id === activeVariantId)?.language
  );
}

async function renderBacklinksForTopic(topicId, backlinksEl, preferLanguage) {
  if (!backlinksEl || !topicId) {
    return;
  }

  const backlinks = await getReferencedInTopics(topicId, {
    publishedOnly: true,
  });

  backlinksEl.innerHTML = renderReferencedInPanel(backlinks, { preferLanguage });
}

async function bootPublishedReader({
  bundle,
  variants,
  activeVariantId,
  headerEl,
  languageTabsEl,
  tabsEl,
  contentEl,
  contentWrapEl,
  flipBarEl,
  backlinksEl,
  versionHistoryEl,
  toolbarEl,
  sourcePanelEl,
  statusEl,
  isTeacher,
  isStudent,
  studentPreview = false,
  enableLayerFlip = false,
  archivePreview = false,
  publishedVariantId = null,
}) {
  if (toolbarEl) {
    toolbarEl.classList.add("hidden");
  }

  if (sourcePanelEl) {
    sourcePanelEl.classList.add("hidden");
  }

  const note = bundle.note;
  const variant = bundle.variant;
  const topicName = note?.topics?.name ?? note?.title ?? "Topic";
  const preferLanguage = renderLanguageTabs(
    languageTabsEl,
    variants,
    activeVariantId,
    isTeacher,
    studentPreview
  );

  const subtitle = archivePreview
    ? `${getLanguageLabel(variant.language)} · archived snapshot`
    : `${getLanguageLabel(variant.language)} · ${variant.status}`;

  const archiveBanner = archivePreview
    ? renderArchivePreviewBanner(variant, { publishedVariantId })
    : "";

  headerEl.innerHTML = `
    <h2>${escapeHTML(topicName)}</h2>
    <div class="exam-subtitle">${escapeHTML(variant.title)}</div>
    <div class="canonical-meta">${escapeHTML(subtitle)}</div>
    ${studentPreview ? renderStudentPreviewBanner() : ""}
    ${archiveBanner}
  `;

  const restoreStatusHandler = (message, isError = false) => {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  };

  let unbindRestore = () => {};
  if (archivePreview && isTeacher) {
    unbindRestore = bindRestoreButtons(headerEl, {
      onStatus: restoreStatusHandler,
    });
  }

  const tabs = getAvailableTabs(bundle.representations, {
    customDefinitions: bundle.sectionExtensions ?? [],
  });
  let activeTab = tabs[0]?.key ?? "narrative";

  logRevisionParityPublished(bundle.variant.id, bundle.representations);

  const layerFlip = createLayerFlipReading({
    contentEl,
    contentWrapEl,
    flipBarEl,
    primaryBundle: bundle,
    variants,
    enabled: enableLayerFlip,
    isStudent,
    isTeacher,
    getActiveTab: () => activeTab,
    getTabs: () => tabs,
  });

  let unbindFlip = layerFlip.bindFlipControl();

  async function renderActiveTab() {
    await layerFlip.renderActiveTab();
  }

  function renderRepTabs() {
    if (!tabs.length) {
      tabsEl.innerHTML = "";
      tabsEl.classList.remove("hidden");
      flipBarEl?.classList.add("hidden");
      contentEl.innerHTML =
        '<p class="canonical-empty">No representation blocks yet.</p>';
      return;
    }

    tabsEl.classList.remove("hidden");
    tabsEl.innerHTML = tabs
      .map(
        (tab) =>
          `<button type="button" class="canonical-tab${tab.key === activeTab ? " active" : ""}" data-tab="${tab.key}">${tab.label}</button>`
      )
      .join("");

    tabsEl.querySelectorAll(".canonical-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        layerFlip.captureBeforeLeave(activeTab);
        activeTab = btn.dataset.tab;
        tabsEl
          .querySelectorAll(".canonical-tab")
          .forEach((b) => b.classList.toggle("active", b === btn));
        layerFlip.resetContentLanguage();
        renderActiveTab().catch((err) => {
          console.error("[Note reader tab]", err);
        });
      });
    });

    renderActiveTab().catch((err) => {
      console.error("[Note reader]", err);
    });
  }

  renderRepTabs();

  const bookmark = initReadingBookmark({
    variantId: variant.id,
    contentEl,
    getActiveTab: () => activeTab,
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bookmark.restore();
    });
  });

  let unbindHistory = () => {};
  if (isTeacher && versionHistoryEl) {
    unbindHistory = await mountVersionHistory({
      versionHistoryEl,
      noteId: variant.note_id,
      language: preferLanguage,
      activeVariantId: archivePreview ? variant.id : null,
      statusEl,
    });
  }

  await renderBacklinksForTopic(note?.topic_id, backlinksEl, preferLanguage);
  statusEl.textContent = "";

  return () => {
    unbindRestore();
    unbindHistory();
    unbindFlip();
    bookmark.destroy();
  };
}

async function resolveVariantContext({ variantId, topicId, lang, runtime }) {
  const studentPreview = isTeacherStudentPreview(runtime);

  if (variantId) {
    const variant = await fetchVariantById(variantId);
    if (!variant) {
      return null;
    }

    if (studentPreview && variant.status !== "published") {
      return { error: "draft_unavailable" };
    }

    if (variant.status === "archived") {
      if (!canTeacherPreviewArchive(runtime, variant)) {
        return { error: "archived_unavailable" };
      }

      const variants = await fetchVariantsForNote(variant.note_id, {
        includeArchived: false,
      });
      const published = await fetchPublishedVariantByLanguage(
        variant.note_id,
        variant.language
      );

      return {
        variant,
        variants,
        note: variant.notes,
        archivePreview: true,
        publishedVariantId: published?.id ?? null,
      };
    }

    if (variant.status === "draft" && (runtime?.role === "student" || studentPreview)) {
      return { error: "draft_unavailable" };
    }

    const variants = await fetchVariantsForNote(variant.note_id, {
      includeArchived: false,
    });
    return { variant, variants, note: variant.notes };
  }

  if (topicId) {
    const preferLang = normalizeLanguage(lang);
    const resolved = await fetchPublishedVariantForTopic(topicId, preferLang);

    if (!resolved) {
      const topic = await fetchTopicById(topicId);
      return { error: "no_published", topic };
    }

    const variants = await fetchVariantsForNote(resolved.canonical.id, {
      includeArchived: false,
    });
    const visibleVariants =
      runtime?.role === "student" || studentPreview
        ? variants.filter((v) => v.status === "published")
        : variants;

    return {
      variant: resolved.variant,
      variants: visibleVariants,
      note: resolved.canonical,
    };
  }

  return null;
}

export async function bootNoteReader() {
  const runtime = await bootPage({
    roles: ["teacher", "admin", "student"],
    nav: false,
  });

  if (runtime) {
    mountAppNav(resolveReaderNav(runtime));
  }

  if (!runtime) {
    return null;
  }

  const variantId = getQueryParam("variant");
  const topicId = getQueryParam("topic");
  const lang = getQueryParam("lang");

  const headerEl = document.getElementById("noteHeader");
  const languageTabsEl = document.getElementById("languageTabs");
  const toolbarEl = document.getElementById("noteDraftToolbar");
  const tabsEl = document.getElementById("representationTabs");
  const contentWrapEl = document.getElementById("noteContentWrap");
  const flipBarEl = document.getElementById("noteLayerFlip");
  const contentEl = document.getElementById("noteContent");
  const sourcePanelEl = document.getElementById("noteSourcePanel");
  const sourceEditorEl = document.getElementById("semanticSourceEditor");
  const backlinksEl = document.getElementById("noteBacklinks");
  const versionHistoryEl = document.getElementById("noteVersionHistory");
  const sectionInventoryEl = document.getElementById("noteSectionInventory");
  const statusEl = document.getElementById("readerStatus");
  const skeletonEl = document.getElementById("noteReaderSkeleton");
  renderDashboardSkeleton(skeletonEl, { variant: "tabs", rows: 2 });

  if (!contentEl) {
    return null;
  }

  try {
    const ctx = await resolveVariantContext({
      variantId,
      topicId,
      lang,
      runtime,
    });

    if (skeletonEl) skeletonEl.innerHTML = "";

    if (!ctx) {
      statusEl.textContent = "No note found. Import a canonical note first.";
      return null;
    }

    if (ctx.error === "no_published") {
      headerEl.innerHTML = `
        <h2>${escapeHTML(ctx.topic?.name ?? "Topic")}</h2>
        <div class="exam-subtitle">Canonical knowledge</div>
      `;
      tabsEl.classList.add("hidden");
      contentEl.innerHTML =
        '<p class="canonical-empty">No published variant available in this language yet.</p>';
      if (ctx.topic?.id) {
        await renderBacklinksForTopic(ctx.topic.id, backlinksEl, lang || "english");
      }
      statusEl.textContent = "";
      return runtime;
    }

    if (ctx.error === "draft_unavailable") {
      statusEl.textContent = "This draft is not available.";
      return null;
    }

    if (ctx.error === "archived_unavailable") {
      statusEl.textContent =
        "This language variant was archived and is no longer available.";
      return null;
    }

    const bundle = await loadVariantBundle(ctx.variant.id);

    if (!bundle) {
      statusEl.textContent = "Note not found or not accessible.";
      return null;
    }

    const studentPreview = isTeacherStudentPreview(runtime);
    const isStudent =
      runtime.role === "student" || studentPreview;
    const isTeacher =
      TEACHER_ROLES.includes(runtime.role) && !studentPreview;

    const useDraft =
      !studentPreview &&
      canUseDraftWorkspace(runtime, bundle.variant) &&
      (isDraftModeRequested() || bundle.variant.status === "draft");

    if (useDraft) {
      const isTeacherDraft = TEACHER_ROLES.includes(runtime.role);
      if (languageTabsEl && (ctx.variants?.length ?? 0) > 1) {
        renderLanguageTabs(
          languageTabsEl,
          ctx.variants,
          ctx.variant.id,
          isTeacherDraft
        );
      } else if (languageTabsEl) {
        languageTabsEl.classList.add("hidden");
      }
      await initDraftWorkspace({
        variant: bundle.variant,
        toolbarEl,
        headerEl,
        tabsEl,
        contentEl,
        sourcePanelEl,
        sourceEditorEl,
        statusEl,
        backlinksEl,
        sectionInventoryEl,
      });
      return runtime;
    }

    await bootPublishedReader({
      bundle,
      variants: ctx.variants ?? [],
      activeVariantId: ctx.variant.id,
      headerEl,
      languageTabsEl,
      tabsEl,
      contentEl,
      contentWrapEl,
      flipBarEl,
      backlinksEl,
      versionHistoryEl,
      toolbarEl,
      sourcePanelEl,
      statusEl,
      isTeacher,
      isStudent,
      studentPreview,
      enableLayerFlip: true,
      archivePreview: Boolean(ctx.archivePreview),
      publishedVariantId: ctx.publishedVariantId ?? null,
    });
  } catch (err) {
    if (skeletonEl) skeletonEl.innerHTML = "";
    statusEl.textContent = err.message || "Failed to load note.";
    if (backlinksEl) {
      backlinksEl.innerHTML = "";
    }
  }

  return runtime;
}

bootNoteReader();
