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

  const words = await fetchLexiconGroup("SYNONYM");

  if (words.length < 4) return null;

  const correct = pickRandom(words, 1)[0];

  const distractors = pickRandom(
    words.filter(w => w.id !== correct.id),
    3
  );

  const options = shuffle([
    correct.word,
    ...distractors.map(d => d.word)
  ]);

  const correctIndex = options.indexOf(correct.word);

  return buildQuestion(
    `${correct.word} എന്ന വാക്കിന്റെ പര്യായം ഏത്?`,
    options,
    correctIndex,
    "SYNONYM"
  );

}


/* =========================================
Pattern — OPPOSITE WORD
========================================= */

async function generateOppositeWordQuestion() {

  const words = await fetchLexiconGroup("OPPOSITE_WORD");

  if (words.length < 4) return null;

  const correct = pickRandom(words, 1)[0];

  const distractors = pickRandom(
    words.filter(w => w.id !== correct.id),
    3
  );

  const options = shuffle([
    correct.word,
    ...distractors.map(d => d.word)
  ]);

  const correctIndex = options.indexOf(correct.word);

  return buildQuestion(
    `${correct.word} എന്ന വാക്കിന്റെ വിപരീതപദം ഏത്?`,
    options,
    correctIndex,
    "OPPOSITE_WORD"
  );

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