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

  it("does not restrict to lexical class when only one other group has that class", () => {
    const actionGroups = {
      action_g1: [
        { word: "പോവുക", lexical_class: "ACTION" },
        { word: "ചെല്ലുക", lexical_class: "ACTION" },
        { word: "ഓടുക", lexical_class: "ACTION" },
      ],
      action_g2: [
        { word: "കള്ളം", lexical_class: "ACTION" },
        { word: "വഞ്ചന", lexical_class: "ACTION" },
        { word: "ചതി", lexical_class: "ACTION" },
      ],
      object_g1: [
        { word: "വീട്", lexical_class: "OBJECT" },
        { word: "ഭവൻ", lexical_class: "OBJECT" },
        { word: "ഗൃഹം", lexical_class: "OBJECT" },
      ],
    };

    const actionG2Words = new Set(actionGroups.action_g2.map((entry) => entry.word));
    let mixedDistractors = 0;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const distractors = buildDistractors({
        groups: actionGroups,
        excludedGroupIds: ["action_g1"],
        excludedWords: ["പോവുക", "ചെല്ലുക"],
        preferredLexicalClass: "ACTION",
        count: 3,
      });

      assert.equal(distractors.length, 3);

      const words = distractors.map((entry) => entry.word);
      const allFromActionG2 = words.every((word) => actionG2Words.has(word));
      if (!allFromActionG2) {
        mixedDistractors += 1;
      }
    }

    assert.ok(
      mixedDistractors > 0,
      "expected distractors from other lexical classes when ACTION has only two groups"
    );
  });
});
