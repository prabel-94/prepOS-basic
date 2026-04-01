// ===============================
// PrepOS Draft Editor (v6 - Stable)
// ===============================

// --------------------------------
// GLOBAL STATE
// --------------------------------
let currentSearchResults = [];
let selectedQuestionIndex = null;
let autosaveTimer = null;
let topicTimer = null;
let isSaving = false;

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

// 🔥 ADD THIS BLOCK
  difficulty: {
    cognitive_level: null,
    complexity_level: null,
    depth_level: null,
    score: null,
    label: null
  }
  };

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
  }
    };

    currentDraft.schema_json.sections[0].questions.push(newQuestion);
    added++;
  });

  renderDraft(currentDraft);

  setStatus(`Added ${added}, skipped ${skipped}`);
}
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

  q.topics.push(topicName.trim());

  renderDraft(currentDraft);
}

function removeTopic(qIndex, topicIndex) {
  const q = currentDraft.schema_json.sections[0].questions[qIndex];
  q.topics.splice(topicIndex, 1);
  renderDraft(currentDraft);
}

// --------------------------------
// TOPIC DB LINKING
// --------------------------------
async function getOrCreateTopic(name) {

  const clean = name.trim().replace(/\s+/g, " ");
  const formatted = formatTopicName(clean);
  const normalized = clean.toLowerCase();

  // Try fetch
  const { data: existing } = await sb
    .from("topics")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  // Try insert (safe because of UNIQUE index)
  const { data, error } = await sb
    .from("topics")
    .insert({
      name: formatted,
      normalized_name: normalized
    })
    .select()
    .single();

  // 🔥 Handle race condition
  if (error && error.code === "23505") {
    const { data: retry } = await sb
      .from("topics")
      .select("id")
      .eq("normalized_name", normalized)
      .single();

    return retry.id;
  }

  return data.id;
}

async function attachTopics(questionId, topics = []) {

  console.log("ATTACHING TOPICS →", topics, "for Q:", questionId);

  for (const t of topics) {

    const topicId = await getOrCreateTopic(t);

    console.log("Resolved Topic:", t, "→ ID:", topicId);

    const { data, error } = await sb
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
  const hashInput = q.text.trim().toLowerCase();

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
        correct_option: q.correct,
        explanation: q.explanation || "",
        question_hash: hash
      })
      .select()
      .single();

    if (error) throw error;

    questionId = data.id;
  }
await attachTopics(questionId, q.topics);

// 🔥 LINK BACK TO DRAFT
q.question_id = questionId;

return { questionId, isDuplicate };
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
    .single();

  if (error) {
    console.error(error);
    setStatus("Load failed", true);
    return;
  }

  currentDraft = data;
  logoURL = data.logo_url || null;

  renderDraft(currentDraft);

  document.getElementById("title").value = data.title || "";
  document.getElementById("duration").value = data.duration || "";

  setStatus("Loaded");

}

function deleteQuestion(index) {
  if (!currentDraft) return;

  const confirmDelete = confirm("Delete this question?");
  if (!confirmDelete) return;

  currentDraft.schema_json.sections[0].questions.splice(index, 1);

  renderDraft(currentDraft);
}

function duplicateQuestion(index) {
  const q = currentDraft.schema_json.sections[0].questions[index];

  const clone = JSON.parse(JSON.stringify(q));
  clone.id = crypto.randomUUID();

  currentDraft.schema_json.sections[0].questions.splice(index + 1, 0, clone);

  renderDraft(currentDraft);
}

function moveQuestionUp(index) {
  if (index === 0) return;

  const qs = currentDraft.schema_json.sections[0].questions;

  [qs[index - 1], qs[index]] = [qs[index], qs[index - 1]];

  renderDraft(currentDraft);
}

function moveQuestionDown(index) {
  const qs = currentDraft.schema_json.sections[0].questions;

  if (index === qs.length - 1) return;

  [qs[index + 1], qs[index]] = [qs[index], qs[index + 1]];

  renderDraft(currentDraft);
}

// --------------------------------
// RENDER
// --------------------------------
function renderDraft(draft) {
  currentDraft = draft;

  const container = document.getElementById("questions");
  container.innerHTML = "";

  const questions = draft.schema_json.sections[0].questions;

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
        </div>

        <div class="question-actions">
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

<!-- DIFFICULTY PANEL -->
<div class="difficulty-panel mt-10">

  <div class="small">Cognitive</div>
  <div class="flex gap-10">
    ${[1,2,3,4].map(v => `
      <label>
        <input type="radio" name="cognitive-${i}" data-i="${i}" value="${v}"
          ${q.difficulty?.cognitive_level === v ? "checked" : ""}
        /> ${["Recall","Concept","Application","Analysis"][v-1]}
      </label>
    `).join("")}
  </div>

  <div class="small mt-10">Complexity</div>
  <div class="flex gap-10">
    ${[1,2,3].map(v => `
      <label>
        <input type="radio" name="complexity-${i}" data-i="${i}" value="${v}"
          ${q.difficulty?.complexity_level === v ? "checked" : ""}
        /> ${["Simple","Moderate","Complex"][v-1]}
      </label>
    `).join("")}
  </div>

  <div class="small mt-10">Depth</div>
  <div class="flex gap-10">
    ${[1,2,3].map(v => `
      <label>
        <input type="radio" name="depth-${i}" data-i="${i}" value="${v}"
          ${q.difficulty?.depth_level === v ? "checked" : ""}
        /> ${["Basic","Standard","Advanced"][v-1]}
      </label>
    `).join("")}
  </div>

  <div class="small mt-10">
    Difficulty: ${q.difficulty?.label || "-"}
  </div>

</div>

      <!-- TOPICS -->
      <div class="topic-box">

        <input 
          class="topic-input" 
          data-i="${i}" 
          placeholder="Add topic..."
        />

        <div class="topic-tags">
          ${topicsHTML}
        </div>

      </div>

    `;

    container.appendChild(div);
  });
}

// --------------------------------
// INPUT EVENTS
// --------------------------------
document.getElementById("questions")?.addEventListener("input", (e) => {

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
// DIFFICULTY INPUT
if (e.target.type === "radio") {

  const i = +e.target.dataset.i;
  const q = currentDraft.schema_json.sections[0].questions[i];

  if (!q.difficulty) {
    q.difficulty = {};
  }

  if (e.target.name.startsWith("cognitive")) {
    q.difficulty.cognitive_level = +e.target.value;
  }

  if (e.target.name.startsWith("complexity")) {
    q.difficulty.complexity_level = +e.target.value;
  }

  if (e.target.name.startsWith("depth")) {
    q.difficulty.depth_level = +e.target.value;
  }

  const result = computeDifficulty({
    cognitive: q.difficulty.cognitive_level,
    complexity: q.difficulty.complexity_level,
    depth: q.difficulty.depth_level
  });

  q.difficulty.score = result.score;
  q.difficulty.label = result.label;

  renderDraft(currentDraft);
}
  scheduleAutosave();
});

// --------------------------------
// CLICK EVENTS (delegated)
// --------------------------------

document.getElementById("questions")?.addEventListener("click", (e) => {

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
    <div class="mt-10">${q.text || "(empty question)"}</div>

    <div class="mt-10"><b>Options:</b></div>
    <ul class="mt-10">
      ${opts.map((o, i) => `
  <li>
    ${["A", "B", "C", "D"][i]}: ${o?.text || "-"}
          ${q.correct === ["A","B","C","D"][i] ? " ✅" : ""}
        </li>
      `).join("")}
    </ul>

    ${q.explanation ? `
      <div class="mt-10"><b>Explanation:</b></div>
      <div class="mt-10">${q.explanation}</div>
    ` : ""}
  `;
}

    // RESET topic UI
    document.getElementById("bankTopicInput").value = "";
    document.getElementById("bankTopicTags").innerHTML = "";
    updateConfirmState();
    renderTopicWarnings([]);
  }

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

  // 🔥 ADD THIS BLOCK
  difficulty: {
    cognitive_level: null,
    complexity_level: null,
    depth_level: null,
    score: null,
    label: null
  }
};

  currentDraft.schema_json.sections[0].questions.push(q);
  renderDraft(currentDraft);
}

// --------------------------------
// SAVE DRAFT (FIXED)
// --------------------------------
async function saveDraft(silent = false) {
  if (!currentDraft || isSaving) return;

  isSaving = true;

  try {
    // --------------------------------
// SYNC DOM → DATA (CRITICAL FIX)
// --------------------------------
document.querySelectorAll(".qtext").forEach(el => {
  const i = +el.dataset.i;
  currentDraft.schema_json.sections[0].questions[i].text = el.value;
});

document.querySelectorAll(".opt").forEach(el => {
  const i = +el.dataset.i;
  const oi = +el.dataset.oi;

  const q = currentDraft.schema_json.sections[0].questions[i];

  if (!q.options[oi]) {
    q.options[oi] = { id: ["A","B","C","D"][oi], text: "" };
  }

  q.options[oi].text = el.value;
});

document.querySelectorAll(".explanation").forEach(el => {
  const i = +el.dataset.i;
  currentDraft.schema_json.sections[0].questions[i].explanation = el.value;
});

document.querySelectorAll('input[type="radio"]:checked').forEach(el => {
  const i = +el.dataset.i;
  currentDraft.schema_json.sections[0].questions[i].correct = el.value;
});

// --------------------------------
    // 🔴 VALIDATION (ADD HERE)
    // --------------------------------
    const questions = currentDraft.schema_json.sections[0].questions;

    for (const q of questions) {
      if (!q.text || !q.text.trim()) {
        throw new Error("Empty question detected");
      }
    }
    const payload = {
      title: document.getElementById("title").value || "Untitled Draft",
      duration: parseInt(document.getElementById("duration").value) || 60,
      schema_json: currentDraft.schema_json,
      logo_url: logoURL,
      status: "draft"
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

  } catch (e) {
    console.error(e);
    setStatus("Save failed", true);
  } finally {
    isSaving = false;
  }
}

// --------------------------------
// ✅ PUBLISH DRAFT (FINAL VERSION)
// --------------------------------
async function publishDraft() {
  if (!draftId) {
    alert("Save draft before publishing");
    return;
  }

  try {
    await saveDraft(true);
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

    // ✅ Update draft
    await sb
      .from("draft_exams")
      .update({
        status: "published",
        published_exam_id: session.id
      })
      .eq("id", draftId);

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
    setStatus("Publish failed", true);
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
function init() {
  
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
    // ✅ Generate hash FIRST
    const hash = await generateHash(
      q.text.trim().toLowerCase()
    );

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
        question_hash: hash
      })
      .select()
      .single();

    if (error) throw error;

    // ✅ Attach topics AFTER insert
    await attachTopics(data.id, q.topics);

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

  function process() {
  const value = input.value.trim();
  if (!value) return;

  createTopicTag(container, value);

  input.value = "";
  renderTopicWarnings([], warningsId);
  updateConfirmState(); // 🔥 ADD THIS
}

  // ENTER
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      process();
    }
  });

  // BLUR
  input.addEventListener("blur", process);

  // WARNINGS
  input.addEventListener("input", (e) => {
    renderTopicWarnings(getTopicWarnings(e.target.value), warningsId);
  });
}

// --------------------------------
// INIT TOPIC INPUT SYSTEMS
// --------------------------------
setupTopicInput("bankTopicInput", "bankTopicTags", "topicWarnings");
setupTopicInput("bulkTopicInput", "bulkTopicTags", "bulkTopicWarnings");

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
  ).map(el => el.dataset.value);

  q.topics = topics;

  try {
    const res = await saveQuestionToBank(q);

    // --------------------------------
    // DUPLICATE FLOW
    // --------------------------------
    if (res.isDuplicate) {

      document.getElementById("duplicateBox").classList.remove("hidden");
      window.duplicateQuestionId = res.questionId;

      setStatus("Duplicate detected. Choose an action.");

      return; // panel stays open → scroll should remain locked
    }

    // --------------------------------
    // SUCCESS FLOW
    // --------------------------------
    q.bank_status = "saved";

    renderDraft(currentDraft);

    // ✅ CLOSE PANEL + UNLOCK SCROLL
    document.getElementById("addToBankPanel").classList.add("hidden");
    document.body.style.overflow = ""; // 🔥 CRITICAL FIX

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
init();

// --------------------------------
// GLOBALS
// --------------------------------
window.saveDraft = saveDraft;
window.publishDraft = publishDraft;
window.deleteQuestion = deleteQuestion;
window.duplicateQuestion = duplicateQuestion;
window.moveQuestionUp = moveQuestionUp;
window.moveQuestionDown = moveQuestionDown;