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
  getHeadwordEntry,
  getHeadwordLabel,
  applyHeadwordFlags,
  sortWordsWithHeadwordFirst,
} from "./lexicon-utils.js";

describe("lexicon-utils", () => {
  it("normalizeWordKey trims and lowercases", () => {
    assert.equal(normalizeWordKey("  Hello "), "hello");
  });

  it("getHeadwordEntry prefers flagged headword", () => {
    const entry = getHeadwordEntry([
      { word: "related", is_headword: false },
      { word: "primary", is_headword: true },
    ]);
    assert.equal(entry?.word, "primary");
  });

  it("getHeadwordLabel returns the headword text", () => {
    assert.equal(
      getHeadwordLabel([
        { word: "primary", is_headword: true },
        { word: "related" },
      ]),
      "primary"
    );
  });

  it("applyHeadwordFlags marks only the first entry", () => {
    const words = applyHeadwordFlags([{ word: "a" }, { word: "b" }]);
    assert.equal(words[0].is_headword, true);
    assert.equal(words[1].is_headword, false);
  });

  it("sortWordsWithHeadwordFirst moves flagged entry to front", () => {
    const sorted = sortWordsWithHeadwordFirst([
      { word: "b" },
      { word: "a", is_headword: true },
    ]);
    assert.equal(sorted[0].word, "a");
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
