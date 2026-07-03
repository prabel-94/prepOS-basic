/**
 * Run: node --test js/notes/note-section-wrap.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectUnitsForSectionWrap,
  wrapUnitsAsSection,
} from "./note-section-wrap.js";

describe("note-section-wrap", () => {
  it("collects units from the active block through the next heading", () => {
    const units = new Map([
      [
        "revision:1:0",
        {
          id: "revision:1:0",
          representation: "revision",
          kind: "paragraph",
          start: 10,
          end: 20,
        },
      ],
      [
        "revision:2:0",
        {
          id: "revision:2:0",
          representation: "revision",
          kind: "paragraph",
          start: 22,
          end: 32,
        },
      ],
      [
        "revision:3:heading",
        {
          id: "revision:3:heading",
          representation: "revision",
          kind: "heading",
          start: 34,
          end: 44,
        },
      ],
    ]);

    const selected = collectUnitsForSectionWrap(units, "revision:2:0");
    assert.deepEqual(
      selected.map((unit) => unit.id),
      ["revision:2:0"]
    );
  });

  it("wraps contiguous units as one section", () => {
    const markdown = "Alpha\n\nBeta";
    const units = [
      { start: 0, end: 5 },
      { start: 7, end: 11 },
    ];

    const result = wrapUnitsAsSection(markdown, units, {
      title: "Group",
      level: 2,
    });

    assert.equal(result, "## Group\n\nAlpha\n\nBeta");
  });
});
