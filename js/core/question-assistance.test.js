/**
 * Run: node --test js/core/question-assistance.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasMalayalamAssistance,
  malayalamAssistanceToMetadataPayload,
  resolveQuestionDisplay,
  pruneMalayalamAssistance,
} from "./question-assistance.js";

describe("question-assistance", () => {
  const question = {
    text: "English stem?",
    options: [
      { id: "A", text: "One" },
      { id: "B", text: "Two" },
    ],
    correct: "A",
    explanation: "English explanation",
    assistance: {
      malayalam: {
        text: "മലയാളം ചോദ്യം?",
        options: { A: "ഒന്ന്", B: "രണ്ട്" },
        explanation: "മലയാളം വിശദീകരണം",
      },
    },
  };

  it("detects Malayalam assistance content", () => {
    assert.equal(hasMalayalamAssistance(question), true);
    assert.equal(hasMalayalamAssistance({ text: "Only English" }), false);
  });

  it("keeps English when mask is off", () => {
    const display = resolveQuestionDisplay(question, false);
    assert.equal(display.text, "English stem?");
    assert.equal(display.options[0].text, "One");
  });

  it("applies Malayalam mask without changing entity identity fields", () => {
    const display = resolveQuestionDisplay(question, true);
    assert.equal(display.text, "മലയാളം ചോദ്യം?");
    assert.equal(display.options[0].text, "ഒന്ന്");
    assert.equal(display.explanation, "മലയാളം വിശദീകരണം");
    assert.equal(question.correct, "A");
  });

  it("falls back per field when mask partial", () => {
    const partial = {
      ...question,
      assistance: {
        malayalam: {
          text: "മലയാളം മാത്രം",
          options: { A: "", B: "" },
          explanation: "",
        },
      },
    };

    const display = resolveQuestionDisplay(partial, true);
    assert.equal(display.text, "മലയാളം മാത്രം");
    assert.equal(display.options[0].text, "One");
  });

  it("prunes empty assistance", () => {
    const empty = { text: "Q", assistance: { malayalam: { text: "", options: {}, explanation: "" } } };
    pruneMalayalamAssistance(empty);
    assert.equal(empty.assistance, undefined);
  });

  it("builds bank metadata payload from assistance mask", () => {
    const payload = malayalamAssistanceToMetadataPayload(question);
    assert.equal(payload.text, "മലയാളം ചോദ്യം?");
    assert.equal(payload.options.A, "ഒന്ന്");
  });
});
