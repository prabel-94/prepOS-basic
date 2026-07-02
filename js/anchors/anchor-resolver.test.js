/**
 * Anchor resolution edge-case regression tests.
 * Run: node --test js/anchors/anchor-resolver.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDeclarationAgainstIndexes,
  resolveNoteAnchorLinkState,
  isGloballyRecognizedAnchor,
} from "./anchor-resolver.js";
import {
  ANCHOR_RESOLUTION_KINDS,
  ANCHOR_TYPES,
  NOTE_ANCHOR_STATES,
} from "./anchor-types.js";

function buildIndexes(overrides = {}) {
  return {
    language: "english",
    anchorsByName: new Map(),
    variantsByName: new Map(),
    variantsAnyLanguageByName: new Map(),
    aliasesByName: new Map(),
    topicsByName: new Map(),
    anchorsByTopicId: new Map(),
    ...overrides,
  };
}

describe("resolveDeclarationAgainstIndexes", () => {
  it("matches an existing anchor by normalized name", () => {
    const indexes = buildIndexes({
      anchorsByName: new Map([
        [
          "prides purge",
          {
            id: "anchor-1",
            normalized_name: "prides purge",
            anchor_type: ANCHOR_TYPES.MICRO,
            canonical_topic_id: null,
          },
        ],
      ]),
    });

    const resolved = resolveDeclarationAgainstIndexes(
      { name: "Prides Purge", section: "narrative", block_index: 0 },
      indexes
    );

    assert.equal(resolved.resolution, ANCHOR_RESOLUTION_KINDS.EXISTING);
    assert.equal(resolved.anchor_id, "anchor-1");
    assert.equal(resolved.state, NOTE_ANCHOR_STATES.ACTIVE);
  });

  it("matches canonical anchors through topic id even when anchor name differs", () => {
    const indexes = buildIndexes({
      topicsByName: new Map([
        [
          "prides purge",
          { id: "topic-1", name: "Prides Purge", normalized_name: "prides purge" },
        ],
      ]),
      anchorsByTopicId: new Map([
        [
          "topic-1",
          {
            id: "anchor-canonical",
            normalized_name: "pride's purge",
            anchor_type: ANCHOR_TYPES.CANONICAL,
            canonical_topic_id: "topic-1",
          },
        ],
      ]),
    });

    const resolved = resolveDeclarationAgainstIndexes(
      { name: "Prides Purge", section: "narrative", block_index: 0 },
      indexes
    );

    assert.equal(resolved.resolution, ANCHOR_RESOLUTION_KINDS.CANONICAL);
    assert.equal(resolved.anchor_id, "anchor-canonical");
    assert.equal(resolved.state, NOTE_ANCHOR_STATES.ACTIVE);
    assert.equal(resolved.canonical_topic_id, "topic-1");
  });

  it("marks topic-only matches as candidate when no canonical anchor exists", () => {
    const indexes = buildIndexes({
      topicsByName: new Map([
        [
          "prides purge",
          { id: "topic-1", name: "Prides Purge", normalized_name: "prides purge" },
        ],
      ]),
    });

    const resolved = resolveDeclarationAgainstIndexes(
      { name: "Prides Purge", section: "narrative", block_index: 0 },
      indexes
    );

    assert.equal(resolved.resolution, ANCHOR_RESOLUTION_KINDS.CANONICAL);
    assert.equal(resolved.anchor_id, null);
    assert.equal(resolved.state, NOTE_ANCHOR_STATES.CANDIDATE);
    assert.equal(resolved.canonical_topic_id, "topic-1");
  });

  it("falls back to variants from any language when current language misses", () => {
    const indexes = buildIndexes({
      variantsByName: new Map(),
      variantsAnyLanguageByName: new Map([
        [
          "prides purge",
          {
            id: "variant-ml",
            anchor_id: "anchor-1",
            display_name: "Prides Purge",
            normalized_name: "prides purge",
            anchors: {
              id: "anchor-1",
              anchor_type: ANCHOR_TYPES.MICRO,
              canonical_topic_id: null,
            },
          },
        ],
      ]),
    });

    const resolved = resolveDeclarationAgainstIndexes(
      { name: "Prides Purge", section: "narrative", block_index: 0 },
      indexes
    );

    assert.equal(resolved.resolution, ANCHOR_RESOLUTION_KINDS.VARIANT);
    assert.equal(resolved.anchor_id, "anchor-1");
    assert.equal(resolved.state, NOTE_ANCHOR_STATES.ACTIVE);
  });

  it("matches an existing anchor when declaration uses a curly apostrophe", () => {
    const indexes = buildIndexes({
      anchorsByName: new Map([
        [
          "bishops' wars",
          {
            id: "anchor-bishops",
            normalized_name: "bishops' wars",
            anchor_type: ANCHOR_TYPES.MICRO,
            canonical_topic_id: null,
          },
        ],
      ]),
    });

    const resolved = resolveDeclarationAgainstIndexes(
      { name: "Bishops’ Wars", section: "narrative", block_index: 0 },
      indexes
    );

    assert.equal(resolved.resolution, ANCHOR_RESOLUTION_KINDS.EXISTING);
    assert.equal(resolved.anchor_id, "anchor-bishops");
  });

  it("returns candidate when nothing matches", () => {
    const resolved = resolveDeclarationAgainstIndexes(
      { name: "Unknown Entity", section: "narrative", block_index: 0 },
      buildIndexes()
    );

    assert.equal(resolved.resolution, ANCHOR_RESOLUTION_KINDS.CANDIDATE);
    assert.equal(resolved.anchor_id, null);
    assert.equal(resolved.state, NOTE_ANCHOR_STATES.CANDIDATE);
  });
});

describe("resolveNoteAnchorLinkState", () => {
  it("promotes stale candidate links when the anchor is globally recognized", () => {
    const state = resolveNoteAnchorLinkState({
      candidate: {
        anchor_id: "anchor-1",
        resolution: ANCHOR_RESOLUTION_KINDS.EXISTING,
        state: NOTE_ANCHOR_STATES.ACTIVE,
      },
      preservedState: NOTE_ANCHOR_STATES.CANDIDATE,
      anchorPreexisted: true,
    });

    assert.equal(state, NOTE_ANCHOR_STATES.ACTIVE);
  });

  it("preserves dormant editorial state", () => {
    const state = resolveNoteAnchorLinkState({
      candidate: {
        anchor_id: "anchor-1",
        resolution: ANCHOR_RESOLUTION_KINDS.EXISTING,
        state: NOTE_ANCHOR_STATES.ACTIVE,
      },
      preservedState: NOTE_ANCHOR_STATES.DORMANT,
      anchorPreexisted: true,
    });

    assert.equal(state, NOTE_ANCHOR_STATES.DORMANT);
  });

  it("keeps unresolved declarations as candidate", () => {
    const state = resolveNoteAnchorLinkState({
      candidate: {
        anchor_id: null,
        resolution: ANCHOR_RESOLUTION_KINDS.CANDIDATE,
        state: NOTE_ANCHOR_STATES.CANDIDATE,
      },
      preservedState: null,
      anchorPreexisted: false,
    });

    assert.equal(state, NOTE_ANCHOR_STATES.CANDIDATE);
  });
});

describe("isGloballyRecognizedAnchor", () => {
  it("treats pre-existing anchor ids as recognized", () => {
    assert.equal(isGloballyRecognizedAnchor({}, true), true);
  });

  it("does not treat topic-only canonical matches as recognized", () => {
    assert.equal(
      isGloballyRecognizedAnchor({
        anchor_id: null,
        resolution: ANCHOR_RESOLUTION_KINDS.CANONICAL,
        state: NOTE_ANCHOR_STATES.CANDIDATE,
        canonical_topic_id: "topic-1",
      }),
      false
    );
  });
});
