/**
 * Run: node --test js/notes/note-source-patch.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEditableUnitMap } from "./note-editable-map.js";
import {
  findEditableUnitIdAtOffset,
  insertLineBreakInUnit,
  replaceUnitRange,
  splitParagraphUnitAt,
} from "./note-source-patch.js";

const SAMPLE = `[NARRATIVE]

First paragraph here.

Second paragraph with more detail.

[QUOTES]

> Highlighted quote line
`;

describe("note-source-patch", () => {
  it("builds editable units with stable ranges", () => {
    const units = buildEditableUnitMap(SAMPLE);
    const first = units.get("narrative:0:0");
    assert.ok(first);
    assert.equal(first.sourceText, "First paragraph here.");
    assert.equal(
      SAMPLE.slice(first.start, first.end),
      "First paragraph here."
    );
  });

  it("replaces paragraph text in markdown", () => {
    const units = buildEditableUnitMap(SAMPLE);
    const unit = units.get("narrative:0:0");
    const updated = replaceUnitRange(SAMPLE, unit, "Updated opening.");
    assert.match(updated, /Updated opening\./);
    assert.doesNotMatch(updated, /First paragraph here\./);
  });

  it("splits a paragraph with a blank line", () => {
    const units = buildEditableUnitMap(SAMPLE);
    const unit = units.get("narrative:1:0");
    const { markdown: updated } = splitParagraphUnitAt(SAMPLE, unit, 21);
    assert.match(updated, /Second paragraph with\n\nmore detail\./);
  });

  it("appends a new paragraph placeholder when splitting at end", () => {
    const units = buildEditableUnitMap(SAMPLE);
    const unit = units.get("narrative:0:0");
    const { markdown: updated, focusOffset } = splitParagraphUnitAt(
      SAMPLE,
      unit,
      unit.sourceText.length
    );
    assert.match(updated, /First paragraph here\.\n\n\u200b/);
    assert.ok(focusOffset >= 0);
    const rebuilt = buildEditableUnitMap(updated);
    assert.equal(findEditableUnitIdAtOffset(rebuilt, focusOffset), "narrative:1:0");
  });

  it("maps placeholder paragraphs as editable units", () => {
    const markdown = `[NARRATIVE]

First paragraph here.

\u200b
`;
    const units = buildEditableUnitMap(markdown);
    const placeholder = units.get("narrative:1:0");
    assert.ok(placeholder);
    assert.equal(placeholder.sourceText, "\u200b");
    assert.equal(placeholder.editable, true);
  });

  it("inserts a soft line break inside a paragraph", () => {
    const units = buildEditableUnitMap(SAMPLE);
    const unit = units.get("narrative:0:0");
    const updated = insertLineBreakInUnit(SAMPLE, unit, 5);
    assert.match(updated, /First\n paragraph here\./);
  });
});
