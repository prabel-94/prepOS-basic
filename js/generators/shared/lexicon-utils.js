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
 * Infer a group default from existing entry classes (mode, then first).
 * @param {Array<{ lexical_class?: string|null }>} words
 */
export function inferGroupLexicalClass(words = []) {
  const counts = new Map();

  for (const entry of words) {
    const lexicalClass = String(entry?.lexical_class ?? "").trim();
    if (!lexicalClass) {
      continue;
    }
    counts.set(lexicalClass, (counts.get(lexicalClass) ?? 0) + 1);
  }

  if (!counts.size) {
    return "";
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Apply the group's default class to every word entry.
 * @param {{ default_lexical_class?: string, words?: Array<object> }} group
 */
export function applyGroupLexicalClassToWords(group) {
  const lexicalClass = group.default_lexical_class || null;

  group.words = (group.words ?? []).map((entry) => ({
    ...entry,
    lexical_class: lexicalClass,
  }));
}

/**
 * @param {string} [selectedValue]
 * @param {{ selectClass?: string, id?: string, placeholder?: string }} [options]
 */
export function renderLexicalClassSelect(
  selectedValue = "",
  { selectClass = "lexical-class-select", id = "", placeholder = "Class (optional)" } = {}
) {
  const options = LEXICAL_CLASS_OPTIONS.map(
    (type) =>
      `<option value="${type}"${
        selectedValue === type ? " selected" : ""
      }>${type}</option>`
  ).join("");

  const idAttr = id ? ` id="${id}"` : "";

  return `
    <select class="${selectClass}"${idAttr}>
      <option value="">${placeholder}</option>
      ${options}
    </select>
  `;
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
