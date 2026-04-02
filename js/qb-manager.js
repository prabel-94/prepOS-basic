// ===============================
// PrepOS QB Manager (v3 - Viewer Mode)
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
  view: "topics",  
  search: "",
  topicFilter: null
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
  render();
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

  // 🔥 BLOCK rendering unless filter/search applied
  if (!state.search && !state.topicFilter) {
    el.questionsView.innerHTML = `
      <div class="empty-state">
        Search or select a topic to view questions
      </div>
    `;
    return;
  }

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
   // 🔥 EXTRACT METADATA
const meta = {};
(q.question_metadata || []).forEach(m => {
  meta[m.key] = m.value;
});
const difficulty = meta.difficulty_label || "not-set";
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
        <div class="opt">${opt.text}</div>
        ${q.correct_option === opt.key ? `<div class="correct-mark">✔</div>` : ""}
      </div>
    `).join("");

    return `
      <div class="question-card">

        <div class="q-header">

  <!-- LEFT -->
  <div class="flex gap-10">

    <div 
  class="difficulty-badge clickable ${difficulty}" 
  data-id="${q.id}">
      ${difficulty === "not-set" ? "NOT SET" : difficulty.toUpperCase()}
    </div>

  </div>

  <!-- RIGHT -->
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
// TOPICS VIEW
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
        <div class="q-title">
  ${t.name} (${t.count})
</div>
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
// DELETE
// --------------------------------
async function deleteQuestion(id) {
  if (!confirm("Delete this question?")) return;

  await sb.from("questions").delete().eq("id", id);

  await fetchQuestions();
  await fetchTopics();
}

// --------------------------------
// EDIT (TEMP PLACEHOLDER)
// --------------------------------
function handleEdit(id) {
  // Future: redirect to draft editor
  console.log("Edit question:", id);
}

// --------------------------------
// EVENTS
// --------------------------------
function bindEvents() {
// CLICK DIFFICULTY BADGE
el.questionsView.addEventListener("click", (e) => {

  const badge = e.target.closest(".difficulty-badge");
  if (!badge) return;

  const id = badge.dataset.id;
  selectedQuestionId = id;

  const q = state.questions.find(q => q.id === id);

  // SHOW PANEL
  document.getElementById("metadataPanel").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // PREVIEW
  document.getElementById("metaQuestionPreview").innerText = q.question_text;

});

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

  el.questionsView.addEventListener("click", e => {

    if (e.target.classList.contains("delete-btn")) {
      deleteQuestion(e.target.dataset.id);
    }

    if (e.target.classList.contains("edit-btn")) {
      handleEdit(e.target.dataset.id);
    }
  });

  el.topicsView.addEventListener("click", e => {

    if (e.target.classList.contains("view-topic-btn")) {
      state.topicFilter = e.target.dataset.id;
      state.view = "questions";
      render();
    }
  });
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