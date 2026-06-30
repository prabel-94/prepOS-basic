/**
 * Run: node --test js/notes/note-renderer-paragraph-spacing.test.js
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMapMarkdown } from "./map-parser.js";
import { renderNarrative } from "./note-renderer.js";

const narrativeSample = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../docs/notes/Sample v3 Exports/English Revolution Narrative (eng).md"
  ),
  "utf8"
);

describe("note-renderer paragraph spacing", () => {
  it("groups consecutive narrative paragraphs in one paragraph run", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]

First paragraph with enough text.

Second paragraph with spacing.

Third paragraph closes the run.`
    );

    const html = renderNarrative(parsed.representations.narrative, {});

    assert.match(html, /semantic-paragraph-run/);
    assert.equal((html.match(/<p class="canonical-paragraph semantic-paragraph/g) ?? []).length, 3);
    assert.equal((html.match(/<article class="semantic-block/g) ?? []).length, 0);
  });

  it("renders MSMDF v3 milestone blocks from split parser paragraphs", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]

Lead-in paragraph.

━━━━━━━━━━
**1649 — [[Execution of Charles I]]**
━━━━━━━━━━

Follow-up paragraph.`
    );

    const html = renderNarrative(parsed.representations.narrative, {});

    assert.match(html, /semantic-chronology-node/);
    assert.match(html, /semantic-paragraph-run/);
    assert.doesNotMatch(html, /<article class="semantic-block[^"]*">\s*<div class="semantic-body">\s*<div class="semantic-divider/);
  });

  it("keeps readable paragraph spacing in the English Revolution v3 sample", () => {
    const parsed = parseMapMarkdown(narrativeSample);
    const html = renderNarrative(parsed.representations.narrative, {});

    const paragraphRuns = (html.match(/semantic-paragraph-run/g) ?? []).length;
    const loneArticleParagraphs = (html.match(
      /<article class="semantic-block[^"]*">\s*<div class="semantic-body">\s*<p class="canonical-paragraph semantic-paragraph/g
    ) ?? []).length;

    assert.ok(paragraphRuns >= 8, "expected grouped paragraph runs in v3 narrative sample");
    assert.equal(loneArticleParagraphs, 0);
    assert.ok((html.match(/semantic-chronology-node/g) ?? []).length >= 3);
  });
});
