/**
 * Canonical question-bank content hash.
 * Must match save_question_to_bank:
 *   lower(trim(question_text || option_a || option_b || option_c || option_d))
 */

export function normalizeQuestionHashInput(questionText, optionTexts = []) {
  const options = optionTexts.map(text => String(text ?? "").trim());

  return (
    String(questionText ?? "").trim() +
    options.join("")
  ).toLowerCase();
}

export async function computeQuestionHash(questionText, optionTexts = []) {
  const normalized = normalizeQuestionHashInput(questionText, optionTexts);
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}
