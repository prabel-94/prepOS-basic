const sb = window.supabaseClient;

const editor = document.getElementById("noteEditor");
const suggestBox = document.getElementById("topicSuggest");
const titleInput = document.getElementById("noteTitle");
const saveStatus = document.getElementById("saveStatus");

let topicId = null;
let saveTimer = null;
let savedRange = null;

function escapeHTML(str){
  return str
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
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

async function saveNote() {

  if (!topicId) return;

  await sb
    .from("topics")
    .update({
      note_title: titleInput.value,
      note_html: serializeTopicLinks(editor.innerHTML),
      note_updated_at: new Date()
    })
    .eq("id", topicId);

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

  const sel = window.getSelection();
savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
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
