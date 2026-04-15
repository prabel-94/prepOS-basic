// ===============================
// PrepOS Lexicon Manager
// ===============================

const sb = window.supabaseClient;

const state = {
  pattern: "SYNONYM",
  groups: []
};

const el = {
  patternSelect: document.getElementById("patternSelect"),
  addGroupBtn: document.getElementById("addGroupBtn"),
  groupsContainer: document.getElementById("groupsContainer"),
  status: document.getElementById("lexiconStatus")
};

function setStatus(message, isError = false) {
  if (!el.status) return;
  el.status.textContent = message;
  el.status.style.color = isError ? "var(--danger)" : "";
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function groupRows(rows) {
  const map = {};

  rows.forEach(r => {
    if (!map[r.stem]) {
      map[r.stem] = [];
    }

    map[r.stem].push(r.value);
  });

  return map;
}

function renderGroup(group, index) {
  return `
    <div class="group-card" data-index="${index}">

      <input
        class="stem-input"
        value="${escapeHTML(group.stem)}"
        placeholder="Stem word"
      />

      <div class="values">
        ${group.values.map((v, valueIndex) => `
          <div class="value-row" data-value-index="${valueIndex}">
            <input
              class="value-input"
              value="${escapeHTML(v)}"
              placeholder="Value"
            />
            <button type="button" class="delete-value secondary-btn">x</button>
          </div>
        `).join("")}
      </div>

      <div class="flex gap-10 mt-10">
        <button type="button" class="add-value secondary-btn">+ Add Value</button>
        <button type="button" class="save-group primary-btn">Save</button>
        <button type="button" class="delete-group secondary-btn">Delete</button>
      </div>

    </div>
  `;
}

function renderGroups() {
  if (!state.groups.length) {
    el.groupsContainer.innerHTML = `
      <div class="question-card">
        No word groups yet.
      </div>
    `;
    return;
  }

  el.groupsContainer.innerHTML =
    state.groups.map((group, index) => renderGroup(group, index)).join("");
}

async function loadGroups() {
  setStatus("Loading word groups...");

  const { data, error } = await sb
    .from("lexicon_entries")
    .select("id, stem, value")
    .eq("pattern_type", state.pattern)
    .order("stem", { ascending: true });

  if (error) {
    console.error(error);
    setStatus("Failed to load word groups", true);
    return;
  }

  const grouped = groupRows(data || []);

  state.groups = Object.entries(grouped).map(([stem, values]) => ({
    stem,
    originalStem: stem,
    values
  }));

  renderGroups();
  setStatus(`${state.groups.length} word groups loaded`);
}

function syncGroupFromCard(card) {
  const index = +card.dataset.index;
  const group = state.groups[index];

  group.stem = card.querySelector(".stem-input").value.trim();
  group.values = [...card.querySelectorAll(".value-input")]
    .map(input => input.value.trim())
    .filter(Boolean);

  return group;
}

async function saveGroup(card) {
  const group = syncGroupFromCard(card);

  if (!group.stem) {
    setStatus("Stem is required", true);
    return;
  }

  const uniqueValues = [...new Set(group.values)];

  if (!uniqueValues.length) {
    setStatus("Add at least one value", true);
    return;
  }

  const selectedPattern = state.pattern;

  const rows = uniqueValues.map(v => ({
    pattern_type: selectedPattern,
    stem: group.stem,
    value: v
  }));

  const stemToReplace = group.originalStem || group.stem;
  let existingRows = [];

  if (group.originalStem) {
    const { data, error: loadError } = await sb
      .from("lexicon_entries")
      .select("pattern_type, stem, value")
      .eq("pattern_type", selectedPattern)
      .eq("stem", stemToReplace);

    if (loadError) {
      console.error(loadError);
      setStatus("Failed to prepare word group update", true);
      return;
    }

    existingRows = data || [];
  }

  if (group.originalStem) {
    const { error: deleteError } = await sb
      .from("lexicon_entries")
      .delete()
      .eq("pattern_type", selectedPattern)
      .eq("stem", stemToReplace);

    if (deleteError) {
      console.error(deleteError);
      setStatus("Failed to update word group", true);
      return;
    }
  }

  const { error } = await sb
    .from("lexicon_entries")
    .insert(rows);

  if (error) {
    console.error(error);

    if (existingRows.length) {
      const { error: restoreError } = await sb
        .from("lexicon_entries")
        .insert(existingRows);

      if (restoreError) {
        console.error(restoreError);
        setStatus("Save failed and restore also failed", true);
        return;
      }
    }

    setStatus("Failed to save word group", true);
    return;
  }

  group.originalStem = group.stem;
  group.values = uniqueValues;

  renderGroups();
  setStatus("Word group saved");
}

async function deleteGroup(card) {
  const index = +card.dataset.index;
  const group = state.groups[index];

  if (!confirm("Delete this word group?")) return;

  if (group.originalStem) {
    const { error } = await sb
      .from("lexicon_entries")
      .delete()
      .eq("pattern_type", state.pattern)
      .eq("stem", group.originalStem);

    if (error) {
      console.error(error);
      setStatus("Failed to delete word group", true);
      return;
    }
  }

  state.groups.splice(index, 1);
  renderGroups();
  setStatus("Word group deleted");
}

el.patternSelect?.addEventListener("change", async (e) => {
  state.pattern = e.target.value;
  await loadGroups();
});

el.addGroupBtn?.addEventListener("click", () => {
  state.groups.unshift({
    stem: "",
    originalStem: null,
    values: [""]
  });

  renderGroups();
});

el.groupsContainer?.addEventListener("click", async (e) => {
  const card = e.target.closest(".group-card");
  if (!card) return;

  if (e.target.classList.contains("add-value")) {
    const group = syncGroupFromCard(card);
    group.values.push("");
    renderGroups();
  }

  if (e.target.classList.contains("delete-value")) {
    const group = syncGroupFromCard(card);
    const valueRow = e.target.closest(".value-row");
    const valueIndex = +valueRow.dataset.valueIndex;

    group.values.splice(valueIndex, 1);
    if (!group.values.length) group.values.push("");
    renderGroups();
  }

  if (e.target.classList.contains("save-group")) {
    await saveGroup(card);
  }

  if (e.target.classList.contains("delete-group")) {
    await deleteGroup(card);
  }
});

loadGroups();
