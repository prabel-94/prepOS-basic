// ===============================
// PrepOS Draft Editor (v6 - Stable)
// ===============================

import { runGenerator } from "./generator-core.js";
// --------------------------------
// GLOBAL STATE
// --------------------------------
let pendingSetLoadId = null;
let currentSearchResults = [];
let selectedQuestionIndex = null;
let autosaveTimer = null;
let topicTimer = null;
let isSaving = false;
let isPublishing = false;

let currentDraft = null;
let logoURL = null;

const sb = window.supabaseClient;

// --------------------------------
// URL PARAM
// --------------------------------
const params = new URLSearchParams(window.location.search);
let draftId = params.get("id");
const mode = params.get("mode");

// --------------------------------
// HELPERS
// --------------------------------

// --------------------------------
// METADATA SYSTEM (v2 - COMPAT)
// --------------------------------

let patternDefinitions = [];
let caEventDefinitions = [];

function renderPatternDropdown(container, query, mode = "all") {

  const q = query.toLowerCase();

let filtered = patternDefinitions;

// 🔥 APPLY MODE FILTER
if (container.classList.contains("generator-dropdown")) {
  const allowedPatterns = ["SYNONYM", "OPPOSITE_WORD"];
  filtered = filtered.filter(p => allowedPatterns.includes(p.key));
}

// 🔍 SEARCH FILTER
filtered = filtered
  .filter(p => p.key.toLowerCase().includes(q))
  .sort((a, b) => a.key.localeCompare(b.key));
  if (!filtered.length) {
    container.innerHTML = `<div class="pattern-empty">No match</div>`;
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div 
      class="pattern-option"
      data-key="${p.key}"
      title="${p.description || ""}"
    >
      ${p.key}
    </div>
  `).join("");
}

function renderCAEventDropdown(container, query) {

  const q = query.toLowerCase();

  const filtered = caEventDefinitions
    .filter(p => p.key.toLowerCase().includes(q))
    .sort((a,b)=>a.key.localeCompare(b.key));

  if (!filtered.length) {
    container.innerHTML =
      `<div class="pattern-empty">No match</div>`;
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="pattern-option"
         data-key="${p.key}">
      ${p.key}
    </div>
  `).join("");
}

async function loadPatternDefinitions() {

  const { data, error } = await sb
    .from("metadata_definitions")
    .select("key, description")
    .order("key", { ascending: true });

  if (error) {
    console.error("Pattern load error", error);
    return;
  }

  patternDefinitions = data || [];
}
async function loadCAEventDefinitions() {

  const { data, error } = await sb
    .from("metadata_definitions")
    .select("key, description")
    .eq("slot", "ca_event")
    .order("key", { ascending: true });

  if (error) {
    console.error("CA event load error", error);
    return;
  }

  caEventDefinitions = data || [];
}
function ensureMetadata(q) {
  if (!q.meta_structured) {
    q.meta_structured = {
      cognitive_level: null,
      complexity: null,
      depth: null,
      difficulty_score: null,
      difficulty_label: null,
      question_type: "mcq_single"
    };
  }

  if (!q.difficulty) {
    q.difficulty = {};
  }
}

function syncMetaToDifficulty(q) {
  ensureMetadata(q);

  q.difficulty.cognitive_level = q.meta_structured.cognitive_level;
  q.difficulty.complexity_level = q.meta_structured.complexity;
  q.difficulty.depth_level = q.meta_structured.depth;

  q.difficulty.score = q.meta_structured.difficulty_score;
  q.difficulty.label = q.meta_structured.difficulty_label;
}

function syncDifficultyToMeta(q) {
  ensureMetadata(q);

  q.meta_structured.cognitive_level = q.difficulty.cognitive_level;
  q.meta_structured.complexity = q.difficulty.complexity_level;
  q.meta_structured.depth = q.difficulty.depth_level;

  q.meta_structured.difficulty_score = q.difficulty.score;
  q.meta_structured.difficulty_label = q.difficulty.label;
  q.meta_structured.question_type = q.meta_structured.question_type || "mcq_single";// optional (if UI controls type later)
}

function updateConfirmState() {
  const addBtn = document.getElementById("confirmAddToBank");
  const saveAllBtn = document.getElementById("confirmSaveAll");

  const bankTags = document.getElementById("bankTopicTags");
  const bulkTags = document.getElementById("bulkTopicTags");

  const hasBankTopics = bankTags?.children.length > 0;
  const hasBulkTopics = bulkTags?.children.length > 0;

  if (addBtn) {
    addBtn.disabled = !hasBankTopics;
    addBtn.classList.toggle("disabled", !hasBankTopics);
  }

  if (saveAllBtn) {
    saveAllBtn.disabled = !hasBulkTopics;
    saveAllBtn.classList.toggle("disabled", !hasBulkTopics);
  }
}

function formatTopicName(name) {

  // convert KEY → display name
  const map = {
    MALAYALAM: "Malayalam",
    VOCABULARY: "Vocabulary",
    SYNONYM: "Synonyms",
    ANTONYM: "Antonyms"
  };

  if (map[name]) return map[name];

  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
}

function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "#555";
}

function getTopicWarnings(input) {

  const warnings = [];
  const clean = input.trim();

  if (!clean) return warnings;

  const lower = clean.toLowerCase();

  // ----------------------------
  // 1. PLURAL DETECTION
  // ----------------------------
  if (lower.endsWith("s") && lower.length > 3) {
    warnings.push({
      type: "plural",
      message: `Use singular → ${formatTopicName(clean.slice(0, -1))}`,
      suggestion: formatTopicName(clean.slice(0, -1))
    });
  }

  // ----------------------------
  // 2. BAD KEYWORDS (type leakage)
  // ----------------------------
  const badWords = ["questions", "problems", "easy", "hard", "important"];

  for (const word of badWords) {
    if (lower.includes(word)) {
      warnings.push({
        type: "bad_word",
        message: `Avoid words like "${word}" in topic name`
      });
      break;
    }
  }

  // ----------------------------
  // 3. TOO LONG (likely not a topic)
  // ----------------------------
  if (clean.split(" ").length > 4) {
    warnings.push({
      type: "length",
      message: "Topic name seems too long"
    });
  }

  return warnings;
}

function renderTopicWarnings(warnings, containerId = "topicWarnings") {

  const container = document.getElementById(containerId);
  if (!container) return;

  if (!warnings.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = warnings.map(w => `
    <div class="warning-text">
      ⚠ ${w.message}
      ${
        w.suggestion
          ? `<button class="fix-btn" data-fix="${w.suggestion}">Fix</button>`
          : ""
      }
    </div>
  `).join("");
}
// --------------------------------
// HASH (Duplicate detection)
// --------------------------------
async function generateHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function computeDifficulty({ cognitive, complexity, depth }) {
  if (!cognitive || !complexity || !depth) {
    return { score: null, label: null };
  }

  const score =
    (cognitive * 0.5) +
    (complexity * 0.3) +
    (depth * 0.2);

  let label = "easy";

  if (score > 2.6) label = "hard";
  else if (score > 1.8) label = "medium";

  return {
    score: Number(score.toFixed(2)),
    label
  };
}
// --------------------------------
// SEARCH QUESTION BANK
// --------------------------------
async function searchQuestionBank(query) {

  if (!query) return [];

  const { data, error } = await sb
    .from("questions")
    .select("*")
    .ilike("question_text", `%${query}%`)
    .limit(20);

  if (error) {
    console.error("Search error:", error);
    return [];
  }

  return data || [];
}
// --------------------------------
// ADD QUESTION FROM BANK → DRAFT (UPDATED)
// --------------------------------
async function addQuestionFromBank(qId, btn) {

  const { data, error } = await sb
    .from("questions")
    .select("*")
    .eq("id", qId)
    .single();

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  // 🚨 PREVENT DUPLICATE
  const exists = currentDraft.schema_json.sections[0].questions
    .some(q => q.text === data.question_text);

  if (exists) {
    setStatus("Already in draft ⚠️");

    // 🔥 soft feedback
    if (btn) {
      btn.innerText = "Already Added";
      btn.classList.add("secondary-btn");
    }

    return;
  }

  const newQuestion = {
  id: crypto.randomUUID(),
  question_id: data.id, // 🔥 CRITICAL
  text: data.question_text,
    options: [
  { id:"A", text: data.option_a || "" },
  { id:"B", text: data.option_b || "" },
  { id:"C", text: data.option_c || "" },
  { id:"D", text: data.option_d || "" }
],
    correct: data.correct_option || "A",
    explanation: data.explanation || "",
    topics: [],
    bank_status: "saved",
    primary_pattern: null, 

// 🔥 ADD THIS BLOCK
  difficulty: {
    cognitive_level: null,
    complexity_level: null,
    depth_level: null,
    score: null,
    label: null
  },
  };
ensureMetadata(newQuestion);

  currentDraft.schema_json.sections[0].questions.push(newQuestion);

  renderDraft(currentDraft);

  setStatus("Question added to draft ✅");
  // 🔥 AUTO REFRESH SEARCH RESULTS
  renderQuestionBankResults(currentSearchResults);

  // 🔥 visual confirmation
  if (btn) {
    btn.innerText = "Added ✓";
  }
}
// --------------------------------
// RENDER QUESTION BANK RESULTS
// --------------------------------
function renderQuestionBankResults(questions) {

  currentSearchResults = questions;

  const container = document.getElementById("questionBankResults");
  if (!container) return;

  if (!questions.length) {
    container.innerHTML = `<div class="qb-loading">No results found</div>`;
    return;
  }

  const draftQuestions =
    currentDraft?.schema_json?.sections?.[0]?.questions || [];

  container.innerHTML = questions.map(q => {

    // ✅ DEFINE exists HERE
    const exists = draftQuestions.some(
      dq => dq.text === q.question_text
    );

    return `
      <div class="question-card">

        <div><b>${q.question_text}</b></div>

        <div class="mt-10 small">
          A. ${q.option_a || "-"}<br>
          B. ${q.option_b || "-"}<br>
          C. ${q.option_c || "-"}<br>
          D. ${q.option_d || "-"}
        </div>

        <button
          class="${exists ? "secondary-btn" : "primary-btn"} mt-10 add-from-bank-btn"
          data-id="${q.id}"
        >
          ${exists ? "Already Added" : "+ Add to Draft"}
        </button>

      </div>
    `;

  }).join("");
}
async function addAllResultsToDraft() {

  if (!currentSearchResults.length) {
    setStatus("No results to add ⚠️");
    return;
  }

  let added = 0;
  let skipped = 0;

  const existingTexts = currentDraft.schema_json.sections[0].questions
    .map(q => q.text);

  currentSearchResults.forEach(data => {

    if (existingTexts.includes(data.question_text)) {
      skipped++;
      return;
    }

    const newQuestion = {
  id: crypto.randomUUID(),
  question_id: data.id, // 🔥 CRITICAL
  text: data.question_text,
      options: [
  { id:"A", text: data.option_a || "" },
  { id:"B", text: data.option_b || "" },
  { id:"C", text: data.option_c || "" },
  { id:"D", text: data.option_d || "" }
],
      correct: data.correct_option || "A",
      explanation: data.explanation || "",
      topics: [],
      bank_status: "saved",

// 🔥 ADD THIS BLOCK
  difficulty: {
    cognitive_level: null,
    complexity_level: null,
    depth_level: null,
    score: null,
    label: null
  },
  };
ensureMetadata(newQuestion);

    currentDraft.schema_json.sections[0].questions.push(newQuestion);
    added++;
  });

  renderDraft(currentDraft);

  setStatus(`Added ${added}, skipped ${skipped}`);
}

// --------------------------------
// PATTERN SYSTEM
// --------------------------------

// --------------------------------
// TOPIC SYSTEM
// --------------------------------

function createTopicTag(container, name) {
  if (!container || !name) return;

  const clean = name.trim().replace(/\s+/g, " ");
const normalized = clean.toLowerCase();
const formatted = formatTopicName(clean);

  // جلوگیری duplicates
  const exists = Array.from(container.children).some(
    el => el.dataset.value === normalized
  );

  if (exists) return;

  const div = document.createElement("div");
  div.className = "topic-tag";
  div.dataset.value = normalized;

  div.innerHTML = `
    ${formatted}
    <button type="button">×</button>
  `;

  // Remove tag
  div.querySelector("button").addEventListener("click", () => {
    div.remove();
    updateConfirmState();
  });

  container.appendChild(div);
  updateConfirmState();
}

async function searchTopics(query) {
  if (!query) return [];

  const { data } = await sb
    .from("topics")
    .select("name")
    .ilike("name", `%${query}%`)
    .limit(5);

  return data || [];
}

async function searchTopicsForDropdown(query) {

  if (!query) return [];

  const { data, error } = await sb
    .from("topics")
    .select("id, name")
    .ilike("name", `%${query}%`)
    .limit(5);

  if (error) {
    console.error("Topic search error:", error);
    return [];
  }

  return data || [];
}

function addTopicToQuestion(qIndex, topicName) {
  const q = currentDraft.schema_json.sections[0].questions[qIndex];

  if (!q.topics) q.topics = [];

  const normalized = topicName.trim().toLowerCase();

  if (q.topics.some(t => t.toLowerCase() === normalized)) return;

  const formatted = formatTopicName(topicName);
q.topics.push(formatted);
  q.generator = {
    ...q.generator,
    topics_auto: false
  };

  renderDraft(currentDraft);
}

function removeTopic(qIndex, topicIndex) {
  const q = currentDraft.schema_json.sections[0].questions[qIndex];
  q.topics.splice(topicIndex, 1);
  q.generator = {
    ...q.generator,
    topics_auto: false
  };
  renderDraft(currentDraft);
}

// --------------------------------
// TOPIC DB LINKING
// --------------------------------

async function resolveTopicKeys(topicKeys) {

  if (!topicKeys || !topicKeys.length) return [];

  const { data, error } = await sb
    .from("topics")
    .select("id, topic_key")
    .in("topic_key", topicKeys);

  if (error) {
    console.error("Topic key resolve error:", error);
    return [];
  }

  const map = {};

  (data || []).forEach(t => {
    map[t.topic_key] = t.id;
  });

  return topicKeys
    .map(k => map[k])
    .filter(Boolean);
}


async function attachTopics(questionId, topics = []) {

  console.log("ATTACHING TOPIC KEYS →", topics);

  const topicIds = await resolveTopicKeys(
  topics.map(t => t.toUpperCase())
);

  for (const topicId of topicIds) {

    const { error } = await sb
      .from("question_topics")
      .upsert({
        question_id: questionId,
        topic_id: topicId
      });

    if (error) {
      console.error("❌ Attach failed:", error);
    } else {
      console.log("✅ Attached:", topicId);
    }
  }
}

// --------------------------------
// QUESTION BANK SAVE
// --------------------------------
async function saveQuestionToBank(q) {

  if (!q.topics || q.topics.length === 0) {
    throw new Error("Question must have at least one topic");
  }

  // ✅ Stable hash input
  syncDifficultyToMeta(q);

  const hashInput = (
  q.text +
  (q.options || []).map(o => o.text).join("")
).trim().toLowerCase();

  // ✅ MUST await
  const hash = await generateHash(hashInput);

  // ✅ Check duplicate
  const { data: existing } = await sb
    .from("questions")
    .select("id")
    .eq("question_hash", hash)
    .maybeSingle();

  let questionId;
  let isDuplicate = false;

  if (existing) {
    questionId = existing.id;
    isDuplicate = true;
  } else {

    // ✅ Normalize options safely
    const opts = (q.options || []).map(o =>
      typeof o === "string" ? o : o.text
    );

      const { data, error } = await sb
        .from("questions")
        .insert({
          question_text: q.text,
          option_a: opts[0] || "",
          option_b: opts[1] || "",
          option_c: opts[2] || "",
          option_d: opts[3] || "",
          correct_option: ["A","B","C","D"].includes(q.correct)
  ? q.correct
  : "A",
          explanation: q.explanation || "",
          question_hash: hash,
          difficulty_score_cached: q.meta_structured?.difficulty_score,
          difficulty_label_cached: q.meta_structured?.difficulty_label
        })
        .select()
        .single();

    if (error) throw error;

    questionId = data.id;
  }
await attachTopics(questionId, q.topics);
await replacePatternMetadata(
  questionId,
  q.primary_pattern || null
);
// ===============================
// SAVE CURRENT AFFAIRS 
// ===============================
if (q.ca_event) {

  await sb.from("question_metadata")
  .upsert([
    {
      question_id: questionId,
      key: "ca_event",
      value: q.ca_event.type
    },
    {
      question_id: questionId,
      key: "ca_date",
      value: q.ca_event.date
    }
  ], { onConflict: "question_id,key" });

}
syncDifficultyToMeta(q);// ✅ SYNC difficulty → structured metadata
// 🔥 SAVE DIFFICULTY METADATA
if (q.meta_structured?.difficulty_score !== null) {

  const meta = q.meta_structured || {};

const metadata = [
  { key: "cognitive_level", value: meta.cognitive_level },
  { key: "complexity_level", value: meta.complexity },
  { key: "depth_level", value: meta.depth },
  { key: "difficulty_score", value: meta.difficulty_score },
  { key: "difficulty_label", value: meta.difficulty_label },
  { key: "question_type", value: meta.question_type || "mcq_single" }
];

  const rows = metadata.map(m => ({
  question_id: questionId,
  key: m.key,
  value: m.value
}));

 await sb
  .from("question_metadata")
  .upsert(rows, { onConflict: "question_id,key" });
}

// 🔥 LINK BACK TO DRAFT
q.question_id = questionId;

return { questionId, isDuplicate };
}

// --------------------------------
// METADATA SYSTEM (REPLACE MODE)
// --------------------------------
async function updateTopicPatterns(questionId, patternKey) {

  if (!patternKey) return;

  const { data } = await sb
    .from("question_topics")
    .select("topic_id")
    .eq("question_id", questionId);

  const rows = (data || []).map(t => ({
    topic_id: t.topic_id,
    pattern_key: patternKey
  }));

  if (!rows.length) return;

  await sb
    .from("topic_patterns")
    .upsert(rows, { onConflict: "topic_id,pattern_key" });
}

async function replacePatternMetadata(questionId, patternKey) {

  await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .eq("key", "pattern");

  if (patternKey) {
    await sb
      .from("question_metadata")
      .insert({
        question_id: questionId,
        key: "pattern",
        value: patternKey
      });
  }

  await sb
    .from("questions")
    .update({
      primary_pattern_key: patternKey || null
    })
    .eq("id", questionId);
}
async function replaceQuestionMetadata(questionId, q) {

  // ✅ ALWAYS sync first
  syncDifficultyToMeta(q);

  const meta = q.meta_structured || {};

  const metadata = [
    { key: "cognitive_level", value: meta.cognitive_level },
    { key: "complexity_level", value: meta.complexity },
    { key: "depth_level", value: meta.depth },
    { key: "difficulty_score", value: meta.difficulty_score },
    { key: "difficulty_label", value: meta.difficulty_label },
    { key: "question_type", value: meta.question_type || "mcq_single" }
  ];

  const rows = metadata.map(m => ({
    question_id: questionId,
    key: m.key,
    value: m.value
  }));

  // ✅ UPSERT metadata
  await sb
    .from("question_metadata")
    .upsert(rows, { onConflict: "question_id,key" });

  // 🔥 ADD THIS BLOCK (EXACT PLACEMENT — AFTER UPSERT)
  await sb
    .from("questions")
    .update({
      difficulty_score_cached: meta.difficulty_score,
      difficulty_label_cached: meta.difficulty_label
    })
    .eq("id", questionId);
     await updateTopicPatterns(
  questionId,
  q.primary_pattern || null
);
}
async function saveAllQuestionsToBank(globalTopics = []) {

  // --------------------------------
  // DATA (MUST BE FIRST)
  // --------------------------------
  const qs = currentDraft.schema_json.sections[0].questions;

  const total = qs.length;
  let processed = 0;

  // --------------------------------
  // UI ELEMENTS (SAFE)
  // --------------------------------
  const progressBox = document.getElementById("saveAllProgress");
  const progressFill = document.getElementById("saveAllProgressFill");
  const progressText = document.getElementById("saveAllProgressText");
  const resultBox = document.getElementById("saveAllResult");

  if (progressBox) progressBox.classList.remove("hidden");

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  // --------------------------------
  // MAIN LOOP
  // --------------------------------
  for (const q of qs) {

    // --------------------------------
    // SKIP ALREADY SAVED
    // --------------------------------
    if (q.bank_status === "saved") {
      skipped++;
      processed++;
      continue;
    }

    // --------------------------------
    // APPLY GLOBAL TOPICS (FIXED LOGIC)
    // --------------------------------
    if (
      (!q.topics || q.topics.length === 0 || q.topics.every(t => !t.trim())) &&
      globalTopics.length
    ) {
      q.topics = [...globalTopics];
      q.generator = {
        ...q.generator,
        topics_auto: false
      };
    }

    // --------------------------------
    // VALIDATION
    // --------------------------------
    if (!q.topics || q.topics.length === 0) {
      console.warn("No topics for question:", q.text);
      errors++;
      processed++;
      continue;
    }
// ✅ ADD HERE (CRITICAL DEBUG POINT)
  console.log("Saving with topics:", q.topics);

    try {
      const res = await saveQuestionToBank(q);

      if (res.isDuplicate) {
        q.bank_status = "duplicate";
        skipped++;
      } else {
        q.bank_status = "saved";
        saved++;
      }

    } catch (err) {
      console.error("Save error:", err);
      errors++;
    }

    // --------------------------------
    // PROGRESS UPDATE
    // --------------------------------
    processed++;

    const percent = Math.round((processed / total) * 100);

    if (progressFill) {
      progressFill.style.width = percent + "%";
    }

    if (progressText) {
      progressText.innerText = `Saving... ${processed} / ${total}`;
    }

    // 🔥 Allow UI repaint (CRITICAL UX FIX)
    await new Promise(r => setTimeout(r, 0));
  }

  // --------------------------------
  // FINAL UI STATE
  // --------------------------------
  if (progressText) {
    progressText.innerText = "Completed ✅";
  }

  renderDraft(currentDraft);

  // --------------------------------
  // RESULT SUMMARY
  // --------------------------------
  if (resultBox) {
    resultBox.classList.remove("hidden");

    let message = `Saved: ${saved}`;

    if (skipped > 0) {
      message += ` | Duplicates: ${skipped}`;
    }

    if (errors > 0) {
      message += ` | Errors: ${errors}`;
    }

    resultBox.innerText = message;

    // Status styling
    if (errors > 0) {
      resultBox.className = "status error mt-10";
    } else if (skipped > 0) {
      resultBox.className = "status warning mt-10";
    } else {
      resultBox.className = "status success mt-10";
    }
  }

  // --------------------------------
  // GLOBAL STATUS (TOP BAR)
  // --------------------------------
  setStatus(`Saved: ${saved} | Duplicates: ${skipped} | Errors: ${errors}`);
}

// --------------------------------
// AUTOSAVE
// --------------------------------
function scheduleAutosave() {
  if (isSaving) return;

  clearTimeout(autosaveTimer);

  autosaveTimer = setTimeout(() => {
    saveDraft(true);
  }, 1000);
}

// --------------------------------
// CREATE EMPTY DRAFT
// --------------------------------
function createEmptyDraft() {
  currentDraft = {
    id: null,
    title: "",
    duration: 60,
    logo_url: null,
    schema_json: {
      sections: [{ questions: [] }]
    }
  };

  renderDraft(currentDraft);
}

// --------------------------------
// LOAD EXISTING DRAFT
// --------------------------------
async function loadDraft() {
  if (!draftId) return;

  setStatus("Loading...");

  const { data, error } = await sb
    .from("draft_exams")
    .select("*")
    .eq("id", draftId)
    .maybeSingle()

  if (error) {
    console.error(error);
    setStatus("Load failed", true);
    return;
    
  }
  // --------------------------------
// SAFETY: HANDLE NULL DATA
// --------------------------------
if (!data) {
  console.warn("Draft not found, creating new draft");

  createEmptyDraft();
  setStatus("Draft not found — new draft created");

  return;
}

currentDraft = data;
currentDraft.status = data.status || "draft";

currentDraft.schema_json.sections[0].questions.forEach(q => {
  ensureMetadata(q);
  syncMetaToDifficulty(q);
});

  logoURL = data.logo_url || null;

  renderDraft(currentDraft);

  document.getElementById("title").value = data.title || "";
  document.getElementById("duration").value = data.duration || "";

  setStatus("Loaded");

}

// ===============================
// CLEAR ALL QUESTIONS
// ===============================
function clearDraftQuestions() {

  if (!currentDraft) return;

  const confirmClear = confirm(
    "Delete ALL questions in this draft?"
  );

  if (!confirmClear) return;

  currentDraft.schema_json.sections[0].questions = [];

  renderDraft(currentDraft);

  setStatus("Draft cleared");
}

function deleteQuestion(index) {
  if (!currentDraft) return;

  const confirmDelete = confirm("Delete this question?");
  if (!confirmDelete) return;

  currentDraft.schema_json.sections[0].questions.splice(index, 1);

  // ✅ FIX index drift
  if (selectedQuestionIndex === index) {
    selectedQuestionIndex = null;
  } else if (selectedQuestionIndex > index) {
    selectedQuestionIndex--;
  }

  renderDraft(currentDraft);
}

function duplicateQuestion(index) {
  const q = currentDraft.schema_json.sections[0].questions[index];

  const clone = JSON.parse(JSON.stringify(q));
  clone.id = crypto.randomUUID();

  // ✅ Ensure difficulty object exists and is clean
  if (clone.difficulty) {
    clone.difficulty = { ...clone.difficulty };
  }

  currentDraft.schema_json.sections[0].questions.splice(index + 1, 0, clone);

  renderDraft(currentDraft);
}

function moveQuestionUp(index) {
  if (index === 0) return;

  const qs = currentDraft.schema_json.sections[0].questions;

  [qs[index - 1], qs[index]] = [qs[index], qs[index - 1]];

  // ✅ FIX index drift
  if (selectedQuestionIndex === index) {
    selectedQuestionIndex--;
  } else if (selectedQuestionIndex === index - 1) {
    selectedQuestionIndex++;
  }

  renderDraft(currentDraft);
}

function moveQuestionDown(index) {
  const qs = currentDraft.schema_json.sections[0].questions;

  if (index === qs.length - 1) return;

  [qs[index + 1], qs[index]] = [qs[index], qs[index + 1]];

  // ✅ FIX index drift
  if (selectedQuestionIndex === index) {
    selectedQuestionIndex++;
  } else if (selectedQuestionIndex === index + 1) {
    selectedQuestionIndex--;
  }

  renderDraft(currentDraft);
}

// --------------------------------
// RENDER
// --------------------------------
function renderDraft(draft) {
  currentDraft = draft;

  const container = document.getElementById("questions");
  container.innerHTML = "";

  const questions = draft?.schema_json?.sections?.[0]?.questions || [];

  // ✅ EMPTY STATE
  if (!questions.length) {
    container.innerHTML = `
      <div class="empty-state">
        No questions yet.<br>
        Click <b>+ New Question</b> to start.
      </div>
    `;
    return;
  }

  questions.forEach((q, i) => {
    const opts = (q.options || []).map(o =>
  typeof o === "string"
    ? { id: "", text: o }
    : o
);
    while (opts.length < 4) opts.push({ id: "", text: "" });

    const status = q.bank_status || "draft";

    // --------------------------
    // TOPICS
    // --------------------------
    const topicsHTML = (q.topics || []).map((t, ti) => `
      <div class="topic-tag">
        ${t}
        <button 
          class="remove-topic" 
          data-q="${i}" 
          data-ti="${ti}"
        >×</button>
      </div>
    `).join("");

    // --------------------------
    // OPTIONS
    // --------------------------
    const optionsHTML = opts.map((opt, oi) => {
      const label = ["A", "B", "C", "D"][oi];

      return `
        <label class="option-row">
          <input 
            type="radio" 
            name="correct-${i}" 
            data-i="${i}" 
            value="${label}"
            ${q.correct === label ? "checked" : ""}
          />

          <span class="opt-label">${label}</span>

          <input 
            class="opt" 
            data-i="${i}" 
            data-oi="${oi}" 
            value="${opt.text || ""}" 
            placeholder="Option ${label}"
          />
        </label>
      `;
    }).join("");

    // --------------------------
    // CARD
    // --------------------------
    const div = document.createElement("div");
    div.className = "question-card";

    div.innerHTML = `
      
      <!-- HEADER -->
      <div class="q-header">

        <div class="q-title">
          Q${i + 1}
          ${q.generator?.enabled ? `
            <div class="small">
              Generated &bull; ${q.generator.pattern || "No pattern selected"}
            </div>
          ` : ""}
        </div>

        <div class="question-actions">
          <button class="icon-btn edit-metadata-btn" data-i="${i}">⚙</button>
          <button onclick="deleteQuestion(${i})" class="icon-btn">🗑</button>
          <button onclick="duplicateQuestion(${i})" class="icon-btn">⧉</button>
          <button onclick="moveQuestionUp(${i})" class="icon-btn">↑</button>
          <button onclick="moveQuestionDown(${i})" class="icon-btn">↓</button>
        </div>

      </div>

      <!-- STATUS + ACTION -->
<div class="flex gap-10 mt-10">

  <div class="status ${status}">
    ${status.toUpperCase()}
  </div>

  <button 
    class="secondary-btn add-to-bank-btn"
    data-q="${i}"
    ${status !== "draft" ? "disabled" : ""}
  >
    ${status === "saved" ? "✓ Saved" :
        status === "duplicate" ? "Duplicate" :
          "+ Add to Bank"}
  </button>

</div>

      <!-- QUESTION -->
      <textarea 
        class="qtext" 
        data-i="${i}" 
        placeholder="Enter question..."
      >${q.text || ""}</textarea>

      <!-- PRIMARY PATTERN (METADATA) -->
<div class="mt-10">
  <input 
    class="primary-pattern-input"
    data-i="${i}"
    placeholder="Pattern (e.g., ASC, Awarded)"
    value="${q.primary_pattern || ""}"
    autocomplete="off"
  />
  <div class="pattern-dropdown primary-pattern-dropdown hidden"></div>
</div>

      <!-- OPTIONS -->
      <div class="options">
        ${optionsHTML}
      </div>

      <!-- EXPLANATION -->
      <textarea 
        class="explanation" 
        data-i="${i}" 
        placeholder="Explanation (optional)"
      >${q.explanation || ""}</textarea>
       
      <div class="mt-10 small">
  Difficulty: ${q.difficulty?.label || "Not set"}
</div>

<!-- GENERATOR TOGGLE -->
<div class="mt-10">
  <label>
    <input 
      type="checkbox"
      class="generator-enable"
      data-i="${i}"
      ${q.generator?.enabled ? "checked" : ""}
    />
    Use Generator
  </label>
</div>

<!-- GENERATOR PANEL -->
${q.generator?.enabled ? `
<div class="generator-panel mt-10">

<div class="pattern-box">
  <select 
    class="pattern-select"
    data-i="${i}"
  >
    <option value="">Select Pattern</option>
    <option value="SYNONYM" ${q.generator?.pattern === "SYNONYM" ? "selected" : ""}>Synonym</option>
    <option value="OPPOSITE_WORD" ${q.generator?.pattern === "OPPOSITE_WORD" ? "selected" : ""}>Opposite Word</option>
  </select>
</div>

  <button 
    class="secondary-btn generate-btn mt-10"
    data-i="${i}">
    Generate
  </button>
  ${q.generator?.generated ? `
  <button 
    class="secondary-btn regenerate-btn mt-10"
    data-i="${i}">
    Regenerate
  </button>
  ` : ""}

</div>
` : ""}

<div class="topic-tags">
  ${topicsHTML}
</div>

</div>

    `;

    container.appendChild(div);
  });
}

function renderMetadataPanel(i) {

  const q = currentDraft.schema_json.sections[0].questions[i];

  if (!q.difficulty) {
    q.difficulty = {};
  }

  const container = document.getElementById("metadataContent");

  container.innerHTML = `
    <div class="question-card">

      <div><b>Difficulty</b></div>

      <div class="mt-10 small">Cognitive</div>
      <div class="flex gap-10">
        ${[1,2,3,4].map(v => `
          <label>
            <input type="radio" name="meta-cognitive" value="${v}"
              ${q.difficulty.cognitive_level === v ? "checked" : ""}
            />
            ${["Recall","Concept","Application","Analysis"][v-1]}
          </label>
        `).join("")}
      </div>

      <div class="mt-10 small">Complexity</div>
      <div class="flex gap-10">
        ${[1,2,3].map(v => `
          <label>
            <input type="radio" name="meta-complexity" value="${v}"
              ${q.difficulty.complexity_level === v ? "checked" : ""}
            />
            ${["Simple","Moderate","Complex"][v-1]}
          </label>
        `).join("")}
      </div>

      <div class="mt-10 small">Depth</div>
      <div class="flex gap-10">
        ${[1,2,3].map(v => `
          <label>
            <input type="radio" name="meta-depth" value="${v}"
              ${q.difficulty.depth_level === v ? "checked" : ""}
            />
            ${["Basic","Standard","Advanced"][v-1]}
          </label>
        `).join("")}
      </div>

      <div class="mt-10 small">
        Difficulty: ${q.difficulty.label || "-"}
      </div>

      <button id="saveMetadataBtn" class="primary-btn w-full mt-20">
        Save Metadata
      </button>

    </div>
  `;
}
// --------------------------------
// INPUT EVENTS
// --------------------------------

document.getElementById("metadataContent")
  ?.addEventListener("change", (e) => {

  if (selectedQuestionIndex === null) return;

  const q = currentDraft.schema_json.sections[0].questions[selectedQuestionIndex];

  if (!q.difficulty) q.difficulty = {};

  if (e.target.name === "meta-cognitive") {
    q.difficulty.cognitive_level = +e.target.value;
  }

  if (e.target.name === "meta-complexity") {
    q.difficulty.complexity_level = +e.target.value;
  }

  if (e.target.name === "meta-depth") {
    q.difficulty.depth_level = +e.target.value;
  }

  const result = computeDifficulty({
    cognitive: q.difficulty.cognitive_level,
    complexity: q.difficulty.complexity_level,
    depth: q.difficulty.depth_level
  });

  q.difficulty.score = result.score;
q.difficulty.label = result.label;

// ✅ NEW
syncDifficultyToMeta(q);

  renderMetadataPanel(selectedQuestionIndex);
});

document.getElementById("questions")?.addEventListener("change", (e) => {
  if (e.target.classList.contains("generator-enable")) {
    const i = +e.target.dataset.i;

    const q = currentDraft.schema_json.sections[0].questions[i];

   // -----------------------------
// ENSURE GENERATOR EXISTS
// -----------------------------
if (!q.generator) {
  q.generator = {
    enabled: false,
    subject: "malayalam",
    pattern: null,
    source: "rule-based",
    version: 1,
    last_generated_at: null,
    generated: false,
    topics_auto: true
  };
}

// -----------------------------
// TOGGLE ONLY ENABLE FLAG
// -----------------------------
q.generator.enabled = e.target.checked;

// -----------------------------
// SAFETY DEFAULTS (DO NOT OVERWRITE)
// -----------------------------
q.generator.subject = q.generator.subject || "malayalam";
q.generator.pattern = q.generator.pattern || null;
q.generator.source = q.generator.source || "rule-based";
q.generator.version = q.generator.version || 1;

    renderDraft(currentDraft);
    scheduleAutosave();
  }
});

document.getElementById("questions")?.addEventListener("input", (e) => {

  // --------------------------------
// GENERATOR PATTERN SELECT (NEW)
// --------------------------------
if (e.target.classList.contains("pattern-select")) {

  const i = +e.target.dataset.i;

  const q = currentDraft.schema_json.sections[0].questions[i];

  // ensure generator exists
  if (!q.generator) {
    q.generator = {
      enabled: false,
      subject: "malayalam",
      pattern: null,
      source: "rule-based",
      version: 1,
      last_generated_at: null,
      generated: false,
      topics_auto: true
    };
  }

  // ✅ CRITICAL: update pattern
  q.generator.pattern = e.target.value;

}

  if (e.target.classList.contains("primary-pattern-input")) {

  const i = +e.target.dataset.i;

  const q = currentDraft.schema_json.sections[0].questions[i];

  q.primary_pattern = e.target.value;

  const box = e.target.closest("div");
  const dropdown = box.querySelector(".primary-pattern-dropdown");

  renderPatternDropdown(dropdown, e.target.value);
}

  if (e.target.classList.contains("qtext")) {
    currentDraft.schema_json.sections[0].questions[+e.target.dataset.i].text = e.target.value;
  }

  if (e.target.classList.contains("opt")) {
  const i = +e.target.dataset.i;
  const oi = +e.target.dataset.oi;

  const q = currentDraft.schema_json.sections[0].questions[i];

  if (!q.options[oi]) {
    q.options[oi] = { id: ["A","B","C","D"][oi], text: "" };
  }

  q.options[oi].text = e.target.value;
}

  if (e.target.classList.contains("explanation")) {
    currentDraft.schema_json.sections[0].questions[+e.target.dataset.i].explanation = e.target.value;
  }

  scheduleAutosave();
});

// --------------------------------
// CLICK EVENTS (delegated)
// --------------------------------
document.getElementById("questions")
?.addEventListener("focusin", (e) => {

  // -----------------------------
  // GENERATOR PATTERN INPUT
  // -----------------------------

  // -----------------------------
  // PRIMARY PATTERN INPUT
  // -----------------------------
  if (e.target.classList.contains("primary-pattern-input")) {

    const box = e.target.closest("div");
    const dropdown = box.querySelector(".primary-pattern-dropdown");

    renderPatternDropdown(dropdown, "");
    dropdown.classList.remove("hidden");

    return;
  }

});

document.getElementById("questions")?.addEventListener("click", (e) => {

if (e.target.classList.contains("generate-btn")) {

  const i = +e.target.dataset.i;

  const q =
    currentDraft.schema_json.sections[0].questions[i];

  const pattern = q.generator?.pattern;

  if (!pattern) {
    setStatus("Select a pattern first", true);
    return;
  }

  generateFromConfig({
    subject: "malayalam",
    pattern
  }).then(result => {

    if (!result) return;

    const generated =
      Array.isArray(result)
        ? result[0]
        : result;

    // -----------------------------
// SAFE SNAPSHOT
// -----------------------------
const oldGenerator = q.generator ? { ...q.generator } : null;
const oldTopics = [...(q.topics || [])];
const oldBankStatus = q.bank_status;
const oldId = q.id;
const oldDifficulty = q.difficulty ? { ...q.difficulty } : null;

const generatedTopics = generated.topics || [];

const topicsAuto =
  oldGenerator?.topics_auto === true || !oldTopics.length;


// -----------------------------
// SAFE MERGE (ONLY CORE FIELDS)
// -----------------------------
q.text = generated.text;
q.options = generated.options;
q.correct = generated.correct;
q.explanation = generated.explanation;
q.primary_pattern = generated.primary_pattern;
q.difficulty = generated.difficulty;


// -----------------------------
// RESTORE STATE
// -----------------------------
q.id = oldId;
q.bank_status = oldBankStatus;

q.topics = topicsAuto ? generatedTopics : oldTopics;


// -----------------------------
// RESTORE GENERATOR
// -----------------------------
q.generator = {
  ...oldGenerator,
  enabled: true,
  subject: "malayalam",
  pattern,
  source: "rule-based",
  version: 1,
  generated: true,
  topics_auto: topicsAuto,
  last_generated_at: new Date().toISOString()
};


// -----------------------------
// PRESERVE USER DIFFICULTY
// -----------------------------
if (oldDifficulty && oldDifficulty.label) {
  q.difficulty = oldDifficulty;
}

    renderDraft(currentDraft);
    scheduleAutosave();

  });

}

if (e.target.classList.contains("regenerate-btn")) {

  const i = +e.target.dataset.i;

  const q =
    currentDraft.schema_json.sections[0].questions[i];

  const pattern = q.generator?.pattern;

  if (!pattern) {
    setStatus("Select a pattern first", true);
    return;
  }

  if (!confirm("Regenerate question? Current content will be replaced.")) {
    return;
  }

  generateFromConfig({
    subject: "malayalam",
    pattern
  }).then(result => {

    if (!result) return;

    const generated =
      Array.isArray(result)
        ? result[0]
        : result;

  // -----------------------------
// SAFE SNAPSHOT
// -----------------------------
const oldGenerator = q.generator ? { ...q.generator } : null;
const oldTopics = [...(q.topics || [])];
const oldBankStatus = q.bank_status;
const oldId = q.id;
const oldDifficulty = q.difficulty ? { ...q.difficulty } : null;

const generatedTopics = generated.topics || [];

const topicsAuto =
  oldGenerator?.topics_auto === true || !oldTopics.length;


// -----------------------------
// SAFE MERGE
// -----------------------------
q.text = generated.text;
q.options = generated.options;
q.correct = generated.correct;
q.explanation = generated.explanation;
q.primary_pattern = generated.primary_pattern;
q.difficulty = generated.difficulty;


// -----------------------------
// RESTORE STATE
// -----------------------------
q.id = oldId;
q.bank_status = oldBankStatus;

q.topics = topicsAuto ? generatedTopics : oldTopics;


// -----------------------------
// RESTORE GENERATOR
// -----------------------------
q.generator = {
  ...oldGenerator,
  enabled: true,
  subject: "malayalam",
  pattern,
  source: "rule-based",
  version: 1,
  generated: true,
  topics_auto: topicsAuto,
  last_generated_at: new Date().toISOString()
};


// -----------------------------
// PRESERVE USER DIFFICULTY
// -----------------------------
if (oldDifficulty && oldDifficulty.label) {
  q.difficulty = oldDifficulty;
}

    renderDraft(currentDraft);
    scheduleAutosave();

  });

}

if (e.target.classList.contains("pattern-option")) {

  const key = e.target.dataset.key;

  const isGenerator =
    e.target.closest(".pattern-box") !== null;

  if (isGenerator) {

    const box = e.target.closest(".pattern-box");
    const i = +input.dataset.i;

    const q =
      currentDraft.schema_json.sections[0].questions[i];

    // -----------------------------
    // ENSURE GENERATOR EXISTS
    // -----------------------------
    if (!q.generator) {
      q.generator = {
        enabled: false,
        subject: "malayalam",
        pattern: null,
        source: "rule-based",
        version: 1,
        last_generated_at: null,
        generated: false,
        topics_auto: true
      };
    }

    // -----------------------------
    // SAFE UPDATE
    // -----------------------------
    q.generator.pattern = key;

    box.querySelector(".pattern-dropdown")
      .classList.add("hidden");

  } else {

    const box = e.target.closest("div");
    const input = box.querySelector(".primary-pattern-input");

    input.value = key;

    const i = +input.dataset.i;

    currentDraft.schema_json.sections[0]
      .questions[i]
      .primary_pattern = key;

    box.querySelector(".primary-pattern-dropdown")
      .classList.add("hidden");

  }

  return;
} // --------------------------------
  // META DATA→ OPEN PANEL
  // --------------------------------

if (e.target.classList.contains("edit-metadata-btn")) {

  const i = +e.target.dataset.i;
  selectedQuestionIndex = i;

  renderMetadataPanel(i);

  document.getElementById("metadataPanel").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

  // --------------------------------
  // ADD TO BANK → OPEN PANEL
  // --------------------------------
  if (e.target.classList.contains("add-to-bank-btn")) {

    selectedQuestionIndex = +e.target.dataset.q;

    const q = currentDraft.schema_json.sections[0].questions[selectedQuestionIndex];

    // OPEN PANEL
    document.getElementById("addToBankPanel")?.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // 🔥 ADD

    // SHOW QUESTION PREVIEW
    const preview = document.getElementById("bankQuestionPreview");

if (preview) {
  const opts = q.options || [];

  preview.innerHTML = `
    <div><b>Question:</b></div>
    <div class="mt-10 prepos-text">
  ${q.text || "(empty question)"}
</div>

    <div class="mt-10"><b>Options:</b></div>
    <ul class="mt-10">
      ${opts.map((o, i) => `
  <li>
    ${["A", "B", "C", "D"][i]}: ${o?.text || "-"}
          ${q.correct === ["A", "B", "C", "D"][i] ? " ✅" : ""}
        </li>
      `).join("")}
    </ul>

    ${q.explanation ? `
      <div class="mt-10"><b>Explanation:</b></div>
      <div class="mt-10 prepos-text">
  ${q.explanation}
</div>
    ` : ""}
  `;
}

    // RESET topic UI
    document.getElementById("bankTopicInput").value = "";
    document.getElementById("bankTopicTags").innerHTML = "";
    updateConfirmState();
    renderTopicWarnings([]);
  }
// RESET CA
document.getElementById("caToggle").checked = false;
document.getElementById("caFields").classList.add("hidden");
document.getElementById("caEventInput").value = "";
document.getElementById("caDateInput").value = "";
  // --------------------------------
  // REMOVE TOPIC
  // --------------------------------
  if (e.target.classList.contains("remove-topic")) {
    const qIndex = +e.target.dataset.q;
    const tIndex = +e.target.dataset.ti;

    removeTopic(qIndex, tIndex);
  }

});
// --------------------------------
// CREATE QUESTION
// --------------------------------
function createNewQuestion() {
const q = {
  id: crypto.randomUUID(),
  question_id: null,
  text: "",
  options: [
    { id:"A", text:"" },
    { id:"B", text:"" },
    { id:"C", text:"" },
    { id:"D", text:"" }
  ],
  correct: "A",
  explanation: "",
  topics: [],
  bank_status: "draft",
  primary_pattern: null, 

  generator: {
  enabled: false,
  subject: "malayalam",
  pattern: null,
  source: "rule-based",
  version: 1,
  last_generated_at: null
},

  // 🔥 ADD THIS BLOCK
  difficulty: {
    cognitive_level: null,
    complexity_level: null,
    depth_level: null,
    score: null,
    label: null
  },
  
};
ensureMetadata(q);
  currentDraft.schema_json.sections[0].questions.push(q);
  renderDraft(currentDraft);
}

// ===============================
// APPEND GENERATED QUESTION
// ===============================
function appendGeneratedQuestion(generated) {

  if (!generated) return;

  const list = Array.isArray(generated)
    ? generated
    : [generated];

  list.forEach(q => {

    currentDraft
      .schema_json
      .sections[0]
      .questions
      .push(q);

  });

  renderDraft(currentDraft);

  scheduleAutosave();

}
//===============================
// GENERATOR RUNNER (CLEAN)
// ===============================
async function generateFromConfig(config) {

  try {

    const result = await runGenerator(config);

    if (!result) {
      console.error("Generator returned empty result");
      setStatus("Generator returned empty result", true);
      return null;
    }

    setStatus("Generated question");

    return result;

  } catch (err) {

    console.error(err);
    setStatus("Generator failed", true);

    return null;
  }
}

// --------------------------------
// SAVE DRAFT (FIXED)
// --------------------------------
async function saveDraft(silent = false, options = {}) {
  if (!currentDraft) return;
  const shouldThrow = Boolean(options.throwOnError);

// WAIT if already saving
while (isSaving) {
  await new Promise(r => setTimeout(r, 50));
}

  isSaving = true;

  try {
    // --------------------------------
// SYNC DOM → DATA (CRITICAL FIX)
// --------------------------------
document.querySelectorAll(".qtext").forEach(el => {
  const i = +el.dataset.i;
  const q = currentDraft.schema_json.sections[0].questions[i];
  if (!q) return;

  q.text = el.value;
});

document.querySelectorAll(".opt").forEach(el => {
  const i = +el.dataset.i;
  const oi = +el.dataset.oi;

  const q = currentDraft.schema_json.sections[0].questions[i];
  if (!q) return;

  if (!q.options[oi]) {
    q.options[oi] = { id: ["A","B","C","D"][oi], text: "" };
  }

  q.options[oi].text = el.value;
});

document.querySelectorAll(".explanation").forEach(el => {
  const i = +el.dataset.i;
  const q = currentDraft.schema_json.sections[0].questions[i];
  if (!q) return;

  q.explanation = el.value;
});

document.querySelectorAll('#questions input[type="radio"]:checked').forEach(el => {
  const i = +el.dataset.i;
  const q = currentDraft.schema_json.sections[0].questions[i];
  if (!q || Number.isNaN(i)) return;

  q.correct = el.value;
});

// --------------------------------
    // 🔴 VALIDATION (ADD HERE)
    // --------------------------------
    const questions = currentDraft.schema_json.sections[0].questions;

    if (!silent) {
      for (const q of questions) {
        if (!q.text || !q.text.trim()) {
          throw new Error("Empty question detected");
        }
      }
    }

    const payload = {
      title: document.getElementById("title").value || "Untitled Draft",
      duration: parseInt(document.getElementById("duration").value) || 60,
      schema_json: currentDraft.schema_json,
      logo_url: logoURL,
      status: currentDraft.status || "draft"
    };

    if (!draftId) {
      const { data, error } = await sb
        .from("draft_exams")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      draftId = data.id;

      history.replaceState(null, "", `draft.html?id=${draftId}`);
      setStatus("Draft created");
    } else {
      const { error } = await sb
        .from("draft_exams")
        .update(payload)
        .eq("id", draftId);

      if (error) throw error;

      if (!silent) setStatus("Saved");
    }

    console.log("saveDraft: success", { draftId, status: currentDraft.status });

  } catch (e) {
    console.error(e);
    setStatus("Save failed", true);
    if (!silent || shouldThrow) throw e;
  } finally {
    isSaving = false;
  }
}

// --------------------------------
// ✅ PUBLISH DRAFT (FINAL VERSION)
// --------------------------------
function validateDraftForPublish() {
  const questions = currentDraft?.schema_json?.sections?.[0]?.questions || [];

  if (!questions.length) {
    throw new Error("Add at least one question before publishing");
  }

  questions.forEach((q, index) => {
    if (!q.text || !q.text.trim()) {
      throw new Error(`Question ${index + 1} is empty`);
    }
  });
}

async function publishDraft() {
  if (isPublishing) return;

  if (!draftId) {
    alert("Save draft before publishing");
    return;
  }

  const publishBtn = document.getElementById("publishDraftBtn");
  const originalPublishText = publishBtn?.innerText;
  let createdSessionId = null;
  let draftUpdated = false;

  try {
    isPublishing = true;

    if (publishBtn) {
      publishBtn.disabled = true;
      publishBtn.innerText = "Publishing...";
    }

    await saveDraft(true, { throwOnError: true });
    validateDraftForPublish();
    setStatus("Publishing...");

    const payload = {
      title: document.getElementById("title").value || "Untitled Exam",
      duration: parseInt(document.getElementById("duration").value) || 60,
      schema_json: currentDraft.schema_json,
      logo_url: logoURL || null
    };

    // ✅ Insert into exam_sessions (NOT exams)
    const { data: session, error } = await sb
      .from("exam_sessions")
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    createdSessionId = session.id;

    // ✅ Update draft
    const { error: draftUpdateError } = await sb
      .from("draft_exams")
      .update({
        status: "published",
        published_exam_id: session.id
      })
      .eq("id", draftId);

    if (draftUpdateError) throw draftUpdateError;
    draftUpdated = true;

    currentDraft.status = "published";
    currentDraft.published_exam_id = session.id;

    setStatus("Published ✅");

    // ✅ Use session id
    const linkBox = document.getElementById("examLink");
    if (linkBox) {
      linkBox.classList.remove("hidden");
      linkBox.innerHTML = `
        <b>Exam Published</b><br>
        <a href="exam.html?id=${session.id}" target="_blank">
          Open Exam
        </a>
      `;
    }

  } catch (err) {
    console.error(err);

    if (createdSessionId && !draftUpdated) {
      const { error: cleanupError } = await sb
        .from("exam_sessions")
        .delete()
        .eq("id", createdSessionId);

      if (cleanupError) {
        console.error("Publish cleanup failed:", cleanupError);
      }
    }

    alert(err.message || "Publish failed");
    setStatus("Publish failed", true);
  } finally {
    isPublishing = false;

    if (publishBtn) {
      publishBtn.disabled = false;
      publishBtn.innerText = originalPublishText || "Publish";
    }
  }
}

async function uploadLogo(file) {

  const fileExt = file.name.split(".").pop();
  const fileName = `logo-${Date.now()}.${fileExt}`;

  const { data, error } = await sb.storage
    .from("logos")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: true
    });

  if (error) {
    console.error("Logo upload failed:", error);
    return null;
  }

  const { data: publicUrlData } = sb.storage
    .from("logos")
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}
// --------------------------------
// INIT
// --------------------------------
async function init() {

  await loadPatternDefinitions();
await loadCAEventDefinitions();

document.getElementById("metadataContent")
  ?.addEventListener("click", async (e) => {

  if (e.target.id !== "saveMetadataBtn") return;

  const q = currentDraft.schema_json.sections[0].questions[selectedQuestionIndex];

  if (!q.question_id) {
    alert("Save question to bank first");
    return;
  }

  try {
    await replaceQuestionMetadata(q.question_id, q);

    document.getElementById("metadataPanel").classList.add("hidden");
    document.body.style.overflow = "";

    setStatus("Metadata updated ✅");

  } catch (err) {
    console.error(err);
    alert("Failed to update metadata");
  }
});
 
// --------------------------------
// PUBLISH BUTTON
// --------------------------------
document.getElementById("publishDraftBtn")
  ?.addEventListener("click", publishDraft);

   // --------------------------------
// CLOSE META PANEL
// --------------------------------
document.getElementById("closeMetadata")
  ?.addEventListener("click", () => {
    document.getElementById("metadataPanel").classList.add("hidden");
    document.body.style.overflow = "";
});

  // --------------------------------
// ADD FROM QUESTION BANK (FIXED)
// --------------------------------
document.getElementById("addAllResultsBtn")
  ?.addEventListener("click", addAllResultsToDraft);

document.getElementById("questionBankResults")
  ?.addEventListener("click", (e) => {

  const btn = e.target.closest(".add-from-bank-btn");
  if (!btn) return;

  const qId = btn.dataset.id;

  addQuestionFromBank(qId, btn);
});

  document.getElementById("qbSearch")
  ?.addEventListener("input", async (e) => {

  const query = e.target.value.trim();

  console.log("SEARCH QUERY:", query); // 👈 add this
  const results = await searchQuestionBank(query);
  console.log("RESULTS:", results); // 👈 add this

  renderQuestionBankResults(results);
});

document.getElementById("topicSearch")
  ?.addEventListener("input", async (e) => {

  const query = e.target.value.trim();

  const topics = await searchTopicsForDropdown(query);
  const normalizedQuery = query.trim().toLowerCase();

const exactMatch = topics.some(
  t => t.name.trim().toLowerCase() === normalizedQuery
);

  const dropdown = document.getElementById("topicDropdown");

  if (!topics.length) {
    dropdown.classList.add("hidden");
    return;
  }

    dropdown.classList.remove("hidden");

    let html = "";

    // Existing topics
    html += topics.map(t => `
  <div class="topic-tag topic-option" data-id="${t.id}">
    ${t.name}
  </div>
`).join("");

    // 🔥 Add "Create New" only if NO exact match
    if (!exactMatch && query.trim()) {
      html += `
    <div class="topic-tag create-new" data-value="${query}">
      + Create "${formatTopicName(query)}"
    </div>
  `;
    }

    dropdown.innerHTML = html;
});

document.getElementById("topicDropdown")
  ?.addEventListener("click", async (e) => {

  if (!e.target.classList.contains("topic-option")) return;

  const topicId = e.target.dataset.id;

  const { data, error } = await sb
    .from("question_topics")
    .select(`
      questions (*)
    `)
    .eq("topic_id", topicId);

  if (error) {
    console.error("Topic fetch error:", error);
    return;
  }

  const questions = data.map(qt => qt.questions);

  renderQuestionBankResults(questions);

  document.getElementById("topicDropdown").classList.add("hidden");
});

document.getElementById("createNewBtn")
  ?.addEventListener("click", async () => {

  const q = currentDraft.schema_json.sections[0].questions[selectedQuestionIndex];

  try {
    // ✅ Match the same duplicate logic used by the standard bank save flow
    syncDifficultyToMeta(q);

    const hashInput = (
      q.text +
      (q.options || []).map(o =>
        typeof o === "string" ? o : o.text
      ).join("")
    ).trim().toLowerCase();
    const hash = await generateHash(hashInput);

    // ✅ Insert cleanly
    const { data, error } = await sb
      .from("questions")
      .insert({
        question_text: q.text,
        option_a: q.options[0]?.text || "",
        option_b: q.options[1]?.text || "",
        option_c: q.options[2]?.text || "",
        option_d: q.options[3]?.text || "",
        correct_option: q.correct,
        explanation: q.explanation,
        question_hash: hash,
        difficulty_score_cached: q.meta_structured?.difficulty_score,
        difficulty_label_cached: q.meta_structured?.difficulty_label
      })
      .select()
      .single();

    if (error) throw error;

    // ✅ Attach topics AFTER insert
    await attachTopics(data.id, q.topics);
    await replacePatternMetadata(
  data.id,
  q.primary_pattern || null
);
// 🔥 SAVE DIFFICULTY METADATA
if (q.meta_structured?.difficulty_score !== null) {

syncDifficultyToMeta(q);
  const meta = q.meta_structured || {};
const metadata = [
  { key: "cognitive_level", value: meta.cognitive_level },
  { key: "complexity_level", value: meta.complexity },
  { key: "depth_level", value: meta.depth },
  { key: "difficulty_score", value: meta.difficulty_score },
  { key: "difficulty_label", value: meta.difficulty_label },
  { key: "question_type", value: meta.question_type || "mcq_single" }
];

  const rows = metadata.map(m => ({
    question_id: data.id,
    key: m.key,
    value: m.value
  }));

  await sb
  .from("question_metadata")
  .upsert(rows, { onConflict: "question_id,key" });
}

// 🔥 ADD THIS (MISSING LINK)
q.question_id = data.id;

q.bank_status = "saved";

    renderDraft(currentDraft);

    document.getElementById("addToBankPanel").classList.add("hidden");
    document.getElementById("duplicateBox").classList.add("hidden");

    setStatus("New question created ✅");

  } catch (err) {
    console.error(err);
    alert(err.message);
  }

});

  document.getElementById("useExistingBtn")
  ?.addEventListener("click", async () => {

  const q = currentDraft.schema_json.sections[0].questions[selectedQuestionIndex];

    try {
      // attach topics only (no new question)
      await attachTopics(window.duplicateQuestionId, q.topics);

      await replacePatternMetadata(
        window.duplicateQuestionId,
        q.primary_pattern || null
      );
      q.question_id = window.duplicateQuestionId;
      q.bank_status = "duplicate";

    renderDraft(currentDraft);

    document.getElementById("addToBankPanel").classList.add("hidden");
    document.getElementById("duplicateBox").classList.add("hidden");

    setStatus("Linked to existing question ✅");

  } catch (err) {
    console.error(err);
    alert("Failed to link question");
  }

});

function setupTopicInput(inputId, tagsId, warningsId) {

  const input = document.getElementById(inputId);
  const container = document.getElementById(tagsId);

  if (!input || !container) return;

  // create dropdown
  const dropdown = document.createElement("div");
  dropdown.className = "topic-dropdown hidden";
  input.parentNode.appendChild(dropdown);

  // ------------------------
  // INPUT SEARCH
  // ------------------------
  input.addEventListener("input", async (e) => {

    const query = e.target.value.trim();

    renderTopicWarnings(
      getTopicWarnings(query),
      warningsId
    );

    if (!query) {
      dropdown.classList.add("hidden");
      return;
    }

    const topics = await searchTopicsForDropdown(query);

    const normalizedQuery = query.toLowerCase();

    const exactMatch = topics.some(
      t => t.name.toLowerCase() === normalizedQuery
    );

    let html = "";

    // existing topics
    html += topics.map(t => `
      <div class="topic-option" data-value="${t.name}">
        ${t.name}
      </div>
    `).join("");

    // create new
    if (!exactMatch) {
      html += `
        <div class="topic-option create-new" data-value="${query}">
          + Create "${formatTopicName(query)}"
        </div>
      `;
    }

    dropdown.innerHTML = html;
    dropdown.classList.remove("hidden");

  });

  // ------------------------
  // SELECT
  // ------------------------
  dropdown.addEventListener("click", (e) => {

    const option = e.target.closest(".topic-option");
    if (!option) return;

    const value = option.dataset.value;

    createTopicTag(container, value);

    input.value = "";
    dropdown.classList.add("hidden");

    updateConfirmState();
  });

  // ------------------------
  // ENTER fallback
  // ------------------------
  input.addEventListener("keydown", (e) => {

    if (e.key !== "Enter") return;

    e.preventDefault();

    const value = input.value.trim();
    if (!value) return;

    createTopicTag(container, value);

    input.value = "";
    dropdown.classList.add("hidden");

  });
}

// --------------------------------
// INIT TOPIC INPUT SYSTEMS
// --------------------------------
setupTopicInput("bankTopicInput", "bankTopicTags", "topicWarnings");
setupTopicInput("bulkTopicInput", "bulkTopicTags", "bulkTopicWarnings");
// ===============================
// CA TOGGLE 
// ===============================
document.getElementById("caToggle")
?.addEventListener("change", (e)=>{

  document
    .getElementById("caFields")
    ?.classList.toggle("hidden", !e.target.checked);

});

document.getElementById("caEventInput")
?.addEventListener("input", (e)=>{

  const dropdown =
    document.getElementById("caEventDropdown");

  renderCAEventDropdown(dropdown, e.target.value);

  dropdown.classList.remove("hidden");

});
document.getElementById("caEventDropdown")
?.addEventListener("click", (e)=>{

  if (!e.target.classList.contains("pattern-option"))
    return;

  document.getElementById("caEventInput").value =
    e.target.dataset.key;

  document
    .getElementById("caEventDropdown")
    .classList.add("hidden");

});

document.getElementById("caEventInput")
?.addEventListener("focus", ()=>{

  const dropdown =
    document.getElementById("caEventDropdown");

  renderCAEventDropdown(dropdown, "");

  dropdown.classList.remove("hidden");

});

  document.getElementById("closeAddToBank")
  ?.addEventListener("click", () => {
    document.getElementById("addToBankPanel").classList.add("hidden");
    document.body.style.overflow = ""; // 🔥 ADD
  });

// --------------------------------
// CLOSE SAVE ALL PANEL
// --------------------------------
document.getElementById("closeSaveAll")
  ?.addEventListener("click", () => {

    document.getElementById("saveAllPanel")?.classList.add("hidden");
    document.body.style.overflow = "";

  });

   // 🔥 FORCE RESET UI STATE
  const newBtn = document.getElementById("newQuestionBtn");
  if (newBtn) newBtn.disabled = false;

  document.getElementById("newQuestionBtn")
    ?.addEventListener("click", createNewQuestion);

  // --------------------------------
// SAVE ALL → OPEN PANEL
// --------------------------------
document.getElementById("saveAllToBankBtn")
  ?.addEventListener("click", () => {

    const qs = currentDraft.schema_json.sections[0].questions;

    // --------------------------------
    // 🔥 DETECT MISSING TOPICS
    // --------------------------------
    const missing = qs.filter(q => !q.topics?.length).length;

    // --------------------------------
    // UPDATE WARNING UI (🔥 ADD THIS)
    // --------------------------------
    const warningBox = document.getElementById("missingTopicWarning");

    if (warningBox) {
  if (missing > 0) {
    warningBox.className = "status warning mt-10";
    warningBox.innerText = `⚠ ${missing} questions missing topics`;
  } else {
    warningBox.className = "status success mt-10";
    warningBox.innerText = "All questions already have topics ✅";
  }
}

    // --------------------------------
    // OPEN PANEL
    // --------------------------------
    document.getElementById("saveAllPanel")?.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    // --------------------------------
    // RESET TOPIC SYSTEM
    // --------------------------------
    document.getElementById("bulkTopicInput").value = "";
document.getElementById("bulkTopicTags").innerHTML = "";
renderTopicWarnings([], "bulkTopicWarnings");
    updateConfirmState();

  });

  document.getElementById("openQuestionBankBtn")
    ?.addEventListener("click", () => {
      document.getElementById("questionBankPanel").classList.remove("hidden");
      document.body.style.overflow = "hidden";
    });

  document.getElementById("closeQB")
    ?.addEventListener("click", () => {
      document.getElementById("questionBankPanel").classList.add("hidden");
      document.body.style.overflow = ""; // 🔥 ADD
    });

  document.getElementById("logoUpload")
  ?.addEventListener("change", async (e) => {

  const file = e.target.files[0];
  if (!file) return;

  // 🔥 Instant preview (UX)
  const previewURL = URL.createObjectURL(file);

  const preview = document.getElementById("logoPreview");
  if (preview) {
    preview.src = previewURL;
    preview.classList.remove("hidden");
  }

  // 🔥 Upload to Supabase (REAL FIX)
  const uploadedURL = await uploadLogo(file);

  if (uploadedURL) {
    logoURL = uploadedURL;
    console.log("Logo stored at:", logoURL);
  }

});

// --------------------------------
// CONFIRM ADD TO BANK (FIXED)
// --------------------------------
document.getElementById("confirmAddToBank")
  ?.addEventListener("click", async () => {

  if (selectedQuestionIndex === null) return;

  const q = currentDraft.schema_json.sections[0].questions[selectedQuestionIndex];

  // --------------------------------
  // EXTRACT TOPICS FROM TAGS
  // --------------------------------
  const topics = Array.from(
    document.querySelectorAll("#bankTopicTags .topic-tag")
  ).map(el => formatTopicName(el.dataset.value));

  q.topics = topics;
  q.generator = {
    ...q.generator,
    topics_auto: false
  };


  // =====================================
  // CAPTURE CURRENT AFFAIRS (ADD HERE)
  // =====================================
  const isCA = document.getElementById("caToggle")?.checked;

  if (isCA) {
    q.ca_event = {
      type: document.getElementById("caEventInput")?.value?.trim() || null,
      date: document.getElementById("caDateInput")?.value?.trim() || null
    };
  } else {
    q.ca_event = null;
  }


  try {
    const res = await saveQuestionToBank(q);

    // --------------------------------
    // DUPLICATE FLOW
    // --------------------------------
    if (res.isDuplicate) {

      document.getElementById("duplicateBox").classList.remove("hidden");
      window.duplicateQuestionId = res.questionId;

      setStatus("Duplicate detected. Choose an action.");

      return;
    }

    // --------------------------------
    // SUCCESS FLOW
    // --------------------------------
    q.bank_status = "saved";

    renderDraft(currentDraft);

    document.getElementById("addToBankPanel").classList.add("hidden");
    document.body.style.overflow = "";

    setStatus("Question saved to bank ✅");

  } catch (err) {
    console.error(err);
    alert("Failed to save question");
  }

});

document.getElementById("confirmSaveAll")
  ?.addEventListener("click", async () => {

    const topics = Array.from(
      document.querySelectorAll("#bulkTopicTags .topic-tag")
    ).map(el => el.dataset.value);

    if (!topics.length) {
      alert("Add at least one topic");
      return;
    }

    await saveAllQuestionsToBank(topics);

    document.body.style.overflow = "";

  });

window.runGenerator = runGenerator;
window.generateFromConfig = generateFromConfig;

  if (draftId) loadDraft();
  else createEmptyDraft();
}

// --------------------------------
// GLOBAL FIX BUTTON HANDLER (MULTI-CONTAINER SAFE)
// --------------------------------
document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("fix-btn")) return;

  const warningBox = e.target.closest("[id$='Warnings']");
  if (!warningBox) return;

  let inputId = "";

  if (warningBox.id === "topicWarnings") {
    inputId = "bankTopicInput";
  } else if (warningBox.id === "bulkTopicWarnings") {
    inputId = "bulkTopicInput";
  }

  const input = document.getElementById(inputId);
  if (!input) return;

  input.value = e.target.dataset.fix;
  input.dispatchEvent(new Event("input"));
});
// ===============================
// SAVE AS QUESTION SET (DEPRECATED)
// ===============================
async function saveAsQuestionSetDeprecated() {

  if (!draftId) {
    await saveDraft(true);
  }

  const name = prompt("Question Set Name:");
  if (!name) return;

  currentDraft.status = "question_set"; // move BEFORE DB update

  await sb
    .from("draft_exams")
    .update({
      title: name,
      status: "question_set"
    })
    .eq("id", draftId);

  setStatus("Saved as Question Set ✅");
}

// ===============================
// LOAD QUESTION SETS
// ===============================
async function loadQuestionSets() {

  const panel = document.getElementById("questionSetPanel");
  const list = document.getElementById("questionSetList");

  panel.classList.remove("hidden");

  const { data, error } = await sb
    .from("draft_exams")
    .select("id,title")
    .eq("status","question_set")
    .order("created_at",{ascending:false});

  if (error) {
    console.error(error);
    list.innerHTML = "Failed to load question sets";
    setStatus("Question set load failed", true);
    return;
  }

  if (!data.length) {
    list.innerHTML = "No saved question sets";
    return;
  }

  list.innerHTML = data.map(d=>`
    <div class="question-card">

      <b>${d.title}</b>

      <div class="mt-10 flex gap-10">

        <button class="secondary-btn load-set"
                data-id="${d.id}">
          Load
        </button>

        <button class="secondary-btn delete-set"
                data-id="${d.id}">
          Delete
        </button>

      </div>

    </div>
  `).join("");
}

// ===============================
// CLEAR MEMORY
// ===============================
async function clearDraftMemory() {

  if (!confirm("Clear all non-question-set drafts?"))
    return;

  await sb
    .from("draft_exams")
    .delete()
    .neq("status","question_set");

  setStatus("Memory cleared ✅");
}

document.addEventListener("click", async (e)=>{

  // LOAD QUESTION SET
if (e.target.classList.contains("load-set")) {

  pendingSetLoadId = e.target.dataset.id;

  document
    .getElementById("loadSetDialog")
    .classList.remove("hidden");
}

  // DELETE QUESTION SET
  if (e.target.classList.contains("delete-set")) {

    const id = e.target.dataset.id;

    if (!confirm("Delete this question set?"))
      return;

    await sb
      .from("draft_exams")
      .delete()
      .eq("id", id);

    loadQuestionSets();
  }

});

document
.getElementById("confirmLoadSet")
?.addEventListener("click", async () => {

  if (!pendingSetLoadId) return;

  const mode = document.querySelector(
    'input[name="loadMode"]:checked'
  ).value;

  const { data, error } = await sb
    .from("draft_exams")
    .select("schema_json")
    .eq("id", pendingSetLoadId)
    .single();

  if (error) {
    alert("Failed to load question set");
    return;
  }

  const incoming =
    data.schema_json.sections[0].questions || [];

  if (mode === "replace") {

    currentDraft.schema_json.sections[0].questions =
      JSON.parse(JSON.stringify(incoming));

  } else {

    currentDraft.schema_json.sections[0].questions.push(
      ...JSON.parse(JSON.stringify(incoming))
    );

  }

  renderDraft(currentDraft);
  document
.getElementById("questionSetPanel")
.classList.add("hidden");

  document
    .getElementById("loadSetDialog")
    .classList.add("hidden");

  pendingSetLoadId = null;

  setStatus(
    mode === "replace"
      ? "Question set loaded"
      : "Question set added"
  );

});

document
.getElementById("cancelLoadSet")
?.addEventListener("click", () => {

  pendingSetLoadId = null;

  document
    .getElementById("loadSetDialog")
    .classList.add("hidden");

});

async function saveAsQuestionSetSafe() {
  const name = prompt("Question Set Name:");
  if (!name?.trim()) return;

  try {
    await saveDraft(true);

    const duration =
      parseInt(document.getElementById("duration")?.value, 10) || 60;

    const { error } = await sb
      .from("draft_exams")
      .insert({
        title: name.trim(),
        duration,
        schema_json: JSON.parse(JSON.stringify(currentDraft.schema_json)),
        logo_url: logoURL,
        status: "question_set"
      });

    if (error) throw error;

    setStatus("Saved as Question Set ✅");
  } catch (error) {
    console.error(error);
    alert("Failed to save question set");
    setStatus("Question set save failed", true);
  }
}
// ===============================
// QUESTION SET BUTTONS
// ===============================
document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("saveQuestionSetBtn")
    ?.addEventListener("click", saveAsQuestionSetSafe);

  document.getElementById("loadQuestionSetBtn")
    ?.addEventListener("click", loadQuestionSets);

  document.getElementById("clearMemoryBtn")
    ?.addEventListener("click", clearDraftMemory);

  document.getElementById("clearDraftBtn")
    ?.addEventListener("click", clearDraftQuestions);

  document.getElementById("closeQuestionSet")
    ?.addEventListener("click", () => {
      document
        .getElementById("questionSetPanel")
        ?.classList.add("hidden");
    });

});

init();

// ========================================
// GLOBAL DROPDOWN CLOSE HANDLER (SINGLE SOURCE)
// ========================================
document.addEventListener("click", (e) => {

  document.querySelectorAll(".pattern-dropdown")
    .forEach(d => {

      const container =
        d.closest(".pattern-box") || d.parentElement;

      if (!container || !container.contains(e.target)) {
        d.classList.add("hidden");
      }

    });

});

// --------------------------------
// GLOBALS
// --------------------------------
window.saveDraft = saveDraft;
window.publishDraft = publishDraft;
window.deleteQuestion = deleteQuestion;
window.duplicateQuestion = duplicateQuestion;
window.moveQuestionUp = moveQuestionUp;
window.moveQuestionDown = moveQuestionDown;
