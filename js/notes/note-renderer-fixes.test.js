/**
 * Run: node --test js/notes/note-renderer-fixes.test.js
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownEmphasis } from "../anchors/inline-emphasis.js";
import {
  parseLegacyDividedChronologySegments,
  parseTimelineMilestoneLabel,
} from "./note-chronology.js";
import { parseMapMarkdown } from "./map-parser.js";
import {
  orderRevisionAndRecallBlocks,
  renderNarrative,
  renderRepresentationTab,
  renderRevision,
  renderStructural,
  renderTimeline,
} from "./note-renderer.js";
import { parseMarkdownTable } from "./markdown-table.js";

const sampleDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/notes/Sample v3 Exports"
);

describe("inline emphasis", () => {
  it("renders **bold** markers as strong elements", () => {
    const html = renderMarkdownEmphasis("Before **1215** after");
    assert.match(html, /Before <strong>1215<\/strong> after/);
    assert.doesNotMatch(html, /\*\*/);
  });
});

describe("timeline milestone labels", () => {
  it("parses bold-wrapped v3 timeline dates", () => {
    assert.equal(parseTimelineMilestoneLabel("**1215**"), "1215");
    assert.equal(parseTimelineMilestoneLabel("**13th–16th Centuries**"), "13th–16th Centuries");
    assert.equal(parseTimelineMilestoneLabel("Late 16th Century"), "Late 16th Century");
    assert.equal(parseTimelineMilestoneLabel("**April 1640**"), "April 1640");
  });

  it("rejects regular prose lines", () => {
    assert.equal(parseTimelineMilestoneLabel("Parliament challenged arbitrary royal authority"), null);
  });
});

describe("legacy timeline divider migration", () => {
  it("splits inline divider leaks into chronology segments", () => {
    const segments = parseLegacyDividedChronologySegments(
      "1215 — [[Magna Carta]] ━━━━━━━━━━ 1629–1640 — [[Personal Rule]]"
    );

    assert.equal(segments.length, 2);
    assert.equal(segments[0].event.date, "1215");
    assert.equal(segments[1].event.date, "1629–1640");
  });

  it("renders migrated legacy dividers without literal divider text", () => {
    const parsed = parseMapMarkdown(
      `[TIMELINE]

1215 — [[Magna Carta]] ━━━━━━━━━━ 1629–1640 — [[Personal Rule]]`
    );

    const html = renderTimeline(parsed.representations.timeline, {});
    assert.match(html, /semantic-chronology-node/);
    assert.doesNotMatch(html, /━━━━/);
    assert.match(html, /<strong>1215<\/strong>|semantic-timeline-milestone|semantic-chronology-date/);
  });

  it("renders v3 timeline sample dates without raw asterisks", () => {
    const timelineSample = readFileSync(
      path.join(sampleDir, "English Revolution Timeline (Eng).md"),
      "utf8"
    );
    const parsed = parseMapMarkdown(timelineSample);
    const html = renderTimeline(parsed.representations.timeline, {});

    assert.doesNotMatch(html, /\*\*1215\*\*/);
    assert.match(html, /<strong>1215<\/strong>|semantic-timeline-milestone/);
    assert.match(html, /msmdf-layer-purpose/);
    assert.doesNotMatch(html, /&gt; \*\*Timeline Purpose\*\*/);
  });
});

describe("revision tab ordering", () => {
  it("orders revision blocks before recall blocks", () => {
    const blocks = [
      { sequence_order: 1, block_type: "recall", content: "Recall first" },
      { sequence_order: 2, block_type: "paragraph", content: "Revision second" },
      {
        sequence_order: 3,
        metadata_json: { source_section: "recall" },
        block_type: "paragraph",
        content: "Tagged recall",
      },
      { sequence_order: 4, block_type: "paragraph", content: "Revision third" },
    ];

    const ordered = orderRevisionAndRecallBlocks(blocks);
    assert.deepEqual(
      ordered.map((block) => block.content),
      ["Revision second", "Revision third", "Recall first", "Tagged recall"]
    );
  });

  it("renders revision sample before recall sample in the revision tab", () => {
    const revisionSample = readFileSync(
      path.join(sampleDir, "English Revolution Revision English.md"),
      "utf8"
    );
    const recallSample = readFileSync(
      path.join(sampleDir, "English Revolution recall note (eng).md"),
      "utf8"
    );

    const parsed = parseMapMarkdown(`${recallSample}\n\n${revisionSample}`);
    const html = renderRepresentationTab("revision", parsed.representations, {});

    const revisionIndex = html.indexOf("One-Line Revision");
    const recallIndex = html.indexOf("Direct Recall");
    assert.ok(revisionIndex >= 0 && recallIndex >= 0);
    assert.ok(revisionIndex < recallIndex);
  });
});

describe("revision layer rendering", () => {
  const revisionSample = readFileSync(
    path.join(sampleDir, "English Revolution Revision English.md"),
    "utf8"
  );
  const recallSample = readFileSync(
    path.join(sampleDir, "English Revolution recall note (eng).md"),
    "utf8"
  );

  it("parses markdown pipe tables", () => {
    const table = parseMarkdownTable(`| Document | Revision Trigger |
|-----------|------------------|
| [[Magna Carta]] | King under Law |`);

    assert.equal(table?.headers.length, 2);
    assert.equal(table?.rows.length, 1);
    assert.equal(table?.rows[0][0], "[[Magna Carta]]");
  });

  it("groups section content inside collapsible bodies", () => {
    const parsed = parseMapMarkdown(revisionSample);
    const html = renderRevision(parsed.representations.revision, {});

    assert.match(
      html,
      /1\. Revision Flow<\/summary>[\s\S]*canonical-block-body semantic-body[\s\S]*Magna Carta/
    );
    assert.doesNotMatch(html, /\| Document \| Revision Trigger \|/);
    assert.match(html, /<table class="semantic-table/);
  });

  it("renders fewer empty section bodies and standalone flow articles", () => {
    const parsed = parseMapMarkdown(revisionSample);
    const html = renderRevision(parsed.representations.revision, {});

    const emptyDetails = (
      html.match(
        /<details[^>]*>\s*<summary[^>]*>[^<]+<\/summary>\s*<div class="canonical-block-body semantic-body"><\/div>/g
      ) || []
    ).length;

    assert.equal(emptyDetails, 0);
    assert.doesNotMatch(
      html,
      /<article[^>]*>[\s\S]*semantic-retrieval-arrow[\s\S]*<\/article>/
    );
  });

  it("pairs direct recall questions with arrow answers", () => {
    const parsed = parseMapMarkdown(recallSample);
    const html = renderRevision(parsed.representations.revision, {});

    const directRecall = html.slice(
      html.indexOf("1. Direct Recall"),
      html.indexOf("2. Completion Recall")
    );

    assert.match(directRecall, /semantic-recall-qa/);
    assert.match(
      directRecall,
      /semantic-recall-question[\s\S]*Which document first established/
    );
    assert.match(directRecall, /semantic-recall-answer[\s\S]*Magna Carta/);
    assert.equal((directRecall.match(/semantic-recall-qa/g) ?? []).length, 20);
    assert.doesNotMatch(directRecall, /<p class="canonical-paragraph[^"]*">→ /);
  });
});

describe("narrative layer rendering", () => {
  const narrativeSample = readFileSync(
    path.join(sampleDir, "English Revolution Narrative (eng).md"),
    "utf8"
  );

  it("wraps section prose inside article semantic-body", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]

## Section One

First paragraph.

Second paragraph.

## Section Two

Another paragraph.`
    );

    const html = renderNarrative(parsed.representations.narrative, {});

    assert.match(
      html,
      /Section One[\s\S]*<div class="semantic-body">[\s\S]*semantic-paragraph-run[\s\S]*First paragraph/
    );
    assert.doesNotMatch(
      html,
      /<\/article>\s*<div class="semantic-paragraph-run"[\s\S]*First paragraph/
    );
  });

  it("groups v3 English Revolution narrative sections with their prose", () => {
    const parsed = parseMapMarkdown(narrativeSample);
    const html = renderNarrative(parsed.representations.narrative, {});

    assert.match(
      html,
      /Constitutional and Religious Foundations[\s\S]*<div class="semantic-body">[\s\S]*semantic-paragraph-run/
    );

    const orphanHeadingArticles =
      html.match(
        /<article class="semantic-block[^"]*">\s*<h[2-6][^>]*>[^<]+<\/h[2-6]>\s*<\/article>/g
      ) || [];

    assert.equal(orphanHeadingArticles.length, 0);
  });

  it("keeps the document title as a section entry without nesting all articles", () => {
    const parsed = parseMapMarkdown(narrativeSample);
    const html = renderNarrative(parsed.representations.narrative, {});

    assert.match(html, /semantic-section-entry[\s\S]*ENGLISH REVOLUTION/);
    assert.doesNotMatch(
      html,
      /<article class="semantic-block[^"]* semantic-section-entry[^"]*">/
    );
  });
});

describe("structural layer rendering", () => {
  const structuralEn = readFileSync(
    path.join(sampleDir, "English Revolution Structural (english).md"),
    "utf8"
  );
  const structuralMl = readFileSync(
    path.join(sampleDir, "English Revolution Structural (mal).md"),
    "utf8"
  );

  it("renders --- dividers as semantic HR elements", () => {
    const parsed = parseMapMarkdown(
      `[STRUCTURAL]

# Topic

## Section

Point one.

---

Point two.`
    );

    const html = renderStructural(parsed.representations.structural, {});

    assert.match(html, /semantic-divider--hr/);
    assert.doesNotMatch(html, /<p class="canonical-paragraph[^"]*">---<\/p>/);
  });

  it("renders nested structural lists from indent depth", () => {
    const parsed = parseMapMarkdown(
      `[STRUCTURAL]

# Topic

## Section

- [[Magna Carta]] (1215)
  - King subject to law
  - Beginning of limited monarchy
- Growth of Parliament`
    );

    const html = renderStructural(parsed.representations.structural, {});

    assert.match(
      html,
      /<li class="semantic-list-item">[\s\S]*Magna Carta[\s\S]*<ul class="canonical-list semantic-list semantic-list--nested">[\s\S]*King subject to law/
    );
    assert.match(html, /Growth of Parliament/);
  });

  it("renders v3 English structural sample without literal divider paragraphs", () => {
    const parsed = parseMapMarkdown(structuralEn);
    const html = renderStructural(parsed.representations.structural, {});

    assert.match(html, /msmdf-layer-purpose/);
    assert.match(html, /semantic-list--nested/);
    assert.equal(
      (html.match(/<p class="canonical-paragraph[^"]*">---<\/p>/g) ?? []).length,
      0
    );
  });

  it("renders Malayalam structural purpose as a callout", () => {
    const parsed = parseMapMarkdown(structuralMl);
    const html = renderStructural(parsed.representations.structural, {});

    assert.match(html, /msmdf-layer-purpose/);
    assert.match(html, /ഘടനാപരമായ ലക്ഷ്യം/);
    assert.doesNotMatch(html, /&gt; \*\*ഘടനാപരമായ ലക്ഷ്യം\*\*/);
  });
});
