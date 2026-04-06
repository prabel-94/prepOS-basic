// ===============================
// PrepOS QB Manager (v3 - Viewer Mode)
// ===============================

// --------------------------------
// INIT
// --------------------------------
const sb = window.supabaseClient;
let selectedQuestionId = null;

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

let patternDefinitions = [];

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
async function fetchPatterns() {
  await loadPatternDefinitions();
  renderPatternManager();
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
async function createPattern() {

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

function renderPatternDropdown(query = "") {

  const q = query.toLowerCase();

  const filtered = patternDefinitions
    .filter(p => p.key.toLowerCase().includes(q))
    .sort((a,b) => a.key.localeCompare(b.key));

  const dropdown = document.getElementById("patternDropdown");

  if (!filtered.length) {
    dropdown.innerHTML = `<div class="pattern-empty">No match</div>`;
    return;
  }

  dropdown.innerHTML = filtered.map(p => `
    <div 
      class="pattern-option"
      data-key="${p.key}"
      title="${p.description || ""}"
    >
      ${p.key}
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

async function replacePatternMetadata(questionId, patternKey) {

  // remove existing pattern
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

  // update cache
  await sb
    .from("questions")
    .update({
      primary_pattern_key: patternKey || null
    })
    .eq("id", questionId);
}
async function replaceQuestionMetadata(questionId, difficulty) {

  await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId);

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

  await sb.from("question_metadata").insert(rows);
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

const pattern = meta.pattern || q.primary_pattern_key || null;// 🔥 EXTRACT PATTERN 
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

  <div 
    class="pattern-badge clickable"
    data-id="${q.id}">
    ${pattern || "PATTERN"}
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

document.getElementById("patternList")
?.addEventListener("input", async (e) => {

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

  document
    .getElementById("patternManagerPanel")
    .classList.remove("hidden");

  document.body.style.overflow = "hidden";

  await fetchPatterns();

});

document.getElementById("closePatternManager")
?.addEventListener("click", () => {

  document
    .getElementById("patternManagerPanel")
    .classList.add("hidden");

  document.body.style.overflow = "";

});

document.getElementById("addPatternBtn")
?.addEventListener("click", createPattern);

  document.getElementById("patternDropdown")
?.addEventListener("click", (e) => {

  if (!e.target.classList.contains("pattern-option")) return;

  const key = e.target.dataset.key;

  document.getElementById("patternInput").value = key;

  document
    .getElementById("patternDropdown")
    .classList.add("hidden");

});

 document.getElementById("patternInput")
?.addEventListener("input", (e) => {
  const value = e.target.value;

  if (!value) {
    document
      .getElementById("patternDropdown")
      .classList.add("hidden");
    return;
  }

  renderPatternDropdown(e.target.value);

}); 

  document.getElementById("patternInput")
?.addEventListener("focus", () => {

  renderPatternDropdown("");

  document
    .getElementById("patternDropdown")
    .classList.remove("hidden");

});
// CLICK DIFFICULTY BADGE
el.questionsView.addEventListener("click", (e) => {

  // 🔥 DIFFICULTY CLICK
  const badge = e.target.closest(".difficulty-badge");
  if (badge) {
    const id = badge.dataset.id;
    selectedQuestionId = id;

    const q = state.questions.find(q => q.id === id);

    document.getElementById("metadataPanel").classList.remove("hidden");
    document.body.style.overflow = "hidden";

    document.getElementById("metaQuestionPreview").innerText = q.question_text;

    return; // 🔥 IMPORTANT (stop further handling)
  }

  // 🔥 PATTERN CLICK (ADD THIS)
  const patternBadge = e.target.closest(".pattern-badge");
  if (patternBadge) {

    const id = patternBadge.dataset.id;
    selectedQuestionId = id;

    const q = state.questions.find(q => q.id === id);

    document.getElementById("patternPanel").classList.remove("hidden");
    document.body.style.overflow = "hidden";

    document.getElementById("patternQuestionPreview").innerText =
      q.question_text;

    const meta = {};
(q.question_metadata || []).forEach(m => {
  meta[m.key] = m.value;
});

document.getElementById("patternInput").value =
  meta.pattern || q.primary_pattern_key || "";

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

  el.topicsView.addEventListener("click", e => {

    if (e.target.classList.contains("view-topic-btn")) {
      state.topicFilter = e.target.dataset.id;
      state.view = "questions";
      render();
    }
  });

  // 🔥CLOSE METADATA PANEL (EXACT PLACEMENT)
  document.getElementById("closeMetadata")
    ?.addEventListener("click", () => {
      document.getElementById("metadataPanel").classList.add("hidden");
      document.body.style.overflow = "";
    });
  document.getElementById("closePattern")
    ?.addEventListener("click", () => {

      document.getElementById("patternPanel")
        .classList.add("hidden");

      document.body.style.overflow = "";

    });
document.getElementById("saveMetadataBtn")
  ?.addEventListener("click", async () => {

if (!selectedQuestionId) {
  alert("No question selected");
  return;
}
  const cognitive = document.querySelector('input[name="cognitive"]:checked')?.value;
  const complexity = document.querySelector('input[name="complexity"]:checked')?.value;
  const depth = document.querySelector('input[name="depth"]:checked')?.value;

  if (!cognitive || !complexity || !depth) {
    alert("Select all fields");
    return;
  }

  const { score, label } = computeDifficulty(cognitive, complexity, depth);

  await replaceQuestionMetadata(selectedQuestionId, {
    cognitive_level: cognitive,
    complexity_level: complexity,
    depth_level: depth,
    score,
    label
  });

  // CLOSE PANEL
  document.getElementById("metadataPanel").classList.add("hidden");
  document.body.style.overflow = "";

  // REFRESH
  await fetchQuestions();

});
document.getElementById("savePatternBtn")
  ?.addEventListener("click", async () => {

  if (!selectedQuestionId) {
    alert("No question selected");
    return;
  }

  const selectedPattern =
    document.getElementById("patternInput")?.value?.trim();

  await replacePatternMetadata(selectedQuestionId, selectedPattern);

  document.getElementById("patternPanel").classList.add("hidden");
  document.body.style.overflow = "";

  await fetchQuestions();
});

}

document.addEventListener("click", (e) => {

  const box = document.querySelector(".pattern-box");
  if (!box) return;

  if (!box.contains(e.target)) {
    document
      .getElementById("patternDropdown")
      ?.classList.add("hidden");
  }

});


// --------------------------------
// INIT
// --------------------------------
async function init() {
  await loadPatternDefinitions();
  bindEvents();
  await fetchTopics();
  await fetchQuestions();
}

init();