/**
 * Draft semantic preview pipeline (parse → resolve → map → interact).
 */

import { getClient } from "../core/get-client.js";
import { parseMapMarkdown } from "../notes/map-parser.js";
import { normalizeLanguage } from "../notes/note-variants.js";
import { attachSemanticCandidates } from "./anchor-candidates.js";
import { lookupSemanticEntry } from "./anchor-renderer.js";
import { normalizeAnchorName } from "./anchor-normalization.js";
import { resolveAnchorCandidates } from "./anchor-resolver.js";
import {
  buildSemanticStateSummary,
  resolveSemanticVisualState,
} from "./anchor-summary.js";
import {
  enrichSemanticMapWithAnchorNotePresence,
  fetchNoteAnchorLinksForVariant,
} from "./anchor-selectors.js";
import { captureReadingContext } from "../notes/reading-ergonomics.js";
import {
  openAnchorInspector,
  openCandidateAnchorInspector,
  openDormantAnchorInspector,
} from "../ui/teacher-inspector.js";

/**
 * Merge global resolution with per-variant editorial state (highest priority).
 * @param {Array} candidates
 * @param {Array} noteAnchorLinks
 */
export function mergeCandidatesWithGovernedLinks(
  candidates = [],
  noteAnchorLinks = []
) {
  const byAnchorId = new Map();
  const bySource = new Map();

  for (const link of noteAnchorLinks) {
    byAnchorId.set(link.anchor_id, link);
    const key = normalizeAnchorName(link.source_text);
    if (key) {
      bySource.set(key, link);
    }
  }

  return candidates.map((candidate) => {
    const normalized = normalizeAnchorName(
      candidate.normalized_name ?? candidate.source_text
    );
    const link =
      (candidate.anchor_id ? byAnchorId.get(candidate.anchor_id) : null) ??
      bySource.get(normalized) ??
      null;

    if (!link) {
      return candidate;
    }

    const anchor = link.anchors ?? {};

    return {
      ...candidate,
      anchor_id: link.anchor_id ?? candidate.anchor_id,
      note_anchor_link_id: link.id,
      note_anchor_state: link.state,
      link_state: link.state,
      anchor_type: anchor.anchor_type ?? candidate.anchor_type,
      canonical_topic_id:
        anchor.canonical_topic_id ?? candidate.canonical_topic_id,
    };
  });
}

/**
 * Convert resolved candidates into a render lookup map.
 * @param {Array} candidates
 * @returns {Record<string, object>}
 */
export function buildSemanticMapFromCandidates(candidates = []) {
  const map = {};

  for (const candidate of candidates) {
    const entry = {
      state: resolveSemanticVisualState(candidate),
      anchor_state: candidate.note_anchor_state ?? candidate.state,
      note_anchor_state: candidate.note_anchor_state ?? null,
      note_anchor_link_id: candidate.note_anchor_link_id ?? null,
      resolution: candidate.resolution,
      anchor_id: candidate.anchor_id ?? null,
      anchor_variant_id: candidate.anchor_variant_id ?? null,
      canonical_topic_id: candidate.canonical_topic_id ?? null,
      anchor_type: candidate.anchor_type ?? null,
      display_name: candidate.display_name ?? candidate.source_text,
      source_text: candidate.source_text,
      normalized_name: candidate.normalized_name,
      block_key: candidate.block_key ?? null,
      section: candidate.section ?? null,
      block_index: candidate.block_index ?? null,
      raw: candidate.raw ?? null,
    };

    const keys = new Set(
      [
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
 * Full draft preview semantic context.
 *
 * @param {string} rawMarkdown
 * @param {{ language?: string, title?: string }} [options]
 */
export async function prepareDraftSemanticPreview(rawMarkdown, options = {}) {
  const markdown = String(rawMarkdown ?? "").trim();
  if (!markdown) {
    throw new Error("Semantic markdown is empty.");
  }

  const language = normalizeLanguage(options.language ?? "english");
  const parsed = attachSemanticCandidates(
    parseMapMarkdown(markdown, {
      language,
      title: options.title ?? null,
      sectionExtensions: options.sectionExtensions ?? [],
    })
  );

  const sb = await getClient();
  const resolvedCandidates = await resolveAnchorCandidates(parsed, { sb, language });

  let governedCandidates = resolvedCandidates;

  if (options.variantId) {
    const noteAnchorLinks = await fetchNoteAnchorLinksForVariant(
      sb,
      options.variantId
    );
    governedCandidates = mergeCandidatesWithGovernedLinks(
      resolvedCandidates,
      noteAnchorLinks
    );
  }

  let semanticMap = buildSemanticMapFromCandidates(governedCandidates);
  semanticMap = await enrichSemanticMapWithAnchorNotePresence(
    sb,
    semanticMap,
    language
  );
  const summary = buildSemanticStateSummary(governedCandidates);

  return {
    parsed,
    candidates: governedCandidates,
    resolvedCandidates: governedCandidates,
    semanticMap,
    summary,
    language,
  };
}

/**
 * Build renderOptions for draft semantic preview mode.
 */
export function buildSemanticPreviewRenderOptions(semanticMap, { preferLanguage } = {}) {
  return {
    preferLanguage: preferLanguage ?? "english",
    semanticPreview: true,
    semanticMap,
    semanticInteractive: true,
    highlightEmptyAnchorNotes: true,
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
    state: el.dataset.anchorState ?? fromMap?.state ?? "existing",
    normalized_name:
      el.dataset.normalizedName ??
      fromMap?.normalized_name ??
      normalizeAnchorName(sourceText),
  };
}

/**
 * Bind preview-only semantic anchor interactions (click + keyboard).
 *
 * @param {HTMLElement} container
 * @param {{ semanticMap?: Record<string, object>, preferLanguage?: string }} context
 */
export function bindSemanticPreviewInteractions(container, context = {}) {
  if (!container) {
    return;
  }

  const semanticMap = context.semanticMap ?? {};
  const preferLanguage = context.preferLanguage ?? "english";

  if (container._semanticPreviewClickHandler) {
    container.removeEventListener("click", container._semanticPreviewClickHandler);
    container.removeEventListener("keydown", container._semanticPreviewKeyHandler);
  }

  const onActivate = (el) => {
    if (!el?.classList?.contains("semantic-anchor")) {
      return;
    }

    captureReadingContext(el);

    const entry = semanticEntryFromElement(el, semanticMap);

    if (el.classList.contains("dormant-anchor") || entry.state === "dormant") {
      openDormantAnchorInspector(entry, {
        preferLanguage,
        governanceContext: context.governanceContext,
      });
      return;
    }

    if (el.classList.contains("candidate-anchor") || entry.state === "candidate") {
      openCandidateAnchorInspector(entry, {
        preferLanguage,
        governanceContext: context.governanceContext,
      });
      return;
    }

    openAnchorInspector(entry, {
      preferLanguage,
      governanceContext: context.governanceContext,
    });
  };

  container._semanticPreviewClickHandler = (event) => {
    const anchor = event.target.closest(".semantic-anchor");
    if (!anchor || !container.contains(anchor)) {
      return;
    }

    if (anchor.classList.contains("structural-toggle")) {
      return;
    }

    event.preventDefault();
    onActivate(anchor);
  };

  container._semanticPreviewKeyHandler = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const anchor = event.target.closest(".semantic-anchor");
    if (!anchor || !container.contains(anchor)) {
      return;
    }

    if (anchor.classList.contains("dormant-anchor")) {
      return;
    }

    event.preventDefault();
    onActivate(anchor);
  };

  container.addEventListener("click", container._semanticPreviewClickHandler);
  container.addEventListener("keydown", container._semanticPreviewKeyHandler);
  container.dataset.semanticPreviewBound = "true";
}
