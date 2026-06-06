/**
 * Highlighted quote detection for [QUOTES] representation.
 * Run: node --test js/notes/quote-highlight.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHighlightedQuoteText,
  stripHighlightedQuoteLines,
} from "./quote-highlight.js";

describe("quote-highlight", () => {
  it("detects single-line > prefix", () => {
    assert.equal(isHighlightedQuoteText('> "Democracy is..."'), true);
    assert.deepEqual(stripHighlightedQuoteLines('> "Democracy is..."'), [
      '"Democracy is..."',
    ]);
  });

  it("detects multi-line > prefix blocks", () => {
    const text = '> Line one\n> Line two';
    assert.equal(isHighlightedQuoteText(text), true);
    assert.deepEqual(stripHighlightedQuoteLines(text), ["Line one", "Line two"]);
  });

  it("rejects non-prefixed or mixed lines", () => {
    assert.equal(isHighlightedQuoteText('"Plain quote"'), false);
    assert.equal(isHighlightedQuoteText('> Highlighted\nPlain line'), false);
    assert.equal(stripHighlightedQuoteLines('"Plain quote"'), null);
  });
});
