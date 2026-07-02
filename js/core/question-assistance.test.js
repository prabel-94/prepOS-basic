/**
 * Run: node --test js/core/question-assistance.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMalayalamAssistanceHash,
  getMlVariantVerificationRecord,
  hasMalayalamAssistance,
  malayalamAssistanceToMetadataPayload,
  ML_VARIANT_VERIFICATION_KEY,
  normalizeMalayalamAssistanceForHash,
  pruneMalayalamAssistance,
  resolveQuestionDisplay,
  enrichQuestionMalayalamVerification,
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

  it("normalizes Malayalam assistance for stable hashing", () => {
    const normalized = normalizeMalayalamAssistanceForHash({
      text: " Stem ",
      options: { A: " One ", B: "Two", C: "", D: "" },
      explanation: " Note ",
    });

    assert.equal(normalized, "stemonetwonote");
  });

  it("computes Malayalam assistance hash", async () => {
    const payload = malayalamAssistanceToMetadataPayload(question);
    const hash = await computeMalayalamAssistanceHash(payload);

    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(await computeMalayalamAssistanceHash(payload), hash);
  });

  it("reads Malayalam verification record from question metadata", () => {
    const record = getMlVariantVerificationRecord({
      question_metadata: [
        {
          key: ML_VARIANT_VERIFICATION_KEY,
          value: {
            content_hash: "abc123",
            verified_at: "2026-06-26T00:00:00.000Z",
            verified_by: "user-1",
          },
        },
      ],
    });

    assert.equal(record.content_hash, "abc123");
    assert.equal(record.verified_by, "user-1");
  });

  it("enriches Malayalam verification flags from matching hash", async () => {
    const payload = malayalamAssistanceToMetadataPayload(question);
    const contentHash = await computeMalayalamAssistanceHash(payload);

    const verifiedQuestion = {
      ...question,
      mlVerificationRecord: {
        content_hash: contentHash,
        verified_at: "2026-06-26T00:00:00.000Z",
        verified_by: "user-1",
      },
    };

    await enrichQuestionMalayalamVerification(verifiedQuestion);
    assert.equal(verifiedQuestion._mlHasContent, true);
    assert.equal(verifiedQuestion._mlVerified, true);
    assert.equal(verifiedQuestion._mlNeedsReview, false);
  });

  it("flags stale Malayalam verification when content changes", async () => {
    const staleQuestion = {
      ...question,
      mlVerificationRecord: {
        content_hash: "stale-hash",
        verified_at: "2026-06-26T00:00:00.000Z",
        verified_by: "user-1",
      },
    };

    await enrichQuestionMalayalamVerification(staleQuestion);
    assert.equal(staleQuestion._mlHasContent, true);
    assert.equal(staleQuestion._mlVerified, false);
    assert.equal(staleQuestion._mlNeedsReview, true);
  });
});
