/**
 * Run: node --test js/notes/note-source-transforms.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyQuoteHighlight,
  convertTextToHeading,
  formatRetrievalAnchorBlock,
  insertBlockAt,
  insertDividerAt,
  insertWikiLinkAt,
  prefixSelectionAsBulletList,
  prefixSelectionAsNumberedList,
  wrapSelectionAsWikiLink,
} from "./note-source-transforms.js";

describe("note-source-transforms", () => {
  it("wraps a selection as wiki link", () => {
    const result = wrapSelectionAsWikiLink("Meet James today", 5, 10);
    assert.equal(result, "Meet [[James]] today");
  });

  it("inserts wiki link at caret", () => {
    const result = insertWikiLinkAt("Before after", 7, 7, "Treaty");
    assert.equal(result, "Before [[Treaty]]after");
  });

  it("applies quote highlight to lines in range", () => {
    const text = "Plain line\nAnother line";
    const result = applyQuoteHighlight(text, 0, text.length);
    assert.equal(result, "> Plain line\n> Another line");
  });

  it("converts text to heading", () => {
    assert.equal(convertTextToHeading("Section title", 2), "## Section title");
    assert.equal(convertTextToHeading("## Old", 3), "### Old");
    assert.equal(convertTextToHeading("Deep", 6), "###### Deep");
  });

  it("prefixes selection as numbered list", () => {
    const text = "First\nSecond";
    assert.equal(
      prefixSelectionAsNumberedList(text, 0, text.length),
      "1. First\n2. Second"
    );
  });

  it("formats retrieval anchor block", () => {
    const block = formatRetrievalAnchorBlock(["[[Cause]]", "[[Effect]]"]);
    assert.match(block, /```ra/);
    assert.match(block, /↓/);
    assert.doesNotMatch(block, /Retrieval anchor:/);
  });

  it("inserts a block at caret", () => {
    assert.equal(
      insertBlockAt("Before after", 6, "---\n\n1947 — Event\n---"),
      "Before\n\n---\n\n1947 — Event\n---\n\nafter"
    );
  });

  it("prefixes selection as bullet list", () => {
    const text = "First\nSecond";
    assert.equal(
      prefixSelectionAsBulletList(text, 0, text.length),
      "- First\n- Second"
    );
  });

  it("inserts divider at caret", () => {
    assert.equal(
      insertDividerAt("Before after", 6),
      "Before\n\n---\n\nafter"
    );
  });
});
