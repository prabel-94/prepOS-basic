/**
 * MSMDF parser compliance regression tests.
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
  resolveMsmdfVersions,
  MSMDF_SECTION_SYNTAX_EXAMPLES,
} from "./map-parser.js";
import { attachSemanticCandidates } from "../anchors/anchor-candidates.js";

function blockHeadings(parsed) {
  return Object.values(parsed.representations)
    .flat()
    .filter((b) => b.heading)
    .map((b) => ({ heading: b.heading, level: b.hierarchy_level }));
}

describe("MSMDF section line detection", () => {
  it("accepts canonical bracket-only sections", () => {
    assert.equal(matchCanonicalSectionLine("[NARRATIVE]"), "NARRATIVE");
    assert.equal(matchCanonicalSectionLine("[EXPANSION]"), "EXPANSION");
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

  it("parses ```text fences as retrieval_anchor blocks", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]

Retrieval Anchor:
\`\`\`text
[[Seven Years' War]]
↓
British Debt
↓
New Taxes
\`\`\`

Following paragraph.`
    );

    const blocks = parsed.representations.narrative;
    const cue = blocks.find((b) => b.content === "Retrieval Anchor:");
    const anchor = blocks.find((b) => b.block_type === "retrieval_anchor");

    assert.ok(cue);
    assert.equal(cue.block_type, "paragraph");
    assert.ok(anchor);
    assert.match(anchor.content, /\[\[Seven Years' War\]\]/);
    assert.match(anchor.content, /British Debt/);
    assert.equal(anchor.metadata_json?.fence_lang, "text");
    assert.ok(
      parsed.topic_links.some((link) => link.name === "Seven Years' War")
    );
  });

  it("[EXPANSION] section maps to representations.expansion", () => {
    const parsed = parseMapMarkdown(
      `[METADATA]
Protocol: MSMDF
Version: 3.0.0
Grammar Version: 3.0.0

[NARRATIVE]

The [[English Revolution]] began with constitutional conflict.

[EXPANSION]

## [[Oliver Cromwell]]
Military leader who became Lord Protector after the execution of Charles I.

## [[Bill of Rights]]
1689 settlement limiting royal power.`
    );

    const summary = summarizeDetectedSections(parsed);
    assert.ok(summary.expansion);
    assert.ok(parsed.representations.expansion.length >= 2);
    assert.equal(parsed.parser_diagnostics.msmdf_version, "3.0.0");
    assert.equal(parsed.parser_diagnostics.grammar_version, "3.0.0");
    assert.equal(parsed.parser_diagnostics.msmdf_generation, "3.x");
  });

  it("parses ```ra fences as MSMDF v3 retrieval anchors", () => {
    const parsed = parseMapMarkdown(
      `[NARRATIVE]

\`\`\`ra
[[Oliver Cromwell]]
↓
Lord Protector
\`\`\`

Following paragraph.`
    );

    const anchor = parsed.representations.narrative.find(
      (block) => block.block_type === "retrieval_anchor"
    );

    assert.ok(anchor);
    assert.match(anchor.content, /\[\[Oliver Cromwell\]\]/);
    assert.equal(anchor.metadata_json?.fence_lang, "ra");
  });
});

describe("resolveMsmdfVersions", () => {
  it("detects v3 metadata fields", () => {
    const versions = resolveMsmdfVersions({
      protocol: "MSMDF",
      version: "3.0.0",
      grammar_version: "3.0.0",
    });
    assert.equal(versions.msmdf_generation, "3.x");
    assert.equal(versions.version, "3.0.0");
  });

  it("falls back to legacy when v3 metadata is absent", () => {
    const versions = resolveMsmdfVersions({
      map_version: "Narrative Continuity Edition",
      msmdf_version: "v1.2",
    });
    assert.equal(versions.msmdf_generation, "legacy");
    assert.equal(versions.version, "Narrative Continuity Edition");
  });

  it("leaves generation unspecified when no version metadata is present", () => {
    const versions = resolveMsmdfVersions({});
    assert.equal(versions.msmdf_generation, "unspecified");
    assert.equal(versions.version, null);
  });
});

describe("custom extension sections", () => {
  it("parses registered [EXT:…] sections into dynamic buckets", () => {
    const custom = {
      id: "exam_tips",
      boundaryTag: "EXT:EXAM_TIPS",
      label: "Exam Tips",
      source: "custom",
      role: "cognition",
      tabOrder: 510,
      showTab: true,
      persist: true,
      rendererProfile: "generic",
    };

    const parsed = parseMapMarkdown(
      `[EXT:EXAM_TIPS]\n\n- Link causes to consequences`,
      { sectionExtensions: [custom] }
    );

    assert.ok(parsed.representations.exam_tips?.length >= 1);
    assert.equal(parsed.parser_diagnostics.warnings.length, 0);
  });

  it("warns on unknown extension tags without a definition", () => {
    const parsed = parseMapMarkdown(`[EXT:UNKNOWN]\n\nOrphan body.`);
    assert.ok(
      parsed.parser_diagnostics.warnings.some((warning) =>
        warning.includes("Unknown extension section")
      )
    );
    assert.equal(parsed.representations.unknown, undefined);
  });
});

/**
 * Renderer preservation gap (documented — not fixed in parser pass):
 * note-renderer.js caps heading tags at h4 via Math.min(..., 4),
 * so hierarchy_level 5–6 are stored correctly but render as h4.
 */
