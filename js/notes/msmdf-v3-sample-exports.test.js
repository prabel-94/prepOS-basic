/**
 * Regression: MSMDF v3 Sample Exports (docs/notes/Sample v3 Exports).
 * Run: node --test js/notes/msmdf-v3-sample-exports.test.js
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMapMarkdown,
  summarizeDetectedSections,
  formatDetectedSectionTags,
} from "./map-parser.js";
import { renderRepresentationTab } from "./note-renderer.js";

const SAMPLES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/notes/Sample v3 Exports"
);

const SAMPLE_FILES = Object.freeze({
  narrativeEn: "English Revolution Narrative (eng).md",
  expansionEn: "English Revolution Expansion note (english).md",
  structuralEn: "English Revolution Structural (english).md",
  structuralMl: "English Revolution Structural (mal).md",
  timelineEn: "English Revolution Timeline (Eng).md",
  timelineMl: "English Revolution Timeline note (mal).md",
  interpretationsEn: "English Revolution interpretation english.md",
  interpretationsMl: "English Revolution interpretation malayalam.md",
  narrativeMl: "Narrative English Revolution Malayalam.md",
  expansionMl: "Expansion English Revolution note malayalam.md",
});

/**
 * @param {string} filename
 * @returns {string}
 */
function readSample(filename) {
  return readFileSync(path.join(SAMPLES_DIR, filename), "utf8");
}

/**
 * @param {string} markdown
 * @param {{ language?: string }} [options]
 */
function parseSample(markdown, options = {}) {
  const parsed = parseMapMarkdown(markdown, options);
  assert.equal(
    parsed.parser_diagnostics.warnings.length,
    0,
    `unexpected parser warnings: ${parsed.parser_diagnostics.warnings.join("; ")}`
  );
  return parsed;
}

function assertRenders(representationKey, representations) {
  const html = renderRepresentationTab(representationKey, representations, {});
  assert.ok(html.length > 0, `expected ${representationKey} HTML`);
  assert.doesNotMatch(html, /RENDER_ERROR/);
  return html;
}

describe("MSMDF v3 Sample Exports — English Revolution", () => {
  it("parses English Narrative export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.narrativeEn), {
      language: "english",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.narrative);
    assert.equal(summary.expansion, false);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[NARRATIVE]"]);
    assert.ok(parsed.representations.narrative.length >= 90);
    assert.ok(parsed.topic_links.length >= 50);
    assertRenders("narrative", parsed.representations);
  });

  it("parses English Expansion export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.expansionEn), {
      language: "english",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.expansion);
    assert.equal(summary.narrative, false);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[EXPANSION]"]);
    assert.ok(parsed.representations.expansion.length >= 700);
    assert.ok(parsed.topic_links.length >= 50);
    assertRenders("expansion", parsed.representations);
  });

  it("parses English Structural export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.structuralEn), {
      language: "english",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.structural);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[STRUCTURAL]"]);
    assert.ok(parsed.representations.structural.length >= 250);
    assert.ok(parsed.topic_links.length >= 50);
    assertRenders("structural", parsed.representations);
  });

  it("parses English Timeline export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.timelineEn), {
      language: "english",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.timeline);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[TIMELINE]"]);
    assert.ok(parsed.representations.timeline.length >= 120);
    assert.ok(parsed.topic_links.length >= 50);
    assertRenders("timeline", parsed.representations);
  });

  it("parses English Interpretation export via [INTERPRETATION] alias", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.interpretationsEn), {
      language: "english",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.interpretations);
    assert.equal(summary.narrative, false);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[INTERPRETATIONS]"]);
    assert.ok(parsed.representations.interpretations.length >= 180);
    assert.ok(parsed.topic_links.length >= 20);
    assertRenders("interpretations", parsed.representations);
  });

  it("parses merged English Narrative + Expansion", () => {
    const merged = [
      readSample(SAMPLE_FILES.narrativeEn).trim(),
      readSample(SAMPLE_FILES.expansionEn).trim(),
    ].join("\n\n");

    const parsed = parseSample(merged, { language: "english" });
    const summary = summarizeDetectedSections(parsed);
    const tags = formatDetectedSectionTags(parsed);

    assert.ok(summary.narrative);
    assert.ok(summary.expansion);
    assert.ok(tags.includes("[NARRATIVE]"));
    assert.ok(tags.includes("[EXPANSION]"));
    assert.ok(parsed.topic_links.length >= 60);
  });
});

describe("MSMDF v3 Sample Exports — Malayalam English Revolution", () => {
  it("parses Malayalam Narrative export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.narrativeMl), {
      language: "malayalam",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.equal(parsed.variant.language, "malayalam");
    assert.ok(summary.narrative);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[NARRATIVE]"]);
    assert.ok(parsed.representations.narrative.length >= 140);
    assertRenders("narrative", parsed.representations);
  });

  it("parses Malayalam Expansion export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.expansionMl), {
      language: "malayalam",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.expansion);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[EXPANSION]"]);
    assert.ok(parsed.representations.expansion.length >= 500);
    assertRenders("expansion", parsed.representations);
  });

  it("parses Malayalam Structural export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.structuralMl), {
      language: "malayalam",
    });

    assert.ok(summarizeDetectedSections(parsed).structural);
    assert.ok(parsed.representations.structural.length >= 250);
    assertRenders("structural", parsed.representations);
  });

  it("parses Malayalam Timeline export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.timelineMl), {
      language: "malayalam",
    });

    assert.ok(summarizeDetectedSections(parsed).timeline);
    assert.ok(parsed.representations.timeline.length >= 120);
    assertRenders("timeline", parsed.representations);
  });

  it("parses Malayalam Interpretation export via [INTERPRETATION] alias", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.interpretationsMl), {
      language: "malayalam",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.interpretations);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[INTERPRETATIONS]"]);
    assert.ok(parsed.representations.interpretations.length >= 180);
    assertRenders("interpretations", parsed.representations);
  });

  it("parses merged Malayalam Narrative + Expansion", () => {
    const merged = [
      readSample(SAMPLE_FILES.narrativeMl).trim(),
      readSample(SAMPLE_FILES.expansionMl).trim(),
    ].join("\n\n");

    const parsed = parseSample(merged, { language: "malayalam" });
    const summary = summarizeDetectedSections(parsed);

    assert.ok(summary.narrative);
    assert.ok(summary.expansion);
    assert.ok(parsed.topic_links.length >= 70);
  });
});
