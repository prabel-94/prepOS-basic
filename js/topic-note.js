const sb = window.supabaseClient;

const editor = document.getElementById("noteEditor");
const titleInput = document.getElementById("noteTitle");
const saveStatus = document.getElementById("saveStatus");

let topicId = null;
let saveTimer = null;

function getTopicId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
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
  editor.innerHTML = data.note_html || "";
}

function scheduleSave() {

  saveStatus.innerText = "Saving...";

  clearTimeout(saveTimer);

  saveTimer = setTimeout(saveNote, 800);
}

async function saveNote() {

  if (!topicId) return;

  await sb
    .from("topics")
    .update({
      note_title: titleInput.value,
      note_html: editor.innerHTML,
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