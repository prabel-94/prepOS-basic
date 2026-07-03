/**
 * Run: node --test js/notes/note-source-transforms.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyQuoteHighlight,
  convertTextToHeading,
  deriveSectionTitle,
  expandRangeToParagraphBoundaries,
  formatRetrievalAnchorBlock,
  insertBlockAt,
  insertDividerAt,
  insertWikiLinkAt,
  nestHeadingsInText,
  prefixSelectionAsBulletList,
  prefixSelectionAsNumberedList,
  wrapRangeAsSection,
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

  it("expands a caret position to paragraph boundaries", () => {
    const md = "Alpha\n\nBeta\n\nGamma";
    const betaStart = md.indexOf("Beta");
    const expanded = expandRangeToParagraphBoundaries(md, betaStart + 1, betaStart + 1);
    assert.equal(md.slice(expanded.start, expanded.end), "Beta");
  });

  it("nests headings inside wrapped body", () => {
    assert.equal(nestHeadingsInText("## Child"), "### Child");
  });

  it("wraps a markdown range as a section", () => {
    const md = "Intro\n\nPoint one\n\nPoint two\n\nOutro";
    const start = md.indexOf("Point one");
    const end = md.indexOf("Point two") + "Point two".length;
    const result = wrapRangeAsSection(md, start, end, { title: "Summary", level: 2 });

    assert.match(result, /Intro\n\n## Summary\n\nPoint one\n\nPoint two\n\nOutro/);
  });

  it("promotes a leading heading to the section title", () => {
    const md = "## Recall block\n\nPrompt text";
    const result = wrapRangeAsSection(md, 0, md.length, { level: 2 });

    assert.equal(result, "## Recall block\n\nPrompt text");
  });
});
