import {
  fetchGroups,
  buildQuestion,
  DEFAULT_LEXICON_TOPIC,
  getUserWordStatsByWordId,
} from "./shared/lexicon-engine.js";
import {
  getHeadwordEntry,
  normalizeWordKey,
  selectSynonymPromptEntry,
} from "./shared/lexicon-utils.js";
import { getClient } from "../core/get-client.js";
const DEFAULT_ADAPTIVE_MODE = true;

/* =========================================
ENGLISH GENERATOR
========================================= */

export async function runEnglishGenerator(config) {
  const topic = config.topic || DEFAULT_LEXICON_TOPIC;
  const groups = await fetchGroups("en", { topic });

  switch (config.pattern) {
    case "SYNONYM":
      return [await generateSynonym(groups, config)];

    case "OPPOSITE_WORD":
      return [await generateOpposite(groups, config)];

    default:
      return [];
  }
}

/* =========================================
Errors
========================================= */

function createGeneratorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/* =========================================
Relations
========================================= */

async function fetchOppositeRelations() {
  const sb = await getClient();
  const { data, error } = await sb
    .from("lexicon_group_relations")
    .select("group_id_1, group_id_2, relation_type");

  if (error) {
    console.error("Relation fetch error:", error);
    throw createGeneratorError(
      "RELATION_FETCH_FAILED",
      "Unable to load opposite-word links right now."
    );
  }

  const antonymRelations = (data || []).filter(row => {
    return !row.relation_type || row.relation_type === "ANTONYM";
  });

  if (!antonymRelations.length) {
    throw createGeneratorError(
      "OPPOSITE_RELATIONS_MISSING",
      "Opposite-word practice needs linked opposite groups in the lexicon manager."
    );
  }

  return antonymRelations;
}

/* =========================================
Adaptive Stats
========================================= */

async function getUserWordStatsMap() {
  const userId = window.currentUser?.id;
  if (!userId) return {};

  const sb = await getClient();
  const { data } = await sb
    .from("user_lexicon_word_stats")
    .select(`
      word_id,
      seen_count,
      wrong_count,
      lexicon_entries!user_lexicon_word_stats_word_id_fkey(word)
    `)
    .eq("user_id", userId);

  const map = {};

  (data || []).forEach(row => {
    const seen = row.seen_count || 0;
    const wrong = row.wrong_count || 0;
    const weakness = seen === 0 ? 1 : wrong / seen;
    const word =
      Array.isArray(row.lexicon_entries)
        ? row.lexicon_entries[0]?.word
        : row.lexicon_entries?.word;

    if (word) {
      map[word] = weakness;
    }
  });

  return map;
}

/* =========================================
Utils
========================================= */

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function pickRandom(arr, count) {
  return shuffle([...arr]).slice(0, count);
}

function getAdaptiveMode(config = {}) {
  if (typeof config.adaptive === "boolean") {
    return config.adaptive;
  }

  return DEFAULT_ADAPTIVE_MODE;
}

function getGroupWords(groups, groupId) {
  return (groups[groupId] || []).map(entry => entry.word);
}

function uniqueEntriesByWord(entries, excludedWords = []) {
  const seen = new Set(excludedWords);
  const unique = [];

  shuffle([...entries]).forEach(entry => {
    if (!entry?.word || seen.has(entry.word)) return;
    seen.add(entry.word);
    unique.push(entry);
  });

  return unique;
}

function buildDistractors({
  groups,
  excludedGroupIds = [],
  excludedWords = [],
  count = 3
}) {
  const pool = Object.keys(groups)
    .filter(groupId => !excludedGroupIds.includes(groupId))
    .flatMap(groupId => groups[groupId]);

  let distractors = uniqueEntriesByWord(pool, excludedWords).slice(0, count);

  if (distractors.length < count) {
    const fallbackPool = Object.values(groups).flat();
    distractors = uniqueEntriesByWord(fallbackPool, excludedWords).slice(0, count);
  }

  if (distractors.length < count) {
    throw createGeneratorError(
      "INSUFFICIENT_DISTRACTORS",
      "Not enough distinct words are available to build this practice question."
    );
  }

  return distractors;
}

/* =========================================
Group Selection
========================================= */

async function selectGroup(groups, adaptiveMode) {
  const keys = Object.keys(groups);

  const valid = keys.filter(groupId => {
    const own = groups[groupId] || [];
    const others = keys
      .filter(id => id !== groupId)
      .flatMap(id => groups[id] || []);

    return own.length >= 2 && uniqueEntriesByWord(others).length >= 3;
  });

  if (!valid.length) {
    return null;
  }

  if (!adaptiveMode) {
    return pickRandom(valid, 1)[0];
  }

  const stats = await getUserWordStatsMap();

  if (!Object.keys(stats).length) {
    return pickRandom(valid, 1)[0];
  }

  const scored = valid.map(groupId => {
    const words = getGroupWords(groups, groupId);
    const avg =
      words.reduce((sum, word) => sum + (stats[word] ?? 1), 0) /
      words.length;

    return { groupId, score: avg };
  });

  scored.sort((a, b) => b.score - a.score);

  return pickRandom(scored.slice(0, 5), 1)[0].groupId;
}

/* =========================================
SYNONYM GENERATOR
========================================= */

async function generateSynonym(groups, config = {}) {
  const groupId = await selectGroup(groups, getAdaptiveMode(config));

  if (!groupId) {
    throw createGeneratorError(
      "INSUFFICIENT_LEXICON_DATA",
      "Add at least two related words in one group and three distractor words in other groups."
    );
  }

  const words = groups[groupId];
  const adaptive = getAdaptiveMode(config);
  const statsByWordId = adaptive ? await getUserWordStatsByWordId() : null;
  const questionEntry = selectSynonymPromptEntry(words, {
    adaptive,
    statsByWordId,
  });

  if (!questionEntry) {
    throw createGeneratorError(
      "INSUFFICIENT_LEXICON_DATA",
      "Add a primary word and at least one related word in the group."
    );
  }

  const correctEntry = pickRandom(
    words.filter(
      (entry) =>
        normalizeWordKey(entry.word) !== normalizeWordKey(questionEntry.word)
    ),
    1
  )[0];

  const distractors = buildDistractors({
    groups,
    excludedGroupIds: [groupId],
    excludedWords: [questionEntry.word, correctEntry.word],
    count: 3
  });

  const options = shuffle([
    correctEntry.word,
    ...distractors.map(entry => entry.word)
  ]);

  return buildQuestion({
    text: `Which word is closest in meaning to "${questionEntry.word}"?`,
    options,
    correctIndex: options.indexOf(correctEntry.word),
    pattern: "SYNONYM",
    difficulty: { score: 2, label: "easy" },
    topics: ["ENGLISH", "VOCABULARY", "SYNONYM"],
    tracking: {
      promptEntryIds: [questionEntry.id],
      correctEntryIds: [correctEntry.id]
    }
  });
}

/* =========================================
OPPOSITE GENERATOR
========================================= */

async function generateOpposite(groups, _config = {}) {
  const relations = await fetchOppositeRelations();

  const adjacency = {};

  relations.forEach(row => {
    if (!groups[row.group_id_1] || !groups[row.group_id_2]) return;

    adjacency[row.group_id_1] ||= [];
    adjacency[row.group_id_2] ||= [];

    adjacency[row.group_id_1].push(row.group_id_2);
    adjacency[row.group_id_2].push(row.group_id_1);
  });

  const linkedGroupIds = Object.keys(adjacency).filter(groupId => {
    return (
      (groups[groupId] || []).length > 0 &&
      (adjacency[groupId] || []).some(linkedId => (groups[linkedId] || []).length > 0)
    );
  });

  if (!linkedGroupIds.length) {
    throw createGeneratorError(
      "OPPOSITE_RELATIONS_INVALID",
      "Opposite-word links exist, but they do not connect to usable word groups yet."
    );
  }

  const baseGroupId = pickRandom(linkedGroupIds, 1)[0];
  const oppositeCandidates = (adjacency[baseGroupId] || []).filter(groupId => {
    return (groups[groupId] || []).length > 0;
  });

  if (!oppositeCandidates.length) {
    throw createGeneratorError(
      "OPPOSITE_RELATIONS_INVALID",
      "The selected word group does not have a usable opposite group yet."
    );
  }

  const oppositeGroupId = pickRandom(oppositeCandidates, 1)[0];
  const baseWords = groups[baseGroupId];
  const oppositeWords = groups[oppositeGroupId];

  const stemEntry = getHeadwordEntry(baseWords) ?? pickRandom(baseWords, 1)[0];
  const correctEntry = getHeadwordEntry(oppositeWords) ?? pickRandom(oppositeWords, 1)[0];

  const distractors = buildDistractors({
    groups,
    excludedGroupIds: [baseGroupId, oppositeGroupId],
    excludedWords: [stemEntry.word, correctEntry.word],
    count: 3
  });

  const options = shuffle([
    correctEntry.word,
    ...distractors.map(entry => entry.word)
  ]);

  return buildQuestion({
    text: `Which word is opposite in meaning to "${stemEntry.word}"?`,
    options,
    correctIndex: options.indexOf(correctEntry.word),
    pattern: "OPPOSITE_WORD",
    difficulty: { score: 2, label: "easy" },
    topics: ["ENGLISH", "VOCABULARY", "ANTONYM"],
    tracking: {
      promptEntryIds: [stemEntry.id],
      correctEntryIds: [correctEntry.id]
    }
  });
}
