// ===============================
// PrepOS Draft Editor (v6 - Stable)
// ===============================

// --------------------------------
// GLOBAL STATE
// --------------------------------
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
function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "#555";
}

// --------------------------------
// HASH (Duplicate detection)
// --------------------------------
function generateHash(q) {
  const base = (
    q.text +
    (q.options || []).join("") +
    q.correct
  ).toLowerCase().replace(/\s+/g, "");

  return btoa(base);
}

// --------------------------------
// TOPIC SYSTEM
// --------------------------------
async function searchTopics(query) {
  if (!query) return [];

  const { data } = await sb
    .from("topics")
    .select("name")
    .ilike("name", `%${query}%`)
    .limit(5);

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
  const normalized = name.trim().toLowerCase();

  const { data: existing } = await sb
    .from("topics")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const { data } = await sb
    .from("topics")
    .insert({
      name: name.trim(),
      normalized_name: normalized
    })
    .select()
    .single();

  return data.id;
}

async function attachTopics(questionId, topics = []) {
  for (const t of topics) {
    const topicId = await getOrCreateTopic(t);

    await sb.from("question_topics").upsert({
      question_id: questionId,
      topic_id: topicId
    });
  }
}

// --------------------------------
// QUESTION BANK SAVE
// --------------------------------
async function saveQuestionToBank(q) {
  const hash = generateHash(q);

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
    const { data, error } = await sb
      .from("questions")
      .insert({
        question_text: q.text,
        option_a: q.options[0],
        option_b: q.options[1],
        option_c: q.options[2],
        option_d: q.options[3],
        correct_option: q.correct,
        explanation: q.explanation,
        question_hash: hash
      })
      .select()
      .single();

    if (error) throw error;

    questionId = data.id;
  }

  await attachTopics(questionId, q.topics);

  return { questionId, isDuplicate };
}

async function saveAllQuestionsToBank() {
  const qs = currentDraft.schema_json.sections[0].questions;

  for (const q of qs) {
    if (q.bank_status === "saved") continue;

    const res = await saveQuestionToBank(q);
    q.bank_status = res.isDuplicate ? "duplicate" : "saved";
  }

  renderDraft(currentDraft);
  setStatus("All questions saved to bank ✅");
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
    const opts = [...(q.options || [])];
    while (opts.length < 4) opts.push("");

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
            value="${opt}" 
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
    currentDraft.schema_json.sections[0].questions[i].options[oi] = e.target.value;
  }

  if (e.target.classList.contains("explanation")) {
    currentDraft.schema_json.sections[0].questions[+e.target.dataset.i].explanation = e.target.value;
  }

  scheduleAutosave();
});

// --------------------------------
// CLICK EVENTS (delegated)
// --------------------------------
document.getElementById("questions")?.addEventListener("click", (e) => {

  // ADD TO BANK (PER QUESTION)
if (e.target.classList.contains("add-to-bank-btn")) {
  const btn = e.target;
  const qIndex = +btn.dataset.q;

  const q = currentDraft.schema_json.sections[0].questions[qIndex];

  if (!q || q.bank_status !== "draft") return;

  (async () => {
    try {
      btn.disabled = true;
      btn.innerText = "Saving...";

      const res = await saveQuestionToBank(q);

      q.bank_status = res.isDuplicate ? "duplicate" : "saved";

      renderDraft(currentDraft);
      setStatus("Question saved to bank ✅");

    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.innerText = "+ Add to Bank";
      setStatus("Failed to save question", true);
    }
  })();
}

  // REMOVE TOPIC
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
    text: "",
    options: ["","","",""],
    correct: "A",
    explanation: "",
    topics: [],
    bank_status: "draft"
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
  currentDraft.schema_json.sections[0].questions[i].options[oi] = el.value;
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
      title: currentDraft.title || "Untitled Exam",
      duration: currentDraft.duration || 60,
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

// --------------------------------
// INIT
// --------------------------------
function init() {
   // 🔥 FORCE RESET UI STATE
  const newBtn = document.getElementById("newQuestionBtn");
  if (newBtn) newBtn.disabled = false;

  document.getElementById("newQuestionBtn")
    ?.addEventListener("click", createNewQuestion);

  document.getElementById("saveAllToBankBtn")
    ?.addEventListener("click", saveAllQuestionsToBank);

  document.getElementById("openQuestionBankBtn")
    ?.addEventListener("click", () => {
      document.getElementById("questionBankPanel").classList.remove("hidden");
    });

  document.getElementById("closeQB")
    ?.addEventListener("click", () => {
      document.getElementById("questionBankPanel").classList.add("hidden");
    });

  if (draftId) loadDraft();
  else createEmptyDraft();
}

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