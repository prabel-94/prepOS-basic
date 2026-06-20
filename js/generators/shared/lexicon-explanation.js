/**
 * Computed practice explanations for lexicon generator questions.
 * Malayalam-first copy; no DB storage required.
 */

function normalizeWord(value = "") {
  return String(value ?? "").trim();
}

function collectSiblingWords(words = [], exclude = []) {
  const excluded = new Set(
    exclude.map((word) => normalizeWord(word).toLowerCase()).filter(Boolean)
  );
  const siblings = [];

  for (const entry of words) {
    const word = normalizeWord(typeof entry === "string" ? entry : entry?.word);
    if (!word) {
      continue;
    }

    const key = word.toLowerCase();
    if (excluded.has(key)) {
      continue;
    }

    if (!siblings.some((item) => item.toLowerCase() === key)) {
      siblings.push(word);
    }
  }

  return siblings;
}

function buildWhyLine(pattern, promptWord, correctWord) {
  if (pattern === "SYNONYM") {
    return `${promptWord} എന്ന വാക്കിന്റെ പര്യായം ${correctWord} ആണ്.`;
  }

  if (pattern === "OPPOSITE_WORD") {
    return `${promptWord} എന്ന വാക്കിന്റെ വിരുദ്ധം ${correctWord} ആണ്.`;
  }

  return "";
}

function buildCompactLine(pattern, promptWord, correctWord) {
  if (pattern === "SYNONYM") {
    return `${correctWord} — ${promptWord} യുടെ പര്യായം.`;
  }

  if (pattern === "OPPOSITE_WORD") {
    return `${correctWord} — ${promptWord} ന്റെ വിരുദ്ധം.`;
  }

  return "";
}

/**
 * @param {{
 *   pattern: "SYNONYM" | "OPPOSITE_WORD",
 *   promptWord: string,
 *   correctWord: string,
 *   groupWords?: Array<string | { word?: string }>,
 *   relatedGroupWords?: Array<string | { word?: string }>,
 * }} params
 */
export function buildMalayalamLexiconExplanation({
  pattern,
  promptWord,
  correctWord,
  groupWords = [],
  relatedGroupWords = [],
} = {}) {
  const prompt = normalizeWord(promptWord);
  const correct = normalizeWord(correctWord);

  if (!prompt || !correct || !pattern) {
    return { explanation: "", explanationMeta: null };
  }

  const siblings = collectSiblingWords(groupWords, [prompt, correct]);
  const relatedWords =
    pattern === "OPPOSITE_WORD"
      ? collectSiblingWords(relatedGroupWords, [correct])
      : [];

  const why = buildWhyLine(pattern, prompt, correct);
  const compact = buildCompactLine(pattern, prompt, correct);

  return {
    explanation: why,
    explanationMeta: {
      pattern,
      promptWord: prompt,
      correctWord: correct,
      why,
      compact,
      siblings,
      relatedWords,
    },
  };
}
