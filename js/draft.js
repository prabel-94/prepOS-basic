// ===============================
// PrepOS Draft Editor (v5 - Stable)
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
// HASH
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

// --------------------------------
// SAVE ALL
// --------------------------------
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
// RENDER
// --------------------------------
function renderDraft(draft) {
  currentDraft = draft;

  const container = document.getElementById("questions");
  container.innerHTML = "";

  const questions = draft.schema_json.sections[0].questions;

  if (!questions.length) {
    container.innerHTML = `<div>No questions yet</div>`;
    return;
  }

  questions.forEach((q, i) => {

    const opts = [...(q.options || [])];
    while (opts.length < 4) opts.push("");

    const status = q.bank_status || "draft";

    const topicsHTML = (q.topics || []).map((t, ti) => `
      <div class="topic-tag">
        ${t}
        <button data-q="${i}" data-ti="${ti}" class="remove-topic">×</button>
      </div>
    `).join("");

    const div = document.createElement("div");
    div.className = "question-card";

    div.innerHTML = `
      <div class="question-header">
        <b>Q${i + 1}</b>
        <button data-i="${i}" class="save-q">Save</button>
      </div>

      <div class="status ${status}">
        ${status.toUpperCase()}
      </div>

      <textarea class="qtext" data-i="${i}">${q.text || ""}</textarea>

      ${opts.map((opt, oi) => {
        const label = ["A","B","C","D"][oi];
        return `
          <div>
            <input type="radio" name="c-${i}" data-i="${i}" value="${label}"
            ${q.correct === label ? "checked":""}>
            <input class="opt" data-i="${i}" data-oi="${oi}" value="${opt}">
          </div>
        `;
      }).join("")}

      <textarea class="exp" data-i="${i}">${q.explanation || ""}</textarea>

      <div class="topic-box">
        <input class="topic-input" data-i="${i}" placeholder="Add topic..." />
        <div class="topic-suggestions"></div>
        <div class="topic-tags">${topicsHTML}</div>
      </div>
    `;

    container.appendChild(div);
  });
}

// --------------------------------
// QB SEARCH
// --------------------------------
document.getElementById("qbSearch")?.addEventListener("input", async (e) => {
  const query = e.target.value;

  const { data } = await sb
    .from("questions")
    .select("*")
    .ilike("question_text", `%${query}%`)
    .limit(20);

  renderQBResults(data || []);
});

function renderQBResults(list) {
  const container = document.getElementById("questionBankResults");

  if (!list.length) {
    container.innerHTML = "No results";
    return;
  }

  container.innerHTML = "";

  list.forEach(q => {
    const div = document.createElement("div");
    div.className = "qb-question";

    div.innerHTML = `
      <span>${q.question_text}</span>
      <button>Add</button>
    `;

    div.querySelector("button").onclick = () => addFromBank(q);

    container.appendChild(div);
  });
}

function addFromBank(q) {
  const mapped = {
    id: crypto.randomUUID(),
    text: q.question_text,
    options: [q.option_a, q.option_b, q.option_c, q.option_d],
    correct: q.correct_option,
    explanation: q.explanation || "",
    topics: [],
    bank_status: "saved"
  };

  currentDraft.schema_json.sections[0].questions.push(mapped);

  renderDraft(currentDraft);

  document.getElementById("questionBankPanel").classList.add("hidden");

  setStatus("Question added to draft ✅");
}

// --------------------------------
// EVENTS (DELEGATED)
// --------------------------------
document.getElementById("questions")?.addEventListener("click", async (e) => {

  if (e.target.classList.contains("save-q")) {
    const i = +e.target.dataset.i;
    const q = currentDraft.schema_json.sections[0].questions[i];

    const res = await saveQuestionToBank(q);
    q.bank_status = res.isDuplicate ? "duplicate" : "saved";

    renderDraft(currentDraft);
    setStatus("Saved to Question Bank ✅");
  }

  if (e.target.classList.contains("remove-topic")) {
    removeTopic(+e.target.dataset.q, +e.target.dataset.ti);
  }

  if (e.target.classList.contains("topic-select")) {
    const qIndex = +e.target.dataset.q;
    const name = e.target.dataset.name;

    addTopicToQuestion(qIndex, name);

    e.target.closest(".topic-box")
      .querySelector(".topic-suggestions").innerHTML = "";
  }
});

// --------------------------------
// INPUT EVENTS
// --------------------------------
document.getElementById("questions")?.addEventListener("input", async (e) => {

  if (e.target.classList.contains("qtext")) {
    currentDraft.schema_json.sections[0].questions[+e.target.dataset.i].text = e.target.value;
  }

  if (e.target.classList.contains("opt")) {
    const i = +e.target.dataset.i;
    const oi = +e.target.dataset.oi;
    currentDraft.schema_json.sections[0].questions[i].options[oi] = e.target.value;
  }

  if (e.target.classList.contains("exp")) {
    currentDraft.schema_json.sections[0].questions[+e.target.dataset.i].explanation = e.target.value;
  }

  if (e.target.classList.contains("topic-input")) {
    const qIndex = +e.target.dataset.i;
    const box = e.target.parentElement;
    const suggestionBox = box.querySelector(".topic-suggestions");

    clearTimeout(topicTimer);

    topicTimer = setTimeout(async () => {
      const results = await searchTopics(e.target.value);

      suggestionBox.innerHTML = results.map(r => `
        <div data-q="${qIndex}" data-name="${r.name}" class="topic-select">
          ${r.name}
        </div>
      `).join("");
    }, 250);
  }

  scheduleAutosave();
});

// --------------------------------
// ENTER → CREATE TOPIC
// --------------------------------
document.getElementById("questions")?.addEventListener("keydown", (e) => {

  if (e.target.classList.contains("topic-input") && e.key === "Enter") {
    e.preventDefault();

    const qIndex = +e.target.dataset.i;
    const value = e.target.value.trim();

    if (!value) return;

    addTopicToQuestion(qIndex, value);

    e.target.value = "";

    e.target.parentElement.querySelector(".topic-suggestions").innerHTML = "";
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
// SAVE DRAFT
// --------------------------------
async function saveDraft() {
  if (!currentDraft) return;

  await sb.from("draft_exams").upsert({
    id: draftId,
    title: currentDraft.title,
    schema_json: currentDraft.schema_json
  });

  setStatus("Draft saved");
}

// --------------------------------
// INIT
// --------------------------------
function init() {

  document.getElementById("newQuestionBtn")
    ?.addEventListener("click", createNewQuestion);

  document.getElementById("openQuestionBankBtn")
    ?.addEventListener("click", () => {
      document.getElementById("questionBankPanel").classList.remove("hidden");
    });

  document.getElementById("closeQB")
    ?.addEventListener("click", () => {
      document.getElementById("questionBankPanel").classList.add("hidden");
    });

  document.getElementById("saveAllToBankBtn")
    ?.addEventListener("click", saveAllQuestionsToBank);

  if (mode === "new") createEmptyDraft();
}

init();

// --------------------------------
// GLOBALS
// --------------------------------
window.createNewQuestion = createNewQuestion;
window.saveDraft = saveDraft;