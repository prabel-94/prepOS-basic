/**
 * MSMDF v1.2 parser compliance regression tests.
 * Run: node --test js/notes/map-parser.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMapMarkdown,
  splitSections,
  matchCanonicalSectionLine,
  summarizeDetectedSections,
  formatDetectedSectionTags,
  MSMDF_SECTION_SYNTAX_EXAMPLES,
} from "./map-parser.js";
import { attachSemanticCandidates } from "../anchors/anchor-candidates.js";

function blockHeadings(parsed) {
  return Object.values(parsed.representations)
    .flat()
    .filter((b) => b.heading)
    .map((b) => ({ heading: b.heading, level: b.hierarchy_level }));
}

describe("MSMDF v1.2 section line detection", () => {
  it("accepts canonical bracket-only sections", () => {
    assert.equal(matchCanonicalSectionLine("[NARRATIVE]"), "NARRATIVE");
    assert.equal(matchCanonicalSectionLine("  [STRUCTURAL]  "), "STRUCTURAL");
    assert.equal(matchCanonicalSectionLine("# [NARRATIVE]"), "NARRATIVE");
    assert.equal(matchCanonicalSectionLine("#[NARRATIVE]"), "NARRATIVE");
    assert.equal(matchCanonicalSectionLine("# [ENTITY_INDEX]"), "ENTITY_INDEX");
    assert.equal(matchCanonicalSectionLine("[QUOTES]"), "QUOTES");
  });

  it("rejects non-boundary lines", () => {
    assert.equal(matchCanonicalSectionLine("## [NARRATIVE]"), null);
    assert.equal(matchCanonicalSectionLine("## Heading"), null);
    assert.equal(matchCanonicalSectionLine("Not [NARRATIVE] inline"), null);
  });
});

describe("splitSections", () => {
  it("parses bracket-only and hash forms", () => {
    const { sections } = splitSections(
      "[METADATA]\ntitle: T\n\n[NARRATIVE]\n\nBody."
    );
    assert.equal(sections.length, 2);
    assert.equal(sections[0].tag, "METADATA");
    assert.equal(sections[1].tag, "NARRATIVE");
    assert.match(sections[1].body, /Body/);
  });

  it("preserves prelude before first section", () => {
    const { prelude, sections } = splitSections(
      "Intro line\n\n[NARRATIVE]\n\nInner."
    );
    assert.ok(prelude?.includes("Intro line"));
    assert.equal(sections[0].tag, "NARRATIVE");
  });
});

describe("parseMapMarkdown — MSMDF fixtures", () => {
  it("[NARRATIVE] bracket-only", () => {
    const parsed = parseMapMarkdown("[NARRATIVE]\n\nParagraph.");
    const summary = summarizeDetectedSections(parsed);
    assert.ok(summary.narrative);
    assert.ok(parsed.representations.narrative.length >= 1);
  });

  it("# [NARRATIVE] and #[NARRATIVE]", () => {
    const a = parseMapMarkdown("# [NARRATIVE]\n\nA.");
    const b = parseMapMarkdown("#[NARRATIVE]\n\nB.");
    assert.ok(summarizeDetectedSections(a).narrative);
    assert.ok(summarizeDetectedSections(b).narrative);
  });

  it("[STRUCTURAL] with heading hierarchy", () => {
    const parsed = parseMapMarkdown(
      `[STRUCTURAL]

## Level two

### Level three

#### Level four

##### Level five

###### Level six
`
    );
    const headings = blockHeadings(parsed);
    const levels = headings.map((h) => h.level);
    assert.deepEqual(levels, [2, 3, 4, 5, 6]);
  });

  it("heading with wiki anchor", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]

## Treaty of [[Versailles]]

Body mentions [[Magna Carta]].`
    );
    const headings = blockHeadings(parsed);
    assert.ok(headings.some((h) => h.heading.includes("[[Versailles]]")));
    assert.ok(parsed.topic_links.some((l) => l.name === "Magna Carta"));
  });

  it("mixed sections + metadata + entity index", () => {
    const parsed = parseMapMarkdown(
      `[METADATA]
title: Sample

[NARRATIVE]

Intro.

[STRUCTURAL]

## Frame

[ENTITY_INDEX]

- item one`
    );
    const summary = summarizeDetectedSections(parsed);
    assert.ok(summary.metadata);
    assert.ok(summary.narrative);
    assert.ok(summary.structural);
    assert.ok(summary.entity_index);
    assert.ok(parsed.entity_index.length >= 1);
  });

  it("preserves prelude in narrative with diagnostics", () => {
    const parsed = parseMapMarkdown(
      `Orphan intro paragraph.

[NARRATIVE]

Canonical body.`
    );
    assert.ok(parsed.parser_diagnostics.prelude?.preserved);
    assert.ok(
      parsed.representations.narrative.some(
        (b) => b.metadata_json?.msmdf_provenance === "prelude"
      )
    );
    const preludeBlocks = parsed.representations.narrative.filter(
      (b) => b.metadata_json?.msmdf_provenance === "prelude"
    );
    assert.ok(preludeBlocks.some((b) => (b.content ?? "").includes("Orphan intro")));
  });

  it("semantic candidates remain downstream", () => {
    const parsed = attachSemanticCandidates(
      parseMapMarkdown(`[NARRATIVE]\n\nLink to [[Topic A]].`)
    );
    assert.ok(parsed.semantic_candidates.length >= 1);
    assert.equal(parsed.semantic_candidates[0].name, "Topic A");
  });

  it("formatDetectedSectionTags lists bracket tags", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]\n\nA.\n\n[STRUCTURAL]\n\n## H`
    );
    const tags = formatDetectedSectionTags(parsed);
    assert.ok(tags.some((t) => t === "[NARRATIVE]"));
    assert.ok(tags.some((t) => t === "[STRUCTURAL]"));
  });

  it("[QUOTES] section maps to representations.quotes", () => {
    const parsed = parseMapMarkdown(
      `[QUOTES]

## [[James I]]
> "Democracy is the worst form of government."

## [[Gandhi]]
Be the change you wish to see in the world.`
    );
    const summary = summarizeDetectedSections(parsed);
    assert.ok(summary.quotes);
    assert.ok(parsed.representations.quotes.length >= 2);
    assert.ok(
      parsed.representations.quotes.some((block) =>
        (block.content ?? "").startsWith(">")
      )
    );
  });
});

/**
 * Renderer preservation gap (documented — not fixed in parser pass):
 * note-renderer.js caps heading tags at h4 via Math.min(..., 4),
 * so hierarchy_level 5–6 are stored correctly but render as h4.
 */
