/**
 * Semantic editorial authority — preview-scoped governance mutations.
 */

import { getClient } from "../core/get-client.js";
import { normalizeLanguage } from "../notes/note-variants.js";
import { normalizeAnchorName } from "./anchor-normalization.js";
import { ANCHOR_TYPES, NOTE_ANCHOR_STATES } from "./anchor-types.js";
import {
  createAnchorVariant,
  ensureAnchorForCandidate,
} from "./anchor-storage.js";
import {
  fetchAnchorVariantForLanguage,
  fetchNoteAnchorLink,
  updateNoteAnchorLinkState,
} from "./anchor-selectors.js";

async function resolveAnchorId(sb, { anchorId, sourceText, userId }) {
  if (anchorId) {
    return anchorId;
  }

  const anchor = await ensureAnchorForCandidate(sb, {
    displayName: sourceText,
    createdBy: userId,
  });

  return anchor.id;
}

async function resolveNoteAnchorLink(
  sb,
  { variantId, anchorId, noteAnchorLinkId, sourceText, initialState = NOTE_ANCHOR_STATES.CANDIDATE }
) {
  if (noteAnchorLinkId) {
    const link = await fetchNoteAnchorLink(sb, noteAnchorLinkId);
    if (link) {
      return link;
    }
  }

  if (!variantId || !anchorId) {
    throw new Error("variantId and anchorId are required.");
  }

  const { data, error } = await sb
    .from("note_anchor_links")
    .select("id, variant_id, anchor_id, state, source_text")
    .eq("variant_id", variantId)
    .eq("anchor_id", anchorId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.id) {
    return data;
  }

  const { data: created, error: insertError } = await sb
    .from("note_anchor_links")
    .insert({
      variant_id: variantId,
      anchor_id: anchorId,
      state: initialState,
      source_text: sourceText ?? "Anchor",
      block_key: null,
    })
    .select("id, variant_id, anchor_id, state, source_text")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return created;
}

/**
 * Approve candidate → active; ensure language variant exists.
 */
export async function approveCandidateAnchor(
  sb,
  { variantId, anchorId, sourceText, language = "english", displayName, userId = null }
) {
  const resolvedAnchorId = await resolveAnchorId(sb, { anchorId, sourceText, userId });
  const lang = normalizeLanguage(language);
  const label = displayName ?? sourceText ?? "Anchor";

  const existingVariant = await fetchAnchorVariantForLanguage(sb, resolvedAnchorId, lang);

  if (!existingVariant?.id) {
    await createAnchorVariant(sb, {
      anchorId: resolvedAnchorId,
      language: lang,
      displayName: label,
    });
  }

  const link = await resolveNoteAnchorLink(sb, {
    variantId,
    anchorId: resolvedAnchorId,
    sourceText,
    initialState: NOTE_ANCHOR_STATES.CANDIDATE,
  });

  return updateNoteAnchorLinkState(sb, link.id, NOTE_ANCHOR_STATES.ACTIVE);
}

/**
 * Dismiss candidate → dormant (preserves global anchor identity).
 */
export async function dismissCandidateAnchor(
  sb,
  { variantId, anchorId, sourceText, userId = null, noteAnchorLinkId }
) {
  const resolvedAnchorId = await resolveAnchorId(sb, { anchorId, sourceText, userId });

  const link = await resolveNoteAnchorLink(sb, {
    variantId,
    anchorId: resolvedAnchorId,
    noteAnchorLinkId,
    sourceText,
    initialState: NOTE_ANCHOR_STATES.CANDIDATE,
  });

  return updateNoteAnchorLinkState(sb, link.id, NOTE_ANCHOR_STATES.DORMANT);
}

/**
 * De-anchor active → dormant for this note variant.
 */
export async function deactivateAnchor(
  sb,
  { variantId, anchorId, noteAnchorLinkId, sourceText }
) {
  const link = await resolveNoteAnchorLink(sb, {
    variantId,
    anchorId,
    noteAnchorLinkId,
    sourceText,
    initialState: NOTE_ANCHOR_STATES.ACTIVE,
  });

  return updateNoteAnchorLinkState(sb, link.id, NOTE_ANCHOR_STATES.DORMANT);
}

/**
 * Re-anchor dormant → active for this note variant.
 */
export async function reactivateAnchor(
  sb,
  {
    variantId,
    anchorId,
    language = "english",
    displayName,
    noteAnchorLinkId,
    sourceText,
  }
) {
  const link = await resolveNoteAnchorLink(sb, {
    variantId,
    anchorId,
    noteAnchorLinkId,
    sourceText,
    initialState: NOTE_ANCHOR_STATES.DORMANT,
  });

  const lang = normalizeLanguage(language);
  const existingVariant = await fetchAnchorVariantForLanguage(sb, anchorId, lang);

  if (!existingVariant?.id && displayName) {
    await createAnchorVariant(sb, {
      anchorId,
      language: lang,
      displayName,
    });
  }

  return updateNoteAnchorLinkState(sb, link.id, NOTE_ANCHOR_STATES.ACTIVE);
}

/**
 * Promote micro anchor to canonical with existing topic (no auto-create).
 */
export async function promoteAnchorToCanonical(
  sb,
  { anchorId, canonicalTopicId }
) {
  if (!anchorId) {
    throw new Error("anchorId is required.");
  }

  if (!canonicalTopicId) {
    throw new Error("canonicalTopicId is required.");
  }

  const { data: topic, error: topicError } = await sb
    .from("topics")
    .select("id, name")
    .eq("id", canonicalTopicId)
    .maybeSingle();

  if (topicError) {
    throw new Error(topicError.message);
  }

  if (!topic?.id) {
    throw new Error("Selected topic does not exist.");
  }

  const { data, error } = await sb
    .from("anchors")
    .update({
      anchor_type: ANCHOR_TYPES.CANONICAL,
      canonical_topic_id: canonicalTopicId,
    })
    .eq("id", anchorId)
    .select("id, normalized_name, anchor_type, canonical_topic_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export const GOVERNANCE_ACTIONS = Object.freeze({
  APPROVE: "approve",
  DISMISS: "dismiss",
  DEACTIVATE: "deactivate",
  REACTIVATE: "reactivate",
  PROMOTE: "promote",
});

/**
 * Dispatch governance action (used by inspector / draft bridge).
 */
export async function runSemanticGovernanceAction(action, params = {}) {
  const sb = params.sb ?? (await getClient());

  switch (action) {
    case GOVERNANCE_ACTIONS.APPROVE:
      return approveCandidateAnchor(sb, params);
    case GOVERNANCE_ACTIONS.DISMISS:
      return dismissCandidateAnchor(sb, params);
    case GOVERNANCE_ACTIONS.DEACTIVATE:
      return deactivateAnchor(sb, params);
    case GOVERNANCE_ACTIONS.REACTIVATE:
      return reactivateAnchor(sb, params);
    case GOVERNANCE_ACTIONS.PROMOTE:
      return promoteAnchorToCanonical(sb, params);
    default:
      throw new Error(`Unknown governance action: ${action}`);
  }
}
