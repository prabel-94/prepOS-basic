/* =========================================
PrepOS Malayalam Generator
========================================= */

const sb = window.supabaseClient;



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
Main Export
========================================= */

export const MalayalamGenerator = {

  async generate(config) {

    const { pattern } = config;

    switch (pattern) {

      case "SYNONYM":
        return generateSynonymQuestion();

      case "OPPOSITE_WORD":
        return generateOppositeWordQuestion();

      default:
        throw new Error(
          "Unknown Malayalam pattern: " + pattern
        );

    }

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

async function getUserWordStats() {

  const userId = window.currentUser?.id;

  if (!userId) return {};

  const { data } = await sb
    .from("user_lexicon_word_stats")
    .select("word_id, seen_count")
    .eq("user_id", userId);

  const map = {};

  (data || []).forEach(row => {
    map[row.word_id] = row.seen_count;
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
SYNONYM
========================================= */

async function generateSynonymQuestion() {

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

  const stats = await getUserWordStats();

  // score stems by least usage
  const scored = stems.map(stem => {

    const row = rows.find(r => r.stem === stem);

    const count = stats[row?.id] || 0;

    return { stem, count };

  });

  // sort ascending (least seen first)
  scored.sort((a, b) => a.count - b.count);

  const top = scored.slice(0, 5); // pick from least-used pool

  const stem = pickRandom(top, 1)[0].stem;

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

  q.topics = getTopicsFromPattern("SYNONYM");

  return [q];

}


/* =========================================
OPPOSITE
========================================= */

async function generateOppositeWordQuestion() {

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

  const stats = await getUserWordStats();

  // score stems by least usage
  const scored = stems.map(stem => {

    const row = rows.find(r => r.stem === stem);

    const count = stats[row?.id] || 0;

    return { stem, count };

  });

  // sort ascending (least seen first)
  scored.sort((a, b) => a.count - b.count);

  const top = scored.slice(0, 5); // pick from least-used pool

  const stem = pickRandom(top, 1)[0].stem;

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

  q.topics = getTopicsFromPattern("OPPOSITE_WORD");

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
