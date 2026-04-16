/* =========================================
PrepOS Malayalam Generator
========================================= */

const sb = window.supabaseClient;

const ADAPTIVE_MODE = true;



/* =========================================
Topic Mapping
========================================= */

function getTopicsFromPattern(pattern) {

  switch (pattern) {

    case "SYNONYM":
      return [
        "Malayalam",
        "Vocabulary",
        "Synonyms"
      ];

    case "OPPOSITE_WORD":
      return [
        "Malayalam",
        "Vocabulary",
        "Antonyms"
      ];

    default:
      return [];

  }

}

/* =========================================
Pattern Registry
========================================= */

const PatternRegistry = {
  SYNONYM: generateSynonymQuestion,
  OPPOSITE_WORD: generateOppositeWordQuestion
};


/* =========================================
Main Export
========================================= */

export const MalayalamGenerator = {

  async generate(config) {

    const { pattern } = config;

    const generatorFn = PatternRegistry[pattern];

    if (!generatorFn) {
      throw new Error(
        "Unknown Malayalam pattern: " + pattern
      );
    }

    return generatorFn(config);

  }

};


/* =========================================
Fetch
========================================= */

async function fetchRows(pattern) {

  const { data, error } = await sb
    .from("lexicon_entries")
    .select("*")
    .eq("pattern_type", pattern);

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];

}

async function getUserWordStatsMap() {

  const userId = window.currentUser?.id;

  if (!userId) return {};

  const { data } = await sb
    .from("user_lexicon_word_stats")
    .select("word_id, seen_count, correct_count, wrong_count, lexicon_entries(word)")
    .eq("user_id", userId);

  const map = {};

  (data || []).forEach(row => {

  const seen = row.seen_count || 0;
  const correct = row.correct_count || 0;
  const wrong = row.wrong_count || 0;

  // -----------------------------
  // WEAKNESS CALCULATION (FIXED)
  // -----------------------------
  const weakness =
    seen === 0
      ? 1
      : wrong / seen;

  // -----------------------------
  // FIX WORD MAPPING (CRITICAL)
  // -----------------------------
  const word = row.lexicon_entries?.word;

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

/* =========================================
Topic Resolver (CRITICAL)
========================================= */

async function resolveTopics(topicNames) {

  if (!topicNames || !topicNames.length) return [];

  // normalize names (trim + lowercase)
  const normalized = topicNames.map(t =>
    t.trim().toLowerCase()
  );

  const { data, error } = await sb
    .from("topics")
    .select("id, name, normalized_name")
    .in("normalized_name", normalized);

  if (error) {
    console.error("Topic resolve error:", error);
    return [];
  }

  // map normalized_name → id
  const map = {};
  (data || []).forEach(t => {
    map[t.normalized_name] = t.id;
  });

  // return ONLY valid topic IDs
  return normalized
    .map(n => map[n])
    .filter(Boolean);
}

async function selectStemForGeneration(stems, groups) {

  const candidates = stems.filter(stem => {
    const otherValues = stems
      .filter(s => s !== stem)
      .flatMap(s => groups[s]);

    return otherValues.length >= 3;
  });

  if (!candidates.length) return null;

  if (!ADAPTIVE_MODE) {
    return pickRandom(candidates, 1)[0];
  }

  const stats = await getUserWordStatsMap();

  if (!Object.keys(stats).length) {
    return pickRandom(candidates, 1)[0];
  }

  const scored = candidates.map(stem => {

    const values = groups[stem];

    // average weakness of values
    const weaknesses = values.map(v =>
      stats[v] ?? 1
    );

    const avg =
      weaknesses.reduce((a, b) => a + b, 0) /
      weaknesses.length;

    return {
      stem,
      score: avg
    };

  });

  // sort by weakness (descending)
  scored.sort((a, b) => b.score - a.score);

  // take top weak stems
  const top = scored.slice(0, 5);

  return pickRandom(top, 1)[0].stem;

}


/* =========================================
SYNONYM
========================================= */

async function generateSynonymQuestion(config) {

  const rows = await fetchRows("SYNONYM");

  if (rows.length < 4) return null;

  // group by stem
  const groups = {};

  rows.forEach(r => {

    if (!groups[r.stem]) {
      groups[r.stem] = [];
    }

    groups[r.stem].push(r.value);

  });

  const stems = Object.keys(groups);

  if (stems.length < 2) return null;

  const stem =
    await selectStemForGeneration(stems, groups);

  if (!stem) return null;

  const correct =
    pickRandom(groups[stem], 1)[0];

  const otherValues = stems
    .filter(s => s !== stem)
    .flatMap(s => groups[s]);

  const distractors =
    pickRandom(otherValues, 3);

  const options = shuffle([
    correct,
    ...distractors
  ]);

  const correctIndex =
    options.indexOf(correct);

  const q = buildQuestion(
      `${stem} എന്ന വാക്കിന്റെ പര്യായം ഏത്?`,
      options,
      correctIndex,
      "SYNONYM",
      getDifficultyFromPattern("SYNONYM")
    );

  const topicNames = getTopicsFromPattern("SYNONYM");
q.topics = topicNames;

  return [q];

}


/* =========================================
OPPOSITE
========================================= */

async function generateOppositeWordQuestion(config) {

  const rows =
    await fetchRows("OPPOSITE_WORD");

  if (rows.length < 4) return null;

  const groups = {};

  rows.forEach(r => {

    if (!groups[r.stem]) {
      groups[r.stem] = [];
    }

    groups[r.stem].push(r.value);

  });

  const stems = Object.keys(groups);

  if (stems.length < 2) return null;

  const stem =
    await selectStemForGeneration(stems, groups);

  if (!stem) return null;

  const correct =
    pickRandom(groups[stem], 1)[0];

  const otherValues = stems
    .filter(s => s !== stem)
    .flatMap(s => groups[s]);

  const distractors =
    pickRandom(otherValues, 3);

  const options = shuffle([
    correct,
    ...distractors
  ]);

  const correctIndex =
    options.indexOf(correct);

  const q = buildQuestion(
      `${stem} എന്ന വാക്കിന്റെ വിപരീതപദം ഏത്?`,
      options,
      correctIndex,
      "OPPOSITE_WORD",
      getDifficultyFromPattern("OPPOSITE_WORD")
    );

  const topicNames = getTopicsFromPattern("OPPOSITE_WORD");
q.topics = topicNames;

  return [q];

}

/* =========================================
Difficulty Mapping
========================================= */

function getDifficultyFromPattern(pattern) {

  switch (pattern) {

    case "SYNONYM":
      return {
        cognitive_level: "recall",
        complexity_level: "low",
        depth_level: "surface",
        score: 2,
        label: "easy"
      };

    case "OPPOSITE_WORD":
      return {
        cognitive_level: "recall",
        complexity_level: "low",
        depth_level: "surface",
        score: 1,
        label: "easy"
      };

    default:
      return null;

  }

}
/* =========================================
Builder
========================================= */

function buildQuestion(
  text,
  options,
  correctIndex,
  pattern,
  difficulty
) {

  return {

    id: crypto.randomUUID(),

    question_id: null,

    text,

    options: options.map((o, i) => ({
      id: ["A","B","C","D"][i],
      text: o
    })),

    correct:
      ["A","B","C","D"][correctIndex],

    explanation: "",

    topics: [],

    primary_pattern: pattern,

    bank_status: "draft",

    difficulty: difficulty || {
      cognitive_level: null,
      complexity_level: null,
      depth_level: null,
      score: null,
      label: null
    }

  };

}
