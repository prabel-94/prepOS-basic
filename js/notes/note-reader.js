/**
 * Canonical note reader + draft knowledge workspace.
 */

import { bootPage } from "../core/page-boot.js";
import { mountAppNav } from "../ui/app-nav.js";
import { TEACHER_ROLES } from "../core/access.js";
import {
  fetchPublishedNoteForTopic,
  fetchTopicById,
  loadCanonicalNoteBundle,
} from "./note-selectors.js";
import {
  bindStructuralCollapse,
  getAvailableTabs,
  renderRepresentationTab,
} from "./note-renderer.js";
import {
  getReferencedInTopics,
  renderReferencedInPanel,
} from "./note-backlinks.js";
import { initDraftWorkspace } from "./note-draft-editor.js";

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function isDraftModeRequested() {
  return getQueryParam("mode") === "draft";
}

function canUseDraftWorkspace(runtime, note) {
  return (
    note?.status === "draft" &&
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

async function renderBacklinksForTopic(topicId, backlinksEl) {
  if (!backlinksEl || !topicId) {
    return;
  }

  const backlinks = await getReferencedInTopics(topicId, {
    publishedOnly: true,
  });

  backlinksEl.innerHTML = renderReferencedInPanel(backlinks);
}

async function showMissingPublishedNote({
  headerEl,
  tabsEl,
  contentEl,
  backlinksEl,
  toolbarEl,
  sourcePanelEl,
  statusEl,
  topic,
}) {
  if (toolbarEl) {
    toolbarEl.classList.add("hidden");
    toolbarEl.innerHTML = "";
  }

  if (sourcePanelEl) {
    sourcePanelEl.classList.add("hidden");
  }

  if (headerEl) {
    headerEl.innerHTML = `
      <h2>${escapeHTML(topic?.name ?? "Topic")}</h2>
      <div class="exam-subtitle">Canonical knowledge</div>
    `;
  }

  if (tabsEl) {
    tabsEl.innerHTML = "";
    tabsEl.classList.add("hidden");
  }

  if (contentEl) {
    contentEl.classList.remove("hidden");
    contentEl.innerHTML =
      '<p class="canonical-empty">No published canonical note available yet.</p>';
  }

  if (statusEl) {
    statusEl.textContent = "";
  }

  if (topic?.id) {
    await renderBacklinksForTopic(topic.id, backlinksEl);
  } else if (backlinksEl) {
    backlinksEl.innerHTML = "";
  }
}

async function bootPublishedReader({
  bundle,
  headerEl,
  tabsEl,
  contentEl,
  backlinksEl,
  toolbarEl,
  sourcePanelEl,
  statusEl,
}) {
  if (toolbarEl) {
    toolbarEl.classList.add("hidden");
  }

  if (sourcePanelEl) {
    sourcePanelEl.classList.add("hidden");
  }

  const viewTopicId = bundle.note.topic_id;
  const topicName =
    bundle.note.topics?.name ?? bundle.note.title ?? "Topic";
  const subtitle = bundle.note.language
    ? `${bundle.note.language} · ${bundle.note.status}`
    : bundle.note.status;

  headerEl.innerHTML = `
    <h2>${escapeHTML(topicName)}</h2>
    <div class="exam-subtitle">${escapeHTML(bundle.note.title)}</div>
    <div class="canonical-meta">${escapeHTML(subtitle)}</div>
  `;

  const tabs = getAvailableTabs(bundle.representations);
  let activeTab = tabs[0]?.key ?? "narrative";
  const topicMap = bundle.topicMap ?? {};

  function renderActiveTab() {
    contentEl.classList.remove("hidden");
    contentEl.innerHTML = renderRepresentationTab(
      activeTab,
      bundle.representations,
      topicMap
    );

    if (activeTab === "structural") {
      bindStructuralCollapse(contentEl);
    }
  }

  function renderTabs() {
    if (!tabs.length) {
      tabsEl.innerHTML = "";
      tabsEl.classList.remove("hidden");
      contentEl.innerHTML =
        '<p class="canonical-empty">This note has no representation blocks yet.</p>';
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

  renderTabs();
  await renderBacklinksForTopic(viewTopicId, backlinksEl);
  statusEl.textContent = "";
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

  const noteId = getQueryParam("id");
  const topicId = getQueryParam("topic");

  const headerEl = document.getElementById("noteHeader");
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
    let resolvedNoteId = noteId;
    let viewTopicId = topicId;

    if (!resolvedNoteId && topicId) {
      const published = await fetchPublishedNoteForTopic(topicId);

      if (!published?.id) {
        const topic = await fetchTopicById(topicId);
        await showMissingPublishedNote({
          headerEl,
          tabsEl,
          contentEl,
          backlinksEl,
          toolbarEl,
          sourcePanelEl,
          statusEl,
          topic,
        });
        return runtime;
      }

      resolvedNoteId = published.id;
      viewTopicId = topicId;
    }

    if (!resolvedNoteId) {
      statusEl.textContent = "No note found. Import a canonical note first.";
      if (backlinksEl) {
        backlinksEl.innerHTML = "";
      }
      return null;
    }

    const bundle = await loadCanonicalNoteBundle(resolvedNoteId);

    if (!bundle?.note) {
      statusEl.textContent = "Note not found or not accessible.";
      if (backlinksEl) {
        backlinksEl.innerHTML = "";
      }
      return null;
    }

    const useDraftWorkspace =
      canUseDraftWorkspace(runtime, bundle.note) &&
      (isDraftModeRequested() || bundle.note.status === "draft");

    if (bundle.note.status === "draft" && !canUseDraftWorkspace(runtime, bundle.note)) {
      statusEl.textContent = "This draft note is not available.";
      return null;
    }

    if (useDraftWorkspace) {
      await initDraftWorkspace({
        note: bundle.note,
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
      headerEl,
      tabsEl,
      contentEl,
      backlinksEl,
      toolbarEl,
      sourcePanelEl,
      statusEl,
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
