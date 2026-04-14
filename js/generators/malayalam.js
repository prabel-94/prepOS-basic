/* =========================================
PrepOS Malayalam Generator
========================================= */

const sb = window.supabaseClient;


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
Fetch words
========================================= */

async function fetchLexiconGroup(groupId, limit = 20) {

  const { data, error } = await sb
    .from("lexicon_entries")
    .select("*")
    .eq("group_id", groupId)
    .limit(limit);

  if (error) {
    console.error("Lexicon fetch error:", error);
    return [];
  }

  return data || [];

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
Pattern — SYNONYM
========================================= */

async function generateSynonymQuestion() {

  const rows = await fetchLexiconGroup("SYNONYM");

  if (!rows.length) return null;

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

  // pick stem
  const stem = pickRandom(stems, 1)[0];

  const correct =
    pickRandom(groups[stem], 1)[0];

  // distractors from other stems
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

  return [
    buildQuestion(
      `${stem} എന്ന വാക്കിന്റെ പര്യായം ഏത്?`,
      options,
      correctIndex,
      "SYNONYM"
    )
  ];
}

/* =========================================
Pattern — OPPOSITE
========================================= */

async function generateOppositeWordQuestion() {

  const rows =
    await fetchLexiconGroup("OPPOSITE_WORD");

  if (!rows.length) return null;

  const groups = {};

  rows.forEach(r => {
    if (!groups[r.stem]) {
      groups[r.stem] = [];
    }
    groups[r.stem].push(r.value);
  });

  const stems = Object.keys(groups);

  if (stems.length < 2) return null;

  const stem = pickRandom(stems, 1)[0];

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

  return [
    buildQuestion(
      `${stem} എന്ന വാക്കിന്റെ വിപരീതപദം ഏത്?`,
      options,
      correctIndex,
      "OPPOSITE_WORD"
    )
  ];
}

/* =========================================
Question Builder
========================================= */

function buildQuestion(text, options, correctIndex, pattern) {

  return {

    id: crypto.randomUUID(),

    question_id: null,

    text,

    options: options.map((o, i) => ({
      id: ["A","B","C","D"][i],
      text: o
    })),

    correct: ["A","B","C","D"][correctIndex],

    explanation: "",

    topics: [],

    primary_pattern: pattern,

    bank_status: "draft",

    difficulty: {
      cognitive_level: null,
      complexity_level: null,
      depth_level: null,
      score: null,
      label: null
    }

  };

}