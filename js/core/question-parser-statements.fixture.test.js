/**
 * Run: node --test js/core/question-parser-statements.fixture.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBulkQuestionPaste,
  parseQuestionPaste,
  prepareQcpForParsing,
} from "./question-parser.js";

const Q6 = `Q6. ഇംഗ്ലീഷ് ആഭ്യന്തര യുദ്ധകാലത്തെ പ്യൂരിറ്റൻമാരെ സംബന്ധിച്ച് താഴെപ്പറയുന്ന പ്രസ്താവനകൾ പരിഗണിക്കുക:
1. അവർ പാർലമെന്റിനെ ശക്തമായി പിന്തുണച്ചു.
2. ആംഗ്ലിക്കൻ സഭയിലെ കത്തോലിക്കാ ശൈലിയിലുള്ള മതപരിഷ്കാരങ്ങളെ അവർ എതിർത്തു.
മുകളിൽ നൽകിയിരിക്കുന്ന പ്രസ്താവനകളിൽ ശരിയായത് ഏത്?
A) 1 മാത്രം
B) 2 മാത്രം
C) 1 ഉം 2 ഉം
D) 1 ഉം 2 ഉം അല്ല
ഉത്തരം: C
വിശദീകരണം: ചാൾസ് I-നുമായി ബന്ധപ്പെട്ട മതനയങ്ങളെ പ്യൂരിറ്റൻമാർ എതിർത്തതിനാൽ അവർ പാർലമെന്റിന്റെ പ്രധാന പിന്തുണക്കാരായി മാറി.`;

const Q8 = `Q8. മാഗ്ന കാർട്ടയെ സംബന്ധിച്ച് താഴെപ്പറയുന്ന പ്രസ്താവനകൾ പരിഗണിക്കുക:
1. ഇത് രാജാവ് ജോണിന്റെ ഭരണകാലത്ത് ഒപ്പുവെക്കപ്പെട്ടു.
2. ഇത് സാർവത്രിക പ്രായപൂർത്തി വോട്ടവകാശം സ്ഥാപിച്ചു.
3. ഇത് നിയമവാഴ്ചയുടെ അടിത്തറ പാകി.
4. ഇത് രാജാവിന്റെ സ്വേച്ഛാധിപത്യ അധികാരങ്ങൾക്ക് നിയന്ത്രണം ഏർപ്പെടുത്തി.
മുകളിൽ നൽകിയിരിക്കുന്ന പ്രസ്താവനകളിൽ ശരിയായത് ഏവ?
A) 1 ഉം 2 ഉം മാത്രം
B) 1, 3, 4 മാത്രം
C) 2 ഉം 3 ഉം മാത്രം
D) 1, 2, 3, 4
ഉത്തരം: B
വിശദീകരണം: പ്രസ്താവനകൾ 1, 3, 4 ശരിയാണ്.`;

const Q10 = `Q10. താഴെപ്പറയുന്ന സംഭവങ്ങൾ കാലക്രമത്തിൽ ക്രമീകരിക്കുക:
1. ചാൾസ് I-ന്റെ വധശിക്ഷ
2. പെറ്റിഷൻ ഓഫ് റൈറ്റ്
3. ഗ്ലോറിയസ് റെവല്യൂഷൻ
4. രാജവാഴ്ചയുടെ പുനഃസ്ഥാപനം
A) 2 – 1 – 4 – 3
B) 1 – 2 – 4 – 3
C) 2 – 4 – 1 – 3
D) 1 – 4 – 2 – 3
ഉത്തരം: A
വിശദീകരണം: പെറ്റിഷൻ ഓഫ് റൈറ്റ് ആഭ്യന്തര യുദ്ധത്തിന് മുമ്പായിരുന്നു.`;

describe("question-parser numbered statements", () => {
  it("parses Q6 with two numbered statements inside stem", () => {
    const result = parseBulkQuestionPaste(Q6);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 1);
    assert.match(result.questions[0].text, /പരിഗണിക്കുക/);
    assert.match(result.questions[0].text, /1\. അവർ പാർലമെന്റിനെ/);
    assert.match(result.questions[0].text, /2\. ആംഗ്ലിക്കൻ/);
    assert.equal(result.questions[0].correct, "C");
  });

  it("parses Q8 with four numbered statements inside stem", () => {
    const result = parseBulkQuestionPaste(Q8);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 1);
    assert.match(result.questions[0].text, /4\. ഇത് രാജാവിന്റെ/);
    assert.equal(result.questions[0].correct, "B");
  });

  it("parses Q10 with numbered chronology items inside stem", () => {
    const result = parseBulkQuestionPaste(Q10);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 1);
    assert.match(result.questions[0].text, /ക്രമീകരിക്കുക/);
    assert.equal(result.questions[0].correct, "A");
  });

  it("does not convert internal statement numbers to Q blocks", () => {
    const prepared = prepareQcpForParsing(Q6);
    assert.doesNotMatch(prepared, /\nQ1\./);
    assert.doesNotMatch(prepared, /\nQ2\./);
  });

  it("does not convert statement 4 to Q4 when deep clean is enabled", () => {
    const prepared = prepareQcpForParsing(Q8, { deepClean: true });
    assert.doesNotMatch(prepared, /\nQ4\./);
    assert.match(prepared, /4\. ഇത് രാജാവിന്റെ/);
  });

  it("parses Q8 with four statements after deep clean", () => {
    const result = parseBulkQuestionPaste(Q8, { clean: true });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 1);
    assert.match(result.questions[0].text, /പരിഗണിക്കുക/);
    assert.match(result.questions[0].text, /1\. ഇത് രാജാവ് ജോണിന്റെ/);
    assert.match(result.questions[0].text, /4\. ഇത് രാജാവിന്റെ/);
    assert.equal(result.questions[0].correct, "B");
  });
});
