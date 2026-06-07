import { getClient } from "../../core/get-client.js";
import { sortWordsWithHeadwordFirst } from "./lexicon-utils.js";

export const DEFAULT_LEXICON_TOPIC = "vocabulary";

/* =========================================
FETCH GROUPS
========================================= */

/**
 * @param {string} languageCode
 * @param {{ topic?: string }} [options]
 */
export async function fetchGroups(languageCode, options = {}) {
  const topic = String(options.topic ?? DEFAULT_LEXICON_TOPIC)
    .trim()
    .toLowerCase();

  const sb = await getClient();
  let query = sb
    .from("lexicon_entries")
    .select(`
  id,
  word,
  group_id,
  difficulty,
  language_code,
  lexical_class,
  topic,
  is_headword
`)
    .eq("language_code", languageCode);

  if (topic) {
    query = query.eq("topic", topic);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return {};
  }

  const groups = {};

  (data || []).forEach((row) => {
    if (!row.group_id || !row.word) {
      return;
    }

    if (!groups[row.group_id]) {
      groups[row.group_id] = [];
    }

    groups[row.group_id].push(row);
  });

  for (const groupId of Object.keys(groups)) {
    groups[groupId] = sortWordsWithHeadwordFirst(groups[groupId]);
  }

  return groups;
}

/* =========================================
Adaptive Stats
========================================= */

/**
 * @param {string} [userId]
 * @returns {Promise<Map<string, { seen_count: number, wrong_count: number }>>}
 */
export async function getUserWordStatsByWordId(
  userId = window.currentUser?.id
) {
  if (!userId) {
    return new Map();
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from("user_lexicon_word_stats")
    .select("word_id, seen_count, wrong_count")
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    return new Map();
  }

  const map = new Map();

  (data || []).forEach((row) => {
    map.set(row.word_id, {
      seen_count: row.seen_count || 0,
      wrong_count: row.wrong_count || 0,
    });
  });

  return map;
}

/* =========================================
BUILD QUESTION
========================================= */

export function buildQuestion({
  text,
  options,
  correct,
  correctIndex = null,
  pattern = null,
  difficulty = "easy",
  topics = [],
  tracking = null,
}) {
  const optionIds = ["A", "B", "C", "D"];
  const normalizedOptions = options.map((option, index) => {
    if (typeof option === "object" && option.id && option.text) {
      return option;
    }

    return {
      id: optionIds[index],
      text: option,
    };
  });

  return {
    id: crypto.randomUUID(),
    question_id: null,
    text,
    options: normalizedOptions,
    correct: correct || optionIds[correctIndex],
    explanation: "",
    topics,
    primary_pattern: pattern,
    bank_status: "draft",
    difficulty,
    tracking,
  };
}
