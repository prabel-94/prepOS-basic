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
  renderRepresentationTab,
  renderTimeline,
} from "./note-renderer.js";

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
