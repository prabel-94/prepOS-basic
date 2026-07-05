/**
 * Run: node --test js/core/question-parser-match-list.fixture.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSingleQuestion,
  parseBulkQuestionPaste,
  prepareQcpForParsing,
} from "./question-parser.js";

const MATCH_LIST_Q127 = `Q127. Match List I with List II:
List I
A. Whigs
B. Tories
C. Green Ribbon Club
D. James, Duke of York
List II
1. Hereditary succession
2. Exclusion from succession
3. Whig political mobilization
4. Catholic heir to the throne
Select the correct answer using the code below:
A) A-1, B-2, C-4, D-3
B) A-2, B-1, C-3, D-4
C) A-3, B-4, C-1, D-2
D) A-2, B-3, C-4, D-1
Answer: B
Explanation:
Core Fact:
The Whigs supported the exclusion of James from succession, while the Tories generally defended hereditary succession. The Green Ribbon Club was associated with Whig political mobilization, and James was the Catholic heir at the centre of the controversy.
Historical Significance:
These associations demonstrate how disputes over religion and succession contributed to the formation of organized political groups during the later Restoration period.
Exam Trap:
The Whigs and Tories should not be confused with Civil War factions. Their emergence as political groupings is closely associated with the Exclusion Crisis.`;

describe("question-parser match list", () => {
  it("parses match-list question with List I / List II stem", () => {
    const result = parseBulkQuestionPaste(MATCH_LIST_Q127);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].correct, "B");
    assert.match(result.questions[0].text, /Match List I with List II/);
    assert.match(result.questions[0].text, /A\. Whigs/);
    assert.match(result.questions[0].text, /1\. Hereditary succession/);
    assert.equal(result.questions[0].options[0].text, "A-1, B-2, C-4, D-3");
    assert.match(result.questions[0].explanation, /Core Fact/);
  });

  it("does not treat List I A. B. lines as MCQ options during normalize", () => {
    const prepared = prepareQcpForParsing(MATCH_LIST_Q127);
    assert.doesNotMatch(prepared, /\nQ128\./);
    const lines = prepared.split("\n");
    const listIWhigs = lines.find((line) => line.includes("A. Whigs"));
    assert.ok(listIWhigs, "List I entry should remain A. not A)");
  });

  it("parses with clean flag", () => {
    const result = parseBulkQuestionPaste(MATCH_LIST_Q127, { clean: true });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions[0].correct, "B");
  });
});
