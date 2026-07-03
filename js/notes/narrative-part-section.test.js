/**
 * Run: node --test js/notes/narrative-part-section.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isNarrativePartHeading,
  narrativePartSlug,
} from "./narrative-part-section.js";
import { parseMapMarkdown } from "./map-parser.js";
import { renderNarrative } from "./note-renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const malayalamSample = readFileSync(
  join(__dirname, "../../docs/notes/Sample v3 Exports/Narrative English Revolution Malayalam.md"),
  "utf8"
);

describe("narrative-part-section", () => {
  it("detects English and Malayalam part headings", () => {
    assert.equal(isNarrativePartHeading("Part II — Collapse of Royal Authority"), true);
    assert.equal(isNarrativePartHeading("PART IV Summary"), true);
    assert.equal(isNarrativePartHeading("ഭാഗം III — text"), true);
    assert.equal(isNarrativePartHeading("2. Constitutional Foundations"), false);
    assert.equal(isNarrativePartHeading("Constitutional Settlement"), false);
  });

  it("builds stable part slugs", () => {
    assert.equal(narrativePartSlug("Part II — Civil War"), "part-ii");
    assert.equal(narrativePartSlug("ഭാഗം IV — settlement"), "bhagam-iv");
  });

  it("renders Malayalam part sections as open details", () => {
    const parsed = parseMapMarkdown(malayalamSample);
    const html = renderNarrative(parsed.representations.narrative, {});

    assert.match(html, /data-narrative-part="bhagam-i"/);
    assert.match(html, /data-narrative-part="bhagam-iv"/);
    assert.match(
      html,
      /<details[^>]*data-narrative-part="bhagam-ii"[^>]* open[\s\S]*ഭാഗം II/
    );

    const partCount = (html.match(/data-narrative-part="bhagam-/g) ?? []).length;
    assert.equal(partCount, 4);
  });
});
