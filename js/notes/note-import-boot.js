import { bootPage } from "../core/page-boot.js";
import { initNoteImportPage } from "./note-import.js";
import { getClient } from "../core/get-client.js";
import {
  getTopicIdFromUrl,
  isValidTopicId,
} from "./note-import-params.js";
import {
  pickMarkdownFile,
  readMarkdownFile,
} from "./note-import-file.js";

function initMarkdownFileUpload(handlers) {
  const fileInput = document.getElementById("mapMarkdownFile");
  const uploadBtn = document.getElementById("uploadMarkdownBtn");
  const dropZone = document.getElementById("mapMarkdownDropZone");
  const statusEl = document.getElementById("importStatus");

  if (!fileInput || !handlers?.loadMarkdown) {
    return;
  }

  async function ingestFile(file) {
    if (!file) {
      return;
    }

    try {
      const { text, filename } = await readMarkdownFile(file);
      handlers.loadMarkdown(text, { filename });
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || "Could not load file.";
        statusEl.classList.add("error");
      }
    }
  }

  uploadBtn?.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    ingestFile(file);
  });

  if (!dropZone) {
    return;
  }

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("import-drag-over");
  });

  dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) {
      dropZone.classList.remove("import-drag-over");
    }
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("import-drag-over");

    const file = pickMarkdownFile(event.dataTransfer?.files);
    if (!file) {
      if (statusEl) {
        statusEl.textContent =
          "Drop a .md, .markdown, or .txt file onto this panel.";
        statusEl.classList.add("error");
      }
      return;
    }

    ingestFile(file);
  });
}

function showTopicGuidance(invalidValue) {
  const topicLabel = document.getElementById("importTopicLabel");
  const statusEl = document.getElementById("importStatus");

  if (topicLabel) {
    topicLabel.textContent = "No valid topic selected";
  }

  const hint =
    "Open Question Bank, click a topic’s legacy note, then use the same id in the URL: " +
    "notes-import.html?id=PASTE_UUID_HERE (not the literal text &lt;topic-uuid&gt;).";

  if (invalidValue && !isValidTopicId(invalidValue)) {
    if (statusEl) {
      statusEl.classList.add("error");
      statusEl.textContent = `Invalid topic id "${invalidValue}". ${hint}`;
    }
    return;
  }

  if (statusEl) {
    statusEl.classList.add("error");
    statusEl.textContent = hint;
  }
}

async function loadTopicContext(topicId, titleEl) {
  if (!topicId) {
    return null;
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from("topics")
    .select("id, name")
    .eq("id", topicId)
    .maybeSingle();

  const topicLabel = document.getElementById("importTopicLabel");

  if (error) {
    if (topicLabel) {
      topicLabel.textContent = "Could not load topic";
    }
    return null;
  }

  if (!data) {
    if (topicLabel) {
      topicLabel.textContent = "Topic not found";
    }
    return null;
  }

  if (titleEl && !titleEl.value) {
    titleEl.value = data.name;
  }

  if (topicLabel) {
    topicLabel.textContent = `Topic: ${data.name}`;
  }

  return data;
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

  const params = new URLSearchParams(window.location.search);
  const rawTopicParam = params.get("topic") || params.get("id");
  const topicId = getTopicIdFromUrl();
  const titleEl = document.getElementById("noteTitle");

  const topicIdInput = document.getElementById("importTopicId");
  if (topicIdInput && topicId) {
    topicIdInput.value = topicId;
  }

  if (!topicId) {
    showTopicGuidance(rawTopicParam);
  } else {
    await loadTopicContext(topicId, titleEl);
  }

  const handlers = initNoteImportPage({
    markdownEl: document.getElementById("mapMarkdown"),
    sectionsEl: document.getElementById("detectedSections"),
    topicLinksEl: document.getElementById("detectedTopicLinks"),
    variantsEl: document.getElementById("existingVariants"),
    variantActionsEl: document.getElementById("variantActions"),
    statusEl: document.getElementById("importStatus"),
    topicId,
    titleEl,
    languageEl: document.getElementById("noteLanguage"),
    publishOnSaveEl: document.getElementById("publishOnSave"),
    topicIdInput: document.getElementById("importTopicId"),
  });

  document.getElementById("parseBtn")?.addEventListener("click", handlers.parse);
  document.getElementById("saveBtn")?.addEventListener("click", handlers.save);
  initMarkdownFileUpload(handlers);
}

bootNoteImport();
