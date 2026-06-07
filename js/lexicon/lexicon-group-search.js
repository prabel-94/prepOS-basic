import {
  normalizeWordKey,
  getHeadwordLabel,
  inferGroupLexicalClass,
} from "../generators/shared/lexicon-utils.js";

export const LEXICON_GROUP_SEARCH_LIMIT = 50;

/**
 * @param {{ words?: Array<{ word?: string }|string> }} group
 */
export function collectGroupWords(group) {
  return (group.words ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.word))
    .filter(Boolean);
}

/**
 * @param {{ words?: Array<object>, default_lexical_class?: string }} group
 */
export function getGroupLexicalClass(group) {
  return group.default_lexical_class || inferGroupLexicalClass(group.words) || "";
}

/**
 * Higher score = better match. Returns -1 when query does not match.
 * @param {{ words?: Array<object>, default_lexical_class?: string }} group
 * @param {string} query
 */
export function scoreLexiconGroupMatch(group, query) {
  const normalizedQuery = normalizeWordKey(query);
  if (!normalizedQuery) {
    return 0;
  }

  const headword = getHeadwordLabel(group.words, "");
  const headKey = normalizeWordKey(headword);

  if (headKey.startsWith(normalizedQuery)) {
    return 100;
  }
  if (headKey.includes(normalizedQuery)) {
    return 80;
  }

  for (const word of collectGroupWords(group)) {
    if (normalizeWordKey(word) === headKey) {
      continue;
    }

    const wordKey = normalizeWordKey(word);
    if (wordKey.startsWith(normalizedQuery)) {
      return 60;
    }
    if (wordKey.includes(normalizedQuery)) {
      return 40;
    }
  }

  return -1;
}

/**
 * @param {{ words?: Array<object>, default_lexical_class?: string }} group
 * @param {string} [query]
 */
export function describeLexiconGroupRow(group, query = "") {
  const headword = getHeadwordLabel(group.words);
  const words = collectGroupWords(group);
  const relatedCount = Math.max(0, words.length - 1);
  const lexicalClass = getGroupLexicalClass(group);

  let matchNote = "";
  const normalizedQuery = normalizeWordKey(query);
  if (normalizedQuery) {
    const matchedRelated = words.find(
      (word) =>
        normalizeWordKey(word) !== normalizeWordKey(headword) &&
        normalizeWordKey(word).includes(normalizedQuery)
    );

    if (matchedRelated) {
      matchNote = `match in related: ${matchedRelated}`;
    }
  }

  const subtitleParts = [
    relatedCount ? `${relatedCount} related` : null,
    lexicalClass || null,
    matchNote || null,
  ].filter(Boolean);

  return {
    headword,
    relatedCount,
    lexicalClass,
    matchNote,
    subtitle: subtitleParts.join(" · "),
  };
}

/**
 * @param {Array<object>} groups
 * @param {{ query?: string, lexicalClass?: string, limit?: number, excludeGroupId?: string|null }} [options]
 */
export function filterLexiconGroups(groups = [], options = {}) {
  const {
    query = "",
    lexicalClass = "",
    limit = LEXICON_GROUP_SEARCH_LIMIT,
    excludeGroupId = null,
  } = options;

  let filtered = groups.filter((group) => group?.group_id);

  if (excludeGroupId) {
    filtered = filtered.filter((group) => group.group_id !== excludeGroupId);
  }

  if (lexicalClass) {
    filtered = filtered.filter(
      (group) => getGroupLexicalClass(group) === lexicalClass
    );
  }

  const trimmedQuery = String(query).trim();
  if (trimmedQuery) {
    filtered = filtered
      .map((group) => ({
        group,
        score: scoreLexiconGroupMatch(group, trimmedQuery),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return getHeadwordLabel(a.group.words).localeCompare(
          getHeadwordLabel(b.group.words)
        );
      })
      .map((entry) => entry.group);
  } else {
    filtered = [...filtered].sort((a, b) =>
      getHeadwordLabel(a.words).localeCompare(getHeadwordLabel(b.words))
    );
  }

  const totalMatches = filtered.length;
  const truncated = totalMatches > limit;
  const visibleGroups = filtered.slice(0, limit);

  return {
    groups: visibleGroups,
    totalMatches,
    truncated,
  };
}
