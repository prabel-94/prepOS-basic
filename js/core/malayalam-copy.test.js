/**
 * Run: node --test js/core/malayalam-copy.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMalayalamTranslationCopyText,
  MALAYALAM_COPY_SEPARATOR,
  MALAYALAM_TRANSLATION_PROMPT,
} from "./malayalam-copy.js";

const SAMPLE = {
  text: "Which planet is known as the Red Planet?",
  options: [
    { id: "A", text: "Venus" },
    { id: "B", text: "Mars" },
    { id: "C", text: "Jupiter" },
    { id: "D", text: "Saturn" },
  ],
  correct: "B",
  explanation: "Mars appears red due to iron oxide.",
};

describe("malayalam-copy", () => {
  it("includes prompt, separator, and single QCP block", () => {
    const text = buildMalayalamTranslationCopyText(SAMPLE);
    assert.match(text, new RegExp(`^${MALAYALAM_TRANSLATION_PROMPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(text, new RegExp(`\\n${MALAYALAM_COPY_SEPARATOR}\\n\\n`));
    assert.match(text, /Q1\. Which planet/);
    assert.match(text, /Answer: B/);
  });

  it("numbers multiple blocks for bulk copy", () => {
    const text = buildMalayalamTranslationCopyText(
      [SAMPLE, { ...SAMPLE, text: "What is 2+2?", correct: "B", options: SAMPLE.options }],
      { startIndex: 1 }
    );
    assert.match(text, /Q1\. Which planet/);
    assert.match(text, /Q2\. What is 2\+2/);
  });
});
