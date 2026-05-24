import { bootPage } from "../core/page-boot.js";
import { initNoteImportPage } from "./note-import.js";
import { getClient } from "../core/get-client.js";

function getTopicId() {
  return new URLSearchParams(window.location.search).get("topic");
}

async function loadTopicContext(topicId, titleEl) {
  if (!topicId) {
    return;
  }

  const sb = await getClient();
  const { data } = await sb
    .from("topics")
    .select("id, name")
    .eq("id", topicId)
    .maybeSingle();

  if (data && titleEl && !titleEl.value) {
    titleEl.value = data.name;
  }

  const topicLabel = document.getElementById("importTopicLabel");
  if (topicLabel) {
    topicLabel.textContent = data?.name
      ? `Topic: ${data.name}`
      : `Topic ID: ${topicId}`;
  }
}

async function bootNoteImport() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Import Canonical Note",
      preset: "teacherKnowledge",
      back: "qb-manager.html",
    },
  });

  if (!runtime) {
    return;
  }

  const topicId = getTopicId();
  const titleEl = document.getElementById("noteTitle");
  await loadTopicContext(topicId, titleEl);

  const handlers = initNoteImportPage({
    markdownEl: document.getElementById("mapMarkdown"),
    sectionsEl: document.getElementById("detectedSections"),
    topicLinksEl: document.getElementById("detectedTopicLinks"),
    statusEl: document.getElementById("importStatus"),
    topicId,
    titleEl,
    languageEl: document.getElementById("noteLanguage"),
    publishOnSaveEl: document.getElementById("publishOnSave"),
  });

  document.getElementById("parseBtn")?.addEventListener("click", handlers.parse);
  document.getElementById("saveBtn")?.addEventListener("click", handlers.save);
}

bootNoteImport();
