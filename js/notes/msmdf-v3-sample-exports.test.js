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

const SAMPLES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/notes/Sample v3 Exports"
);

const SAMPLE_FILES = Object.freeze({
  narrativeEn: "English Revolution Narrative (eng).md",
  expansionEn: "English Revolution Expansion note (english).md",
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
    assert.equal(parsed.representations.expansion.length, 0);
    assert.ok(parsed.topic_links.length >= 50);
    assert.ok(
      parsed.representations.narrative.some((block) =>
        (block.content ?? "").includes("━━")
      ),
      "expected chronology milestone separators in narrative"
    );
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
    assert.equal(parsed.representations.narrative.length, 0);
    assert.ok(parsed.topic_links.length >= 50);
    assert.ok(
      parsed.representations.expansion.some((block) =>
        block.heading?.startsWith("Expansion Unit")
      ),
      "expected Expansion Unit section headings"
    );
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
    assert.ok(parsed.representations.narrative.length >= 90);
    assert.ok(parsed.representations.expansion.length >= 700);
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
    assert.equal(summary.expansion, false);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[NARRATIVE]"]);
    assert.ok(parsed.representations.narrative.length >= 140);
    assert.ok(parsed.topic_links.length >= 60);
    assert.ok(
      parsed.representations.narrative.some((block) =>
        block.heading?.includes("ഭാഗം")
      ),
      "expected Malayalam part headings"
    );
  });

  it("parses Malayalam Expansion export", () => {
    const parsed = parseSample(readSample(SAMPLE_FILES.expansionMl), {
      language: "malayalam",
    });
    const summary = summarizeDetectedSections(parsed);

    assert.equal(parsed.variant.language, "malayalam");
    assert.ok(summary.expansion);
    assert.equal(summary.narrative, false);
    assert.deepEqual(formatDetectedSectionTags(parsed), ["[EXPANSION]"]);
    assert.ok(parsed.representations.expansion.length >= 500);
    assert.ok(parsed.topic_links.length >= 40);
    assert.ok(
      parsed.representations.expansion.some((block) =>
        block.heading?.includes("വികസന യൂണിറ്റ്")
      ),
      "expected Malayalam expansion unit headings"
    );
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
    assert.ok(parsed.representations.narrative.length >= 140);
    assert.ok(parsed.representations.expansion.length >= 500);
    assert.ok(parsed.topic_links.length >= 70);
  });
});
