// ===============================
// PrepOS Draft Editor (Stable v2)
// ===============================

// --------------------------------
// GLOBAL STATE
// --------------------------------
let autosaveTimer = null;
let isSaving = false;

let currentDraft = null;
let logoURL = null;

// --------------------------------
// URL PARAM
// --------------------------------
const params = new URLSearchParams(window.location.search);

let draftId = params.get("id");
const mode = params.get("mode");

console.log("Draft init:", { draftId, mode });

// --------------------------------
// SUPABASE
// --------------------------------
const sb = window.supabaseClient;

// Edge functions
const PUBLISH_FUNCTION_URL =
  "https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/publish-draft";

const CLONE_FUNCTION_URL =
  "https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/clone-draft";

// --------------------------------
// HELPERS
// --------------------------------
async function getAccessToken() {
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token;
}

function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "#555";
}

function setActionButtonsDisabled(state) {
  document.querySelectorAll(".draft-actions button").forEach(btn => {
    btn.disabled = state;
  });
}

// --------------------------------
// SCHEMA NORMALIZATION
// --------------------------------
function normalizeDraftSchema(draft) {
  if (!draft.schema_json) draft.schema_json = {};

  if (!draft.schema_json.sections) {
    draft.schema_json.sections = [{ questions: [] }];
  }

  if (!draft.schema_json.sections[0].questions) {
    draft.schema_json.sections[0].questions = [];
  }
}

// --------------------------------
// AUTOSAVE
// --------------------------------
function scheduleAutosave() {
  if (isSaving) return;

  if (autosaveTimer) clearTimeout(autosaveTimer);

  setStatus("Saving...");

  autosaveTimer = setTimeout(() => {
    if (!isSaving) saveDraft(true);
  }, 1200);
}
// --------------------------------
// ADD EMPTY DRAFT SUPPORT
// --------------------------------
function createEmptyDraft() {
  console.log("Creating empty draft");

  currentDraft = {
    id: null,
    title: "",
    duration: 60,
    logo_url: null,
    schema_json: {
      sections: [
        {
          questions: []
        }
      ]
    }
  };

  renderDraft(currentDraft);

  // Enable button immediately
  const btn = document.getElementById("newQuestionBtn");
  if (btn) btn.disabled = false;

  setStatus("New draft");
}

// --------------------------------
// LOAD DRAFT
// --------------------------------
async function loadDraft() {
  try {
    setStatus("Loading...");

    const { data, error } = await sb
      .from("draft_exams")
      .select("*")
      .eq("id", draftId)
      .single();

    if (error) throw error;

    renderDraft(data);
    const btn = document.getElementById("newQuestionBtn");
    if (btn) btn.disabled = false;
    setStatus("Loaded");

  } catch (e) {
    console.error(e);
    setStatus("Failed to load draft", true);
    alert("Failed to load draft");
  }
}

// --------------------------------
// RENDER
// --------------------------------
function renderDraft(draft) {
  normalizeDraftSchema(draft);
  currentDraft = draft;

  const titleEl = document.getElementById("title");
  const durationEl = document.getElementById("duration");
  const container = document.getElementById("questions");
  const preview = document.getElementById("logoPreview");

  titleEl.value = draft.title || "";
  durationEl.value = draft.duration || "";

  // bind once
  if (!titleEl.dataset.bound) {
    titleEl.addEventListener("input", scheduleAutosave);
    durationEl.addEventListener("input", scheduleAutosave);
    titleEl.dataset.bound = "true";
  }

  // logo
  logoURL =
    draft.logo_url ||
    localStorage.getItem("defaultLogo") ||
    null;

  if (logoURL && preview) {
    preview.src = logoURL;
    preview.style.display = "block";
  }

  const questions = draft.schema_json.sections[0].questions;

  container.innerHTML = "";

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

    let correctIndex = q.correct ?? 0;
    if (typeof correctIndex === "string") {
      correctIndex = ["A", "B", "C", "D"].indexOf(correctIndex);
    }

    const div = document.createElement("div");
    div.className = "question-card";

    div.innerHTML = `
<div class="question-header">
<b>Q${i + 1}</b>
<div class="q-actions">
<button class="move-up" data-i="${i}">↑</button>
<button class="move-down" data-i="${i}">↓</button>
<button class="duplicate-q" data-i="${i}">Duplicate</button>
<button class="delete-q" data-i="${i}">Delete</button>
</div>
</div>

<label>Question</label>
<textarea class="qtext" data-i="${i}">${q.question || ""}</textarea>

<label>Options</label>

${opts.map((opt, oi) => {
  const label = ["A", "B", "C", "D"][oi];
  return `
<div class="option-row">
<input type="radio" name="correct-${i}" class="correct-radio"
data-i="${i}" value="${oi}" ${correctIndex === oi ? "checked" : ""}>
<span class="option-label">${label}</span>
<input type="text" class="opt" data-i="${i}" data-oi="${oi}"
value="${opt}" placeholder="Option ${label}">
</div>`;
}).join("")}

<label>Explanation</label>
<textarea class="exp" data-i="${i}">${q.explanation || ""}</textarea>
`;

    container.appendChild(div);
  });

  // bind once
  if (!container.dataset.bound) {
    container.addEventListener("input", e => {
      if (["qtext", "opt", "exp"].some(c => e.target.classList.contains(c))) {
        scheduleAutosave();
      }
    });

    container.addEventListener("change", e => {
      if (e.target.classList.contains("correct-radio")) {
        scheduleAutosave();
      }
    });

    container.dataset.bound = "true";
  }
}

// --------------------------------
// CREATE QUESTION
// --------------------------------
function createNewQuestion() {
  if (!currentDraft) return;

  const questions = currentDraft.schema_json.sections[0].questions;

  questions.push({
    id: crypto.randomUUID(),
    question: "",
    options: ["", "", "", ""],
    correct: 0,
    explanation: ""
  });

  renderDraft(currentDraft);
  scheduleAutosave();
}

// --------------------------------
// QUESTION ACTIONS
// --------------------------------
function handleQuestionActions(e) {
  if (!currentDraft) return;

  const i = +e.target.dataset.i;
  const questions = currentDraft.schema_json.sections[0].questions;

  if (e.target.classList.contains("delete-q")) {
    questions.splice(i, 1);
  }

  if (e.target.classList.contains("duplicate-q")) {
    const copy = JSON.parse(JSON.stringify(questions[i]));
    copy.id = crypto.randomUUID();
    questions.splice(i, 0, copy);
  }

  if (e.target.classList.contains("move-up") && i > 0) {
    [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]];
  }

  if (e.target.classList.contains("move-down") && i < questions.length - 1) {
    [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]];
  }

  renderDraft(currentDraft);
  scheduleAutosave();
}

// --------------------------------
// SAVE DRAFT
// --------------------------------
async function saveDraft(silent = false) {
  if (!currentDraft || isSaving) return;

  isSaving = true;

  try {
    const questions = currentDraft.schema_json.sections[0].questions;

    document.querySelectorAll(".qtext").forEach(el => {
      questions[+el.dataset.i].question = el.value;
    });

    document.querySelectorAll(".opt").forEach(el => {
      questions[+el.dataset.i].options[+el.dataset.oi] = el.value;
    });

    document.querySelectorAll(".correct-radio").forEach(el => {
      if (el.checked) {
        questions[+el.dataset.i].correct = +el.value;
      }
    });

    document.querySelectorAll(".exp").forEach(el => {
      questions[+el.dataset.i].explanation = el.value;
    });

    if (!draftId) {
  // CREATE NEW DRAFT FIRST TIME
  const { data, error } = await sb
    .from("draft_exams")
    .insert([{
      title: document.getElementById("title").value || "Untitled Draft",
      duration: parseInt(document.getElementById("duration").value) || null,
      schema_json: currentDraft.schema_json,
      logo_url: logoURL,
      status: "draft"
    }])
    .select()
    .single();

  if (error) throw error;

  draftId = data.id;

  // Update URL WITHOUT reload
  history.replaceState(null, "", `draft.html?id=${draftId}`);

  setStatus("Draft created");

} else {
  // NORMAL UPDATE
  const { error } = await sb
    .from("draft_exams")
    .update({
      title: document.getElementById("title").value,
      duration: parseInt(document.getElementById("duration").value) || null,
      schema_json: currentDraft.schema_json,
      logo_url: logoURL
    })
    .eq("id", draftId);

  if (error) throw error;

  if (!silent) setStatus("Saved");
}

    if (error) throw error;

    if (!silent) setStatus("Saved");

  } catch (e) {
    console.error(e);
    setStatus("Save failed", true);
  }

  isSaving = false;
}

// --------------------------------
// CLONE DRAFT (EDGE)
// --------------------------------
async function cloneDraft() {
  try {
    setActionButtonsDisabled(true);

    const token = await getAccessToken();

    const res = await fetch(CLONE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ draftId })
    });

    const data = await res.json();

    if (!res.ok) throw data;

    window.location.href = `/draft.html?id=${data.newDraftId}`;

  } catch (e) {
    console.error(e);
    alert("Clone failed");
  } finally {
    setActionButtonsDisabled(false);
  }
}

// --------------------------------
// PUBLISH DRAFT (EDGE)
// --------------------------------
async function publishDraft() {
  try {
    await saveDraft(true);

    setActionButtonsDisabled(true);

    const token = await getAccessToken();

    const res = await fetch(PUBLISH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ draftId })
    });

    const data = await res.json();

    if (!res.ok) throw data;

    setStatus("Published");
    alert("Exam published successfully");

  } catch (e) {
    console.error(e);
    alert("Publish failed");
  } finally {
    setActionButtonsDisabled(false);
  }
}

// --------------------------------
// INIT
// --------------------------------
function init() {
  document
    .getElementById("newQuestionBtn")
    ?.addEventListener("click", createNewQuestion);

  document
    .getElementById("questions")
    ?.addEventListener("click", handleQuestionActions);

  document
    .getElementById("logoUpload")
    ?.addEventListener("change", handleLogoUpload);

  if (draftId) {
    loadDraft();
  } else if (mode === "new") {
    createEmptyDraft();
  } else {
    console.warn("No id or mode, fallback to new");
    createEmptyDraft();
  }
}

init();

// --------------------------------
// GLOBALS
// --------------------------------
window.saveDraft = saveDraft;
window.cloneDraft = cloneDraft;
window.publishDraft = publishDraft;