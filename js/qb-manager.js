// ===============================
// PrepOS QB Manager
// ===============================

import { getClient } from "./core/get-client.js";
import { bootPage } from "./core/page-boot.js";
import { resolveAppPath } from "./core/access.js";
import { computeQuestionHash } from "./core/question-hash.js";
import { invokeEdgeFunction } from "./core/edge-invoke.js";
import {
  ensureMalayalamAssistance,
  hasMalayalamAssistance,
  malayalamAssistanceFromMetadata,
  malayalamAssistanceToMetadataPayload,
  ML_VARIANT_VERIFICATION_KEY,
  computeMalayalamAssistanceHash,
  getMlVariantVerificationRecord,
} from "./core/question-assistance.js";
import { parseQuestionPaste } from "./core/question-parser.js";
import { copyMalayalamTranslationRequest } from "./core/malayalam-copy.js";
import { openModal, closeModal } from "./ui/modal-system.js";

const SIDE_PANEL_OPTIONS = {
  overlayType: "side-panel",
  closeOnBackdrop: false,
};

let statusTimer = null;

function openSidePanel(id, options = {}) {
  return openModal(id, { ...SIDE_PANEL_OPTIONS, ...options });
}

function formatDbError(error) {
  return error?.message || "Save failed";
}

function showQbStatus(message, isError = false) {
  const el = document.getElementById("qb-status");
  if (!el) return;

  el.textContent = message;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");

  if (statusTimer) {
    clearTimeout(statusTimer);
  }

  statusTimer = setTimeout(() => {
    el.classList.add("hidden");
  }, isError ? 6000 : 3500);
}

function unwrapMetaValue(value) {
  if (value == null || value === "null") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return String(value);
}

function extractQuestionMeta(question = {}) {
  const meta = {};
  (question.question_metadata || []).forEach(row => {
    meta[row.key] = unwrapMetaValue(row.value);
  });
  return meta;
}

function questionWithAssistance(question = {}) {
  const row = (question.question_metadata || []).find(
    entry => entry.key === "assistance_malayalam"
  );
  const patch = malayalamAssistanceFromMetadata(row?.value);
  if (!patch) {
    return question;
  }

  return { ...question, ...patch };
}

function bankQuestionForCopy(question = {}) {
  return {
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
    correct_option: question.correct_option,
    explanation: question.explanation,
  };
}

function applyParsedMalayalamToQbCard(questionId, parsed) {
  const block = document.getElementById(`ml-${questionId}`);
  if (!block || !parsed) {
    return false;
  }

  const questionInput = block.querySelector(".ml-question-input");
  const explanationInput = block.querySelector(".ml-explanation-input");

  if (questionInput) {
    questionInput.value = parsed.text || "";
  }

  if (explanationInput) {
    explanationInput.value = parsed.explanation || "";
  }

  for (const letter of ["A", "B", "C", "D"]) {
    const input = block.querySelector(`.ml-option-input[data-letter="${letter}"]`);
    const option = parsed.options?.find((entry) => entry.id === letter);
    if (input) {
      input.value = option?.text || "";
    }
  }

  return true;
}

function applyMalayalamQcpPasteToCard(questionId) {
  const block = document.getElementById(`ml-${questionId}`);
  if (!block) {
    showQbStatus("Malayalam editor not open.", true);
    return;
  }

  const rawText = block.querySelector(".ml-qcp-paste-input")?.value || "";
  const clean = Boolean(block.querySelector(".ml-qcp-paste-clean")?.checked);
  const result = parseQuestionPaste(rawText, { target: "malayalam", clean });

  if (!result.ok) {
    showQbStatus(result.error, true);
    return;
  }

  applyParsedMalayalamToQbCard(questionId, result.malayalam);
  showQbStatus("Malayalam fields filled from paste — review and Save Malayalam");
}

async function reportQbCopyResult(result) {
  if (!result.count) {
    showQbStatus("Nothing to copy.", true);
    return;
  }

  if (result.ok) {
    const label = result.count === 1 ? "1 question" : `${result.count} questions`;
    showQbStatus(`Copied prompt + ${label} for translation 📋`);
    return;
  }

  showQbStatus("Copy failed — select all text in the dialog and copy manually.", true);
  window.prompt("Copy this text:", result.text);
}

async function copyBankQuestionForTranslation(question) {
  await reportQbCopyResult(
    await copyMalayalamTranslationRequest(bankQuestionForCopy(question), {
      startIndex: 1,
    })
  );
}

async function copySelectedQuestionsForTranslation() {
  const ordered = state.questions.filter((question) =>
    state.selectedQuestionIds.has(question.id)
  );

  await reportQbCopyResult(
    await copyMalayalamTranslationRequest(
      ordered.map((question) => bankQuestionForCopy(question)),
      { startIndex: 1 }
    )
  );
}

function updateQbSelectionToolbar() {
  const copyBtn = document.getElementById("qb-copy-selected-ml");
  const count = state.selectedQuestionIds.size;

  if (copyBtn) {
    copyBtn.disabled = count === 0;
    copyBtn.textContent =
      count > 0
        ? `Copy selected (${count}) for translation`
        : "Copy selected for translation";
  }
}

function renderMalayalamInlineBlock(questionId, mlQuestion, mlVerified = false) {
  const mask = ensureMalayalamAssistance({ ...mlQuestion });
  const options = mask.options || {};
  const hasMl = hasMalayalamAssistance(mlQuestion);

  return `
<div class="malayalam-block hidden" id="ml-${questionId}">
  <p class="text-muted question-assistance-help">
    English stays canonical for scoring. Students can toggle Malayalam help during exams and practice.
  </p>

  <details class="ml-qcp-paste-panel">
    <summary class="ml-qcp-paste-summary">Paste Malayalam (QCP)</summary>
    <p class="text-muted ml-qcp-paste-help">
      Paste ChatGPT output here after using <strong>Copy for ML</strong>. Use
      <code>ഉത്തരം:</code> / <code>വിശദീകരണം:</code> labels when possible.
    </p>
    <textarea
      class="ml-qcp-paste-input"
      data-id="${questionId}"
      rows="6"
      placeholder="1. ചോദ്യം മലയാളത്തിൽ&#10;A) …&#10;B) …&#10;C) …&#10;D) …&#10;ഉത്തരം: B&#10;വിശദീകരണം: …"
    ></textarea>
    <div class="flex gap-10 mt-10 ml-qcp-paste-actions">
      <label class="ml-qcp-paste-clean-label">
        <input type="checkbox" class="ml-qcp-paste-clean" data-id="${questionId}">
        Clean first (QCP)
      </label>
      <button
        type="button"
        class="secondary-btn apply-ml-qcp-paste"
        data-id="${questionId}"
      >
        Apply paste
      </button>
    </div>
  </details>

  <label class="malayalam-field-label">Question (Malayalam)</label>
  <textarea
    class="ml-question-input"
    data-id="${questionId}"
    rows="3"
    placeholder="Malayalam question stem (optional)"
  >${mask.text || ""}</textarea>

  <div class="malayalam-options-label">Options (Malayalam)</div>

  <label class="malayalam-field-label">A</label>
  <input
    class="ml-option-input"
    data-id="${questionId}"
    data-letter="A"
    type="text"
    value="${options.A || ""}"
    placeholder="Malayalam text for option A"
  />

  <label class="malayalam-field-label">B</label>
  <input
    class="ml-option-input"
    data-id="${questionId}"
    data-letter="B"
    type="text"
    value="${options.B || ""}"
    placeholder="Malayalam text for option B"
  />

  <label class="malayalam-field-label">C</label>
  <input
    class="ml-option-input"
    data-id="${questionId}"
    data-letter="C"
    type="text"
    value="${options.C || ""}"
    placeholder="Malayalam text for option C"
  />

  <label class="malayalam-field-label">D</label>
  <input
    class="ml-option-input"
    data-id="${questionId}"
    data-letter="D"
    type="text"
    value="${options.D || ""}"
    placeholder="Malayalam text for option D"
  />

  <label class="malayalam-field-label">Explanation (Malayalam, optional)</label>
  <textarea
    class="ml-explanation-input"
    data-id="${questionId}"
    rows="3"
    placeholder="Malayalam explanation for review (optional)"
  >${mask.explanation || ""}</textarea>

  <div class="flex gap-10 mt-10 malayalam-block-actions">
    <button
      class="primary-btn save-malayalam"
      data-id="${questionId}"
      type="button"
    >
      Save Malayalam
    </button>
    <button
      class="secondary-btn certify-malayalam${hasMl ? "" : " hidden"}"
      data-id="${questionId}"
      type="button"
    >
      Mark verified
    </button>
    <button
      class="secondary-btn revoke-malayalam-cert${mlVerified ? "" : " hidden"}"
      data-id="${questionId}"
      type="button"
    >
      Remove verification
    </button>
  </div>
</div>
  `.trim();
}

function readMalayalamFromCard(questionId) {
  const block = document.getElementById(`ml-${questionId}`);
  if (!block) {
    return null;
  }

  const readOption = letter =>
    block.querySelector(`.ml-option-input[data-letter="${letter}"]`)?.value ?? "";

  return {
    text: block.querySelector(".ml-question-input")?.value ?? "",
    options: {
      A: readOption("A"),
      B: readOption("B"),
      C: readOption("C"),
      D: readOption("D"),
    },
    explanation: block.querySelector(".ml-explanation-input")?.value ?? "",
  };
}

function toggleMalayalamBlock(questionId, button = null) {
  const block = document.getElementById(`ml-${questionId}`);
  if (!block) {
    return;
  }

  block.classList.toggle("hidden");
  const open = !block.classList.contains("hidden");

  if (button) {
    button.classList.toggle("malayalam-btn--open", open);
    button.title = open
      ? "Hide Malayalam editor"
      : button.classList.contains("malayalam-btn--active")
        ? "Edit Malayalam assistance"
        : "Add Malayalam assistance";
  }
}

async function saveMalayalamAssistance(questionId, payload) {
  await invokeEdgeFunction("update-question-assistance-malayalam", {
    questionId,
    malayalam: payload,
  });
}

async function clearMlVariantVerification(questionId) {
  const sb = await getClient();
  await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .eq("key", ML_VARIANT_VERIFICATION_KEY);
}

async function certifyMlVariant(questionId) {
  const payload = readMalayalamFromCard(questionId);
  const question = { assistance: { malayalam: payload } };
  const normalized = malayalamAssistanceToMetadataPayload(question);

  if (!normalized || !hasMalayalamAssistance(question)) {
    throw new Error("Add Malayalam content before marking as verified");
  }

  const contentHash = await computeMalayalamAssistanceHash(normalized);
  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser();

  const { error } = await sb
    .from("question_metadata")
    .upsert(
      {
        question_id: questionId,
        key: ML_VARIANT_VERIFICATION_KEY,
        value: {
          content_hash: contentHash,
          verified_at: new Date().toISOString(),
          verified_by: userData?.user?.id ?? null,
        },
      },
      { onConflict: "question_id,key" }
    );

  if (error) {
    throw error;
  }
}

async function enrichQuestionMlStatus(question) {
  const mlQuestion = questionWithAssistance(question);
  const hasMl = hasMalayalamAssistance(mlQuestion);
  let verified = false;

  if (hasMl) {
    const record = getMlVariantVerificationRecord(question);
    const payload = malayalamAssistanceToMetadataPayload(mlQuestion);

    if (record?.content_hash && payload) {
      const currentHash = await computeMalayalamAssistanceHash(payload);
      verified = currentHash === record.content_hash;
    }
  }

  question._mlHasContent = hasMl;
  question._mlVerified = verified;
  question._mlNeedsReview = hasMl && !verified;
}

function setRadioGroup(name, value) {
  if (!value) return;

  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.checked = input.value === value;
  });
}

function populateDifficultyPanel(meta = {}) {
  setRadioGroup("cognitive", meta.cognitive_level);
  setRadioGroup("complexity", meta.complexity_level);
  setRadioGroup("depth", meta.depth_level);
}

// --------------------------------
// INIT
// --------------------------------
let selectedQuestionId = null;

// --------------------------------
// STATE
// --------------------------------
const state = {
  questions: [],
  topics: [],
  view: "topics",
  search: "",
  topicFilter: null,
  topicSearch: "",
  caFilter: "all",
  mlFilter: "all",
  selectedQuestionIds: new Set(),
  lastVisibleQuestionIds: [],
};

// --------------------------------
// DOM CACHE
// --------------------------------
const el = {
  questionsView: document.getElementById("questions-view"),
  topicsView: document.getElementById("topics-view"),
  searchInput: document.getElementById("search-input"),
  topicFilter: document.getElementById("topic-filter"),

  totalQuestions: document.getElementById("total-questions"),
  totalTopics: document.getElementById("total-topics"),
  avgPerTopic: document.getElementById("avg-per-topic"),
  weakTopics: document.getElementById("weak-topics")
};

let patternDefinitions = [];
let caDefinitions = [];

async function loadPatternDefinitions() {
  const sb = await getClient()
  const { data, error } = await sb
    .from("metadata_definitions")
    .select("key, description")
    .eq("slot", "pattern")   // 🔥 FIX
    .order("key", { ascending: true });

  if (error) {
    console.error("Pattern load error", error);
    return;
  }

  patternDefinitions = data || [];
}
async function fetchPatterns() {
  await loadPatternDefinitions();
  renderPatternManager();
}

async function loadCADefinitions() {

  const sb = await getClient()
  const { data, error } = await sb
    .from("metadata_definitions")
    .select("key, description")
    .eq("slot", "ca_event")
    .order("key", { ascending: true });

  if (error) {
    console.error("CA load error", error);
    return;
  }

  caDefinitions = data || [];
}

function renderPatternManager() {

  const container = document.getElementById("patternList");

  container.innerHTML = patternDefinitions.map(p => `
    <div class="pattern-row">

      <div class="pattern-key">${p.key}</div>

      <input 
        class="pattern-desc-input"
        data-key="${p.key}"
        value="${p.description || ""}"
      />

      <button 
        class="delete-pattern-btn"
        data-key="${p.key}">
        🗑
      </button>

    </div>
  `).join("");
}

function renderCAManager() {

  const container = document.getElementById("caList");

  container.innerHTML = caDefinitions.map(p => `
    <div class="pattern-row">

      <div class="pattern-key">${p.key}</div>

      <input 
        class="ca-desc-input"
        data-key="${p.key}"
        value="${p.description || ""}"
      />

      <button 
        class="delete-ca-btn"
        data-key="${p.key}">
        🗑
      </button>

    </div>
  `).join("");

}

async function createCA() {

  const sb = await getClient()
  const key = document
    .getElementById("newCAKey")
    .value
    .trim();

  const description = document
    .getElementById("newCADesc")
    .value
    .trim();

  if (!key) {
    alert("Event key required");
    return;
  }

  await sb
    .from("metadata_definitions")
    .insert({
      key,
      description,
      slot: "ca_event"
    });

  document.getElementById("newCAKey").value = "";
  document.getElementById("newCADesc").value = "";

  await loadCADefinitions();
  renderCAManager();
}

async function createPattern() {

  const sb = await getClient()
  const key = document
    .getElementById("newPatternKey")
    .value
    .trim();

  const description = document
    .getElementById("newPatternDesc")
    .value
    .trim();

  if (!key) {
    alert("Pattern key required");
    return;
  }

  await sb
    .from("metadata_definitions")
    .insert({
      key,
      description,
      slot: "pattern"
    });

  document.getElementById("newPatternKey").value = "";
  document.getElementById("newPatternDesc").value = "";

  await fetchPatterns();
}

async function renderPatternDropdown(query = "", topicIds = []) {

  let patterns = [];

  if (topicIds.length) {
    // 🔥 topic-filtered patterns
    patterns = await getPatternsByTopics(topicIds, query);
  } else {
    // fallback to global
    patterns = patternDefinitions
      .map(p => p.key)
      .filter(k =>
        k.toLowerCase().includes(query.toLowerCase())
      );
  }

  const dropdown = document.getElementById("patternDropdown");

  if (!patterns.length) {
    dropdown.innerHTML = `<div class="pattern-empty">No match</div>`;
    return;
  }

  dropdown.innerHTML = patterns.map(p => `
    <div 
      class="pattern-option"
      data-key="${p}"
    >
      ${p}
    </div>
  `).join("");
}

function renderCADropdown(query = "") {

  const dropdown = document.getElementById("caEventDropdown");
  if (!dropdown) return;

  const keys = caDefinitions
    .map(item => item.key)
    .filter(key =>
      key.toLowerCase().includes(query.toLowerCase())
    );

  if (!keys.length) {
    dropdown.innerHTML = `<div class="pattern-empty">No match</div>`;
    return;
  }

  dropdown.innerHTML = keys.map(key => `
    <div class="ca-option pattern-option" data-key="${key}">
      ${key}
    </div>
  `).join("");
}

function computeDifficulty(cognitive, complexity, depth) {

  const map = {
    recall: 1,
    concept: 2,
    application: 3,
    analysis: 4,

    simple: 1,
    moderate: 2,
    complex: 3,

    basic: 1,
    standard: 2,
    advanced: 3
  };

  const score =
    map[cognitive] +
    map[complexity] +
    map[depth];

  let label = "easy";

  if (score >= 7) label = "hard";
  else if (score >= 5) label = "medium";

  return { score, label };
}

async function updateTopicPatterns(questionId, patternKey) {

  const sb = await getClient()
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

  const sb = await getClient()

  const { error: deleteError } = await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .eq("key", "pattern");

  if (deleteError) throw deleteError;

  if (patternKey) {
    const { error: insertError } = await sb
      .from("question_metadata")
      .insert({
        question_id: questionId,
        key: "pattern",
        value: patternKey
      });

    if (insertError) throw insertError;
  }

  const { error: updateError } = await sb
    .from("questions")
    .update({
      primary_pattern_key: patternKey || null
    })
    .eq("id", questionId);

  if (updateError) throw updateError;

  await updateTopicPatterns(questionId, patternKey);
}

async function replaceQuestionMetadata(questionId, difficulty) {

  const sb = await getClient()

  const { error: deleteError } = await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .in("key", [
      "cognitive_level",
      "complexity_level",
      "depth_level",
      "difficulty_score",
      "difficulty_label"
    ]);

  if (deleteError) throw deleteError;

  const rows = [
    { key: "cognitive_level", value: difficulty.cognitive_level },
    { key: "complexity_level", value: difficulty.complexity_level },
    { key: "depth_level", value: difficulty.depth_level },
    { key: "difficulty_score", value: difficulty.score },
    { key: "difficulty_label", value: difficulty.label }
  ].map(m => ({
    question_id: questionId,
    key: m.key,
    value: m.value
  }));

  const { error: insertError } = await sb
    .from("question_metadata")
    .insert(rows);

  if (insertError) throw insertError;

  const { error: cacheError } = await sb
    .from("questions")
    .update({
      difficulty_score_cached: difficulty.score,
      difficulty_label_cached: difficulty.label
    })
    .eq("id", questionId);

  if (cacheError) throw cacheError;
}

async function saveQuestionContent(questionId, payload) {

  const questionText = payload.question_text.trim();
  const options = [
    payload.option_a,
    payload.option_b,
    payload.option_c,
    payload.option_d
  ].map(text => text.trim());

  if (!questionText) {
    throw new Error("Question text is required");
  }

  if (options.filter(Boolean).length < 2) {
    throw new Error("At least two options are required");
  }

  const correctOption = String(payload.correct_option || "A").toUpperCase();

  if (!["A", "B", "C", "D"].includes(correctOption)) {
    throw new Error("Select a valid correct answer");
  }

  const questionHash = await computeQuestionHash(questionText, options);
  const sb = await getClient()

  const { data: duplicate } = await sb
    .from("questions")
    .select("id")
    .eq("question_hash", questionHash)
    .neq("id", questionId)
    .maybeSingle();

  if (duplicate?.id) {
    throw new Error(
      "Another question with the same text and options already exists in the bank."
    );
  }

  const { error } = await sb
    .from("questions")
    .update({
      question_text: questionText,
      option_a: options[0] || "",
      option_b: options[1] || "",
      option_c: options[2] || "",
      option_d: options[3] || "",
      correct_option: correctOption,
      question_hash: questionHash
    })
    .eq("id", questionId);

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "Another question with the same text and options already exists in the bank."
      );
    }
    throw error;
  }
}

async function getPatternsByTopics(topicIds, query = "") {

  const sb = await getClient()
  if (!topicIds.length) return [];

  const { data, error } = await sb
    .from("topic_patterns")
    .select(`
      pattern_key,
      topic_id
    `)
    .in("topic_id", topicIds);

  if (error) {
    console.error("Pattern fetch error", error);
    return [];
  }

  // unique keys
  const unique = [...new Set(data.map(d => d.pattern_key))];

  // filter by query
  return unique
    .filter(p =>
      p.toLowerCase().includes(query.toLowerCase())
    )
    .sort();
}

// --------------------------------
// FETCH
// --------------------------------
async function fetchQuestions() {
  const sb = await getClient()
  const { data, error } = await sb
    .from("questions")
.select(`
  *,
  question_topics (
    topic_id,
    topics ( id, name )
  ),
  question_metadata (
    key,
    value
  )
`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  state.questions = data || [];
  await Promise.all(state.questions.map((question) => enrichQuestionMlStatus(question)));
  render();
}

async function fetchTopics() {
  const sb = await getClient()
  const { data, error } = await sb
    .from("question_topics")
    .select(`
      topic_id,
      topics ( id, name )
    `);

  if (error) {
    console.error(error);
    return;
  }

  const map = {};

  data.forEach(row => {
    if (!row.topics) return;

    const t = row.topics;

    if (!map[t.id]) {
      map[t.id] = { id: t.id, name: t.name, count: 0 };
    }

    map[t.id].count++;
  });

  state.topics = Object.values(map);

  renderTopicFilter();
  renderOverview();
}
// --------------------------------
// ROOT RENDER
// --------------------------------
function render() {
  if (state.view === "questions") {
    el.questionsView.classList.remove("hidden");
    el.topicsView.classList.add("hidden");
    renderQuestions();
  } else {
    el.topicsView.classList.remove("hidden");
    el.questionsView.classList.add("hidden");
    renderTopics();
  }

  renderOverview();
}

// --------------------------------
// OVERVIEW
// --------------------------------
function renderOverview() {
  el.totalQuestions.textContent = state.questions.length;
  el.totalTopics.textContent = state.topics.length;

  const avg = state.topics.length
    ? Math.round(state.questions.length / state.topics.length)
    : 0;

  el.avgPerTopic.textContent = avg;

  const weak = state.topics.filter(t => t.count < 5).length;
  el.weakTopics.textContent = weak;
}

// --------------------------------
// QUESTIONS VIEW
// --------------------------------
function renderQuestions() {
  const hasListTrigger =
    state.search ||
    state.topicFilter ||
    state.mlFilter !== "all";

  if (!hasListTrigger) {
    el.questionsView.innerHTML = `
      <div class="empty-state">
        Search, select a topic, or choose a Malayalam filter to view questions
      </div>
    `;
    return;
  }

  let list = [...state.questions];

  if (state.caFilter !== "all") {
  list = list.filter(q => {

    const meta = {};
    (q.question_metadata || []).forEach(m => {
      meta[m.key] = m.value;
    });

    const isCA = !!meta.ca_event;

    if (state.caFilter === "ca") return isCA;
    if (state.caFilter === "static") return !isCA;

    return true;
  });
}

  if (state.mlFilter === "ml-missing") {
    list = list.filter((q) => !q._mlHasContent);
  }

  if (state.mlFilter === "ml-unverified") {
    list = list.filter((q) => q._mlNeedsReview);
  }

  if (state.mlFilter === "ml-verified") {
    list = list.filter((q) => q._mlVerified);
  }

  if (state.search) {
    list = list.filter(q =>
      q.question_text.toLowerCase().includes(state.search.toLowerCase())
    );
  }

  if (state.topicFilter) {
    list = list.filter(q =>
      (q.question_topics || []).some(
        qt => qt.topic_id == state.topicFilter
      )
    );
  }

  if (!list.length) {
    state.lastVisibleQuestionIds = [];
    updateQbSelectionToolbar();
    const emptyMessage =
      state.mlFilter === "ml-missing" && state.topicFilter
        ? "No missing-Malayalam questions in this topic"
        : state.mlFilter === "ml-missing"
          ? "No missing-Malayalam questions found"
          : state.mlFilter === "ml-unverified" && state.topicFilter
        ? "No unverified Malayalam questions in this topic"
        : state.mlFilter === "ml-unverified"
          ? "No unverified Malayalam questions found"
          : state.mlFilter === "ml-verified"
            ? "No verified Malayalam questions found"
            : "No questions found";

    el.questionsView.innerHTML =
      `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }


  state.lastVisibleQuestionIds = list.map((question) => question.id);

  el.questionsView.innerHTML = list.map(q => {
   // 🔥 EXTRACT METADATA
const meta = {};
(q.question_metadata || []).forEach(m => {
  meta[m.key] = m.value;
});
const difficulty = meta.difficulty_label || "not-set";

const pattern = meta.pattern || q.primary_pattern_key || null;// 🔥 EXTRACT PATTERN 
const caEvent = meta.ca_event || null;
const caDate = meta.ca_date || null;
const caBadge = caEvent
  ? `<div 
       class="ca-badge clickable"
       data-id="${q.id}">
       CA${caDate ? " • " + caDate : ""}
     </div>`
  : "";
    const topicsHTML = (q.question_topics || [])
      .map(qt => `<div class="topic-tag">${qt.topics.name}</div>`)
      .join("");

    const optionsHTML = [
      { key: "A", text: q.option_a },
      { key: "B", text: q.option_b },
      { key: "C", text: q.option_c },
      { key: "D", text: q.option_d }
    ].map(opt => `
      <div class="option-row ${q.correct_option === opt.key ? 'correct' : ''}">
        <div class="opt-label">${opt.key}</div>
        <div class="opt prepos-text">${opt.text}</div>
        ${q.correct_option === opt.key ? `<div class="correct-mark">✔</div>` : ""}
      </div>
    `).join("");

    const mlQuestion = questionWithAssistance(q);
    const hasMl = q._mlHasContent ?? hasMalayalamAssistance(mlQuestion);
    const mlVerified = Boolean(q._mlVerified);
    const mlVerifiedBadge = mlVerified
      ? `<div class="ml-verified-badge" title="Malayalam verified">ML ✓</div>`
      : "";

    return `
      <div class="question-card question-card--copy-footer" data-question-id="${q.id}">

        <div class="q-header">

  <!-- LEFT -->
  <div class="flex gap-10">

  <label class="qb-select-label" title="Select for bulk copy">
    <input
      type="checkbox"
      class="qb-select-question"
      data-id="${q.id}"
      ${state.selectedQuestionIds.has(q.id) ? "checked" : ""}
    />
  </label>

  <div 
    class="difficulty-badge clickable ${difficulty}" 
    data-id="${q.id}">
    ${difficulty === "not-set" ? "NOT SET" : difficulty.toUpperCase()}
  </div>

  <div 
    class="pattern-badge clickable"
    data-id="${q.id}">
    ${pattern || "PATTERN"}
  </div>
  ${caBadge}
  ${mlVerifiedBadge}

</div>

  <!-- RIGHT -->
  <div class="question-actions">
    <button
      class="icon-btn malayalam-btn${hasMl ? " malayalam-btn--active" : ""}"
      data-id="${q.id}"
      title="${hasMl ? "Edit Malayalam assistance" : "Add Malayalam assistance"}"
    >ML</button>
    <button class="icon-btn edit-btn" data-id="${q.id}">✏️</button>
    <button class="icon-btn delete-btn" data-id="${q.id}">🗑</button>
  </div>

</div>

        <div class="qtext prepos-text">${q.question_text}</div>

        <div class="options mt-10">
          ${optionsHTML}
        </div>

<div class="topic-tags mt-10">
  ${topicsHTML}
</div>

${renderMalayalamInlineBlock(q.id, mlQuestion, mlVerified)}

${q.explanation ? `
  <div class="explanation-toggle clickable" data-id="${q.id}">
    Show Explanation
  </div>
` : `
  <div class="explanation-toggle clickable" data-id="${q.id}">
    Add Explanation
  </div>
`}

<div class="explanation-block hidden" id="exp-${q.id}">
  <textarea 
    class="explanation-input"
    data-id="${q.id}"
  >${q.explanation || ""}</textarea>

  <button 
    class="primary-btn save-explanation"
    data-id="${q.id}">
    Save Explanation
  </button>
</div>

<div class="question-card-footer">
  <button
    type="button"
    class="secondary-btn copy-ml-translation-btn"
    data-id="${q.id}"
    title="Copy English QCP and translation prompt for ChatGPT"
  >
    📋 Copy for ML
  </button>
</div>

      </div>
    `;
  }).join("");

  updateQbSelectionToolbar();
}

// --------------------------------
// TOPICS VIEW
// --------------------------------
function renderTopics() {

  // -----------------------------
  // FILTER LIST
  // -----------------------------
  let list = [...state.topics];

  if (state.topicSearch) {
    list = list.filter(t =>
      t.name
        .toLowerCase()
        .includes(state.topicSearch.toLowerCase())
    );
  }

 list.sort((a, b) => b.count - a.count);
  // -----------------------------
  // EMPTY STATE
  // -----------------------------
  if (!list.length) {
    el.topicsView.innerHTML =
      `<div class="empty-state">No topics found</div>`;
    return;
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  el.topicsView.innerHTML = list.map(t => {

    const weak = t.count < 5 ? "warning" : "";
    const disableDelete = t.count > 0 ? "disabled" : "";

    return `
      <div class="question-card ${weak}">

        <div class="q-header">
          <div class="q-title">
            ${t.name} (${t.count})
          </div>

          <div class="question-actions">

            <button 
              class="icon-btn rename-topic"
              data-id="${t.id}"
              data-name="${t.name}">
              ✏️
            </button>

            <button 
              class="icon-btn merge-topic"
              data-id="${t.id}">
              🔀
            </button>

            <button 
              class="icon-btn delete-topic"
              data-id="${t.id}"
              ${disableDelete}>
              🗑
            </button>

          </div>
        </div>

        <div class="flex gap-10 mt-10">

  <button
    class="secondary-btn view-topic-btn"
    data-id="${t.id}">
    View Questions
  </button>

  <button 
    class="secondary-btn open-note-btn" 
    data-id="${t.id}">
    Master Note
  </button>

  <button
    class="secondary-btn import-canonical-note-btn"
    data-id="${t.id}">
    Import canonical note
  </button>

</div>

      </div>
    `;
  }).join("");
}

async function renameTopic(id, oldName) {

  const sb = await getClient()
  const newName = prompt("Rename topic:", oldName);

  if (!newName || newName === oldName) return;

  const normalized = newName.trim().toLowerCase();

  await sb
    .from("topics")
    .update({
      name: newName,
      normalized_name: normalized
    })
    .eq("id", id);

  await fetchTopics();
  await fetchQuestions();
}

async function mergeTopic(sourceId) {

  const sb = await getClient()
  const targetName = prompt(
    "Merge this topic into:\n(Type existing topic name)"
  );

  if (!targetName) return;

  const confirmMerge = confirm(
    `Merge into "${targetName}"?\n\nAll questions will be moved.`
  );

  if (!confirmMerge) return;

  const normalized = targetName.trim().toLowerCase();

  let { data: target } = await sb
    .from("topics")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (!target) {

    const { data } = await sb
      .from("topics")
      .insert({
        name: targetName,
        normalized_name: normalized
      })
      .select()
      .single();

    target = data;
  }

  const targetId = target.id;

  await sb
    .from("question_topics")
    .update({ topic_id: targetId })
    .eq("topic_id", sourceId);

  await sb
    .from("topic_patterns")
    .update({ topic_id: targetId })
    .eq("topic_id", sourceId);

  await sb
    .from("topics")
    .delete()
    .eq("id", sourceId);

  await fetchTopics();
  await fetchQuestions();
}

async function deleteTopic(id) {

  const sb = await getClient()
  // --------------------------------
  // CHECK IF QUESTIONS EXIST
  // --------------------------------
  const { count, error } = await sb
    .from("question_topics")
    .select("*", { count: "exact", head: true })
    .eq("topic_id", id);

  if (error) {
    alert("Failed to check topic usage");
    return;
  }

  // --------------------------------
  // BLOCK DELETE
  // --------------------------------
  if (count > 0) {
    alert(
      "Cannot delete topic.\n\n" +
      "This topic has " + count + " questions.\n" +
      "Merge or reassign questions first."
    );
    return;
  }

  // --------------------------------
  // CONFIRM DELETE
  // --------------------------------
  const ok = confirm(
    "Delete empty topic?\n\nThis cannot be undone."
  );

  if (!ok) return;

  // --------------------------------
  // DELETE PATTERN LINKS
  // --------------------------------
  await sb
    .from("topic_patterns")
    .delete()
    .eq("topic_id", id);

  // --------------------------------
  // DELETE TOPIC
  // --------------------------------
  await sb
    .from("topics")
    .delete()
    .eq("id", id);

  await fetchTopics();
}
// --------------------------------
// FILTER DROPDOWN
// --------------------------------
function renderTopicFilter() {
  el.topicFilter.innerHTML = `
    <option value="">All Topics</option>
    ${state.topics.map(t => `
      <option value="${t.id}">
        ${t.name} (${t.count})
      </option>
    `).join("")}
  `;
}

// --------------------------------
// DELETE
// --------------------------------
async function deleteQuestion(id) {

  const sb = await getClient()
  const ok = confirm(
    "Delete this question?\n\nThis cannot be undone."
  );

  if (!ok) return;

  // ---------------------------
  // DELETE METADATA
  // ---------------------------
  await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", id);

  // ---------------------------
  // DELETE TOPIC LINKS
  // ---------------------------
  await sb
    .from("question_topics")
    .delete()
    .eq("question_id", id);

  // ---------------------------
  // DELETE QUESTION
  // ---------------------------
  await sb
    .from("questions")
    .delete()
    .eq("id", id);

  await fetchQuestions();
  await fetchTopics();
}

function handleEdit(id) {

  const question = state.questions.find(row => row.id === id);
  if (!question) {
    showQbStatus("Question not found", true);
    return;
  }

  selectedQuestionId = id;
  openSidePanel("editQuestionPanel");

  document.getElementById("editQuestionText").value =
    question.question_text || "";
  document.getElementById("editOptionA").value =
    question.option_a || "";
  document.getElementById("editOptionB").value =
    question.option_b || "";
  document.getElementById("editOptionC").value =
    question.option_c || "";
  document.getElementById("editOptionD").value =
    question.option_d || "";

  setRadioGroup(
    "editCorrect",
    String(question.correct_option || "A").toUpperCase()
  );
}

async function replaceCAMetadata(questionId, event, date) {

  const sb = await getClient()

  const { error: deleteError } = await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .in("key", ["ca_event", "ca_date"]);

  if (deleteError) throw deleteError;

  if (!event) return;

  const { error: insertError } = await sb
    .from("question_metadata")
    .insert([
      {
        question_id: questionId,
        key: "ca_event",
        value: event
      },
      {
        question_id: questionId,
        key: "ca_date",
        value: date || null
      }
    ]);

  if (insertError) throw insertError;
}

// --------------------------------
// EVENTS
// --------------------------------
function bindEvents() {

  document
    .getElementById("topic-search")
    ?.addEventListener("input", e => {

      state.topicSearch = e.target.value;
      renderTopics();

    });

document.getElementById("patternList")
?.addEventListener("input", async (e) => {

  const sb = await getClient()

  if (!e.target.classList.contains("pattern-desc-input")) return;

  const key = e.target.dataset.key;
  const description = e.target.value;

  await sb
    .from("metadata_definitions")
    .update({ description })
    .eq("key", key)
    .eq("slot", "pattern");
  await loadPatternDefinitions();

});

document.getElementById("patternList")
?.addEventListener("click", async (e) => {

  const sb = await getClient()

  if (!e.target.classList.contains("delete-pattern-btn")) return;

  const key = e.target.dataset.key;

  if (!confirm("Delete pattern?")) return;

  await sb
    .from("metadata_definitions")
    .delete()
    .eq("key", key)
    .eq("slot", "pattern");

  await fetchPatterns();
});

document.getElementById("openPatternManager")
?.addEventListener("click", async () => {

  openSidePanel("patternManagerPanel");

  await fetchPatterns();

});

document.getElementById("closePatternManager")
?.addEventListener("click", () => {

  closeModal("patternManagerPanel");

});

document.getElementById("addPatternBtn")
?.addEventListener("click", createPattern);

document.getElementById("openCAManager")
?.addEventListener("click", async () => {

  openSidePanel("caManagerPanel");

  await loadCADefinitions();
  renderCAManager();

});

document.getElementById("closeCAManager")
?.addEventListener("click", () => {

  closeModal("caManagerPanel");

});

document.getElementById("addCABtn")
?.addEventListener("click", createCA);

document.getElementById("caList")
?.addEventListener("click", async (e) => {

  const sb = await getClient()

  if (!e.target.classList.contains("delete-ca-btn")) return;

  const key = e.target.dataset.key;

  if (!confirm("Delete CA event?")) return;

  await sb
    .from("metadata_definitions")
    .delete()
    .eq("key", key)
    .eq("slot", "ca_event");

  await loadCADefinitions();
  renderCAManager();

});

  document.getElementById("patternDropdown")
?.addEventListener("click", (e) => {

  if (!e.target.classList.contains("pattern-option")) return;

  const key = e.target.dataset.key;

  document.getElementById("patternInput").value = key;

  document
    .getElementById("patternDropdown")
    .classList.add("hidden");

});

 document.addEventListener("input", (e) => {

  if (e.target.id !== "patternInput") return;

  const value = e.target.value;

  if (!value) {
    document
      .getElementById("patternDropdown")
      ?.classList.add("hidden");
    return;
  }

  renderPatternDropdown(
  value,
  window.currentPatternTopicIds || []
);

  document
    .getElementById("patternDropdown")
    ?.classList.remove("hidden");

});

  document.addEventListener("focusin", (e) => {

  if (e.target.id === "patternInput") {
    renderPatternDropdown("");
    document
      .getElementById("patternDropdown")
      ?.classList.remove("hidden");
    return;
  }

  if (e.target.id === "caEventEdit") {
    renderCADropdown(e.target.value || "");
    document
      .getElementById("caEventDropdown")
      ?.classList.remove("hidden");
  }

});

document.getElementById("caEventDropdown")
?.addEventListener("click", (e) => {

  if (!e.target.classList.contains("ca-option")) return;

  document.getElementById("caEventEdit").value =
    e.target.dataset.key || "";

  document
    .getElementById("caEventDropdown")
    ?.classList.add("hidden");

});

document.addEventListener("input", (e) => {

  if (e.target.id !== "caEventEdit") return;

  const value = e.target.value;

  if (!value) {
    document
      .getElementById("caEventDropdown")
      ?.classList.add("hidden");
    return;
  }

  renderCADropdown(value);
  document
    .getElementById("caEventDropdown")
    ?.classList.remove("hidden");

});
// CLICK DIFFICULTY BADGE
el.questionsView.addEventListener("click", async (e) => {

  const sb = await getClient()

  // 🔥 CA CLICK
const caBadge = e.target.closest(".ca-badge");
if (caBadge) {

  const id = caBadge.dataset.id;
  selectedQuestionId = id;

  const q = state.questions.find(q => q.id === id);
  const meta = extractQuestionMeta(q);

  await loadCADefinitions();
  openSidePanel("caPanel");

  document.getElementById("caQuestionPreview").innerText =
    q.question_text;

  document.getElementById("caEventEdit").value =
    meta.ca_event || "";

  document.getElementById("caDateEdit").value =
    meta.ca_date || "";

  renderCADropdown(meta.ca_event || "");

  return;
}
  // 🔥 DIFFICULTY CLICK
const badge = e.target.closest(".difficulty-badge");
if (badge) {

  const id = badge.dataset.id;
  selectedQuestionId = id;

  const q = state.questions.find(q => q.id === id);
  const meta = extractQuestionMeta(q);

  openSidePanel("metadataPanel");

  document.getElementById("metaQuestionPreview").innerText =
    q.question_text;

  populateDifficultyPanel(meta);

  return;
}

  // 🔥 PATTERN CLICK (ADD THIS)
  const patternBadge = e.target.closest(".pattern-badge");
if (patternBadge) {

  const id = patternBadge.dataset.id;
  selectedQuestionId = id;

  const q = state.questions.find(q => q.id === id);

  const topicIds = (q.question_topics || [])
    .map(t => t.topic_id);

  openSidePanel("patternPanel");

  document.getElementById("patternQuestionPreview").innerText =
    q.question_text;

  const meta = {};
  (q.question_metadata || []).forEach(m => {
    meta[m.key] = m.value;
  });

  document.getElementById("patternInput").value =
    meta.pattern || q.primary_pattern_key || "";

  // 🔥 IMPORTANT
  renderPatternDropdown("", topicIds);

  // store for later use
  window.currentPatternTopicIds = topicIds;

  return;
}
// TOGGLE EXPLANATION
const toggle = e.target.closest(".explanation-toggle");
if (toggle) {

  const id = toggle.dataset.id;
  const block = document.getElementById(`exp-${id}`);

  block.classList.toggle("hidden");

  toggle.innerText =
    block.classList.contains("hidden")
      ? "Show Explanation"
      : "Hide Explanation";

  return;
}

// SAVE EXPLANATION
const saveExp = e.target.closest(".save-explanation");
if (saveExp) {

  const id = saveExp.dataset.id;

  const textarea = document.querySelector(
    `.explanation-input[data-id="${id}"]`
  );

  const value = textarea.value.trim();

  const { error } = await sb
    .from("questions")
    .update({
      explanation: value || null
    })
    .eq("id", id);

  if (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  showQbStatus("Explanation saved");
  await fetchQuestions();

  return;
}

// SAVE MALAYALAM
const saveMl = e.target.closest(".save-malayalam");
if (saveMl) {
  const id = saveMl.dataset.id;
  const payload = readMalayalamFromCard(id);
  const question = { assistance: { malayalam: payload } };
  const normalized = malayalamAssistanceToMetadataPayload(question);

  try {
    await saveMalayalamAssistance(id, normalized);
    await clearMlVariantVerification(id);
  } catch (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  showQbStatus(normalized ? "Malayalam assistance saved" : "Malayalam assistance cleared");
  await fetchQuestions();
  return;
}

const certifyMl = e.target.closest(".certify-malayalam");
if (certifyMl) {
  const id = certifyMl.dataset.id;

  try {
    await certifyMlVariant(id);
  } catch (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  showQbStatus("Malayalam marked as verified");
  await fetchQuestions();
  return;
}

const revokeMl = e.target.closest(".revoke-malayalam-cert");
if (revokeMl) {
  const id = revokeMl.dataset.id;

  try {
    await clearMlVariantVerification(id);
  } catch (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  showQbStatus("Malayalam verification removed");
  await fetchQuestions();
  return;
}

  // 🔥 DELETE
  if (e.target.classList.contains("delete-btn")) {
    deleteQuestion(e.target.dataset.id);
    return;
  }

  // 🔥 EDIT
  if (e.target.classList.contains("edit-btn")) {
    handleEdit(e.target.dataset.id);
    return;
  }

  const mlBtn = e.target.closest(".malayalam-btn");
  if (mlBtn) {
    toggleMalayalamBlock(mlBtn.dataset.id, mlBtn);
    return;
  }

  const copyMlBtn = e.target.closest(".copy-ml-translation-btn");
  if (copyMlBtn) {
    const question = state.questions.find((entry) => entry.id === copyMlBtn.dataset.id);
    if (question) {
      copyBankQuestionForTranslation(question);
    }
    return;
  }

  const applyMlPaste = e.target.closest(".apply-ml-qcp-paste");
  if (applyMlPaste) {
    applyMalayalamQcpPasteToCard(applyMlPaste.dataset.id);
    return;
  }

});

  el.searchInput.addEventListener("input", e => {
    state.search = e.target.value;
    renderQuestions();
  });

  el.topicFilter.addEventListener("change", e => {
    state.topicFilter = e.target.value || null;
    renderQuestions();
  });

  document.getElementById("ca-filter")
?.addEventListener("change", e => {

  state.caFilter = e.target.value;
  renderQuestions();

});

  document.getElementById("ml-filter")
    ?.addEventListener("change", (e) => {
      state.mlFilter = e.target.value || "all";
      renderQuestions();
    });

  document.getElementById("qb-copy-selected-ml")
    ?.addEventListener("click", () => {
      copySelectedQuestionsForTranslation();
    });

  document.getElementById("qb-select-visible")
    ?.addEventListener("click", () => {
      state.lastVisibleQuestionIds.forEach((id) => {
        state.selectedQuestionIds.add(id);
      });
      renderQuestions();
    });

  document.getElementById("qb-clear-selection")
    ?.addEventListener("click", () => {
      state.selectedQuestionIds.clear();
      renderQuestions();
    });

  el.questionsView?.addEventListener("change", (e) => {
    if (!e.target.classList.contains("qb-select-question")) {
      return;
    }

    const id = e.target.dataset.id;
    if (!id) {
      return;
    }

    if (e.target.checked) {
      state.selectedQuestionIds.add(id);
    } else {
      state.selectedQuestionIds.delete(id);
    }

    updateQbSelectionToolbar();
  });

  document.getElementById("view-questions")
    .addEventListener("click", () => {
      state.view = "questions";
      render();
    });

  document.getElementById("view-topics")
    .addEventListener("click", () => {
      state.view = "topics";
      render();
    });

el.topicsView.addEventListener("click", async (e) => {

  // ---------------------------
  // VIEW QUESTIONS
  // ---------------------------
  const viewBtn = e.target.closest(".view-topic-btn");
  if (viewBtn) {
    state.topicFilter = viewBtn.dataset.id;
    state.view = "questions";
    render();
    return;
  }

  // ---------------------------
// OPEN MASTER NOTE
// ---------------------------
const noteBtn = e.target.closest(".open-note-btn");
if (noteBtn) {
  const topicId = noteBtn.dataset.id;
  window.location.href = resolveAppPath(`topic-note.html?id=${topicId}`);
  return;
}

  const importNoteBtn = e.target.closest(".import-canonical-note-btn");
  if (importNoteBtn) {
    const topicId = importNoteBtn.dataset.id;
    window.location.href = resolveAppPath(`notes-import.html?id=${topicId}`);
    return;
  }

  // ---------------------------
  // RENAME
  // ---------------------------
  const renameBtn = e.target.closest(".rename-topic");
  if (renameBtn) {
    renameTopic(
      renameBtn.dataset.id,
      renameBtn.dataset.name
    );
    return;
  }

  // ---------------------------
  // MERGE
  // ---------------------------
  const mergeBtn = e.target.closest(".merge-topic");
  if (mergeBtn) {
    mergeTopic(mergeBtn.dataset.id);
    return;
  }

  // ---------------------------
  // DELETE
  // ---------------------------
  const deleteBtn = e.target.closest(".delete-topic");
  if (deleteBtn) {
    deleteTopic(deleteBtn.dataset.id);
    return;
  }

});

  // 🔥CLOSE METADATA PANEL (EXACT PLACEMENT)
  document.getElementById("closeMetadata")
    ?.addEventListener("click", () => {
      closeModal("metadataPanel");
    });
  document.getElementById("closePattern")
    ?.addEventListener("click", () => {

      closeModal("patternPanel");

    });

  document.getElementById("closeEditQuestion")
    ?.addEventListener("click", () => {
      closeModal("editQuestionPanel");
    });

document.getElementById("saveMetadataBtn")
  ?.addEventListener("click", async () => {

if (!selectedQuestionId) {
  showQbStatus("No question selected", true);
  return;
}
  const cognitive = document.querySelector('input[name="cognitive"]:checked')?.value;
  const complexity = document.querySelector('input[name="complexity"]:checked')?.value;
  const depth = document.querySelector('input[name="depth"]:checked')?.value;

  if (!cognitive || !complexity || !depth) {
    showQbStatus("Select all difficulty fields", true);
    return;
  }

  const { score, label } = computeDifficulty(cognitive, complexity, depth);

  try {
    await replaceQuestionMetadata(selectedQuestionId, {
      cognitive_level: cognitive,
      complexity_level: complexity,
      depth_level: depth,
      score,
      label
    });
  } catch (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  closeModal("metadataPanel");
  showQbStatus("Difficulty saved");
  await fetchQuestions();

});

document.getElementById("saveCABtn")
?.addEventListener("click", async () => {

  if (!selectedQuestionId) {
    showQbStatus("No question selected", true);
    return;
  }

  const event =
    document.getElementById("caEventEdit").value.trim();

  const date =
    document.getElementById("caDateEdit").value.trim();

  try {
    await replaceCAMetadata(
      selectedQuestionId,
      event,
      date
    );
  } catch (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  closeModal("caPanel");
  showQbStatus(event ? "Current affair saved" : "Current affair cleared");
  await fetchQuestions();

});

document.getElementById("closeCA")
?.addEventListener("click", () => {

  closeModal("caPanel");

});

document.getElementById("savePatternBtn")
  ?.addEventListener("click", async () => {

  if (!selectedQuestionId) {
    showQbStatus("No question selected", true);
    return;
  }

  const selectedPattern =
    document.getElementById("patternInput")?.value?.trim();

  try {
    await replacePatternMetadata(selectedQuestionId, selectedPattern);
  } catch (error) {
    showQbStatus(formatDbError(error), true);
    return;
  }

  closeModal("patternPanel");
  showQbStatus("Pattern saved");
  await fetchQuestions();
});

document.getElementById("saveQuestionBtn")
  ?.addEventListener("click", async () => {

    if (!selectedQuestionId) {
      showQbStatus("No question selected", true);
      return;
    }

    const correctOption =
      document.querySelector('input[name="editCorrect"]:checked')?.value;

    if (!correctOption) {
      showQbStatus("Select the correct answer", true);
      return;
    }

    try {
      await saveQuestionContent(selectedQuestionId, {
        question_text: document.getElementById("editQuestionText").value,
        option_a: document.getElementById("editOptionA").value,
        option_b: document.getElementById("editOptionB").value,
        option_c: document.getElementById("editOptionC").value,
        option_d: document.getElementById("editOptionD").value,
        correct_option: correctOption
      });
    } catch (error) {
      showQbStatus(formatDbError(error), true);
      return;
    }

    closeModal("editQuestionPanel");
    showQbStatus("Question saved");
    await fetchQuestions();
  });

}

document.addEventListener("click", (e) => {

  const patternBox = document.querySelector("#patternPanel .pattern-box");
  if (patternBox && !patternBox.contains(e.target)) {
    document
      .getElementById("patternDropdown")
      ?.classList.add("hidden");
  }

  const caBox = document.querySelector(".ca-box");
  if (caBox && !caBox.contains(e.target)) {
    document
      .getElementById("caEventDropdown")
      ?.classList.add("hidden");
  }

});


// --------------------------------
// INIT
// --------------------------------
async function init() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Question Bank Manager",
      preset: "teacherKnowledge",
    },
  });

  if (!runtime) return;

  await loadPatternDefinitions();
  await loadCADefinitions();
  bindEvents();
  await fetchTopics();
  await fetchQuestions();
}

init();