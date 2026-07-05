/**
 * Run: node --test js/core/question-parser-match-list-ml.fixture.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBulkQuestionPaste, parseQuestionPaste } from "./question-parser.js";

const MATCH_LIST_ML = `Q127. List I-നെ List II-മായി യോജിപ്പിക്കുക:
List I
A. Whigs
B. Tories
C. Green Ribbon Club
D. James, Duke of York
List II
1. പാരമ്പര്യ പിന്തുടർച്ച
2. സിംഹാസനാവകാശത്തിൽ നിന്ന് ഒഴിവാക്കൽ
3. Whig രാഷ്ട്രീയ സംഘാടനം
4. സിംഹാസനത്തിന്റെ കത്തോലിക്കാ അവകാശി
താഴെ നൽകിയിരിക്കുന്ന കോഡ് ഉപയോഗിച്ച് ശരിയായ ഉത്തരം തിരഞ്ഞെടുക്കുക:
A) A-1, B-2, C-4, D-3
B) A-2, B-1, C-3, D-4
C) A-3, B-4, C-1, D-2
D) A-2, B-3, C-4, D-1
ഉത്തരം: B
വിശദീകരണം:
അടിസ്ഥാന വസ്തുത:
James-നെ സിംഹാസനാവകാശത്തിൽ നിന്ന് ഒഴിവാക്കുന്നതിനെ Whigs പിന്തുണച്ചപ്പോൾ Tories പൊതുവേ പാരമ്പര്യ പിന്തുടർച്ചയെ പിന്തുണച്ചു. Green Ribbon Club Whig രാഷ്ട്രീയ സംഘാടനവുമായി ബന്ധപ്പെട്ടിരുന്നു; വിവാദത്തിന്റെ കേന്ദ്രത്തിലുണ്ടായിരുന്ന കത്തോലിക്കാ സിംഹാസനാവകാശിയായിരുന്നു James.
ചരിത്രപരമായ പ്രാധാന്യം:
മതത്തെയും രാജകീയ പിന്തുടർച്ചയെയും സംബന്ധിച്ച തർക്കങ്ങൾ Restoration കാലത്തിന്റെ പിൽക്കാലഘട്ടത്തിൽ സംഘടിത രാഷ്ട്രീയ വിഭാഗങ്ങളുടെ രൂപീകരണത്തിന് എങ്ങനെ കാരണമായെന്ന് ഈ ബന്ധങ്ങൾ വ്യക്തമാക്കുന്നു.
പരീക്ഷാ കെണി:
Whigs-നെയും Tories-നെയും Civil War കാലത്തെ വിഭാഗങ്ങളുമായി ആശയക്കുഴപ്പത്തിലാക്കരുത്. രാഷ്ട്രീയ വിഭാഗങ്ങളെന്ന നിലയിലുള്ള അവരുടെ ഉദയം Exclusion Crisis-മായി അടുത്ത് ബന്ധപ്പെട്ടിരിക്കുന്നു.`;

describe("question-parser match list malayalam", () => {
  it("parses Malayalam match-list bulk paste", () => {
    const result = parseBulkQuestionPaste(MATCH_LIST_ML);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].correct, "B");
    assert.match(result.questions[0].text, /List I-നെ List II-മായി/);
    assert.match(result.questions[0].text, /A\. Whigs/);
    assert.equal(result.questions[0].options[1].text, "A-2, B-1, C-3, D-4");
    assert.match(result.questions[0].explanation, /അടിസ്ഥാന വസ്തുത/);
  });

  it("parses Malayalam match-list single paste target", () => {
    const result = parseQuestionPaste(MATCH_LIST_ML, { target: "malayalam" });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.malayalam.correct, "B");
  });

  it("parses Malayalam match-list with clean flag", () => {
    const result = parseBulkQuestionPaste(MATCH_LIST_ML, { clean: true });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.questions[0].correct, "B");
  });
});
