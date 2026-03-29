// ===============================
// PrepOS QB Manager (v1)
// ===============================

// --------------------------------
// GLOBAL STATE
// --------------------------------
const sb = window.supabaseClient;

let questions = [];
let topics = [];

let currentView = "questions"; // "questions" | "topics"
let activeTopicFilter = null;
let searchQuery = "";
let editingQuestionId = null;

// --------------------------------
// UTIL (REUSED FROM DRAFT)
// --------------------------------
function formatTopicName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
}

function generateHash(q) {
  const base = (
    q.text +
    (q.options || []).map(o => o.text).join("") +
    q.correct
  ).toLowerCase().replace(/\s+/g, "");

  return btoa(base);
}

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
    .insert({
      name: formatted,
      normalized_name: normalized
    })
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
// FETCH DATA
// --------------------------------
async function fetchQuestions() {
console.log("Fetching questions...");
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

  if (error) {
    console.error(error);
    return;
  }

console.log("Questions response:", data, error);
  questions = data || [];
  render();
  updateOverview();
}

async function fetchTopics() {
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
    const t = row.topics;

    if (!map[t.id]) {
      map[t.id] = {
        id: t.id,
        name: t.name,
        count: 0
      };
    }

    map[t.id].count++;
  });

  topics = Object.values(map);
  renderTopicsFilter();
}

// --------------------------------
// OVERVIEW
// --------------------------------
function updateOverview() {
  document.getElementById("total-questions").textContent = questions.length;
  document.getElementById("total-topics").textContent = topics.length;

  const avg = topics.length
    ? Math.round(questions.length / topics.length)
    : 0;

  document.getElementById("avg-per-topic").textContent = avg;

  const weak = topics.filter(t => t.count < 5).length;
  document.getElementById("weak-topics").textContent = weak;
}

// --------------------------------
// RENDER ROOT
// --------------------------------
function render() {
  if (currentView === "questions") {
    renderQuestions();
  } else {
    renderTopics();
  }
}

// --------------------------------
// QUESTIONS VIEW
// --------------------------------
function renderQuestions() {
  const container = document.getElementById("questions-view");

  let filtered = [...questions];

  if (searchQuery) {
    filtered = filtered.filter(q =>
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  if (activeTopicFilter) {
    filtered = filtered.filter(q =>
      q.question_topics.some(qt => qt.topic_id === activeTopicFilter)
    );
  }

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">No questions found</div>`;
    return;
  }

  container.innerHTML = filtered.map(q => {

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
        ${q.correct_option === opt.key ? "✔" : ""}
      </div>
    `).join("");

    return `
      <div class="question-card">

        <!-- HEADER -->
        <div class="q-header">
          <div class="q-title">Question</div>

          <div class="question-actions">
            <button class="icon-btn edit-btn" data-id="${q.id}">✏️</button>
            <button class="icon-btn delete-btn" data-id="${q.id}">🗑</button>
          </div>
        </div>

        <!-- QUESTION TEXT -->
        <div class="qtext">
          ${q.question_text}
        </div>

        <!-- OPTIONS -->
        <div class="options mt-10">
          ${optionsHTML}
        </div>

        <!-- TOPICS -->
        <div class="topic-tags mt-10">
          ${topicsHTML}
        </div>

      </div>
    `;
  }).join("");
}
// --------------------------------
// TOPICS VIEW
// --------------------------------
function renderTopics() {
  const container = document.getElementById("topics-view");

  if (!topics.length) {
    container.innerHTML = `<div class="empty-state">No topics</div>`;
    return;
  }

  container.innerHTML = topics.map(t => {

    const weak = t.count < 5 ? "warning" : "";

    return `
      <div class="topic-card ${weak}">

        <div class="topic-name">${t.name}</div>

        <div class="mt-5">${t.count} questions</div>

        <button class="view-topic-btn mt-10" data-id="${t.id}">
          View Questions
        </button>

      </div>
    `;
  }).join("");
}

// --------------------------------
// FILTER DROPDOWN
// --------------------------------
function renderTopicsFilter() {
  const select = document.getElementById("topic-filter");

  select.innerHTML = `
    <option value="">All Topics</option>
    ${topics.map(t => `
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
  if (!confirm("Delete this question?")) return;

  await sb.from("questions").delete().eq("id", id);

  await fetchQuestions();
  await fetchTopics();
}

// --------------------------------
// CREATE / UPDATE
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

  if (editingQuestionId) {
    await sb.from("questions").update({
      question_text: text,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correct,
      explanation
    }).eq("id", editingQuestionId);

    questionId = editingQuestionId;
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
  const q = questions.find(q => q.id == id);
  if (!q) return;

  editingQuestionId = id;

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

  document.getElementById("question-form").classList.remove("hidden");
}

// --------------------------------
// RESET FORM
// --------------------------------
function resetForm() {
  editingQuestionId = null;

  document.getElementById("question-form").classList.add("hidden");

  document.querySelectorAll("#question-form input, #question-form textarea")
    .forEach(el => el.value = "");
}

// --------------------------------
// EVENTS
// --------------------------------
function bindEvents() {

  document.getElementById("search-input")
    ?.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderQuestions();
    });

  document.getElementById("topic-filter")
    ?.addEventListener("change", (e) => {
      activeTopicFilter = e.target.value || null;
      renderQuestions();
    });

  document.getElementById("view-questions")
    ?.addEventListener("click", () => {
      currentView = "questions";
      render();
    });

  document.getElementById("view-topics")
    ?.addEventListener("click", () => {
      currentView = "topics";
      render();
    });

  document.getElementById("add-question-btn")
    ?.addEventListener("click", () => {
      document.getElementById("question-form").classList.remove("hidden");
    });

  document.getElementById("questions-view")
    ?.addEventListener("click", (e) => {

      if (e.target.classList.contains("delete-btn")) {
        deleteQuestion(e.target.dataset.id);
      }

      if (e.target.classList.contains("edit-btn")) {
        loadEdit(e.target.dataset.id);
      }
    });

  document.getElementById("topics-view")
    ?.addEventListener("click", (e) => {

      if (e.target.classList.contains("view-topic-btn")) {
        activeTopicFilter = e.target.dataset.id;
        currentView = "questions";
        render();
      }
    });

  document.getElementById("save-question-btn")
    ?.addEventListener("click", saveQuestion);
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