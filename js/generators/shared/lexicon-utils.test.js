/**
 * Run: node --test js/generators/shared/lexicon-utils.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWordKey,
  validateGroupWords,
  validateGeneratorReadiness,
  inferGroupLexicalClass,
  applyGroupLexicalClassToWords,
} from "./lexicon-utils.js";

describe("lexicon-utils", () => {
  it("normalizeWordKey trims and lowercases", () => {
    assert.equal(normalizeWordKey("  Hello "), "hello");
  });

  it("inferGroupLexicalClass picks the most common class", () => {
    assert.equal(
      inferGroupLexicalClass([
        { lexical_class: "QUALITY" },
        { lexical_class: "QUALITY" },
        { lexical_class: "ACTION" },
      ]),
      "QUALITY"
    );
  });

  it("applyGroupLexicalClassToWords sets every entry", () => {
    const group = {
      default_lexical_class: "EMOTION",
      words: [{ word: "a" }, { word: "b" }],
    };
    applyGroupLexicalClassToWords(group);
    assert.equal(group.words[0].lexical_class, "EMOTION");
    assert.equal(group.words[1].lexical_class, "EMOTION");
  });

  it("validateGroupWords rejects empty and duplicate words", () => {
    assert.ok(validateGroupWords([]).length > 0);
    assert.ok(
      validateGroupWords([{ word: "a" }, { word: "a" }]).some((msg) =>
        /duplicate/i.test(msg)
      )
    );
  });

  it("validateGeneratorReadiness warns when distractor pool is small", () => {
    const warnings = validateGeneratorReadiness(
      [{ word: "a" }, { word: "b" }],
      { g1: [{ word: "a" }, { word: "b" }] },
      "g1"
    );
    assert.ok(warnings.some((msg) => /distractor/i.test(msg)));
  });
});
