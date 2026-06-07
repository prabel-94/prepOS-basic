export const DEFAULT_LEXICON_TOPIC = "vocabulary";

export const LEXICAL_CLASS_OPTIONS = Object.freeze([
  "ABSTRACT",
  "EMOTION",
  "STATE",
  "QUALITY",
  "ACTION",
  "OBJECT",
  "PLACE",
  "COLLECTIVE",
  "TITLE",
  "PERSON_NEUTRAL",
  "PERSON_MALE",
  "PERSON_FEMALE",
]);

/**
 * @param {string} word
 */
export function normalizeWordKey(word) {
  return String(word ?? "").trim().toLowerCase();
}

/**
 * @param {Array<{ word?: string }>} words
 */
export function validateGroupWords(words = []) {
  const messages = [];
  const filled = words.filter((entry) => normalizeWordKey(entry.word));

  if (!filled.length) {
    messages.push("Add at least one word.");
    return messages;
  }

  if (filled.length < 2) {
    messages.push("Synonym practice needs at least 2 words in a group.");
  }

  const keys = filled.map((entry) => normalizeWordKey(entry.word));
  if (new Set(keys).size !== keys.length) {
    messages.push("Remove duplicate words in this group.");
  }

  return messages;
}

/**
 * @param {Array<{ word?: string }>} words
 * @param {Record<string, object[]>} allGroups
 * @param {string|null} groupId
 */
export function validateGeneratorReadiness(words, allGroups, groupId = null) {
  const warnings = [];
  const filled = words.filter((entry) => normalizeWordKey(entry.word));

  if (filled.length < 2) {
    return warnings;
  }

  const otherWordCount = Object.entries(allGroups)
    .filter(([id]) => id !== groupId)
    .flatMap(([, entries]) => entries)
    .filter((entry) => normalizeWordKey(entry?.word)).length;

  if (otherWordCount < 3) {
    warnings.push(
      "Add at least 3 words in other groups for synonym distractors."
    );
  }

  return warnings;
}
