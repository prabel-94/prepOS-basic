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
 * @param {Array<{ word?: string, is_headword?: boolean }>} words
 * @returns {{ word?: string, is_headword?: boolean } | null}
 */
export function getHeadwordEntry(words = []) {
  const flagged = words.find(
    (entry) => entry?.is_headword && normalizeWordKey(entry.word)
  );
  if (flagged) {
    return flagged;
  }

  return words.find((entry) => normalizeWordKey(entry.word)) ?? null;
}

/**
 * @param {Array<{ word?: string, is_headword?: boolean }>} words
 * @param {string} [fallback]
 */
export function getHeadwordLabel(words = [], fallback = "(empty)") {
  const headword = getHeadwordEntry(words);
  const label = String(headword?.word ?? "").trim();
  return label || fallback;
}

/**
 * First word in a group is always the headword.
 * @param {Array<object>} words
 */
export function applyHeadwordFlags(words = []) {
  return words.map((entry, index) => ({
    ...entry,
    is_headword: index === 0,
  }));
}

/**
 * @param {Array<{ is_headword?: boolean }>} words
 */
export function sortWordsWithHeadwordFirst(words = []) {
  const headwordIndex = words.findIndex((entry) => entry?.is_headword);
  if (headwordIndex <= 0) {
    return words;
  }

  const sorted = [...words];
  const [headword] = sorted.splice(headwordIndex, 1);
  sorted.unshift(headword);
  return sorted;
}

export const HEADWORD_FAMILIARITY = Object.freeze({
  minSeen: 3,
  maxErrorRate: 0.34,
});

/**
 * @param {{ seen_count?: number, wrong_count?: number }|null|undefined} stat
 * @param {{ minSeen?: number, maxErrorRate?: number }} [options]
 */
export function isHeadwordFamiliar(
  stat,
  {
    minSeen = HEADWORD_FAMILIARITY.minSeen,
    maxErrorRate = HEADWORD_FAMILIARITY.maxErrorRate,
  } = {}
) {
  if (!stat || (stat.seen_count ?? 0) < minSeen) {
    return false;
  }

  const seen = stat.seen_count ?? 0;
  const wrong = stat.wrong_count ?? 0;
  return wrong / seen <= maxErrorRate;
}

/**
 * @template T
 * @param {T[]} entries
 * @param {number} [count]
 * @returns {T[]}
 */
export function pickRandomEntries(entries = [], count = 1) {
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Synonym prompt: random in normal mode; headword until familiar when adaptive.
 * @param {Array<{ id?: string, word?: string, is_headword?: boolean }>} words
 * @param {{ adaptive?: boolean, statsByWordId?: Map<string, { seen_count?: number, wrong_count?: number }> }} [options]
 */
export function selectSynonymPromptEntry(
  words = [],
  { adaptive = false, statsByWordId = null } = {}
) {
  const filled = words.filter((entry) => normalizeWordKey(entry.word));
  if (!filled.length) {
    return null;
  }

  if (!adaptive) {
    return pickRandomEntries(filled, 1)[0] ?? null;
  }

  const headword = getHeadwordEntry(filled);
  if (!headword) {
    return pickRandomEntries(filled, 1)[0] ?? null;
  }

  const headwordStat = headword.id ? statsByWordId?.get(headword.id) : null;
  if (isHeadwordFamiliar(headwordStat)) {
    return pickRandomEntries(filled, 1)[0] ?? null;
  }

  return headword;
}

/**
 * @param {Array<object>} words
 * @param {number} wordIndex
 */
export function promoteWordToHeadword(words = [], wordIndex = 0) {
  if (wordIndex <= 0 || wordIndex >= words.length) {
    return applyHeadwordFlags(words);
  }

  const next = [...words];
  [next[0], next[wordIndex]] = [next[wordIndex], next[0]];
  return applyHeadwordFlags(next);
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
    messages.push("Add a primary word.");
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
