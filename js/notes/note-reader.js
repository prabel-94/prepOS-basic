/**
 * Minimal canonical note reader (note.html?id=... or ?topic=...).
 */

import { bootPage } from "../core/page-boot.js";
import { mountAppNav } from "../ui/app-nav.js";
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

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
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

function showMissingPublishedNote({
  headerEl,
  tabsEl,
  contentEl,
  backlinksEl,
  statusEl,
  topic,
}) {
  if (headerEl) {
    headerEl.innerHTML = `
      <h2>${escapeHTML(topic?.name ?? "Topic")}</h2>
      <div class="exam-subtitle">Canonical knowledge</div>
    `;
  }

  if (tabsEl) {
    tabsEl.innerHTML = "";
  }

  if (contentEl) {
    contentEl.innerHTML =
      '<p class="canonical-empty">No published canonical note available yet.</p>';
  }

  if (statusEl) {
    statusEl.textContent = "";
  }

  if (topic?.id) {
    renderBacklinksForTopic(topic.id, backlinksEl);
  } else if (backlinksEl) {
    backlinksEl.innerHTML = "";
  }
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
  const tabsEl = document.getElementById("representationTabs");
  const contentEl = document.getElementById("noteContent");
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

    viewTopicId = bundle.note.topic_id ?? viewTopicId;

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
        contentEl.innerHTML =
          '<p class="canonical-empty">This note has no representation blocks yet.</p>';
        return;
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
          renderActiveTab();
        });
      });

      renderActiveTab();
    }

    renderTabs();
    await renderBacklinksForTopic(viewTopicId, backlinksEl);
    statusEl.textContent = "";
  } catch (err) {
    statusEl.textContent = err.message || "Failed to load note.";
    if (backlinksEl) {
      backlinksEl.innerHTML = "";
    }
  }

  return runtime;
}

bootNoteReader();
