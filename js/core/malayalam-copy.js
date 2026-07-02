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

export const MALAYALAM_TRANSLATION_PROMPT = `Translate the following question block into Malayalam using cognitive translation model we developed for prepOS.
Rules:
- Keep exact structure: Q1., A) B) C) D), then Answer: and Explanation:
- Use ഉത്തരം: instead of Answer: and വിശദീകരണം: instead of Explanation:
- Do NOT change the answer letter (e.g. if Answer: B, ഉത്തരം: must still be B)
- Do not add commentary — output only the translated block

${NUMBERED_STATEMENT_MALAYALAM_FORMAT}

Output only the Malayalam block below, ready to paste back into PrepOS.`;

const NUMBERED_STATEMENT_LINE_REGEX = /^\d+[\.\)]\s+\S/;
const OPTION_LINE_REGEX = /^[A-D][\)\.\:\-]\s+/i;

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

  const statementNote =
    statementIndexes.length > 0
      ? `IMPORTANT: ${statementIndexes.length > 1 ? "Questions" : "Question"} ${statementIndexes.join(", ")} ${statementIndexes.length > 1 ? "use" : "uses"} numbered statements inside the stem. Follow the numbered-statement Malayalam format exactly for those block(s).\n\n`
      : "";

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
