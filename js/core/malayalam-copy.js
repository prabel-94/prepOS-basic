/**
 * Copy English QCP + PrepOS Malayalam translation prompt for external AI workflows.
 */

import { serializeQuestionToQcp } from "./question-parser.js";

export const MALAYALAM_TRANSLATION_PROMPT = `Translate the following question block into Malayalam using cognitive translation model we developed for prepOS.
Rules:
- Keep exact structure: Q1., A) B) C) D), then Answer: and Explanation:
- Use ഉത്തരം: instead of Answer: and വിശദീകരണം: instead of Explanation:
- Do NOT change the answer letter (e.g. if Answer: B, ഉത്തരം: must still be B)
- Do not add commentary — output only the translated block

Output only the Malayalam block below, ready to paste back into PrepOS.`;

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

  const body = blocks.join("\n\n");
  return `${MALAYALAM_TRANSLATION_PROMPT}\n\n${MALAYALAM_COPY_SEPARATOR}\n\n${body}`;
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
