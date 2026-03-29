// ===============================
// PrepOS QB Manager (v2 - Clean Architecture)
// ===============================

// --------------------------------
// INIT
// --------------------------------
const sb = window.supabaseClient;

// --------------------------------
// STATE
// --------------------------------
const state = {
  questions: [],
  topics: [],
  view: "questions", // "questions" | "topics"
  search: "",
  topicFilter: null,
  editingId: null
};

// --------------------------------
// DOM CACHE
// --------------------------------
const el = {
  questionsView: document.getElementById("questions-view"),
  topicsView: document.getElementById("topics-view"),
  searchInput: document.getElementById("search-input"),
  topicFilter: document.getElementById("topic-filter"),
  form: document.getElementById("question-form"),

  totalQuestions: document.getElementById("total-questions"),
  totalTopics: document.getElementById("total-topics"),
  avgPerTopic: document.getElementById("avg-per-topic"),
  weakTopics: document.getElementById("weak-topics")
};

// --------------------------------
// UTIL
// --------------------------------
function formatTopicName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g(w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ));
}

function generateHash(q) {
  const base = (
    q.text +
    (q.options || []).map(o => o.text).join("") +
    q.correct
  ).toLowerCase().replace(/\s+/g, "");

  return btoa(base);
}

// --------------------------------
// TOPIC HELPERS
// --------------------------------
async function getOrCreateTopic(name) {
  const clean = name.trim().replace(/\s+/g, " ");
  const formatted = formatTopicName(clean);
  const normalized = clean.toLowerCase();

  const { data: existing } = await sb
    .from("topics")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await sb
    .from("topics")
    .insert({ name: formatted, normalized_name: normalized })
    .select()
    .single();

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

async function attachTopics(questionId, topicNames = []) {
  for (const t of topicNames) {
    const topicId = await getOrCreateTopic(t);

    await sb.from("question_topics").upsert({
      question_id: questionId,
      topic_id: topicId
    });
  }
}

// --------------------------------
// FETCH
// --------------------------------
async function fetchQuestions() {
  const { data, error } = await sb
    .from("questions")
    .select(`
      *,
      question_topics (
        topic_id,
        topics ( id, name )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) return console.error(error);

  state.questions = data || [];
  render();
}

async function fetchTopics() {
  const { data, error } = await sb
    .from("question_topics")
    .select(`
      topic_id,
      topics ( id, name )
    `);

  if (error) return console.error(error);

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
// RENDER ROOT
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
// QUESTIONS
// --------------------------------
function renderQuestions() {
  let list = [...state.questions];

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
    el.questionsView.innerHTML =
      `<div class="empty-state">No questions found</div>`;
    return;
  }

  el.questionsView.innerHTML = list.map(q => {

    const topicsHTML = (q.question_topics || [])
      .map(qt => `<div class="topic-tag">${qt.topics.name}</div>`)
      .join("");

    const optionsHTML = [
      { key: "A", text: q.option_a },
      { key: "B", text: q.option_b },
      { key: "C", text: q.option_c },
      { key: "D", text: q.option_d }
    ].map(opt => `
      <div class="option-row">
        <div class="opt-label">${opt.key}</div>
        <div class="opt">${opt.text}</div>
        ${q.correct_option === opt.key ? `<div class="correct-mark">✔</div>` : ""}
      </div>
    `).join("");

    return `
      <div class="question-card">

        <div class="q-header">
          <div class="q-title">Question</div>

          <div class="question-actions">
            <button class="icon-btn edit-btn" data-id="${q.id}">✏️</button>
            <button class="icon-btn delete-btn" data-id="${q.id}">🗑</button>
          </div>
        </div>

        <div class="qtext">${q.question_text}</div>

        <div class="options mt-10">
          ${optionsHTML}
        </div>

        <div class="topic-tags mt-10">
          ${topicsHTML}
        </div>

      </div>
    `;
  }).join("");
}

// --------------------------------
// TOPICS
// --------------------------------
function renderTopics() {
  if (!state.topics.length) {
    el.topicsView.innerHTML =
      `<div class="empty-state">No topics</div>`;
    return;
  }

  el.topicsView.innerHTML = state.topics.map(t => {
    const weak = t.count < 5 ? "warning" : "";

    return `
      <div class="question-card ${weak}">
        <div class="q-title">${t.name}</div>
        <div class="small mt-5">${t.count} questions</div>

        <button class="secondary-btn mt-10 view-topic-btn" data-id="${t.id}">
          View Questions
        </button>
      </div>
    `;
  }).join("");
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
// FORM CONTROL
// --------------------------------
function openForm() {
  el.form.classList.remove("hidden");
}

function closeForm() {
  el.form.classList.add("hidden");
}

// --------------------------------
// DELETE
// --------------------------------
async function deleteQuestion(id) {
  if (!confirm("Delete this question?")) return;

  await sb.from("questions").delete().eq("id", id);

  await fetchQuestions();
  await fetchTopics();
}

// --------------------------------
// SAVE
// --------------------------------
async function saveQuestion() {

  const text = document.getElementById("question-text").value.trim();

  const options = [
    document.getElementById("optA").value,
    document.getElementById("optB").value,
    document.getElementById("optC").value,
    document.getElementById("optD").value
  ];

  const correct = document.getElementById("correct-option").value;
  const explanation = document.getElementById("explanation").value;

  const topicsInput = document.getElementById("topic-input").value;
  const topicList = topicsInput.split(",").map(t => t.trim()).filter(Boolean);

  const qObj = {
    text,
    options: options.map((t, i) => ({ id: ["A","B","C","D"][i], text: t })),
    correct
  };

  const hash = generateHash(qObj);

  let questionId;

  if (state.editingId) {
    await sb.from("questions").update({
      question_text: text,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correct,
      explanation
    }).eq("id", state.editingId);

    questionId = state.editingId;
  } else {
    const { data } = await sb
      .from("questions")
      .insert({
        question_text: text,
        option_a: options[0],
        option_b: options[1],
        option_c: options[2],
        option_d: options[3],
        correct_option: correct,
        explanation,
        question_hash: hash
      })
      .select()
      .single();

    questionId = data.id;
  }

  await attachTopics(questionId, topicList);

  resetForm();

  await fetchQuestions();
  await fetchTopics();
}

// --------------------------------
// EDIT LOAD
// --------------------------------
function loadEdit(id) {
  const q = state.questions.find(q => q.id == id);
  if (!q) return;

  state.editingId = id;

  openForm();

  document.getElementById("question-text").value = q.question_text;
  document.getElementById("optA").value = q.option_a;
  document.getElementById("optB").value = q.option_b;
  document.getElementById("optC").value = q.option_c;
  document.getElementById("optD").value = q.option_d;
  document.getElementById("correct-option").value = q.correct_option;
  document.getElementById("explanation").value = q.explanation;

  const topicNames = (q.question_topics || [])
    .map(qt => qt.topics.name)
    .join(", ");

  document.getElementById("topic-input").value = topicNames;
}

// --------------------------------
// RESET
// --------------------------------
function resetForm() {
  state.editingId = null;

  closeForm();

  document.querySelectorAll("#question-form input, #question-form textarea")
    .forEach(el => el.value = "");
}

// --------------------------------
// EVENTS
// --------------------------------
function bindEvents() {

  el.searchInput.addEventListener("input", e => {
    state.search = e.target.value;
    renderQuestions();
  });

  el.topicFilter.addEventListener("change", e => {
    state.topicFilter = e.target.value || null;
    renderQuestions();
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

  document.getElementById("add-question-btn")
    .addEventListener("click", openForm);

  el.questionsView.addEventListener("click", e => {

    if (e.target.classList.contains("delete-btn")) {
      deleteQuestion(e.target.dataset.id);
    }

    if (e.target.classList.contains("edit-btn")) {
      loadEdit(e.target.dataset.id);
    }
  });

  el.topicsView.addEventListener("click", e => {

    if (e.target.classList.contains("view-topic-btn")) {
      state.topicFilter = e.target.dataset.id;
      state.view = "questions";
      render();
    }
  });

  document.getElementById("save-question-btn")
    .addEventListener("click", saveQuestion);
}

// --------------------------------
// INIT
// --------------------------------
async function init() {
  bindEvents();
  await fetchTopics();
  await fetchQuestions();
}

init();