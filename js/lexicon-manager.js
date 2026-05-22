/* =========================================
PrepOS Lexicon Manager (v2 - Correct Architecture)
========================================= */

import { getClient } from "./core/get-client.js";

/* =========================================
STATE
========================================= */
let selectedGroupA = null;
let selectedGroupB = null;
const state = {
  topic: "vocabulary",
  mode: "SESSION",
  language: "ml",
  sessionGroups: [],
  dbGroups: [],
  selectedGroupId: null
};

const el = {
  groupSearchSelect: document.getElementById("groupSearchSelect"),
  topicInput: document.getElementById("topicInput"),
  languageSelect: document.getElementById("languageSelect"),
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
    map[r.group_id].push({
  word: r.word,
  lexical_class: r.lexical_class || ""
});
  });

  return map;
}


/* =========================================
RENDER
========================================= */

function renderGroup(group, index) {

  return `
    <div
      class="group-card"
      data-group-id="${group.group_id || ''}"
      data-index="${group.group_id ? '' : index}"
    >

      <div class="small mb-10">
        ${
          group.language_code === "en"
            ? "🇬🇧 English"
            : "🇮🇳 Malayalam"
        }
      </div>

      <div class="values">

        ${group.words.map((w, i) => {

          const word =
            typeof w === "string"
              ? w
              : (w?.word || "");

          const lexicalClass =
            typeof w === "object"
              ? (w?.lexical_class || "")
              : "";

          return `
            <div class="value-row" data-index="${i}">

              <input
                class="word-input"
                value="${escapeHTML(word)}"
                placeholder="Word"
              />

              <div class="lexical-class-wrapper">

                <select class="lexical-class-select">

                  <option value="">
                    Class
                  </option>

                  ${[
                    "ABSTRACT",
                    "EMOTION",
                    "STATE",
                    "QUALITY",
                    "ACTION",
                    "OBJECT",
                    "PLACE",
                    "COLLECTIVE",
                    "TITLE",
                    "PERSON_NEUTRAL",
                    "PERSON_MALE",
                    "PERSON_FEMALE"
                  ].map(type => `

                    <option
                      value="${type}"
                      ${
                        lexicalClass === type
                          ? "selected"
                          : ""
                      }
                    >
                      ${type}
                    </option>

                  `).join("")}

                </select>

              </div>

              <button class="delete-word secondary-btn">
                ×
              </button>

            </div>
          `;

        }).join("")}

      </div>

      <div class="flex gap-10 mt-10">

        <button class="add-word secondary-btn">
          + Add Word
        </button>

        <button class="save-group primary-btn">
          Save
        </button>

        <button class="delete-group secondary-btn">
          Delete
        </button>

      </div>

    </div>
  `;
}

function getCurrentGroups() {
  return state.mode === "SESSION"
    ? state.sessionGroups
    : state.dbGroups;
}

function findGroupByCard(card) {
  const groups = getCurrentGroups();
  const groupId = card.dataset.groupId;

  if (groupId) {
    const group = groups.find(g => g.group_id === groupId);
    if (group) return group;
  }

  const index = +card.dataset.index;
  return groups[index] || groups[0];
}

function renderGroups() {

  let groups =
    state.mode === "SESSION"
      ? state.sessionGroups
      : state.dbGroups;

  // Apply filter ONLY in browse mode
  if (state.mode === "BROWSE" && state.selectedGroupId) {
    groups = groups.filter(g => g.group_id === state.selectedGroupId);
  }

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

    div.textContent = words
  .slice(0, 3)
  .map(w => typeof w === "string" ? w : w.word)
  .join(", ");

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

function populateSearchDropdown() {

  if (!el.groupSearchSelect) return;

  el.groupSearchSelect.innerHTML = `
    <option value="">Select Group</option>
  `;

  state.dbGroups.forEach(g => {

    const label =
  g.words
    .slice(0, 3)
    .map(w => typeof w === "string" ? w : w.word)
    .join(", ")
  || "(empty)";

    const option = document.createElement("option");
    option.value = g.group_id;
    option.textContent = label;

    el.groupSearchSelect.appendChild(option);
  });

}

/* =========================================
LOAD
========================================= */

async function loadGroups() {

  const sb = await getClient()
  setStatus("Loading groups...");

  const { data, error } = await sb
    .from("lexicon_entries")
    .select(`
  id,
  word,
  lexical_class,
  group_id,
  topic,
  language_code
`)
    .eq("topic", state.topic)
    .eq("language_code", state.language);

  if (error) {
    console.error(error);
    setStatus("Failed to load groups", true);
    return;
  }

  const grouped = groupRows(data || []);

  state.dbGroups = Object.entries(grouped).map(([group_id, words]) => ({
    group_id,
    original_group_id: group_id,
    words,
    language_code: state.language
  }));

  renderGroups();
renderRelationGroups(state.dbGroups);
populateSearchDropdown();
setStatus(`${state.dbGroups.length} groups loaded`);
}

/* =========================================
SYNC FROM UI
========================================= */

function syncGroup(card) {
  const group = findGroupByCard(card);

  const rows = [...card.querySelectorAll(".value-row")];

group.words = rows.map(row => {

  const word = row
    .querySelector(".word-input")
    ?.value
    .trim();

  const lexicalClass = row
    .querySelector(".lexical-class-select")
    ?.value || null;

  return {
    word,
    lexical_class: lexicalClass
  };

}).filter(entry => entry.word);

  return group;
}


/* =========================================
SAVE GROUP
========================================= */
async function saveGroup(card) {

  const sb = await getClient()
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
      .insert({
        id: group_id,
        language_code: state.language
      });

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

  const rows = group.words.map(entry => ({
  word: entry.word,
  lexical_class: entry.lexical_class,
  group_id,
  topic: state.topic,
  language_code: state.language
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

  const sb = await getClient()
  const groups = getCurrentGroups();
  const groupId = card.dataset.groupId;
  let index = groupId
    ? groups.findIndex(g => g.group_id === groupId)
    : +card.dataset.index;

  if (Number.isNaN(index) || index < 0) {
    index = -1;
  }

  const group = index !== -1 && groups[index]
    ? groups[index]
    : groups[0];

  if (!confirm("Delete this group?")) return;

  if (group.original_group_id) {

  // ========================================
  // DELETE RELATIONS
  // ========================================

  await sb
    .from("lexicon_group_relations")
    .delete()
    .or(`
      group_id_1.eq.${group.original_group_id},
      group_id_2.eq.${group.original_group_id}
    `);

  // ========================================
  // DELETE ENTRIES
  // ========================================

  await sb
    .from("lexicon_entries")
    .delete()
    .eq("group_id", group.original_group_id);

  // ========================================
  // DELETE GROUP
  // ========================================

  await sb
    .from("lexicon_groups")
    .delete()
    .eq("id", group.original_group_id);

}

  const removeIndex = index !== -1 ? index : groups.indexOf(group);
  if (removeIndex !== -1) {
    groups.splice(removeIndex, 1);
  }

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
      el.groupSearchSelect.style.display = "inline-block";
      await loadGroups();
    } else {
      el.groupSearchSelect.style.display = "none";
      state.selectedGroupId = null;
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
    words: [
  {
    word: "",
    lexical_class: ""
  }
],
    language_code: state.language
  });

  renderGroups();

});


el.groupsContainer?.addEventListener("click", async (e) => {

  const card = e.target.closest(".group-card");
  if (!card) return;

  const group = syncGroup(card);

  if (e.target.classList.contains("add-word")) {
    group.words.push({
  word: "",
  lexical_class: ""
});
    renderGroups();
  }

  if (e.target.classList.contains("delete-word")) {
    const row = e.target.closest(".value-row");
    const i = +row.dataset.index;
    group.words.splice(i, 1);
    if (!group.words.length) {

  group.words.push({
    word: "",
    lexical_class: ""
  });

}
    renderGroups();
  }

  if (e.target.classList.contains("save-group")) {
    await saveGroup(card);
  }

  if (e.target.classList.contains("delete-group")) {
    await deleteGroup(card);
  }

});

el.groupSearchSelect?.addEventListener("change", (e) => {

  state.selectedGroupId = e.target.value || null;

  renderGroups();

});

el.topicInput?.addEventListener("change", async (e) => {
  state.topic = e.target.value.trim().toLowerCase();
  await loadGroups();
});

el.languageSelect?.addEventListener("change", async (e) => {

  state.language = e.target.value;

  if (state.mode === "BROWSE") {
    await loadGroups();
  }

  setStatus(
    state.language === "ml"
      ? "Malayalam mode"
      : "English mode"
  );
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
async function init() {
  state.sessionGroups = [];
  renderGroups();
  setStatus("Start adding new word groups");
}

init();