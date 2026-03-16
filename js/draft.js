// ===============================
// PrepOS Draft Editor — Phase 6
// ===============================

let autosaveTimer = null
let isSaving = false

// ===============================
// URL param
// ===============================
const params = new URLSearchParams(window.location.search)
const draftId = params.get("id")

const PUBLISH_FUNCTION_URL =
"https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/publish-draft"

const CLONE_FUNCTION_URL =
"https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/clone-draft"

if (!draftId) {
  alert("Missing draft id")
  throw new Error("No draft id")
}

// ===============================
// Supabase client
// ===============================
const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)

// ===============================
// Local state
// ===============================
let currentDraft = null
let logoURL = null

// ===============================
// Normalize Draft Schema
// ===============================
function normalizeDraftSchema(draft){

  if(!draft.schema_json){
    draft.schema_json = {}
  }

  if(!draft.schema_json.sections && draft.schema_json.questions){

    draft.schema_json.sections = [
      { questions: draft.schema_json.questions }
    ]

  }

  if(!draft.schema_json.sections){
    draft.schema_json.sections = [
      { questions:[] }
    ]
  }

  if(!draft.schema_json.sections[0].questions){
    draft.schema_json.sections[0].questions = []
  }

}

// ===============================
// Ensure Question Section
// ===============================
function ensureQuestionSection(){

  if(!currentDraft.schema_json){
    currentDraft.schema_json = {}
  }

  if(!currentDraft.schema_json.sections){
    currentDraft.schema_json.sections = [{questions:[]}]
  }

  if(!currentDraft.schema_json.sections[0].questions){
    currentDraft.schema_json.sections[0].questions = []
  }

}

// ===============================
// Autosave scheduler
// ===============================
function scheduleAutosave(){

  if(autosaveTimer) clearTimeout(autosaveTimer)

  autosaveTimer = setTimeout(()=>{
    saveDraft(true)
  },1500)

}

// ===============================
// Load Draft
// ===============================
async function loadDraft(){

  try{

    const { data, error } = await sb
      .from("draft_exams")
      .select("*")
      .eq("id", draftId)
      .single()

    if(error) throw error

    renderDraft(data)

  }catch(e){

    console.error(e)
    alert("Failed to load draft")

  }

}

loadDraft()

// ===============================
// Render Draft
// ===============================
function renderDraft(draft){

  normalizeDraftSchema(draft)

  currentDraft = draft
  logoURL = draft.logo_url || localStorage.getItem("defaultLogo") || null

  const titleEl = document.getElementById("title")
  const durationEl = document.getElementById("duration")
  const preview = document.getElementById("logoPreview")
  const container = document.getElementById("questions")

  titleEl.value = draft.title || ""
  durationEl.value = draft.duration || ""

  if(!titleEl.dataset.bound){

    titleEl.addEventListener("input", scheduleAutosave)
    durationEl.addEventListener("input", scheduleAutosave)

    titleEl.dataset.bound = "true"

  }

  if(logoURL && preview){
    preview.src = logoURL
    preview.style.display = "block"
  }

  const questions = draft.schema_json.sections[0].questions

  container.innerHTML = ""

  if(!questions.length){

    container.innerHTML = `
      <div class="empty-state">
        No questions yet.<br>
        Click <b>+ New Question</b> to start.
      </div>
    `
    return
  }

  questions.forEach((q,i)=>{

    let correctIndex = q.correct

    if(typeof correctIndex === "string"){
      correctIndex = ["A","B","C","D"].indexOf(correctIndex)
    }

    if(correctIndex < 0 || correctIndex > 3){
      correctIndex = 0
    }

    const opts = [...(q.options || [])]
    while(opts.length < 4) opts.push("")

    const div = document.createElement("div")
    div.className = "question-card"

    div.innerHTML = `

<div class="question-header">

<b>Q${i+1}</b>

<div class="q-actions">

<button class="move-up" data-i="${i}">↑</button>
<button class="move-down" data-i="${i}">↓</button>
<button class="duplicate-q" data-i="${i}">Duplicate</button>
<button class="delete-q" data-i="${i}">Delete</button>

</div>

</div>

<label>Question</label>

<textarea data-i="${i}" class="qtext" rows="3">${q.question || ""}</textarea>

<label>Options</label>

${opts.map((opt,oi)=>{

const label = ["A","B","C","D"][oi]

return `
<div class="option-row">

<label class="option-container">

<input
type="radio"
name="correct-${i}"
class="correct-radio"
data-i="${i}"
value="${oi}"
${correctIndex===oi?"checked":""}
>

<span class="option-label">${label}</span>

</label>

<input
type="text"
class="opt"
data-i="${i}"
data-oi="${oi}"
value="${opt || ""}"
placeholder="Option ${label}"
>

</div>
`

}).join("")}

<label>Explanation</label>

<textarea class="exp" data-i="${i}" rows="2">${q.explanation || ""}</textarea>

`

    container.appendChild(div)

  })

  container.querySelectorAll(".qtext,.opt,.exp")
  .forEach(el=>{
    el.addEventListener("input", scheduleAutosave)
  })

  container.querySelectorAll(".correct-radio")
  .forEach(el=>{
    el.addEventListener("change", scheduleAutosave)
  })

}

// ===============================
// Create New Question
// ===============================
function createNewQuestion(){
console.log("button clicked", currentDraft)

  if(!currentDraft) return

  normalizeDraftSchema(currentDraft)

  const questions =
  currentDraft.schema_json.sections[0].questions

  const newQuestion = {
    id: crypto.randomUUID(),
    question:"",
    options:["","","",""],
    correct:0,
    explanation:""
  }

  questions.push(newQuestion)

  renderDraft(currentDraft)

  scheduleAutosave()

  setTimeout(()=>{
    document
    .querySelector(".qtext:last-of-type")
    ?.focus()
  },50)

}

// ===============================
// Question Actions
// ===============================
document
.getElementById("questions")
?.addEventListener("click",function(e){

  if(!currentDraft) return

  const btn = e.target
  const i = +btn.dataset.i

  const questions =
  currentDraft.schema_json.sections[0].questions

  if(btn.classList.contains("delete-q")){

    questions.splice(i,1)

    renderDraft(currentDraft)

    scheduleAutosave()

  }

  if(btn.classList.contains("duplicate-q")){

    const copy =
    JSON.parse(JSON.stringify(questions[i]))

    copy.id = crypto.randomUUID()

    questions.splice(i,0,copy)

    renderDraft(currentDraft)

    scheduleAutosave()

  }

  if(btn.classList.contains("move-up")){

    if(i===0) return

    const temp = questions[i]

    questions[i] = questions[i-1]
    questions[i-1] = temp

    renderDraft(currentDraft)

    scheduleAutosave()

  }

  if(btn.classList.contains("move-down")){

    if(i>=questions.length-1) return

    const temp = questions[i]

    questions[i] = questions[i+1]
    questions[i+1] = temp

    renderDraft(currentDraft)

    scheduleAutosave()

  }

})

// ===============================
// Save Draft
// ===============================
async function saveDraft(silent=false){

  if(!currentDraft || isSaving) return

  isSaving = true

  try{

    const questions =
    currentDraft.schema_json.sections[0].questions

    document.querySelectorAll(".qtext").forEach(el=>{
      const i = +el.dataset.i
      if(questions[i]) questions[i].question = el.value
    })

    document.querySelectorAll(".opt").forEach(el=>{
      const i = +el.dataset.i
      const oi = +el.dataset.oi
      if(questions[i]) questions[i].options[oi] = el.value
    })

    document.querySelectorAll(".correct-radio").forEach(el=>{

      if(el.checked){

        const i = +el.dataset.i

        if(questions[i]) questions[i].correct = +el.value

      }

    })

    document.querySelectorAll(".exp").forEach(el=>{
      const i = +el.dataset.i
      if(questions[i]) questions[i].explanation = el.value
    })

    const durationVal =
    document.getElementById("duration").value

    const { error } = await sb
    .from("draft_exams")
    .update({
      title: document.getElementById("title").value,
      duration: durationVal ? parseInt(durationVal) : null,
      schema_json: currentDraft.schema_json,
      logo_url: logoURL
    })
    .eq("id", draftId)

    if(error) throw error

    if(!silent){

      const status =
      document.getElementById("status")

      if(status) status.textContent = "Saved"

    }

  }catch(e){

    console.error(e)
    alert("Save failed")

  }

  isSaving = false

}

// ===============================
// Init
// ===============================

document.addEventListener("DOMContentLoaded", function(){

  document
  .getElementById("logoUpload")
  ?.addEventListener("change", handleLogoUpload)

  document
  .getElementById("newQuestionBtn")
  ?.addEventListener("click", createNewQuestion)

})