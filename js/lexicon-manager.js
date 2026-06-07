/* =========================================
PrepOS Lexicon Manager (v3)
========================================= */

import { getClient } from "./core/get-client.js";
import { bootPage } from "./core/page-boot.js";
import { DEFAULT_LEXICON_TOPIC } from "./generators/shared/lexicon-engine.js";
import {
  normalizeWordKey,
  validateGroupWords,
  validateGeneratorReadiness,
  inferGroupLexicalClass,
  applyGroupLexicalClassToWords,
  renderLexicalClassSelect,
} from "./generators/shared/lexicon-utils.js";

let selectedGroupA = null;
let selectedGroupB = null;

const state = {
  topic: DEFAULT_LEXICON_TOPIC,
  mode: "SESSION",
  language: "ml",
  sessionGroups: [],
  dbGroups: [],
  dbRelations: [],
  selectedGroupId: null,
  lastLexicalClass: "",
};

const el = {
  groupSearchSelect: document.getElementById("groupSearchSelect"),
  topicInput: document.getElementById("topicInput"),
  languageSelect: document.getElementById("languageSelect"),
  modeSelect: document.getElementById("modeSelect"),
  addGroupBtn: document.getElementById("addGroupBtn"),
  groupsContainer: document.getElementById("groupsContainer"),
  status: document.getElementById("lexiconStatus"),
  relationSessionHint: document.getElementById("relationSessionHint"),
  relationBuilder: document.getElementById("relationBuilder"),
  existingRelationsList: document.getElementById("existingRelationsList"),
};

function setStatus(msg, isError = false) {
  if (!el.status) {
    return;
  }
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

function getCurrentGroups() {
  return state.mode === "SESSION" ? state.sessionGroups : state.dbGroups;
}

function groupRows(rows) {
  const map = {};

  rows.forEach((row) => {
    if (!map[row.group_id]) {
      map[row.group_id] = [];
    }

    map[row.group_id].push({
      id: row.id,
      word: row.word,
      lexical_class: row.lexical_class || "",
    });
  });

  return map;
}

function groupLabel(groupId) {
  const group =
    state.dbGroups.find((entry) => entry.group_id === groupId) ||
    state.sessionGroups.find((entry) => entry.group_id === groupId);

  if (!group?.words?.length) {
    return groupId.slice(0, 8);
  }

  return (
    group.words
      .slice(0, 3)
      .map((word) => (typeof word === "string" ? word : word.word))
      .filter(Boolean)
      .join(", ") || "(empty)"
  );
}

function getRelationEligibleGroups() {
  const merged = new Map();

  for (const group of [...state.dbGroups, ...state.sessionGroups]) {
    if (!group?.group_id || !group.words?.length) {
      continue;
    }

    merged.set(group.group_id, group);
  }

  return [...merged.values()];
}

function syncGroup(card) {
  const group = findGroupByCard(card);
  if (!group) {
    return null;
  }

  const rows = [...card.querySelectorAll(".value-row")];

  group.words = rows
    .map((row) => {
      const word = row.querySelector(".word-input")?.value?.trim() ?? "";
      const entryId = row.dataset.entryId || null;

      return {
        id: entryId || undefined,
        word,
      };
    })
    .filter((entry) => entry.word);

  group.default_lexical_class =
    card.querySelector(".group-lexical-class-select")?.value || "";

  if (group.default_lexical_class) {
    state.lastLexicalClass = group.default_lexical_class;
  }

  applyGroupLexicalClassToWords(group);

  return group;
}

function syncAllGroupsFromDOM() {
  el.groupsContainer?.querySelectorAll(".group-card").forEach((card) => {
    syncGroup(card);
  });
}

function findGroupByCard(card) {
  const groups = getCurrentGroups();
  const groupId = card.dataset.groupId;

  if (groupId) {
    return groups.find((group) => group.group_id === groupId) ?? null;
  }

  const index = Number(card.dataset.index);
  return Number.isFinite(index) ? groups[index] ?? null : null;
}

function renderGroup(group, index) {
  const defaultClass = group.default_lexical_class ?? inferGroupLexicalClass(group.words);

  return `
    <div
      class="group-card"
      data-group-id="${group.group_id || ""}"
      data-index="${group.group_id ? "" : index}"
    >
      <div class="small mb-10">
        ${group.language_code === "en" ? "🇬🇧 English" : "🇮🇳 Malayalam"}
        · topic: ${escapeHTML(state.topic)}
      </div>

      <div class="group-lexical-class-row mb-10">
        <label class="small" for="group-class-${group.group_id || index}">Lexical class for group</label>
        ${renderLexicalClassSelect(defaultClass, {
          selectClass: "group-lexical-class-select",
          id: `group-class-${group.group_id || index}`,
        })}
      </div>

      <div class="values">
        ${group.words
          .map((wordEntry, wordIndex) => {
            const word =
              typeof wordEntry === "string" ? wordEntry : wordEntry?.word || "";
            const entryId =
              typeof wordEntry === "object" && wordEntry?.id
                ? wordEntry.id
                : "";

            return `
              <div class="value-row" data-index="${wordIndex}"${
                entryId ? ` data-entry-id="${escapeHTML(entryId)}"` : ""
              }>
                <input class="word-input" value="${escapeHTML(word)}" placeholder="Word" />
                <button type="button" class="delete-word secondary-btn" aria-label="Delete word">×</button>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="flex gap-10 mt-10">
        <button type="button" class="add-word secondary-btn">+ Add Word</button>
        <button type="button" class="save-group primary-btn">Save</button>
        <button type="button" class="delete-group secondary-btn">Delete</button>
      </div>
    </div>
  `;
}

function renderGroups({ skipSync = false } = {}) {
  if (!skipSync) {
    syncAllGroupsFromDOM();
  }

  let groups =
    state.mode === "SESSION" ? state.sessionGroups : state.dbGroups;

  if (state.mode === "BROWSE" && state.selectedGroupId) {
    groups = groups.filter((group) => group.group_id === state.selectedGroupId);
  }

  if (!groups.length) {
    el.groupsContainer.innerHTML = `
      <div class="question-card">
        ${
          state.mode === "SESSION"
            ? "No groups in this session. Add a word group, then Save each card."
            : "No groups found for this topic and language."
        }
      </div>
    `;
    updateRelationPanels();
    return;
  }

  el.groupsContainer.innerHTML = groups
    .map((group, index) => {
      if (!group.default_lexical_class) {
        group.default_lexical_class = inferGroupLexicalClass(group.words);
      }
      return renderGroup(group, index);
    })
    .join("");

  updateRelationPanels();
}

function renderRelationGroups(groups) {
  const map = {};

  groups.forEach((group) => {
    if (group.group_id) {
      map[group.group_id] = group.words;
    }
  });

  renderRelationList("groupA-list", map, "A");
  renderRelationList("groupB-list", map, "B");
}

function renderRelationList(containerId, groups, side) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  container.innerHTML = "";

  const entries = Object.entries(groups);
  if (!entries.length) {
    container.innerHTML = `<p class="small text-muted">No saved groups available.</p>`;
    return;
  }

  entries.forEach(([groupId, words]) => {
    const div = document.createElement("div");
    div.className = "group-item";
    div.dataset.id = groupId;
    div.textContent = words
      .slice(0, 3)
      .map((word) => (typeof word === "string" ? word : word.word))
      .join(", ");
    div.onclick = () => selectRelationGroup(side, groupId, div);
    container.appendChild(div);
  });
}

function selectRelationGroup(side, groupId, itemEl) {
  const containerId = side === "A" ? "groupA-list" : "groupB-list";

  document
    .querySelectorAll(`#${containerId} .group-item`)
    .forEach((node) => node.classList.remove("active"));

  itemEl.classList.add("active");

  if (side === "A") {
    selectedGroupA = groupId;
  } else {
    selectedGroupB = groupId;
  }
}

function populateSearchDropdown() {
  if (!el.groupSearchSelect) {
    return;
  }

  el.groupSearchSelect.innerHTML = `<option value="">Select Group</option>`;

  state.dbGroups.forEach((group) => {
    const label = groupLabel(group.group_id);
    const option = document.createElement("option");
    option.value = group.group_id;
    option.textContent = label;
    if (group.group_id === state.selectedGroupId) {
      option.selected = true;
    }
    el.groupSearchSelect.appendChild(option);
  });
}

function renderExistingRelations() {
  if (!el.existingRelationsList) {
    return;
  }

  const eligibleIds = new Set(
    getRelationEligibleGroups().map((group) => group.group_id)
  );

  const visibleRelations = state.dbRelations.filter(
    (relation) =>
      eligibleIds.has(relation.group_id_1) &&
      eligibleIds.has(relation.group_id_2)
  );

  if (!visibleRelations.length) {
    el.existingRelationsList.innerHTML =
      '<li class="small text-muted">No opposite links for this topic and language yet.</li>';
    return;
  }

  el.existingRelationsList.innerHTML = visibleRelations
    .map(
      (relation) => `
        <li class="lexicon-relation-item">
          <span>${escapeHTML(groupLabel(relation.group_id_1))} ↔ ${escapeHTML(
            groupLabel(relation.group_id_2)
          )}</span>
          <button
            type="button"
            class="secondary-btn delete-relation-btn"
            data-relation-id="${escapeHTML(relation.id)}"
          >
            Remove
          </button>
        </li>
      `
    )
    .join("");
}

function updateRelationPanels() {
  const browseMode = state.mode === "BROWSE";
  const eligibleGroups = getRelationEligibleGroups();

  if (el.relationSessionHint) {
    el.relationSessionHint.classList.toggle("hidden", browseMode);
  }

  if (el.relationBuilder) {
    el.relationBuilder.classList.toggle("hidden", !browseMode);
  }

  const existingPanel = document.getElementById("existingRelationsPanel");
  if (existingPanel) {
    existingPanel.classList.toggle("hidden", !browseMode);
  }

  if (browseMode) {
    renderRelationGroups(eligibleGroups);
    renderExistingRelations();
  }
}

async function loadRelations() {
  const sb = await getClient();
  const { data, error } = await sb
    .from("lexicon_group_relations")
    .select("id, group_id_1, group_id_2, relation_type")
    .eq("relation_type", "ANTONYM");

  if (error) {
    console.error(error);
    setStatus("Failed to load opposite links", true);
    return;
  }

  state.dbRelations = data || [];
  renderExistingRelations();
}

async function loadGroups() {
  const sb = await getClient();
  setStatus("Loading groups...");

  const { data, error } = await sb
    .from("lexicon_entries")
    .select("id, word, lexical_class, group_id, topic, language_code")
    .eq("topic", state.topic)
    .eq("language_code", state.language);

  if (error) {
    console.error(error);
    setStatus("Failed to load groups", true);
    return;
  }

  const grouped = groupRows(data || []);

  state.dbGroups = Object.entries(grouped).map(([groupId, words]) => ({
    group_id: groupId,
    original_group_id: groupId,
    words,
    default_lexical_class: inferGroupLexicalClass(words),
    language_code: state.language,
  }));

  populateSearchDropdown();
  await loadRelations();
  renderGroups({ skipSync: true });
  setStatus(`${state.dbGroups.length} groups loaded`);
}

function mergeSavedGroupIntoBrowseCache(group) {
  if (!group?.group_id) {
    return;
  }

  const payload = {
    group_id: group.group_id,
    original_group_id: group.group_id,
    words: group.words,
    default_lexical_class:
      group.default_lexical_class ?? inferGroupLexicalClass(group.words),
    language_code: state.language,
  };

  const index = state.dbGroups.findIndex(
    (entry) => entry.group_id === group.group_id
  );

  if (index >= 0) {
    state.dbGroups[index] = payload;
  } else {
    state.dbGroups.push(payload);
  }
}

async function persistGroupEntries(sb, groupId, words) {
  const { data: existing, error: fetchError } = await sb
    .from("lexicon_entries")
    .select("id, word")
    .eq("group_id", groupId);

  if (fetchError) {
    throw fetchError;
  }

  const existingByKey = new Map(
    (existing || []).map((row) => [normalizeWordKey(row.word), row.id])
  );

  const desiredKeys = new Set(words.map((entry) => normalizeWordKey(entry.word)));
  const toDelete = (existing || [])
    .filter((row) => !desiredKeys.has(normalizeWordKey(row.word)))
    .map((row) => row.id);

  if (toDelete.length) {
    const { error: deleteError } = await sb
      .from("lexicon_entries")
      .delete()
      .in("id", toDelete);

    if (deleteError) {
      throw deleteError;
    }
  }

  for (const entry of words) {
    const key = normalizeWordKey(entry.word);
    const existingId = entry.id || existingByKey.get(key);

    if (existingId) {
      const { error: updateError } = await sb
        .from("lexicon_entries")
        .update({
          word: entry.word,
          lexical_class: entry.lexical_class || null,
          topic: state.topic,
          language_code: state.language,
        })
        .eq("id", existingId);

      if (updateError) {
        throw updateError;
      }

      entry.id = existingId;
      continue;
    }

    const { data: inserted, error: insertError } = await sb
      .from("lexicon_entries")
      .insert({
        word: entry.word,
        lexical_class: entry.lexical_class || null,
        group_id: groupId,
        topic: state.topic,
        language_code: state.language,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    entry.id = inserted.id;
  }
}

async function saveGroup(card) {
  syncAllGroupsFromDOM();
  const group = findGroupByCard(card);

  if (!group) {
    setStatus("Could not find group to save", true);
    return;
  }

  const validationErrors = validateGroupWords(group.words);
  if (validationErrors.length) {
    setStatus(validationErrors[0], true);
    return;
  }

  const sb = await getClient();
  const isNew = !group.original_group_id;
  let groupId = group.original_group_id;
  let createdGroupId = null;

  const allGroupsMap = Object.fromEntries(
    [...state.dbGroups, ...state.sessionGroups]
      .filter((entry) => entry.group_id)
      .map((entry) => [entry.group_id, entry.words])
  );

  const readinessWarnings = validateGeneratorReadiness(
    group.words,
    allGroupsMap,
    groupId
  );

  try {
    if (isNew) {
      groupId = crypto.randomUUID();
      createdGroupId = groupId;

      const { error: groupError } = await sb.from("lexicon_groups").insert({
        id: groupId,
        language_code: state.language,
      });

      if (groupError) {
        throw groupError;
      }
    }

    await persistGroupEntries(sb, groupId, group.words);
  } catch (error) {
    console.error(error);

    if (createdGroupId) {
      await sb.from("lexicon_groups").delete().eq("id", createdGroupId);
    }

    setStatus(error.message || "Save failed", true);
    return;
  }

  group.group_id = groupId;
  group.original_group_id = groupId;
  mergeSavedGroupIntoBrowseCache(group);

  if (state.mode === "BROWSE") {
    await loadGroups();
  } else {
    renderGroups({ skipSync: true });
    await loadRelations();
  }

  if (readinessWarnings.length) {
    setStatus(`Group saved ✅ ${readinessWarnings[0]}`);
    return;
  }

  setStatus("Group saved ✅");
}

async function deleteGroup(card) {
  syncAllGroupsFromDOM();

  const sb = await getClient();
  const groups = getCurrentGroups();
  const groupId = card.dataset.groupId;
  let index = groupId
    ? groups.findIndex((group) => group.group_id === groupId)
    : Number(card.dataset.index);

  if (!Number.isFinite(index) || index < 0) {
    index = -1;
  }

  const group =
    index !== -1 && groups[index] ? groups[index] : groups[0] ?? null;

  if (!group || !confirm("Delete this group?")) {
    return;
  }

  if (group.original_group_id) {
    const { error: relationError } = await sb
      .from("lexicon_group_relations")
      .delete()
      .or(
        `group_id_1.eq.${group.original_group_id},group_id_2.eq.${group.original_group_id}`
      );

    if (relationError) {
      console.error(relationError);
      setStatus("Failed to delete opposite links", true);
      return;
    }

    const { error: entryError } = await sb
      .from("lexicon_entries")
      .delete()
      .eq("group_id", group.original_group_id);

    if (entryError) {
      console.error(entryError);
      setStatus("Failed to delete words", true);
      return;
    }

    const { error: groupError } = await sb
      .from("lexicon_groups")
      .delete()
      .eq("id", group.original_group_id);

    if (groupError) {
      console.error(groupError);
      setStatus("Failed to delete group", true);
      return;
    }
  }

  const removeIndex = index !== -1 ? index : groups.indexOf(group);
  if (removeIndex !== -1) {
    groups.splice(removeIndex, 1);
  }

  state.dbGroups = state.dbGroups.filter(
    (entry) => entry.group_id !== group.original_group_id
  );

  if (selectedGroupA === group.original_group_id) {
    selectedGroupA = null;
  }
  if (selectedGroupB === group.original_group_id) {
    selectedGroupB = null;
  }

  if (state.mode === "BROWSE") {
    await loadGroups();
  } else {
    renderGroups({ skipSync: true });
    await loadRelations();
  }

  setStatus("Group deleted");
}

async function linkOpposite() {
  if (state.mode !== "BROWSE") {
    setStatus("Switch to Browse & Edit to link opposites.", true);
    return;
  }

  if (!selectedGroupA || !selectedGroupB) {
    setStatus("Select both groups", true);
    return;
  }

  if (selectedGroupA === selectedGroupB) {
    setStatus("Cannot link same group", true);
    return;
  }

  const sb = await getClient();

  const { data: existing, error: existingError } = await sb
    .from("lexicon_group_relations")
    .select("id")
    .or(
      `and(group_id_1.eq.${selectedGroupA},group_id_2.eq.${selectedGroupB}),and(group_id_1.eq.${selectedGroupB},group_id_2.eq.${selectedGroupA})`
    );

  if (existingError) {
    console.error(existingError);
    setStatus("Could not verify existing links", true);
    return;
  }

  if (existing?.length) {
    setStatus("Already linked", true);
    return;
  }

  const { error } = await sb.from("lexicon_group_relations").insert({
    group_id_1: selectedGroupA,
    group_id_2: selectedGroupB,
    relation_type: "ANTONYM",
  });

  if (error) {
    console.error(error);
    setStatus("Link failed", true);
    return;
  }

  await loadRelations();
  setStatus("Opposite linked ✅");
}

async function deleteRelation(relationId) {
  if (!relationId || !confirm("Remove this opposite link?")) {
    return;
  }

  const sb = await getClient();
  const { error } = await sb
    .from("lexicon_group_relations")
    .delete()
    .eq("id", relationId);

  if (error) {
    console.error(error);
    setStatus("Could not remove link", true);
    return;
  }

  await loadRelations();
  setStatus("Opposite link removed");
}

el.modeSelect?.addEventListener("change", async (event) => {
  state.mode = event.target.value;

  if (state.mode === "BROWSE") {
    el.groupSearchSelect.style.display = "inline-block";
    await loadGroups();
  } else {
    el.groupSearchSelect.style.display = "none";
    state.selectedGroupId = null;
    renderGroups({ skipSync: true });
  }
});

el.addGroupBtn?.addEventListener("click", () => {
  syncAllGroupsFromDOM();

  const target =
    state.mode === "SESSION" ? state.sessionGroups : state.dbGroups;

  target.unshift({
    group_id: null,
    original_group_id: null,
    default_lexical_class: state.lastLexicalClass || "",
    words: [{ word: "" }],
    language_code: state.language,
  });

  renderGroups({ skipSync: true });
});

el.groupsContainer?.addEventListener("click", async (event) => {
  const card = event.target.closest(".group-card");
  if (!card) {
    return;
  }

  syncAllGroupsFromDOM();
  const group = findGroupByCard(card);
  if (!group) {
    return;
  }

  if (event.target.classList.contains("add-word")) {
    group.words.push({ word: "" });
    renderGroups({ skipSync: true });
    return;
  }

  if (event.target.classList.contains("delete-word")) {
    const row = event.target.closest(".value-row");
    const wordIndex = Number(row?.dataset.index);
    if (Number.isFinite(wordIndex)) {
      group.words.splice(wordIndex, 1);
    }

    if (!group.words.length) {
      group.words.push({ word: "" });
    }

    renderGroups({ skipSync: true });
    return;
  }

  if (event.target.classList.contains("save-group")) {
    await saveGroup(card);
    return;
  }

  if (event.target.classList.contains("delete-group")) {
    await deleteGroup(card);
  }
});

el.groupSearchSelect?.addEventListener("change", (event) => {
  state.selectedGroupId = event.target.value || null;
  renderGroups({ skipSync: true });
});

el.topicInput?.addEventListener("change", async (event) => {
  state.topic = event.target.value.trim().toLowerCase() || DEFAULT_LEXICON_TOPIC;

  if (state.mode === "BROWSE") {
    await loadGroups();
    return;
  }

  setStatus(`Topic set to "${state.topic}" for new saves`);
});

el.languageSelect?.addEventListener("change", async (event) => {
  state.language = event.target.value;

  if (state.mode === "BROWSE") {
    await loadGroups();
  } else {
    renderGroups({ skipSync: true });
  }

  setStatus(state.language === "ml" ? "Malayalam mode" : "English mode");
});

document.getElementById("link-opposite-btn")?.addEventListener("click", linkOpposite);

el.existingRelationsList?.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-relation-btn");
  if (!button) {
    return;
  }

  await deleteRelation(button.dataset.relationId);
});

async function init() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Lexicon Manager",
      preset: "teacherKnowledge",
      back: "qb-manager.html",
    },
  });

  if (!runtime) {
    return;
  }

  if (el.topicInput) {
    el.topicInput.value = state.topic;
  }

  state.sessionGroups = [];
  renderGroups({ skipSync: true });
  setStatus("Session entry mode — save each group, then use Browse & Edit to link opposites.");
}

init();
