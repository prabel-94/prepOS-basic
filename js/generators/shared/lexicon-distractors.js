function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

/**
 * @param {Array<{ word?: string }>} entries
 * @param {string[]} excludedWords
 */
export function uniqueEntriesByWord(entries, excludedWords = []) {
  const seen = new Set(excludedWords.filter(Boolean));
  const unique = [];

  shuffle([...entries]).forEach((entry) => {
    if (!entry?.word || seen.has(entry.word)) {
      return;
    }
    seen.add(entry.word);
    unique.push(entry);
  });

  return unique;
}

/**
 * @param {Record<string, Array<{ word?: string }>>} groups
 * @param {string[]} excludedGroupIds
 */
function buildExcludedWordList(groups, excludedGroupIds = [], excludedWords = []) {
  const blocked = new Set(excludedWords.filter(Boolean));

  for (const groupId of excludedGroupIds) {
    for (const entry of groups[groupId] || []) {
      if (entry?.word) {
        blocked.add(entry.word);
      }
    }
  }

  return [...blocked];
}

/**
 * Non-excluded groups that contain at least one word in the lexical class.
 * @param {Record<string, Array<{ lexical_class?: string|null }>>} groups
 * @param {string[]} excludedGroupIds
 * @param {string} lexicalClass
 */
function countGroupsWithLexicalClass(groups, excludedGroupIds, lexicalClass) {
  return Object.keys(groups).filter((groupId) => {
    if (excludedGroupIds.includes(groupId)) {
      return false;
    }

    return (groups[groupId] || []).some(
      (entry) => entry.lexical_class === lexicalClass
    );
  }).length;
}

/**
 * Distractors always come from groups outside excludedGroupIds.
 * @param {{
 *   groups: Record<string, Array<{ word?: string, lexical_class?: string|null }>>,
 *   excludedGroupIds?: string[],
 *   excludedWords?: string[],
 *   preferredLexicalClass?: string|null,
 *   count?: number,
 * }} options
 */
export function buildDistractors({
  groups,
  excludedGroupIds = [],
  excludedWords = [],
  preferredLexicalClass = null,
  count = 3,
}) {
  const blockedWords = buildExcludedWordList(
    groups,
    excludedGroupIds,
    excludedWords
  );

  const basePool = Object.keys(groups)
    .filter((groupId) => !excludedGroupIds.includes(groupId))
    .flatMap((groupId) => groups[groupId] || []);

  let filteredPool = basePool;

  if (preferredLexicalClass) {
    const sameClassPool = basePool.filter(
      (entry) => entry.lexical_class === preferredLexicalClass
    );
    const eligibleGroupCount = countGroupsWithLexicalClass(
      groups,
      excludedGroupIds,
      preferredLexicalClass
    );

    // Require multiple source groups so distractors are not all synonyms of each other.
    if (sameClassPool.length >= count && eligibleGroupCount >= 2) {
      filteredPool = sameClassPool;
    }
  }

  let distractors = uniqueEntriesByWord(filteredPool, blockedWords).slice(0, count);

  if (distractors.length < count) {
    const additional = uniqueEntriesByWord(
      basePool,
      [...blockedWords, ...distractors.map((entry) => entry.word)]
    ).slice(0, count - distractors.length);

    distractors = [...distractors, ...additional];
  }

  return distractors;
}
