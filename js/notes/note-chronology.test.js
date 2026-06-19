/**
 * Run: node --test js/notes/note-chronology.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatChronologyParagraph,
  isChronologyParagraph,
  parseChronologyParagraph,
} from "./note-chronology.js";

describe("note-chronology", () => {
  it("formats and parses a chronology paragraph", () => {
    const paragraph = formatChronologyParagraph({
      date: "1947",
      label: "Independence",
      annotation: "End of British rule",
    });

    assert.ok(isChronologyParagraph(paragraph));
    const parsed = parseChronologyParagraph(paragraph);
    assert.equal(parsed.date, "1947");
    assert.equal(parsed.label, "Independence");
    assert.equal(parsed.annotation, "End of British rule");
  });

  it("rejects invalid format requests", () => {
    assert.throws(() => formatChronologyParagraph({ date: "", label: "X" }), /required/);
  });
});
