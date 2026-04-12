const sb = window.supabaseClient;

const editor = document.getElementById("noteEditor");
const suggestBox = document.getElementById("topicSuggest");
const titleInput = document.getElementById("noteTitle");
const saveStatus = document.getElementById("saveStatus");

let topicId = null;
let saveTimer = null;
let savedRange = null;
let suggestIndex = -1;

function escapeHTML(str){
  return str
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function highlightSuggestion() {

  const items = suggestBox.querySelectorAll(".topic-suggest-item");

  items.forEach((el, i) => {
    el.classList.toggle("active", i === suggestIndex);
  });

}

function getTopicId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function resolveTopicLinks(html) {

    const matches = html.match(/\[\[(.*?)\]\]/g);

    if (!matches) return html;

    for (const m of matches) {

        const name = m.replace("[[", "").replace("]]", "").trim();
        const normalized = name.toLowerCase();

        const { data } = await sb
            .from("topics")
            .select("id,name")
            .eq("normalized_name", normalized)
            .maybeSingle();

        if (!data) continue;

        const link = `
  <span 
  class="topic-link"
  contenteditable="false"
    data-id="${data.id}">
    ${escapeHTML(data.name)}
  </span>
`;

        html = html.replace(m, link);
    }

    return html;
}

async function loadTopic() {

  topicId = getTopicId();

  if (!topicId) return;

  const { data } = await sb
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .single();

  if (!data) return;

  document.getElementById("topicName").innerText = data.name;

  titleInput.value = data.note_title || "";
  editor.innerHTML = await resolveTopicLinks(
  data.note_html || ""
);
}

function scheduleSave() {

  saveStatus.innerText = "Saving...";

  clearTimeout(saveTimer);

  saveTimer = setTimeout(saveNote, 800);
}

function serializeTopicLinks(html) {

  const div = document.createElement("div");
  div.innerHTML = html;

  div.querySelectorAll(".topic-link")
  .forEach(el => {

    const name = el.textContent.trim();

    el.replaceWith(`[[${name}]]`);

  });

  return div.innerHTML;
}

async function ensureTopicsExist(html) {

  const matches = html.match(/\[\[(.*?)\]\]/g);
  if (!matches) return;

  for (const m of matches) {

    const name = m.replace("[[","").replace("]]","").trim();
    const normalized = name.toLowerCase();

    const { data } = await sb
      .from("topics")
      .select("id")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (data) continue;

    await sb
      .from("topics")
      .insert({
        name,
        normalized_name: normalized
      });

  }
}

async function saveNote() {

  if (!topicId) return;

  const rawHtml = serializeTopicLinks(editor.innerHTML);

  await sb
    .from("topics")
    .update({
      note_title: titleInput.value,
      note_html: rawHtml,
      note_updated_at: new Date()
    })
    .eq("id", topicId);

  // 🔥 RE-RESOLVE LINKS AFTER SAVE
  const resolved = await resolveTopicLinks(rawHtml);
  editor.innerHTML = resolved;

  saveStatus.innerText = "Saved ✓";
}

document.addEventListener("input", (e) => {

  if (
    e.target === editor ||
    e.target === titleInput
  ) {
    scheduleSave();
  }

});

// --------------------------------
// DETECT [[ TYPING
// --------------------------------
editor.addEventListener("keyup", async () => {

 if (suggestBox.classList.contains("hidden")) return;

  const sel = window.getSelection();
savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  // ---------------------------
  // KEYBOARD NAVIGATION
  // ---------------------------
  if (!suggestBox.classList.contains("hidden")) {

    const items = suggestBox.querySelectorAll(".topic-suggest-item");

    if (e.key === "Escape") {
      suggestBox.classList.add("hidden");
      return;
    }

    if (e.key === "ArrowDown") {
      suggestIndex = Math.min(
        suggestIndex + 1,
        items.length - 1
      );
      highlightSuggestion();
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowUp") {
      suggestIndex = Math.max(
        suggestIndex - 1,
        0
      );
      highlightSuggestion();
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && suggestIndex >= 0) {
      items[suggestIndex].click();
      e.preventDefault();
      return;
    }
  }

  const text = sel.anchorNode?.textContent || "";

  const match = text.match(/\[\[(.*?)$/);

  if (!match) {
    suggestBox.classList.add("hidden");
    return;
  }

  const query = match[1].toLowerCase();

  const { data } = await sb
    .from("topics")
    .select("id,name")
    .ilike("name", `%${query}%`)
    .limit(6);

  if (!data?.length) {
    suggestBox.classList.add("hidden");
    return;
  }

  suggestBox.innerHTML = data.map(t => `
    <div 
      class="topic-suggest-item"
      data-id="${t.id}"
      data-name="${escapeHTML(t.name)}">
      ${escapeHTML(t.name)}
    </div>
  `).join("");

  const rect = sel.getRangeAt(0).getBoundingClientRect();

  suggestBox.style.top = rect.bottom + window.scrollY + "px";
  suggestBox.style.left = rect.left + window.scrollX + "px";

  suggestBox.classList.remove("hidden");
  suggestIndex = 0;
highlightSuggestion();

});
/* toolbar commands */
document.querySelectorAll("[data-cmd]")
.forEach(btn => {

  btn.addEventListener("click", () => {

    document.execCommand(
      btn.dataset.cmd,
      false,
      null
    );

    editor.focus();
    scheduleSave();
  });

});

/* highlight */
document.getElementById("highlightBtn")
.addEventListener("click", () => {

  document.execCommand(
    "insertHTML",
    false,
    `<span class="hl">${document.getSelection()}</span>`
  );

  scheduleSave();
});

/* colors */
document.querySelectorAll("[data-color]")
.forEach(btn => {

  btn.addEventListener("click", () => {

    const color = btn.dataset.color;

    document.execCommand(
      "insertHTML",
      false,
      `<span class="${color}">${document.getSelection()}</span>`
    );

    scheduleSave();
  });

});

/* print */
document.getElementById("printNote")
.addEventListener("click", () => {
  window.print();
});

loadTopic();

// --------------------------------
// CLICKABLE TOPIC LINKS
// --------------------------------
editor.addEventListener("click", (e) => {

  const link = e.target.closest(".topic-link");

  if (!link) return;

  const id = link.dataset.id;

  window.location.href =
    `topic-note.html?id=${id}`;

});

editor.addEventListener("keydown", (e) => {

  if (e.key !== "Backspace" && e.key !== "Delete") return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const node = sel.anchorNode;

  const link = node?.parentElement?.closest(".topic-link");

  if (!link) return;

  e.preventDefault();

  link.remove();

  scheduleSave();

});

// --------------------------------
// TOPIC SUGGEST CLICK INSERT
// --------------------------------
function getTriggerLength() {

  const sel = window.getSelection();
  const text = sel.anchorNode?.textContent || "";

  const match = text.match(/\[\[(.*?)$/);

  return match ? match[0].length : 0;
}

suggestBox.addEventListener("click", (e) => {

  const item = e.target.closest(".topic-suggest-item");
  if (!item || !savedRange) return;

  const name = item.dataset.name;

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);

  const range = savedRange;

  const triggerLength = getTriggerLength();

  range.setStart(
    range.startContainer,
    range.startOffset - triggerLength
  );

  range.deleteContents();

  const text = document.createTextNode(`[[${name}]]`);
  range.insertNode(text);

  range.collapse(false);

  suggestBox.classList.add("hidden");

  editor.focus();
  scheduleSave();

});

document.addEventListener("click", (e) => {

  if (
    !suggestBox.contains(e.target) &&
    e.target !== editor
  ) {
    suggestBox.classList.add("hidden");
  }

});