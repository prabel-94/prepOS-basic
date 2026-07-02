/**
 * Run: node --test js/core/malayalam-copy.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMalayalamTranslationCopyText,
  MALAYALAM_COPY_SEPARATOR,
  MALAYALAM_TRANSLATION_PROMPT,
  NUMBERED_STATEMENT_MALAYALAM_FORMAT,
  questionHasNumberedStatements,
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

  it("includes numbered-statement format rules in the translation prompt", () => {
    const text = buildMalayalamTranslationCopyText(SAMPLE);
    assert.match(text, /FLEXIBLE \(wording is yours/);
    assert.match(text, /STRICT \(must follow exactly\)/);
    assert.match(text, /ONLY line 1 of the block uses Q<n>\./);
    assert.ok(text.includes(NUMBERED_STATEMENT_MALAYALAM_FORMAT));
  });

  it("detects numbered statements in multiline stem text", () => {
    const statementQuestion = {
      ...SAMPLE,
      text: `With reference to the Puritans, consider the following statements:
1. They strongly supported Parliament.
2. They opposed Catholic-style reforms in the Anglican Church.
Which of the above is correct?`,
    };
    assert.equal(questionHasNumberedStatements(statementQuestion), true);
    assert.equal(questionHasNumberedStatements(SAMPLE), false);
  });

  it("flags numbered-statement questions before the English blocks", () => {
    const statementQuestion = {
      ...SAMPLE,
      text: `Consider the following statements:
1. Alpha
2. Beta
Which is correct?`,
    };
    const text = buildMalayalamTranslationCopyText([SAMPLE, statementQuestion], {
      startIndex: 1,
    });
    assert.match(text, /IMPORTANT: Question 2 uses numbered statements/);
    assert.doesNotMatch(text, /IMPORTANT: Question 1 uses numbered statements/);
  });
});
