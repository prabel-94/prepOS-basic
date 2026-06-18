/**
 * Language variant publish workflow (replaces prior published variant in same language).
 */

import { getClient } from "../core/get-client.js";
import { regenerateVariantFromMarkdown } from "./note-storage.js";
import { ARCHIVE_RETENTION_DAYS } from "./note-variants.js";
import {
  buildSemanticPublishReview,
  openSemanticPublishReview,
  openSemanticPublishReviewForDraft,
} from "../anchors/anchor-publish-review.js";
import { prepareDraftSemanticPreview } from "../anchors/anchor-preview.js";

const PUBLISH_CONFIRM_MESSAGE =
  `Publish this language variant?\n\nThe previous published version in this language will be archived for ${ARCHIVE_RETENTION_DAYS} days, then removed automatically. Students will see this version.`;

function archiveScheduledAt() {
  const at = new Date();
  at.setDate(at.getDate() + ARCHIVE_RETENTION_DAYS);
  return at.toISOString();
}

/**
 * Archive other published variants in the same language stream (client-side; DB trigger also enforces).
 */
async function archivePublishedSiblings(sb, { noteId, language, excludeVariantId }) {
  const { error } = await sb
    .from("note_variants")
    .update({
      status: "archived",
      scheduled_delete_at: archiveScheduledAt(),
    })
    .eq("note_id", noteId)
    .eq("language", language)
    .eq("status", "published")
    .neq("id", excludeVariantId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Publish a language variant; archives any prior published variant in the same language.
 * @param {string} variantId
 * @param {{ rawMarkdown?: string, title?: string, language?: string }} [options]
 */
export async function publishCanonicalVariant(variantId, options = {}) {
  if (!variantId) {
    throw new Error("variantId is required");
  }

  if (options.rawMarkdown?.trim()) {
    await regenerateVariantFromMarkdown({
      variantId,
      rawMarkdown: options.rawMarkdown,
      title: options.title,
      language: options.language,
      status: "draft",
      sectionExtensions: options.sectionExtensions,
    });
  }

  const sb = await getClient();

  const { data: variant, error: fetchError } = await sb
    .from("note_variants")
    .select("id, status, language, note_id")
    .eq("id", variantId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (variant.status === "published") {
    return variant;
  }

  if (variant.status === "archived") {
    throw new Error(
      "Archived variants cannot be published. Create a new draft revision."
    );
  }

  await archivePublishedSiblings(sb, {
    noteId: variant.note_id,
    language: variant.language,
    excludeVariantId: variantId,
  });

  const { data, error } = await sb
    .from("note_variants")
    .update({
      status: "published",
      scheduled_delete_at: null,
    })
    .eq("id", variantId)
    .select("id, status, language, note_id, scheduled_delete_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/** @deprecated Use publishCanonicalVariant */
export async function publishCanonicalNote(variantId, options = {}) {
  return publishCanonicalVariant(variantId, options);
}

export function confirmPublish() {
  return window.confirm(PUBLISH_CONFIRM_MESSAGE);
}

/**
 * Build advisory semantic publish review from draft markdown (no blocking).
 */
export async function buildPublishReviewFromDraft({
  variant,
  rawMarkdown,
  title,
  language,
} = {}) {
  const preview = await prepareDraftSemanticPreview(rawMarkdown, {
    language,
    title,
    variantId: variant?.id,
  });

  return buildSemanticPublishReview({
    resolvedCandidates: preview.resolvedCandidates,
    summary: preview.summary,
    variant,
    semanticMap: preview.semanticMap,
  });
}

/**
 * Publish flow: semantic review modal → teacher confirms → publish.
 * Publishing is never blocked by semantic state.
 */
export async function beginSemanticPublishReview({
  variant,
  rawMarkdown,
  title,
  language,
  sectionExtensions,
  onReturn,
  onPublish,
} = {}) {
  return openSemanticPublishReviewForDraft({
    variant,
    rawMarkdown,
    title,
    language,
    sectionExtensions,
    onReturn,
    onPublish,
  });
}

export {
  buildSemanticPublishReview,
  openSemanticPublishReview,
  openSemanticPublishReviewForDraft,
};
