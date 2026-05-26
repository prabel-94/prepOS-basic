/**
 * Semantic anchor constants (Phase 1 infrastructure).
 */

export const ANCHOR_TYPES = Object.freeze({
  MICRO: "micro",
  CANONICAL: "canonical",
});

export const ANCHOR_VARIANT_STATUSES = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});

export const ANCHOR_NOTE_STATUSES = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});

export const NOTE_ANCHOR_STATES = Object.freeze({
  CANDIDATE: "candidate",
  ACTIVE: "active",
  DORMANT: "dormant",
});

/** Resolution kinds returned by resolveAnchorCandidates */
export const ANCHOR_RESOLUTION_KINDS = Object.freeze({
  EXISTING: "existing",
  ALIAS: "alias",
  VARIANT: "variant",
  CANONICAL_TOPIC: "canonical",
  CANDIDATE: "candidate",
});
