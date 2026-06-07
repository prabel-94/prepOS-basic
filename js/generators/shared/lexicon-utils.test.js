/**
 * Run: node --test js/generators/shared/lexicon-utils.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWordKey,
  validateGroupWords,
  validateGeneratorReadiness,
} from "./lexicon-utils.js";

describe("lexicon-utils", () => {
  it("normalizeWordKey trims and lowercases", () => {
    assert.equal(normalizeWordKey("  Hello "), "hello");
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
