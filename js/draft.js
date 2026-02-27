// ===============================
// PrepOS Draft Editor — Phase 3 (Improved)
// ===============================

let autosaveTimer = null
let isSaving = false

// ⭐ URL param
const params = new URLSearchParams(window.location.search)
const draftId = params.get("id")

const PUBLISH_FUNCTION_URL = "https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/publish-draft"
const CLONE_FUNCTION_URL   = "https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/clone-draft"

if (!draftId) {
  alert("Missing draft id")
  throw new Error("No draft id")
}

// ⭐ Supabase client
const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)

// ⭐ Local state
let currentDraft = null



// ===============================
// Autosave scheduler
// ===============================
function scheduleAutosave() {

  if (autosaveTimer) clearTimeout(autosaveTimer)

  autosaveTimer = setTimeout(() => {
    saveDraft(true)
  }, 1500)
}



// ===============================
// Load Draft
// ===============================
async function loadDraft() {

  try {

    const { data, error } = await sb
      .from("exam_drafts")
      .select("*")
      .eq("id", draftId)
      .single()

    if (error) throw error

    renderDraft(data)

  } catch (e) {
    console.error(e)
    alert("Failed to load draft")
  }
}

loadDraft()



// ===============================
// Render Draft
// ===============================
function renderDraft(draft) {

  console.log("DRAFT RECEIVED →", draft)

  currentDraft = draft

  // ===============================
  // Meta
  // ===============================
  const titleEl = document.getElementById("title")
  const durationEl = document.getElementById("duration")

  titleEl.value = draft.title || ""
  durationEl.value = draft.duration || ""

  titleEl.addEventListener("input", scheduleAutosave)
  durationEl.addEventListener("input", scheduleAutosave)

  // ===============================
  // Questions
  // ===============================
  const container = document.getElementById("questions")
  container.innerHTML = ""

  const sections = draft.schema_json?.sections || []

  if (!sections.length) {
    container.innerHTML = "<p>No questions</p>"
    return
  }

  const questions = sections?.[0]?.questions || []

  questions.forEach((q, i) => {

    // ⭐ Normalize correct value (letter → index)
    let correctIndex = q.correct

    if (typeof correctIndex === "string") {
      correctIndex = ["A","B","C","D"].indexOf(correctIndex)
    }

    if (correctIndex < 0 || correctIndex > 3) {
      correctIndex = 0
    }

    const opts = q.options || ["", "", "", ""]

    const div = document.createElement("div")
    div.className = "question-card"

    div.innerHTML = `
      <p><b>Q${i + 1}</b></p>

      <label>Question</label>
      <textarea data-i="${i}" class="qtext" rows="3">${q.question || ""}</textarea>

      <label>Options</label>
      ${opts.map((opt, oi) => `
        <input class="opt"
               data-i="${i}"
               data-oi="${oi}"
               value="${opt || ""}" />
      `).join("")}

      <label>Correct</label>
      <select class="correct" data-i="${i}">
        ${["A","B","C","D"].map((l, idx)=>`
          <option value="${idx}" ${correctIndex===idx?"selected":""}>${l}</option>
        `).join("")}
      </select>

      <label>Explanation</label>
      <textarea class="exp" data-i="${i}" rows="2">${q.explanation || ""}</textarea>
    `

    container.appendChild(div)

    // ⭐ Autosave listeners
    div.querySelectorAll(".qtext, .opt, .correct, .exp")
      .forEach(el => el.addEventListener("input", scheduleAutosave))
  })
}



// ===============================
// Save Draft
// ===============================
async function saveDraft(silent = false) {

  if (!currentDraft) return
  if (isSaving) return

  isSaving = true

  try {

    const qTexts = document.querySelectorAll(".qtext")

    const questions =
      currentDraft.schema_json?.sections?.[0]?.questions || []

    qTexts.forEach(el => {
      const i = parseInt(el.dataset.i)
      if (questions[i]) {
        questions[i].question = el.value
      }
    })
    document.querySelectorAll(".opt").forEach(el => {
      const i = +el.dataset.i
      const oi = +el.dataset.oi
      if (questions[i]) questions[i].options[oi] = el.value
    })

    document.querySelectorAll(".correct").forEach(el => {
      const i = +el.dataset.i
      if (questions[i]) questions[i].correct = +el.value
    })

    document.querySelectorAll(".exp").forEach(el => {
      const i = +el.dataset.i
      if (questions[i]) questions[i].explanation = el.value
    })

    const durationVal = document.getElementById("duration").value

    const { error } = await sb
      .from("exam_drafts")
      .update({
        title: document.getElementById("title").value,
        duration: durationVal ? parseInt(durationVal) : null,
        schema_json: currentDraft.schema_json
      })
      .eq("id", draftId)

    if (error) throw error

    if (!silent) {
      const status = document.getElementById("status")
      if (status) status.textContent = "Saved"
    }

  } catch (e) {
    console.error(e)
    alert("Save failed")
  }

  isSaving = false
}



// ===============================
// Clone Draft (Versioning)
// ===============================
async function cloneDraft() {

  await saveDraft(true)

  try {

    const res = await fetch(CLONE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
      body: JSON.stringify({ draftId })
    })

    const data = await res.json()

    if (!data.success) {
      alert(data.error || "Clone failed")
      return
    }

    window.location.href = data.draftLink

  } catch (e) {
    console.error(e)
    alert("Network error")
  }
}



// ===============================
// Publish Draft
// ===============================
async function publishDraft() {

  await saveDraft(true)

  try {

    const res = await fetch(PUBLISH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ draftId })
    })

    const data = await res.json()

    if (!data.success) {
      alert(data.error || "Publish failed")
      return
    }

    alert("Published!")
    window.open(data.examLink, "_blank")

  } catch (e) {
    console.error(e)
    alert("Network error")
  }
}



// ===============================
// Expose globally
// ===============================
window.saveDraft = saveDraft
window.cloneDraft = cloneDraft
window.publishDraft = publishDraft