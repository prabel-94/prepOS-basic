/**
 * MCQ-GP v2.1 / QFP v1.0 parser compliance fixtures.
 * Run: node --test js/core/question-parser-mcqgp-compliance.fixture.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBulkQuestionPaste,
  parseQuestionPaste,
} from "./question-parser.js";

const DIRECT_MCQ = `Q1. Which colony was founded at Jamestown in 1607?
A) Massachusetts
B) Virginia
C) Maryland
D) Pennsylvania
Answer: B
Explanation:
Core Fact:
Jamestown (1607) was the first permanent English settlement in North America, located in Virginia.
Historical Significance:
It marked the beginning of sustained English colonization.
Exam Trap:
Do not confuse Jamestown with Plymouth (1620).`;

const STATEMENT_MCQ = `Q2. Consider the following statements:
1. The Petition of Right was passed in 1628.
2. It abolished the monarchy.
Which of the following is correct?
A) 1 only
B) 2 only
C) Both 1 and 2
D) Neither 1 nor 2
Answer: A
Explanation:
Core Fact:
Statement 1 is correct; statement 2 is false.
Exam Trap:
The Petition limited royal power but did not abolish monarchy.`;

const CHRONOLOGY_MCQ = `Q3. Arrange the following events in chronological order:
1. Glorious Revolution
2. Petition of Right
3. Restoration of monarchy
4. Execution of Charles I
A) 2 – 4 – 3 – 1
B) 4 – 2 – 3 – 1
C) 2 – 3 – 4 – 1
D) 1 – 2 – 3 – 4
Answer: A
Explanation:
Core Fact:
Petition of Right (1628) precedes Charles I's execution (1649), Restoration (1660), and Glorious Revolution (1688).`;

const MATCH_LIST_MCQ = `Q4. Match List I with List II:
List I
A. Whigs
B. Tories
List II
1. Exclusion
2. Hereditary succession
Select the correct answer using the code below:
A) A-2, B-1
B) A-1, B-2
C) A-2, B-2
D) A-1, B-1
Answer: A
Explanation:
Core Fact:
Whigs favoured exclusion; Tories defended hereditary succession.`;

const PAIR_COUNT_MCQ = `Q5. Consider the following pairs:
1. Jamestown — 1607
2. Plymouth — 1620
3. Boston — 1630
How many pairs given above are correctly matched?
A) One
B) Two
C) Three
D) None
Answer: C
Explanation:
Core Fact:
All three pairs are correctly matched.`;

const MULTILINE_STEM = `Q6. The English Civil War involved multiple phases.
Parliamentary forces eventually prevailed.
Which outcome followed the war?
A) Absolute monarchy strengthened
B) Execution of Charles I
C) Spanish conquest of England
D) Dissolution of Parliament permanently
Answer: B
Explanation:
Core Fact:
Charles I was executed in 1649 after Parliamentary victory.`;

const MULTILINE_OPTIONS = `Q7. What was the significance of the Bill of Rights (1689)?
A) It established parliamentary supremacy
and limited royal prerogative
B) It abolished Parliament
C) It restored absolute monarchy
D) It ended the Glorious Revolution immediately
Answer: A
Explanation:
Core Fact:
The Bill of Rights affirmed parliamentary authority.`;

const ECP_EXPLANATION = `Q8. When was the Magna Carta signed?
A) 1066
B) 1215
C) 1415
D) 1517
Answer: B
Explanation:
Core Fact:
Magna Carta was sealed in 1215.
Historical Significance:
It limited royal authority and influenced constitutional development.
Exam Trap:
Do not confuse with Norman Conquest (1066).`;

const CONSECUTIVE_BATCH = `${DIRECT_MCQ}

${STATEMENT_MCQ}

${CHRONOLOGY_MCQ}`;

const MALAYALAM_MCQ = `Q9. ഇംഗ്ലീഷ് ആഭ്യന്തര യുദ്ധകാലത്തെ പ്യൂരിറ്റൻമാരെ സംബന്ധിച്ച് താഴെപ്പറയുന്ന പ്രസ്താവനകൾ പരിഗണിക്കുക:
1. അവർ പാർലമെന്റിനെ ശക്തമായി പിന്തുണച്ചു.
2. ആംഗ്ലിക്കൻ സഭയിലെ കത്തോലിക്കാ ശൈലിയിലുള്ള മതപരിഷ്കാരങ്ങളെ അവർ എതിർത്തു.
മുകളിൽ നൽകിയിരിക്കുന്ന പ്രസ്താവനകളിൽ ശരിയായത് ഏത്?
A) 1 മാത്രം
B) 2 മാത്രം
C) 1 ഉം 2 ഉം
D) 1 ഉം 2 ഉം അല്ല
ഉത്തരം: C
വിശദീകരണം: ചാൾസ് I-നുമായി ബന്ധപ്പെട്ട മതനയങ്ങളെ പ്യൂരിറ്റൻമാർ എതിർത്തതിനാൽ അവർ പാർലമെന്റിന്റെ പ്രധാന പിന്തുണക്കാരായി മാറി.`;

const UNICODE_PUNCTUATION = `Q10. The "Glorious Revolution" (1688–89) is often described as bloodless—yet it transformed England's constitutional balance.
Which development followed?
A) Restoration of the Stuarts
B) William and Mary accepted the throne
C) Abolition of Parliament
D) Spanish occupation
Answer: B
Explanation:
Core Fact:
William III and Mary II accepted the throne after James II fled.`;

function assertParsedBlock(result, { expectedCount = 1, correct, stemMatch, optionA, explanationMatch }) {
  assert.equal(result.ok, true, result.error || "parse failed");
  assert.equal(result.questions.length, expectedCount);
  const q = result.questions[0];
  if (stemMatch) assert.match(q.text, stemMatch);
  if (correct) assert.equal(q.correct, correct);
  if (optionA) assert.equal(q.options[0].text, optionA);
  if (explanationMatch) assert.match(q.explanation, explanationMatch);
  assert.equal(q.options.length, 4);
}

describe("MCQ-GP / QFP parser compliance fixtures", () => {
  it("parses direct retrieval MCQ with ECP explanation", () => {
    assertParsedBlock(parseBulkQuestionPaste(DIRECT_MCQ), {
      correct: "B",
      stemMatch: /Jamestown/,
      optionA: "Massachusetts",
      explanationMatch: /Core Fact/,
    });
  });

  it("parses statement-based MCQ with numbered stem lines", () => {
    assertParsedBlock(parseBulkQuestionPaste(STATEMENT_MCQ), {
      correct: "A",
      stemMatch: /Consider the following statements/,
    });
    assert.match(
      parseBulkQuestionPaste(STATEMENT_MCQ).questions[0].text,
      /1\. The Petition of Right/
    );
  });

  it("parses chronology / sequence MCQ", () => {
    assertParsedBlock(parseBulkQuestionPaste(CHRONOLOGY_MCQ), {
      correct: "A",
      stemMatch: /Arrange the following/,
    });
  });

  it("parses match-the-list MCQ", () => {
    assertParsedBlock(parseBulkQuestionPaste(MATCH_LIST_MCQ), {
      correct: "A",
      stemMatch: /Match List I with List II/,
      optionA: "A-2, B-1",
    });
  });

  it("parses how-many-pairs-correctly-matched MCQ", () => {
    assertParsedBlock(parseBulkQuestionPaste(PAIR_COUNT_MCQ), {
      correct: "C",
      stemMatch: /How many pairs given above are correctly matched/,
    });
  });

  it("parses multiline question stem", () => {
    assertParsedBlock(parseBulkQuestionPaste(MULTILINE_STEM), {
      correct: "B",
      stemMatch: /Parliamentary forces eventually prevailed/,
    });
  });

  it("documents multiline option limitation (only first line becomes option text)", () => {
    const result = parseBulkQuestionPaste(MULTILINE_OPTIONS);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions[0].options[0].text, "It established parliamentary supremacy");
    assert.doesNotMatch(result.questions[0].options[0].text, /royal prerogative/);
  });

  it("parses ECP-formatted multiline explanation with all headings", () => {
    const q = parseBulkQuestionPaste(ECP_EXPLANATION).questions[0];
    assert.match(q.explanation, /Core Fact/);
    assert.match(q.explanation, /Historical Significance/);
    assert.match(q.explanation, /Exam Trap/);
  });

  it("parses consecutive question blocks in bulk", () => {
    const result = parseBulkQuestionPaste(CONSECUTIVE_BATCH);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 3);
    assert.equal(result.questions[0].correct, "B");
    assert.equal(result.questions[1].correct, "A");
    assert.equal(result.questions[2].correct, "A");
  });

  it("parses English question via parseQuestionPaste", () => {
    const result = parseQuestionPaste(DIRECT_MCQ);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.english.correct, "B");
    assert.match(result.english.text, /Jamestown/);
  });

  it("parses Malayalam question with ഉത്തരം / വിശദീകരണം labels", () => {
    assertParsedBlock(parseBulkQuestionPaste(MALAYALAM_MCQ), {
      correct: "C",
      stemMatch: /പരിഗണിക്കുക/,
    });
  });

  it("parses mixed Unicode punctuation in stem", () => {
    assertParsedBlock(parseBulkQuestionPaste(UNICODE_PUNCTUATION), {
      correct: "B",
      stemMatch: /1688–89/,
    });
    assert.match(
      parseBulkQuestionPaste(UNICODE_PUNCTUATION).questions[0].text,
      /bloodless—yet/
    );
  });

  it("rejects non-compliant block missing Answer line", () => {
    const bad = `Q1. Test?
A) one
B) two
C) three
D) four`;
    const result = parseBulkQuestionPaste(bad);
    assert.equal(result.ok, false);
  });

  it("rejects non-compliant block with only three options", () => {
    const bad = `Q1. Test?
A) one
B) two
C) three
Answer: A`;
    const result = parseBulkQuestionPaste(bad);
    assert.equal(result.ok, false);
  });
});
