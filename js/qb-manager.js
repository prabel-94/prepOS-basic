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
  topicFilter: null,
  topicSearch: "",
  caFilter: "all"
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

     await updateTopicPatterns(questionId, patternKey);
}
async function replaceQuestionMetadata(questionId, difficulty) {

  await sb
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

async function getPatternsByTopics(topicIds, query = "") {

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
  ${caBadge}

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

      </div>
    `;
  }).join("");
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

        <button 
          class="secondary-btn mt-10 view-topic-btn" 
          data-id="${t.id}">
          View Questions
        </button>

      </div>
    `;
  }).join("");
}

async function renameTopic(id, oldName) {

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

// --------------------------------
// EDIT (TEMP PLACEHOLDER)
// --------------------------------
function handleEdit(id) {
  // Future: redirect to draft editor
  console.log("Edit question:", id);
}

async function replaceCAMetadata(questionId, event, date) {

  await sb
    .from("question_metadata")
    .delete()
    .eq("question_id", questionId)
    .in("key", ["ca_event","ca_date"]);

  if (!event) return;

  await sb.from("question_metadata").insert([
    {
      question_id: questionId,
      key: "ca_event",
      value: event
    },
    {
      question_id: questionId,
      key: "ca_date",
      value: date
    }
  ]);
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

document.getElementById("openCAManager")
?.addEventListener("click", async () => {

  document
    .getElementById("caManagerPanel")
    .classList.remove("hidden");

  document.body.style.overflow = "hidden";

  await loadCADefinitions();
  renderCAManager();

});

document.getElementById("closeCAManager")
?.addEventListener("click", () => {

  document
    .getElementById("caManagerPanel")
    .classList.add("hidden");

  document.body.style.overflow = "";

});

document.getElementById("addCABtn")
?.addEventListener("click", createCA);

document.getElementById("caList")
?.addEventListener("click", async (e) => {

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

});

  document.addEventListener("focusin", (e) => {

  if (e.target.id !== "patternInput") return;

  renderPatternDropdown("");

  document
    .getElementById("patternDropdown")
    ?.classList.remove("hidden");

});
// CLICK DIFFICULTY BADGE
el.questionsView.addEventListener("click", (e) => {

  // 🔥 CA CLICK
const caBadge = e.target.closest(".ca-badge");
if (caBadge) {

  const id = caBadge.dataset.id;
  selectedQuestionId = id;

  const q = state.questions.find(q => q.id === id);

  const meta = {};
  (q.question_metadata || []).forEach(m => {
    meta[m.key] = m.value;
  });

  document.getElementById("caPanel")
    .classList.remove("hidden");

  document.body.style.overflow = "hidden";

  document.getElementById("caQuestionPreview").innerText =
    q.question_text;

  document.getElementById("caEventEdit").value =
    meta.ca_event || "";

  document.getElementById("caDateEdit").value =
    meta.ca_date || "";

  return;
}
  // 🔥 DIFFICULTY CLICK
const badge = e.target.closest(".difficulty-badge");
if (badge) {

  const id = badge.dataset.id;
  selectedQuestionId = id;

  const q = state.questions.find(q => q.id === id);

  document.getElementById("metadataPanel")
    .classList.remove("hidden");

  document.body.style.overflow = "hidden";

  document.getElementById("metaQuestionPreview").innerText =
    q.question_text;

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

  await sb
    .from("questions")
    .update({
      explanation: value || null
    })
    .eq("id", id);

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

document.getElementById("saveCABtn")
?.addEventListener("click", async () => {

  if (!selectedQuestionId) return;

  const event =
    document.getElementById("caEventEdit").value.trim();

  const date =
    document.getElementById("caDateEdit").value.trim();

  await replaceCAMetadata(
    selectedQuestionId,
    event,
    date
  );

  document.getElementById("caPanel")
    .classList.add("hidden");

  document.body.style.overflow = "";

  await fetchQuestions();

});

document.getElementById("closeCA")
?.addEventListener("click", () => {

  document.getElementById("caPanel")
    .classList.add("hidden");

  document.body.style.overflow = "";

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