/* =========================================
PrepOS Lexicon Manager (v2 - Correct Architecture)
========================================= */

const sb = window.supabaseClient;

/* =========================================
STATE
========================================= */
let selectedGroupA = null;
let selectedGroupB = null;
const state = {
  topic: "vocabulary",
  mode: "SESSION", // SESSION | BROWSE
  sessionGroups: [],
  dbGroups: []
};

const el = {
  topicInput: document.getElementById("topicInput"),
  addGroupBtn: document.getElementById("addGroupBtn"),
  groupsContainer: document.getElementById("groupsContainer"),
  status: document.getElementById("lexiconStatus")
};


/* =========================================
UTILS
========================================= */

function setStatus(msg, isError = false) {
  if (!el.status) return;
  el.status.textContent = msg;
  el.status.style.color = isError ? "var(--danger)" : "";
}

function escapeHTML(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}


/* =========================================
GROUPING (CORE)
========================================= */

function groupRows(rows) {
  const map = {};

  rows.forEach(r => {
    if (!map[r.group_id]) {
      map[r.group_id] = [];
    }
    map[r.group_id].push(r.word);
  });

  return map;
}


/* =========================================
RENDER
========================================= */

function renderGroup(group, index) {
  return `
    <div class="group-card" data-index="${index}">

      <div class="values">
        ${group.words.map((w, i) => `
          <div class="value-row" data-index="${i}">
            <input
              class="word-input"
              value="${escapeHTML(w)}"
              placeholder="Word"
            />
            <button class="delete-word secondary-btn">×</button>
          </div>
        `).join("")}
      </div>

      <div class="flex gap-10 mt-10">
        <button class="add-word secondary-btn">+ Add Word</button>
        <button class="save-group primary-btn">Save</button>
        <button class="delete-group secondary-btn">Delete</button>
      </div>

    </div>
  `;
}

function renderGroups() {

  const groups =
    state.mode === "SESSION"
      ? state.sessionGroups
      : state.dbGroups;

  if (!groups.length) {
    el.groupsContainer.innerHTML = `
      <div class="question-card">
        ${
          state.mode === "SESSION"
            ? "No groups in this session."
            : "No groups found."
        }
      </div>
    `;
    return;
  }

  el.groupsContainer.innerHTML =
    groups.map((g, i) => renderGroup(g, i)).join("");
}

function renderRelationGroups(groups) {

  const map = {};

  groups.forEach(g => {
    if (g.group_id) {
      map[g.group_id] = g.words;
    }
  });

  renderRelationList("groupA-list", map, "A");
  renderRelationList("groupB-list", map, "B");
}

function renderRelationList(containerId, groups, side) {

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  Object.entries(groups).forEach(([group_id, words]) => {

    const div = document.createElement("div");

    div.className = "group-item";
    div.dataset.id = group_id;

    div.textContent = words.slice(0, 3).join(", ");

    div.onclick = () => selectRelationGroup(side, group_id, div);

    container.appendChild(div);
  });
}

function selectRelationGroup(side, group_id, el) {

  const containerId = side === "A" ? "groupA-list" : "groupB-list";

  document.querySelectorAll(`#${containerId} .group-item`)
    .forEach(x => x.classList.remove("active"));

  el.classList.add("active");

  if (side === "A") {
    selectedGroupA = group_id;
  } else {
    selectedGroupB = group_id;
  }
}

/* =========================================
LOAD
========================================= */

async function loadGroups() {

  setStatus("Loading groups...");

  const { data, error } = await sb
    .from("lexicon_entries")
    .select("id, word, group_id, topic")
    .eq("topic", state.topic);

  if (error) {
    console.error(error);
    setStatus("Failed to load groups", true);
    return;
  }

  const grouped = groupRows(data || []);

  state.dbGroups = Object.entries(grouped).map(([group_id, words]) => ({
    group_id,
    original_group_id: group_id,
    words
  }));

  renderGroups();
renderRelationGroups(state.dbGroups);
setStatus(`${state.dbGroups.length} groups loaded`);
}

/* =========================================
SYNC FROM UI
========================================= */

function syncGroup(card) {
  const index = +card.dataset.index;
  const group = state.groups[index];

  const words = [...card.querySelectorAll(".word-input")]
    .map(i => i.value.trim())
    .filter(Boolean);

  group.words = [...new Set(words)];

  return group;
}


/* =========================================
SAVE GROUP
========================================= */
async function saveGroup(card) {

  const group = syncGroup(card);

  if (!group.words.length) {
    setStatus("Add at least one word", true);
    return;
  }

  let isNew = !group.original_group_id;
  let group_id = group.original_group_id;

  // ========================================
  // 1. CREATE GROUP IF NEW
  // ========================================

  if (isNew) {

    group_id = crypto.randomUUID();

    const { error: groupError } = await sb
      .from("lexicon_groups")
      .insert({ id: group_id });

    if (groupError) {
      console.error(groupError);
      setStatus("Failed to create group", true);
      return;
    }
  }

  // ========================================
  // 2. DELETE OLD ENTRIES (ONLY IF EXISTING)
  // ========================================

  if (!isNew) {
    await sb
      .from("lexicon_entries")
      .delete()
      .eq("group_id", group_id);
  }

  // ========================================
  // 3. INSERT WORDS
  // ========================================

  const rows = group.words.map(word => ({
    word,
    group_id,
    topic: state.topic
  }));

  const { error } = await sb
    .from("lexicon_entries")
    .insert(rows);

  if (error) {
    console.error(error);
    setStatus("Save failed", true);
    return;
  }

  // ========================================
  // 4. UPDATE STATE
  // ========================================

  group.group_id = group_id;
  group.original_group_id = group_id;

  setStatus("Group saved ✅");
  renderGroups();
}

/* =========================================
DELETE GROUP
========================================= */

async function deleteGroup(card) {

  const index = +card.dataset.index;
  const groups =
  state.mode === "SESSION"
    ? state.sessionGroups
    : state.dbGroups;

const group = groups[index];

  if (!confirm("Delete this group?")) return;

  if (group.original_group_id) {
    await sb
      .from("lexicon_entries")
      .delete()
      .eq("group_id", group.original_group_id);
  }

  groups.splice(index, 1);
  renderGroups();

  setStatus("Group deleted");
}


/* =========================================
EVENTS
========================================= */

document.getElementById("modeSelect")
  ?.addEventListener("change", async (e) => {

    state.mode = e.target.value;

    if (state.mode === "BROWSE") {
      await loadGroups();
    } else {
      renderGroups();
    }

});

el.addGroupBtn?.addEventListener("click", () => {

  const target =
    state.mode === "SESSION"
      ? state.sessionGroups
      : state.dbGroups;

  target.unshift({
    group_id: null,
    original_group_id: null,
    words: [""]
  });

  renderGroups();

});


el.groupsContainer?.addEventListener("click", async (e) => {

  const card = e.target.closest(".group-card");
  if (!card) return;

  const groups =
  state.mode === "SESSION"
    ? state.sessionGroups
    : state.dbGroups;

  const group = syncGroup(card);

  if (e.target.classList.contains("add-word")) {
    groups[card.dataset.index].words.push("");
    renderGroups();
  }

  if (e.target.classList.contains("delete-word")) {
    const row = e.target.closest(".value-row");
    const i = +row.dataset.index;
    groups[card.dataset.index].words.splice(i, 1);
    if (!group.words.length) group.words.push("");
    renderGroups();
  }

  if (e.target.classList.contains("save-group")) {
    await saveGroup(card);
  }

  if (e.target.classList.contains("delete-group")) {
    await deleteGroup(card);
  }

});


el.topicInput?.addEventListener("change", async (e) => {
  state.topic = e.target.value.trim().toLowerCase();
  await loadGroups();
});

document
  .getElementById("link-opposite-btn")
  ?.addEventListener("click", linkOpposite);

async function linkOpposite() {

  if (!selectedGroupA || !selectedGroupB) {
    setStatus("Select both groups", true);
    return;
  }

  if (selectedGroupA === selectedGroupB) {
    setStatus("Cannot link same group", true);
    return;
  }

  const { data: existing } = await sb
    .from("lexicon_group_relations")
    .select("id")
    .or(`and(group_id_1.eq.${selectedGroupA},group_id_2.eq.${selectedGroupB}),and(group_id_1.eq.${selectedGroupB},group_id_2.eq.${selectedGroupA})`);

  if (existing && existing.length) {
    setStatus("Already linked", true);
    return;
  }

  const { error } = await sb
    .from("lexicon_group_relations")
    .insert({
      group_id_1: selectedGroupA,
      group_id_2: selectedGroupB,
      relation_type: "ANTONYM"
    });

  if (error) {
    console.error(error);
    setStatus("Link failed", true);
    return;
  }

  setStatus("Opposite linked ✅");
}
/* =========================================
INIT
========================================= */
function init() {
  state.sessionGroups = [];
  renderGroups();
  setStatus("Start adding new word groups");
}

init();