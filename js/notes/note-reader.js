/**
 * Canonical note reader + draft workspace (variant-aware).
 */

import { bootPage } from "../core/page-boot.js";
import { mountAppNav } from "../ui/app-nav.js";
import { TEACHER_ROLES } from "../core/access.js";
import { resolveAppPath } from "../core/access.js";
import {
  fetchPublishedVariantForTopic,
  fetchTopicById,
  fetchVariantById,
  fetchVariantsForNote,
  loadVariantBundle,
} from "./note-selectors.js";
import {
  bindStructuralCollapse,
  getAvailableTabs,
  renderRepresentationTab,
} from "./note-renderer.js";
import { withReadingErgonomics } from "./reading-ergonomics.js";
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
  bindStudentSemanticReading,
  bindPublishedSemanticReading,
  buildStudentSemanticRenderOptions,
  preparePublishedStudentSemanticMap,
} from "../anchors/anchor-student-reader.js";

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function isDraftModeRequested() {
  return getQueryParam("mode") === "draft";
}

function canUseDraftWorkspace(runtime, variant) {
  return (
    variant?.status === "draft" &&
    runtime?.role &&
    TEACHER_ROLES.includes(runtime.role)
  );
}

function resolveReaderNav(runtime) {
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

function renderLanguageTabs(container, variants, activeVariantId, isTeacher) {
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
      const href = resolveAppPath(
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
  backlinksEl,
  toolbarEl,
  sourcePanelEl,
  statusEl,
  isTeacher,
  isStudent,
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
    isTeacher
  );

  const subtitle = `${getLanguageLabel(variant.language)} · ${variant.status}`;

  headerEl.innerHTML = `
    <h2>${escapeHTML(topicName)}</h2>
    <div class="exam-subtitle">${escapeHTML(variant.title)}</div>
    <div class="canonical-meta">${escapeHTML(subtitle)}</div>
  `;

  const tabs = getAvailableTabs(bundle.representations);
  let activeTab = tabs[0]?.key ?? "narrative";

  let renderOptions = withReadingErgonomics({ preferLanguage });
  let publishedSemanticMap = null;

  try {
    publishedSemanticMap = await preparePublishedStudentSemanticMap(
      bundle.variant.id,
      preferLanguage
    );
  } catch (err) {
    console.warn("[Published semantic map]", err);
    publishedSemanticMap = null;
  }

  if (publishedSemanticMap && Object.keys(publishedSemanticMap).length) {
    renderOptions = withReadingErgonomics({
      preferLanguage,
      semanticMap: publishedSemanticMap,
      semanticPreview: true,
      semanticInteractive: true,
      studentMode: Boolean(isStudent),
    });
  }

  function renderActiveTab() {
    contentEl.classList.remove("hidden");
    contentEl.classList.add("semantic-reading-surface");
    contentEl.innerHTML = renderRepresentationTab(
      activeTab,
      bundle.representations,
      bundle.topicMap,
      renderOptions
    );

    if (activeTab === "structural") {
      bindStructuralCollapse(contentEl);
    }

    if (publishedSemanticMap && Object.keys(publishedSemanticMap).length) {
      bindPublishedSemanticReading(contentEl, {
        semanticMap: publishedSemanticMap,
        preferLanguage,
        role: isStudent ? "student" : isTeacher ? "teacher" : "admin",
      });
    }
  }

  function renderRepTabs() {
    if (!tabs.length) {
      tabsEl.innerHTML = "";
      tabsEl.classList.remove("hidden");
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
        activeTab = btn.dataset.tab;
        tabsEl
          .querySelectorAll(".canonical-tab")
          .forEach((b) => b.classList.toggle("active", b === btn));
        renderActiveTab();
      });
    });

    renderActiveTab();
  }

  renderRepTabs();
  await renderBacklinksForTopic(note?.topic_id, backlinksEl, preferLanguage);
  statusEl.textContent = "";
}

async function resolveVariantContext({ variantId, topicId, lang, runtime }) {
  if (variantId) {
    const variant = await fetchVariantById(variantId);
    if (!variant) {
      return null;
    }

    if (variant.status === "archived") {
      return { error: "archived_unavailable" };
    }

    if (variant.status === "draft" && runtime?.role === "student") {
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
      runtime?.role === "student"
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
  const contentEl = document.getElementById("noteContent");
  const sourcePanelEl = document.getElementById("noteSourcePanel");
  const sourceEditorEl = document.getElementById("semanticSourceEditor");
  const backlinksEl = document.getElementById("noteBacklinks");
  const statusEl = document.getElementById("readerStatus");

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

    const useDraft =
      canUseDraftWorkspace(runtime, bundle.variant) &&
      (isDraftModeRequested() || bundle.variant.status === "draft");

    if (useDraft) {
      const isTeacher = TEACHER_ROLES.includes(runtime.role);
      if (languageTabsEl && (ctx.variants?.length ?? 0) > 1) {
        renderLanguageTabs(
          languageTabsEl,
          ctx.variants,
          ctx.variant.id,
          isTeacher
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
      backlinksEl,
      toolbarEl,
      sourcePanelEl,
      statusEl,
      isTeacher: TEACHER_ROLES.includes(runtime.role),
      isStudent: runtime.role === "student",
    });
  } catch (err) {
    statusEl.textContent = err.message || "Failed to load note.";
    if (backlinksEl) {
      backlinksEl.innerHTML = "";
    }
  }

  return runtime;
}

bootNoteReader();
