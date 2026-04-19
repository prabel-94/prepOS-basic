/* =========================================
PrepOS Malayalam Generator (Final Clean)
========================================= */

const sb = window.supabaseClient;
const ADAPTIVE_MODE = true;

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

    const fn = PatternRegistry[pattern];

    if (!fn) {
      throw new Error("Unknown Malayalam pattern: " + pattern);
    }

    return fn(config);
  }
};

/* =========================================
Fetch Groups (NO MAPPING LAYER)
========================================= */

async function fetchGroups() {
  const { data, error } = await sb
    .from("lexicon_entries")
    .select("word, group_id");

  if (error) {
    console.error("Fetch error:", error);
    return {};
  }

  const groups = {};

  (data || []).forEach(row => {
    if (!row.group_id || !row.word) return;

    if (!groups[row.group_id]) {
      groups[row.group_id] = [];
    }

    groups[row.group_id].push(row.word);
  });

  return groups;
}

/* =========================================
Adaptive Stats (word-level)
========================================= */

async function getUserWordStatsMap() {
  const userId = window.currentUser?.id;
  if (!userId) return {};

  const { data } = await sb
    .from("user_lexicon_word_stats")
    .select("seen_count, wrong_count, lexicon_entries(word)")
    .eq("user_id", userId);

  const map = {};

  (data || []).forEach(row => {
    const seen = row.seen_count || 0;
    const wrong = row.wrong_count || 0;

    const weakness = seen === 0 ? 1 : wrong / seen;

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
Group Selection
========================================= */

async function selectGroup(groups) {
  const keys = Object.keys(groups);

  const valid = keys.filter(k => {
    const own = groups[k];
    const others = keys
      .filter(x => x !== k)
      .flatMap(x => groups[x]);

    return own.length >= 2 && others.length >= 3;
  });

  if (!valid.length) return null;

  if (!ADAPTIVE_MODE) {
    return pickRandom(valid, 1)[0];
  }

  const stats = await getUserWordStatsMap();

  if (!Object.keys(stats).length) {
    return pickRandom(valid, 1)[0];
  }

  const scored = valid.map(k => {
    const words = groups[k];

    const avg =
      words.reduce((sum, w) => sum + (stats[w] ?? 1), 0) /
      words.length;

    return { k, score: avg };
  });

  scored.sort((a, b) => b.score - a.score);

  return pickRandom(scored.slice(0, 5), 1)[0].k;
}

/* =========================================
SYNONYM GENERATOR
========================================= */

async function generateSynonymQuestion() {
  const groups = await fetchGroups();

  const group_id = await selectGroup(groups);
  if (!group_id) return null;

  const words = groups[group_id];

  if (words.length < 2) return null;

  const questionWord = pickRandom(words, 1)[0];

  const correct = pickRandom(
    words.filter(w => w !== questionWord),
    1
  )[0];

  const distractors = pickRandom(
    Object.keys(groups)
      .filter(k => k !== group_id)
      .flatMap(k => groups[k]),
    3
  );

  const options = shuffle([correct, ...distractors]);
  const correctIndex = options.indexOf(correct);

  return [buildQuestion({
    text: `${questionWord} എന്ന വാക്കിന്റെ പര്യായം ഏത്?`,
    options,
    correctIndex,
    pattern: "SYNONYM",
    difficulty: { score: 2, label: "easy" },
    topics: ["MALAYALAM", "VOCABULARY", "SYNONYM"]
  })];
}

/* =========================================
OPPOSITE GENERATOR (TEMP LOGIC)
========================================= */
async function generateOppositeWordQuestion(config = {}) {

  // ========================================
  // 1. FETCH ALL WORDS
  // ========================================

  const { data: rows, error } = await sb
    .from("lexicon_entries")
    .select("group_id, word");

  if (error || !rows || rows.length < 4) {
    console.error("Lexicon fetch failed", error);
    return null;
  }

  // ========================================
  // 2. GROUP WORDS
  // ========================================

  const groups = {};

  rows.forEach(r => {
    if (!groups[r.group_id]) {
      groups[r.group_id] = [];
    }
    groups[r.group_id].push(r.word);
  });

  const groupIds = Object.keys(groups);

  if (groupIds.length < 2) return null;

  // ========================================
  // 3. PICK BASE GROUP
  // ========================================

  const baseGroupId =
    groupIds[Math.floor(Math.random() * groupIds.length)];

  const baseWords = groups[baseGroupId];

  if (!baseWords || baseWords.length === 0) return null;

  const stem =
    baseWords[Math.floor(Math.random() * baseWords.length)];

  // ========================================
  // 4. FETCH RELATIONS (CORE UPGRADE)
  // ========================================

  let oppositeGroupId = null;

  const { data: relations } = await sb
    .from("lexicon_group_relations")
    .select("group_id_1, group_id_2")
    .or(
      `group_id_1.eq.${baseGroupId},group_id_2.eq.${baseGroupId}`
    );

  if (relations && relations.length > 0) {

    const possible = relations.map(r =>
      r.group_id_1 === baseGroupId
        ? r.group_id_2
        : r.group_id_1
    );

    if (possible.length > 0) {
      oppositeGroupId =
        possible[Math.floor(Math.random() * possible.length)];
    }
  }

  // ========================================
  // 5. FALLBACK (IMPORTANT)
  // ========================================


// ========================================
// 5. STRICT MODE (NO FALLBACK)
// ========================================

if (!oppositeGroupId) {
  console.warn("No opposite group linked for:", baseGroupId);
  return null; // 🚨 DO NOT GENERATE
}


  const correctWords = groups[oppositeGroupId];

  if (!correctWords || correctWords.length === 0) return null;

  const correct =
    correctWords[Math.floor(Math.random() * correctWords.length)];

  // ========================================
  // 6. DISTRACTORS
  // ========================================

  const distractors = [];

  const otherGroups = groupIds.filter(
    id => id !== baseGroupId && id !== oppositeGroupId
  );

  while (distractors.length < 3 && otherGroups.length > 0) {

    const g =
      otherGroups[Math.floor(Math.random() * otherGroups.length)];

    const words = groups[g];

    if (words && words.length) {
      const w =
        words[Math.floor(Math.random() * words.length)];

      if (!distractors.includes(w) && w !== correct) {
        distractors.push(w);
      }
    }
  }

  // fallback fill
  while (distractors.length < 3) {
    distractors.push(correctWords[0]);
  }

  // ========================================
  // 7. SHUFFLE OPTIONS
  // ========================================

  const options = [correct, ...distractors]
    .sort(() => Math.random() - 0.5);

  const correctIndex = options.indexOf(correct);

  const correctOption =
    ["A", "B", "C", "D"][correctIndex];

  // ========================================
  // 8. RETURN FINAL STRUCTURE
  // ========================================

  return {
    text: `Choose the opposite of: ${stem}`,

    options: {
      A: options[0],
      B: options[1],
      C: options[2],
      D: options[3]
    },

    correct_option: correctOption,

    explanation: `${correct} is the opposite of ${stem}`,

    topics: ["opposite_words"]
  };
}


/* =========================================
Question Builder (STANDARD CONTRACT)
========================================= */

function buildQuestion({
  text,
  options,
  correctIndex,
  pattern,
  difficulty,
  topics
}) {
  return {
    id: crypto.randomUUID(),
    question_id: null,
    text,
    options: options.map((o, i) => ({
      id: ["A", "B", "C", "D"][i],
      text: o
    })),
    correct: ["A", "B", "C", "D"][correctIndex],
    explanation: "",
    topics,
    primary_pattern: pattern,
    bank_status: "draft",
    difficulty
  };
}

