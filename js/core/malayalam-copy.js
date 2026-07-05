/**
 * Copy English QCP + PrepOS Malayalam translation prompt for external AI workflows.
 */

import { serializeQuestionToQcp } from "./question-parser.js";

/**
 * Exact Malayalam shape required by question-parser.js for numbered-statement stems.
 * Internal 1. 2. 3. lines must stay inside the stem (before A)–D)); intro must match
 * STATEMENT_LIST_INTRO_REGEX in question-parser.js.
 */
export const NUMBERED_STATEMENT_MALAYALAM_FORMAT = `Numbered-statement questions (English stem contains lines starting with 1. 2. 3. before the options):
Use this layout so PrepOS can paste the Malayalam mask without breaking the block.

STRICT (must follow exactly):
Q<n>. <intro — see flexible wording below>
1. <first statement>
2. <second statement>
3. <third statement — add lines as needed; same count as English>
<closing question — see flexible wording below; omit only for arrange-only stems where options are sequences>
A) <option>
B) <option>
C) <option>
D) <option>
ഉത്തരം: <same letter as English Answer:>
വിശദീകരണം: <translation>

FLEXIBLE (wording is yours — translate naturally; do not copy verbatim):
• Intro line after Q<n>. — e.g. "… പ്രസ്താവനകൾ പരിഗണിക്കുക:" or any natural Malayalam that includes പരിഗണിക്കുക or പ്രസ്താവന (for statement lists), or ക്രമീകരിക്കുക (for arrange/chronology). Must end with : and stay on the same line as Q<n>. or continue the stem before 1.
• Closing question line before options — e.g. "മുകളിൽ നൽകിയിരിക്കുന്ന പ്രസ്താവനകളിൽ ശരിയായത് ഏത്?" — any natural Malayalam equivalent of the English closing question.

Example (illustrative wording only — intro and closing MAY differ in your output):
Q6. … പ്രസ്താവനകൾ പരിഗണിക്കുക:
1. …
2. …
മുകളിൽ നൽകിയിരിക്കുന്ന പ്രസ്താവനകളിൽ ശരിയായത് ഏത്?
A) 1 മാത്രം
B) 2 മാത്രം
C) 1 ഉം 2 ഉം
D) 1 ഉം 2 ഉം അല്ല
ഉത്തരം: C
വിശദീകരണം: …

Critical rules (strict):
- ONLY line 1 of the block uses Q<n>. — never label statements as Q2., Q3., etc.
- Every statement MUST stay on its own line starting with 1. then 2. then 3. (same count as English).
- ALL numbered lines and the closing question MUST appear before the first A) line.
- Do NOT insert blank lines between statements.
- Do NOT move statements into the explanation or options.
- Option lines MUST be exactly A) B) C) D) in order; labels MUST be ഉത്തരം: and വിശദീകരണം:.`;

export const MATCH_LIST_MALAYALAM_FORMAT = `Match-list questions (English stem contains "List I" / "List II" with A. B. rows and 1. 2. rows before the code options):
Use this layout so PrepOS can paste the Malayalam mask without breaking the block.

STRICT (must follow exactly):
Q<n>. <intro — flexible wording; see below>
List I
A. <item>
B. <item>
C. <item>
D. <item>
List II
1. <item>
2. <item>
3. <item>
4. <item>
<closing instruction — flexible wording>
A) <code option, e.g. A-1, B-2, C-4, D-3>
B) <code option>
C) <code option>
D) <code option>
ഉത്തരം: <same letter as English Answer:>
വിശദീകരണം: <translation>

FLEXIBLE (wording is yours — translate naturally):
• Intro line — e.g. "List I-നെ List II-മായി യോജിപ്പിക്കുക:" or any natural Malayalam match-list intro.
• Closing line before code options — e.g. "താഴെ നൽകിയിരിക്കുന്ന കോഡ് ഉപയോഗിച്ച് ശരിയായ ഉത്തരം തിരഞ്ഞെടുക്കുക:"

Critical rules (strict):
- Keep the headings "List I" and "List II" exactly (English labels).
- List I rows MUST use A. B. C. D. (period) — not A) B) C) D).
- List II rows MUST use 1. 2. 3. 4. on separate lines before the code options.
- ONLY the four code lines at the end use A) B) C) D) before ഉത്തരം:`;

export const MALAYALAM_TRANSLATION_PROMPT = `Translate the following question block into Malayalam using cognitive translation model we developed for prepOS.
Rules:
- Keep exact structure: Q1., A) B) C) D), then Answer: and Explanation:
- Use ഉത്തരം: instead of Answer: and വിശദീകരണം: instead of Explanation:
- Do NOT change the answer letter (e.g. if Answer: B, ഉത്തരം: must still be B)
- Do not add commentary — output only the translated block

${NUMBERED_STATEMENT_MALAYALAM_FORMAT}

${MATCH_LIST_MALAYALAM_FORMAT}

Output only the Malayalam block below, ready to paste back into PrepOS.`;

const NUMBERED_STATEMENT_LINE_REGEX = /^\d+[\.\)]\s+\S/;
const OPTION_LINE_REGEX = /^[A-D][\)\.\:\-]\s+/i;
const MATCH_LIST_STEM_REGEX = /match\s+list\s+i|list\s+i\b/i;

/** True when stem text has internal 1. / 2. lines before options (statement-list type). */
export function questionHasNumberedStatements(question = {}) {
  const text = String(
    question.text ?? question.question ?? question.question_text ?? ""
  ).trim();
  if (!text) {
    return false;
  }

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let sawNumbered = false;

  for (const line of lines) {
    if (OPTION_LINE_REGEX.test(line)) {
      break;
    }
    if (NUMBERED_STATEMENT_LINE_REGEX.test(line)) {
      sawNumbered = true;
    }
  }

  return sawNumbered;
}

/** True when stem is a List I / List II match question. */
export function questionHasMatchList(question = {}) {
  const text = String(
    question.text ?? question.question ?? question.question_text ?? ""
  ).trim();

  return MATCH_LIST_STEM_REGEX.test(text);
}

export const MALAYALAM_COPY_SEPARATOR = "---";

/**
 * @param {object|object[]} questions
 * @param {{ startIndex?: number }} [options]
 */
export function buildMalayalamTranslationCopyText(questions, { startIndex = 1 } = {}) {
  const list = Array.isArray(questions) ? questions : [questions];
  const blocks = list.map((question, offset) =>
    serializeQuestionToQcp(question, { index: startIndex + offset })
  );

  const statementIndexes = list
    .map((question, offset) =>
      questionHasNumberedStatements(question) ? startIndex + offset : null
    )
    .filter((index) => index !== null);

  const matchListIndexes = list
    .map((question, offset) =>
      questionHasMatchList(question) ? startIndex + offset : null
    )
    .filter((index) => index !== null);

  const formatNotes = [];

  if (statementIndexes.length > 0) {
    formatNotes.push(
      `IMPORTANT: ${statementIndexes.length > 1 ? "Questions" : "Question"} ${statementIndexes.join(", ")} ${statementIndexes.length > 1 ? "use" : "uses"} numbered statements inside the stem. Follow the numbered-statement Malayalam format for those block(s).`
    );
  }

  if (matchListIndexes.length > 0) {
    formatNotes.push(
      `IMPORTANT: ${matchListIndexes.length > 1 ? "Questions" : "Question"} ${matchListIndexes.join(", ")} ${matchListIndexes.length > 1 ? "are" : "is"} match-list (List I / List II) questions. Follow the match-list Malayalam format for those block(s).`
    );
  }

  const statementNote = formatNotes.length ? `${formatNotes.join("\n")}\n\n` : "";

  const body = blocks.join("\n\n");
  return `${MALAYALAM_TRANSLATION_PROMPT}\n\n${statementNote}${MALAYALAM_COPY_SEPARATOR}\n\n${body}`;
}

/**
 * @returns {Promise<{ ok: boolean, text: string }>}
 */
export async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, text };
    }
  } catch (_) {
    // fall through to legacy copy
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (copied) {
      return { ok: true, text };
    }
  } catch (_) {
    // manual fallback below
  }

  return { ok: false, text };
}

/**
 * @param {object|object[]} questions
 * @param {{ startIndex?: number }} [options]
 * @returns {Promise<{ ok: boolean, count: number, text: string }>}
 */
export async function copyMalayalamTranslationRequest(questions, options = {}) {
  const list = Array.isArray(questions) ? questions : [questions];
  const text = buildMalayalamTranslationCopyText(list, options);
  const result = await copyTextToClipboard(text);

  return {
    ok: result.ok,
    count: list.length,
    text: result.text,
  };
}
