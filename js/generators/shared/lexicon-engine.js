const sb = window.supabaseClient;

/* =========================================
FETCH GROUPS
========================================= */

export async function fetchGroups(languageCode) {

  const { data, error } = await sb
    .from("lexicon_entries")
    .select(`
  id,
  word,
  group_id,
  difficulty,
  language_code,
  lexical_class
`)
    .eq("language_code", languageCode);

  if (error) {
    console.error(error);
    return {};
  }

  const groups = {};

  (data || []).forEach(row => {
    if (!row.group_id || !row.word) return;

    if (!groups[row.group_id]) {
      groups[row.group_id] = [];
    }

    groups[row.group_id].push(row);
  });

  return groups;
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
  tracking = null
}) {
  const optionIds = ["A", "B", "C", "D"];
  const normalizedOptions = options.map((option, index) => {
    if (typeof option === "object" && option.id && option.text) {
      return option;
    }

    return {
      id: optionIds[index],
      text: option
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
    tracking
  };
}
