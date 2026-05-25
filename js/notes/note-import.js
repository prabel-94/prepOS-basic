/**
 * MAP import-review workflow (paste → parse → save variant).
 * Variant-aware: draft revisions, language streams, publish replaces prior published.
 */

import { parseMapMarkdown, summarizeDetectedSections } from "./map-parser.js";
import {
  saveNoteVariant,
  getCanonicalNoteByTopicId,
  createDraftRevisionFromPublished,
} from "./note-storage.js";
import { getTopicIdFromUrl } from "./note-import-params.js";
import { resolveAppPath } from "../core/access.js";
import {
  getLanguageLabel,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from "./note-variants.js";
import { fetchVariantsForNote } from "./note-selectors.js";

const SECTION_LABELS = Object.freeze({
  metadata: "Metadata",
  narrative: "Narrative",
  structural: "Structural",
  revision: "Revision",
  timeline: "Timeline",
  interpretations: "Interpretations",
  recall: "Recall",
});

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Summarize active variants per language (excludes archived).
 */
export function summarizeVariantStreams(variants = []) {
  const streams = {};

  for (const variant of variants) {
    const lang = normalizeLanguage(variant.language);
    if (!streams[lang]) {
      streams[lang] = { published: null, draft: null };
    }

    if (variant.status === "published" && !streams[lang].published) {
      streams[lang].published = variant;
    } else if (variant.status === "draft" && !streams[lang].draft) {
      streams[lang].draft = variant;
    }
  }

  return streams;
}

export function initNoteImportPage({
  markdownEl,
  sectionsEl,
  topicLinksEl,
  variantsEl,
  variantActionsEl,
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

  async function renderExistingVariants() {
    if (!variantsEl || !topicId) {
      return;
    }

    const canonical = await getCanonicalNoteByTopicId(topicId);

    if (!canonical?.id) {
      variantsEl.innerHTML =
        '<li class="detected-item detected-miss">No canonical note for this topic yet — first import creates it.</li>';
      if (variantActionsEl) {
        variantActionsEl.innerHTML = "";
      }
      return;
    }

    const variants = await fetchVariantsForNote(canonical.id);
    const streams = summarizeVariantStreams(variants);

    if (!variants.length) {
      variantsEl.innerHTML =
        '<li class="detected-item detected-miss">Canonical note exists with no language variants yet.</li>';
    } else {
      const lines = [];

      for (const lang of SUPPORTED_LANGUAGES) {
        const stream = streams[lang];
        if (!stream?.published && !stream?.draft) {
          continue;
        }

        const label = getLanguageLabel(lang);
        const parts = [];
        if (stream.published) {
          parts.push("Published");
        }
        if (stream.draft) {
          parts.push("Draft");
        }

        const mark = stream.published ? "✓" : "○";
        lines.push(
          `<li class="detected-item detected-ok">${mark} ${escapeHTML(label)} (${escapeHTML(parts.join(" · "))})</li>`
        );
      }

      const otherLangs = Object.keys(streams).filter(
        (lang) => !SUPPORTED_LANGUAGES.includes(lang)
      );
      for (const lang of otherLangs) {
        const stream = streams[lang];
        const label = getLanguageLabel(lang);
        const parts = [];
        if (stream?.published) {
          parts.push("Published");
        }
        if (stream?.draft) {
          parts.push("Draft");
        }
        if (parts.length) {
          lines.push(
            `<li class="detected-item detected-ok">○ ${escapeHTML(label)} (${escapeHTML(parts.join(" · "))})</li>`
          );
        }
      }

      variantsEl.innerHTML =
        lines.join("") ||
        '<li class="detected-item detected-miss">No active language variants.</li>';
    }

    renderVariantActions(canonical.id, streams);
  }

  function renderVariantActions(noteId, streams) {
    if (!variantActionsEl) {
      return;
    }

    const buttons = [];

    for (const lang of SUPPORTED_LANGUAGES) {
      const stream = streams[lang];
      const label = getLanguageLabel(lang);

      if (stream?.published) {
        buttons.push(
          `<button type="button" class="secondary-btn" data-action="draft-revision" data-language="${escapeHTML(lang)}">Create ${escapeHTML(label)} Draft Revision</button>`
        );
      }
    }

    const missingLangs = SUPPORTED_LANGUAGES.filter((lang) => !streams[lang]);
    const focusLang = missingLangs[0] ?? SUPPORTED_LANGUAGES[0];

    buttons.push(
      `<button type="button" class="secondary-btn" data-action="focus-import" data-language="${escapeHTML(focusLang)}">Import New Language Variant</button>`
    );

    variantActionsEl.innerHTML = `
      <div class="variant-action-buttons">${buttons.join("")}</div>
      <p class="text-muted variant-action-hint">Publishing replaces the prior published variant in the same language (archived 14 days). Other languages are unaffected.</p>
    `;

    variantActionsEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleVariantAction(btn.dataset.action, btn.dataset.language, noteId)
      );
    });
  }

  async function handleVariantAction(action, language, noteId) {
    if (action === "focus-import") {
      if (language && languageEl) {
        languageEl.value = language;
      }
      markdownEl?.focus();
      setStatus("Paste semantic markdown for the new language variant, then Save.");
      return;
    }

    if (action === "draft-revision") {
      try {
        setStatus(`Creating ${getLanguageLabel(language)} draft revision…`);

        const result = await createDraftRevisionFromPublished({
          noteId,
          language,
          title: titleEl?.value?.trim(),
        });

        window.location.href = resolveAppPath(
          `note.html?variant=${encodeURIComponent(result.variant.id)}&mode=draft`
        );
      } catch (err) {
        setStatus(err.message || "Could not create draft revision.", true);
      }
    }
  }

  function renderSectionsSummary(parsed) {
    const detected = summarizeDetectedSections(parsed);
    const items = Object.entries(SECTION_LABELS)
      .filter(([key]) => detected[key])
      .map(([, label]) => `<li class="detected-item detected-ok">✓ ${label}</li>`);

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
      .map((link) => `<li class="detected-item detected-ok">✓ ${link.name}</li>`)
      .join("");
  }

  async function handleParse() {
    const raw = markdownEl?.value?.trim() ?? "";

    if (!raw) {
      setStatus("Paste semantic markdown first.", true);
      return;
    }

    const language = normalizeLanguage(languageEl?.value);
    lastParsed = parseMapMarkdown(raw, {
      language,
      title: titleEl?.value?.trim(),
    });
    renderSectionsSummary(lastParsed);
    renderTopicLinks(lastParsed);
    setStatus("Parsed. Review sections and topic links, then save.");
  }

  async function handleSave() {
    const resolvedTopicId =
      getTopicIdFromUrl() || topicIdInput?.value?.trim() || topicId;

    if (!resolvedTopicId) {
      setStatus(
        "No topic attached. Use Question Bank → Import canonical note.",
        true
      );
      return;
    }

    if (!lastParsed) {
      lastParsed = parseMapMarkdown(markdownEl?.value ?? "", {
        language: languageEl?.value,
        title: titleEl?.value?.trim(),
      });
    }

    const title =
      titleEl?.value?.trim() ||
      lastParsed.variant?.title ||
      lastParsed.metadata?.title ||
      "Untitled Note";
    const language = normalizeLanguage(
      languageEl?.value || lastParsed.variant?.language || "english"
    );
    const publishOnSave = Boolean(publishOnSaveEl?.checked);

    try {
      setStatus(
        publishOnSave
          ? "Saving and publishing language variant…"
          : "Saving language variant draft…"
      );

      const result = await saveNoteVariant({
        topicId: resolvedTopicId,
        title,
        language,
        status: publishOnSave ? "published" : "draft",
        parsed: lastParsed,
        rawMarkdown: lastParsed.source.raw_markdown,
      });

      const variantId = result.variant.id;
      const readerPath = publishOnSave
        ? `note.html?variant=${encodeURIComponent(variantId)}`
        : `note.html?variant=${encodeURIComponent(variantId)}&mode=draft`;

      window.location.href = resolveAppPath(readerPath);
    } catch (err) {
      setStatus(err.message || "Save failed", true);
    }
  }

  renderExistingVariants();

  return {
    parse: handleParse,
    save: handleSave,
    refreshVariants: renderExistingVariants,
  };
}
