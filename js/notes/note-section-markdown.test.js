/**
 * Run: node --test js/notes/note-section-markdown.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendSection,
  formatSectionBlock,
  getSectionInventory,
  validateSectionBody,
} from "./note-section-markdown.js";
import { getDefinitionById } from "./note-section-catalog.js";
import { parseMapMarkdown } from "./map-parser.js";

describe("note-section-markdown", () => {
  it("formats a section block with boundary tag", () => {
    const definition = getDefinitionById("narrative");
    assert.match(formatSectionBlock(definition, "Hello world"), /^\[NARRATIVE\]/);
    assert.match(formatSectionBlock(definition, "Hello world"), /Hello world/);
  });

  it("rejects empty section body", () => {
    const definition = getDefinitionById("timeline");
    assert.throws(() => validateSectionBody("   "), /cannot be empty/);
    assert.throws(() => appendSection("", definition, " "), /cannot be empty/);
  });

  it("rejects nested section tags in pasted body", () => {
    assert.throws(
      () => validateSectionBody("Line one\n[NARRATIVE]\nMore"),
      /Remove section tags/
    );
  });

  it("appends first section to empty markdown", () => {
    const definition = getDefinitionById("narrative");
    const result = appendSection("", definition, "Opening paragraph.");
    assert.equal(result, "[NARRATIVE]\n\nOpening paragraph.");
  });

  it("inserts sections in tab order", () => {
    const narrative = getDefinitionById("narrative");
    const timeline = getDefinitionById("timeline");

    const first = appendSection("", narrative, "Story.");
    const combined = appendSection(first, timeline, "1947 — Independence.");

    const narrativeIndex = combined.indexOf("[NARRATIVE]");
    const timelineIndex = combined.indexOf("[TIMELINE]");
    assert.ok(narrativeIndex >= 0);
    assert.ok(timelineIndex > narrativeIndex);

    const parsed = parseMapMarkdown(combined);
    assert.ok(parsed.representations.narrative.length >= 1);
    assert.ok(parsed.representations.timeline.length >= 1);
  });

  it("reports section inventory from markdown", () => {
    const narrative = getDefinitionById("narrative");
    const markdown = appendSection("", narrative, "Body text.");
    const inventory = getSectionInventory(markdown);

    assert.equal(inventory.sections.length, 1);
    assert.equal(inventory.sections[0].id, "narrative");
    assert.equal(inventory.sections[0].bucket, "narrative");
    assert.ok(inventory.sections[0].bodyLength > 0);
  });
});
