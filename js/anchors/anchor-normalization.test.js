/**
 * Anchor normalization regression tests.
 * Run: node --test js/anchors/anchor-normalization.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  foldAnchorApostrophes,
  normalizeAnchorName,
} from "./anchor-normalization.js";

describe("foldAnchorApostrophes", () => {
  it("folds curly apostrophe to ASCII apostrophe", () => {
    assert.equal(foldAnchorApostrophes("Bishops’ Wars"), "Bishops' Wars");
    assert.equal(foldAnchorApostrophes("Eleven Years’ Tyranny"), "Eleven Years' Tyranny");
  });

  it("leaves ASCII apostrophe unchanged", () => {
    assert.equal(foldAnchorApostrophes("Pride's Purge"), "Pride's Purge");
  });
});

describe("normalizeAnchorName", () => {
  it("treats apostrophe variants as equivalent", () => {
    assert.equal(
      normalizeAnchorName("Bishops’ Wars"),
      normalizeAnchorName("Bishops' Wars")
    );
    assert.equal(
      normalizeAnchorName("Eleven Years’ Tyranny"),
      normalizeAnchorName("Eleven Years' Tyranny")
    );
    assert.equal(
      normalizeAnchorName("Pride’s Purge"),
      normalizeAnchorName("Pride's Purge")
    );
  });

  it("still trims, lowercases, and collapses whitespace", () => {
    assert.equal(normalizeAnchorName("  Pride’s   Purge  "), "pride's purge");
  });
});
