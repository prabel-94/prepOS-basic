/**
 * Minimal canonical note reader (note.html?id=...).
 */

import { bootPage } from "../core/page-boot.js";
import { mountAppNav } from "../ui/app-nav.js";
import {
  fetchPublishedNoteForTopic,
  loadCanonicalNoteBundle,
} from "./note-selectors.js";
import {
  getAvailableTabs,
  renderRepresentationTab,
} from "./note-renderer.js";

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
  const statusEl = document.getElementById("readerStatus");

  if (!contentEl) {
    return null;
  }

  try {
    let resolvedNoteId = noteId;

    if (!resolvedNoteId && topicId) {
      const published = await fetchPublishedNoteForTopic(topicId);
      resolvedNoteId = published?.id ?? null;
    }

    if (!resolvedNoteId) {
      statusEl.textContent = "No note found. Import a canonical note first.";
      return null;
    }

    const bundle = await loadCanonicalNoteBundle(resolvedNoteId);

    if (!bundle?.note) {
      statusEl.textContent = "Note not found or not accessible.";
      return null;
    }

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

    function renderActiveTab() {
      contentEl.innerHTML = renderRepresentationTab(
        activeTab,
        bundle.representations,
        bundle.topicLinks
      );
    }

    function renderTabs() {
      if (!tabs.length) {
        tabsEl.innerHTML = "";
        contentEl.innerHTML =
          "<p class=\"canonical-empty\">This note has no representation blocks yet.</p>";
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
    statusEl.textContent = "";
  } catch (err) {
    statusEl.textContent = err.message || "Failed to load note.";
  }

  return runtime;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

bootNoteReader();
