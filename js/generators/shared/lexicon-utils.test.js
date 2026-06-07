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
  isHeadwordFamiliar,
  selectSynonymPromptEntry,
  HEADWORD_FAMILIARITY,
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

  it("isHeadwordFamiliar requires enough seen and low error rate", () => {
    assert.equal(isHeadwordFamiliar(null), false);
    assert.equal(isHeadwordFamiliar({ seen_count: 2, wrong_count: 0 }), false);
    assert.equal(isHeadwordFamiliar({ seen_count: 3, wrong_count: 1 }), true);
    assert.equal(isHeadwordFamiliar({ seen_count: 3, wrong_count: 2 }), false);
  });

  it("selectSynonymPromptEntry uses random prompt in normal mode", () => {
    const words = [
      { id: "1", word: "primary", is_headword: true },
      { id: "2", word: "related" },
    ];
    const seen = new Set();

    for (let i = 0; i < 20; i += 1) {
      const entry = selectSynonymPromptEntry(words, { adaptive: false });
      seen.add(entry?.word);
    }

    assert.ok(seen.has("related"));
  });

  it("selectSynonymPromptEntry uses headword in adaptive mode until familiar", () => {
    const words = [
      { id: "hw", word: "primary", is_headword: true },
      { id: "rel", word: "related" },
    ];
    const stats = new Map();

    const scaffold = selectSynonymPromptEntry(words, {
      adaptive: true,
      statsByWordId: stats,
    });
    assert.equal(scaffold?.word, "primary");

    stats.set("hw", {
      seen_count: HEADWORD_FAMILIARITY.minSeen,
      wrong_count: 0,
    });

    const seen = new Set();
    for (let i = 0; i < 20; i += 1) {
      const entry = selectSynonymPromptEntry(words, {
        adaptive: true,
        statsByWordId: stats,
      });
      seen.add(entry?.word);
    }

    assert.ok(seen.has("related"));
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
