/**
 * Published student semantic reading (cognition layer — no governance).
 */

import { getClient } from "../core/get-client.js";
import { normalizeLanguage } from "../notes/note-variants.js";
import { lookupSemanticEntry } from "./anchor-renderer.js";
import { normalizeAnchorName } from "./anchor-normalization.js";
import { fetchNoteAnchorLinksForVariant } from "./anchor-selectors.js";
import { resolveSemanticVisualState } from "./anchor-summary.js";
import { NOTE_ANCHOR_STATES } from "./anchor-types.js";

const STUDENT_INTERACTIVE_VISUAL_STATES = new Set(["existing", "canonical"]);

/**
 * @param {Array} candidates
 * @returns {Array}
 */
export function filterCandidatesForStudent(candidates = []) {
  return candidates.filter((candidate) => {
    const visual = resolveSemanticVisualState(candidate);
    return STUDENT_INTERACTIVE_VISUAL_STATES.has(visual);
  });
}

/**
 * Convert governed / resolved candidates into a student-safe render map.
 * Strips governance metadata; collapses canonical + existing to one interactive style.
 *
 * @param {Array} candidates
 * @returns {Record<string, object>}
 */
export function buildStudentSemanticMap(candidates = []) {
  const map = {};

  for (const candidate of filterCandidatesForStudent(candidates)) {
    const entry = {
      anchor_id: candidate.anchor_id ?? null,
      display_name: candidate.display_name ?? candidate.source_text,
      source_text: candidate.source_text,
      normalized_name:
        candidate.normalized_name ?? normalizeAnchorName(candidate.source_text),
      canonical_topic_id: candidate.canonical_topic_id ?? null,
      state: "existing",
    };

    const keys = new Set(
      [
        candidate.source_text,
        candidate.normalized_name,
        normalizeAnchorName(candidate.source_text),
        normalizeAnchorName(candidate.display_name),
      ].filter(Boolean)
    );

    for (const key of keys) {
      if (!map[key]) {
        map[key] = entry;
      }
    }
  }

  return map;
}

/**
 * @param {Array} noteAnchorLinks
 * @returns {Array}
 */
export function noteAnchorLinksToCandidates(noteAnchorLinks = []) {
  return noteAnchorLinks
    .filter((link) => link.state === NOTE_ANCHOR_STATES.ACTIVE)
    .map((link) => {
      const anchor = link.anchors ?? {};

      return {
        source_text: link.source_text,
        normalized_name: normalizeAnchorName(link.source_text),
        anchor_id: link.anchor_id,
        anchor_type: anchor.anchor_type,
        canonical_topic_id: anchor.canonical_topic_id,
        note_anchor_state: link.state,
        link_state: link.state,
        display_name: link.source_text,
      };
    });
}

/**
 * Batched published semantic map (one note_anchor_links fetch per variant).
 *
 * @param {string} variantId
 * @param {string} [language]
 */
export async function preparePublishedStudentSemanticMap(
  variantId,
  language = "english"
) {
  if (!variantId) {
    return {};
  }

  const sb = await getClient();
  const lang = normalizeLanguage(language);
  const links = await fetchNoteAnchorLinksForVariant(sb, variantId);
  const candidates = noteAnchorLinksToCandidates(links);

  return buildStudentSemanticMap(candidates);
}

/**
 * Render options for published student note reading.
 */
export function buildStudentSemanticRenderOptions(semanticMap, { preferLanguage } = {}) {
  return {
    preferLanguage: preferLanguage ?? "english",
    studentSemanticMode: true,
    semanticPreview: true,
    semanticMap,
    semanticInteractive: true,
    studentMode: true,
  };
}

function semanticEntryFromElement(el, semanticMap) {
  const sourceText = el.dataset.sourceText ?? el.textContent?.trim() ?? "";
  const fromMap =
    lookupSemanticEntry(semanticMap, sourceText) ||
    lookupSemanticEntry(semanticMap, el.dataset.normalizedName ?? "");

  return {
    ...(fromMap ?? {}),
    source_text: sourceText,
    display_name: fromMap?.display_name ?? sourceText,
    anchor_id: el.dataset.anchorId ?? fromMap?.anchor_id ?? null,
    canonical_topic_id:
      el.dataset.canonicalTopicId ?? fromMap?.canonical_topic_id ?? null,
    normalized_name:
      el.dataset.normalizedName ??
      fromMap?.normalized_name ??
      normalizeAnchorName(sourceText),
    state: "existing",
  };
}

/**
 * Bind published student semantic anchor clicks → read-only anchor inspector.
 *
 * @param {HTMLElement} container
 * @param {{ semanticMap?: Record<string, object>, preferLanguage?: string }} context
 */
export function bindStudentSemanticReading(container, context = {}) {
  if (!container) {
    return;
  }

  const semanticMap = context.semanticMap ?? {};
  const preferLanguage = context.preferLanguage ?? "english";
  const inspectorOptions = {
    preferLanguage,
    studentMode: true,
    canEditAnchorNote: false,
    studentSemanticMap: semanticMap,
  };

  if (container._studentSemanticClickHandler) {
    container.removeEventListener("click", container._studentSemanticClickHandler);
    container.removeEventListener("keydown", container._studentSemanticKeyHandler);
  }

  const onActivate = (el) => {
    if (!el?.classList?.contains("semantic-anchor")) {
      return;
    }

    if (!el.classList.contains("existing-anchor")) {
      return;
    }

    const entry = semanticEntryFromElement(el, semanticMap);
    if (!entry.anchor_id) {
      return;
    }

    import("../ui/teacher-inspector.js").then(({ openAnchorInspector }) => {
      openAnchorInspector(entry, inspectorOptions);
    });
  };

  container._studentSemanticClickHandler = (event) => {
    const anchor = event.target.closest(".semantic-anchor.existing-anchor");
    if (!anchor || !container.contains(anchor)) {
      return;
    }

    event.preventDefault();
    onActivate(anchor);
  };

  container._studentSemanticKeyHandler = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const anchor = event.target.closest(".semantic-anchor.existing-anchor");
    if (!anchor || !container.contains(anchor)) {
      return;
    }

    event.preventDefault();
    onActivate(anchor);
  };

  container.addEventListener("click", container._studentSemanticClickHandler);
  container.addEventListener("keydown", container._studentSemanticKeyHandler);
  container.dataset.studentSemanticBound = "true";
}
