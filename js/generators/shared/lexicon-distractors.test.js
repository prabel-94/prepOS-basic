/**
 * Run: node --test js/generators/shared/lexicon-distractors.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDistractors } from "./lexicon-distractors.js";

describe("lexicon-distractors", () => {
  const groups = {
    g1: [
      { word: "അവിൽ" },
      { word: "ധാനാ" },
      { word: "ചിപിടകം" },
      { word: "പൃഥുകം" },
    ],
    g2: [{ word: "ശരം" }, { word: "രൂപം" }, { word: "മരം" }],
    g3: [{ word: "വീട്" }, { word: "ഭവൻ" }, { word: "ഗൃഹം" }],
  };

  it("never uses words from excluded synonym groups as distractors", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const distractors = buildDistractors({
        groups,
        excludedGroupIds: ["g1"],
        excludedWords: ["അവിൽ", "പൃഥുകം"],
        preferredLexicalClass: "OBJECT",
        count: 3,
      });

      assert.equal(distractors.length, 3);

      const words = distractors.map((entry) => entry.word);
      assert.ok(!words.includes("ധാനാ"));
      assert.ok(!words.includes("ചിപിടകം"));
      assert.ok(!words.includes("അവിൽ"));
      assert.ok(!words.includes("പൃഥുകം"));
    }
  });

  it("relaxes lexical class before failing when other groups have enough words", () => {
    const distractors = buildDistractors({
      groups,
      excludedGroupIds: ["g1"],
      excludedWords: ["അവിൽ", "പൃഥുകം"],
      preferredLexicalClass: "OBJECT",
      count: 3,
    });

    assert.equal(distractors.length, 3);
  });
});
