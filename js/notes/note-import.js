/**
 * MAP import-review workflow (paste → parse → review → save).
 */

import { parseMapMarkdown, summarizeDetectedSections } from "./map-parser.js";
import { saveCanonicalNote } from "./note-storage.js";
import { getTopicIdFromUrl } from "./note-import-params.js";

const SECTION_LABELS = Object.freeze({
  metadata: "Metadata",
  narrative: "Narrative",
  structural: "Structural",
  revision: "Revision",
  timeline: "Timeline",
  interpretations: "Interpretations",
  recall: "Recall",
});

export function initNoteImportPage({
  markdownEl,
  sectionsEl,
  topicLinksEl,
  statusEl,
  topicId,
  titleEl,
  languageEl,
  publishOnSaveEl,
  topicIdInput,
}) {
  let lastParsed = null;

  function setStatus(message, isError = false) {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  }

  function renderSectionsSummary(parsed) {
    const detected = summarizeDetectedSections(parsed);
    const items = Object.entries(SECTION_LABELS)
      .filter(([key]) => detected[key])
      .map(
        ([, label]) =>
          `<li class="detected-item detected-ok">✓ ${label}</li>`
      );

    if (!items.length) {
      sectionsEl.innerHTML =
        '<li class="detected-item detected-miss">No semantic sections detected. Use # [NARRATIVE], etc.</li>';
      return;
    }

    sectionsEl.innerHTML = items.join("");
  }

  function renderTopicLinks(parsed) {
    const links = parsed?.topic_links ?? [];

    if (!links.length) {
      topicLinksEl.innerHTML =
        '<li class="detected-item detected-miss">No [[topic]] links found</li>';
      return;
    }

    topicLinksEl.innerHTML = links
      .map(
        (link) =>
          `<li class="detected-item detected-ok">✓ ${link.name}</li>`
      )
      .join("");
  }

  async function handleParse() {
    const raw = markdownEl?.value?.trim() ?? "";

    if (!raw) {
      setStatus("Paste semantic markdown first.", true);
      return;
    }

    lastParsed = parseMapMarkdown(raw);
    renderSectionsSummary(lastParsed);
    renderTopicLinks(lastParsed);
    setStatus("Parsed. Review sections and topic links, then save.");
  }

  async function handleSave() {
    const resolvedTopicId =
      getTopicIdFromUrl() ||
      topicIdInput?.value?.trim() ||
      topicId;

    if (!resolvedTopicId) {
      setStatus(
        "No topic attached. Use Question Bank → Import canonical note, or open " +
          "notes-import.html?id=<your-topic-uuid>.",
        true
      );
      return;
    }

    if (!lastParsed) {
      lastParsed = parseMapMarkdown(markdownEl?.value ?? "");
    }

    const title = titleEl?.value?.trim() || lastParsed.metadata?.title || "Untitled Note";
    const language = languageEl?.value || lastParsed.metadata?.language || "english";
    const publishOnSave = Boolean(publishOnSaveEl?.checked);

    try {
      setStatus("Saving canonical note…");

      const result = await saveCanonicalNote({
        topicId: resolvedTopicId,
        title,
        language,
        status: publishOnSave ? "published" : "draft",
        parsed: lastParsed,
        rawMarkdown: lastParsed.source.raw_markdown,
      });

      if (statusEl) {
        statusEl.classList.remove("error");
        statusEl.innerHTML =
          `Saved note (${result.blockCount} blocks, ${result.topicLinkCount} topic links). ` +
          `<a href="note.html?id=${encodeURIComponent(result.note.id)}">Open reader</a>`;
      }
    } catch (err) {
      setStatus(err.message || "Save failed", true);
    }
  }

  return {
    parse: handleParse,
    save: handleSave,
  };
}
