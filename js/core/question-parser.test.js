/**
 * Run: node --test js/core/question-parser.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSingleQuestion,
  parseQuestionPaste,
  parseBulkQuestionPaste,
  splitBilingualPaste,
  normalizeSingleQuestionPaste,
} from "./question-parser.js";

const ENGLISH_BLOCK = `Q1. Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
Answer: B
Explanation: Mars appears red due to iron oxide.`;

const MALAYALAM_BLOCK = `Q1. ചുവന്ന ഗ്രഹം ഏതാണ്?
A) വenus
B) ചൊവ്വ
C) വ്യാഴം
D) ശനി
Answer: B
Explanation: ഇരുമ്പ് ഓക്സൈഡ് കാരണം ചൊവ്വ ചുവപ്പാണ്.`;

describe("question-parser", () => {
  it("parses a standard QCP block", () => {
    const parsed = parseSingleQuestion(ENGLISH_BLOCK);
    assert.equal(parsed.text, "Which planet is known as the Red Planet?");
    assert.equal(parsed.correct, "B");
    assert.equal(parsed.options[1].text, "Mars");
  });

  it("adds Q1 prefix when missing", () => {
    const parsed = parseSingleQuestion(
      `Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
Answer: B`
    );
    assert.ok(parsed);
    assert.equal(parsed.correct, "B");
  });

  it("splits bilingual paste on Malayalam marker", () => {
    const split = splitBilingualPaste(`${ENGLISH_BLOCK}\n--- Malayalam ---\n${MALAYALAM_BLOCK}`);
    assert.match(split.english, /Red Planet/);
    assert.match(split.malayalam, /ചുവന്ന ഗ്രഹം/);
  });

  it("auto mode fills english and malayalam", () => {
    const result = parseQuestionPaste(
      `${ENGLISH_BLOCK}\n--- Malayalam ---\n${MALAYALAM_BLOCK}`,
      { target: "auto" }
    );
    assert.equal(result.ok, true);
    assert.equal(result.english.correct, "B");
    assert.match(result.malayalam.text, /ചുവന്ന ഗ്രഹം/);
  });

  it("malayalam-only target ignores english requirement in other section", () => {
    const result = parseQuestionPaste(MALAYALAM_BLOCK, { target: "malayalam" });
    assert.equal(result.ok, true);
    assert.match(result.malayalam.text, /ചുവന്ന ഗ്രഹം/);
  });

  it("parses multiple blocks for bulk paste", () => {
    const bulk = `${ENGLISH_BLOCK}\n\nQ2. What is 2+2?\nA) Three\nB) Four\nC) Five\nD) Six\nAnswer: B`;
    const result = parseBulkQuestionPaste(bulk);
    assert.equal(result.ok, true);
    assert.equal(result.questions.length, 2);
    assert.match(result.questions[1].text, /2\+2/);
  });

  it("uses only first question when multiple blocks pasted", () => {
    const normalized = normalizeSingleQuestionPaste(`${ENGLISH_BLOCK}\n\nQ2. Second question?\nA) One\nB) Two\nC) Three\nD) Four\nAnswer: A`);
    assert.match(normalized, /^Q1\./);
    assert.doesNotMatch(normalized, /Q2\./);
  });
});
