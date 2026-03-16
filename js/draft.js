// ===============================
// PrepOS Draft Editor
// ===============================

let autosaveTimer = null
let isSaving = false

let currentDraft = null
let logoURL = null

// ===============================
// URL PARAM
// ===============================
const params = new URLSearchParams(window.location.search)
const draftId = params.get("id")

if(!draftId){
  alert("Missing draft id")
  throw new Error("No draft id")
}

// ===============================
// Supabase Client
// ===============================
const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)

const PUBLISH_FUNCTION_URL =
"https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/publish-draft"

const CLONE_FUNCTION_URL =
"https://bcqjfosxneuyoyuzhdiq.supabase.co/functions/v1/clone-draft"


// ===============================
// SCHEMA NORMALIZATION
// ===============================
function normalizeDraftSchema(draft){

  if(!draft.schema_json){
    draft.schema_json = {}
  }

  if(!draft.schema_json.sections){
    draft.schema_json.sections = [{
      questions:[]
    }]
  }

  if(!draft.schema_json.sections[0].questions){
    draft.schema_json.sections[0].questions = []
  }

}


// ===============================
// AUTOSAVE
// ===============================
function scheduleAutosave(){

  if(autosaveTimer){
    clearTimeout(autosaveTimer)
  }

  const status =
  document.getElementById("status")

  if(status){
    status.textContent = "Saving..."
  }

  autosaveTimer = setTimeout(()=>{
    saveDraft(true)
  },1500)

}



// ===============================
// LOAD DRAFT
// ===============================
async function loadDraft(){
console.log("loadDraft started")

  try{

    const {data,error} = await sb
      .from("draft_exams")
      .select("*")
      .eq("id",draftId)
      .single()

    if(error) throw error

    renderDraft(data)

  }catch(e){

    console.error(e)
    alert("Failed to load draft")

  }

}



// ===============================
// RENDER DRAFT
// ===============================
function renderDraft(draft){

  normalizeDraftSchema(draft)

  currentDraft = draft

  logoURL =
  draft.logo_url ||
  localStorage.getItem("defaultLogo") ||
  null

  const titleEl = document.getElementById("title")
  const durationEl = document.getElementById("duration")
  const container = document.getElementById("questions")
  const preview = document.getElementById("logoPreview")

  titleEl.value = draft.title || ""
  durationEl.value = draft.duration || ""

  if(!titleEl.dataset.bound){

    titleEl.addEventListener("input",scheduleAutosave)
    durationEl.addEventListener("input",scheduleAutosave)

    titleEl.dataset.bound = "true"

  }

  if(logoURL && preview){
    preview.src = logoURL
    preview.style.display = "block"
  }

  const questions =
  draft.schema_json.sections[0].questions

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

    const opts = [...(q.options || [])]

    while(opts.length < 4){
      opts.push("")
    }

    let correctIndex = q.correct ?? 0

    if(typeof correctIndex === "string"){
      correctIndex =
      ["A","B","C","D"].indexOf(correctIndex)
    }

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

<textarea class="qtext" data-i="${i}" rows="3">
${q.question || ""}
</textarea>

<label>Options</label>

${opts.map((opt,oi)=>{

const label=["A","B","C","D"][oi]

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
value="${opt}"
placeholder="Option ${label}"
>

</div>
`

}).join("")}

<label>Explanation</label>

<textarea class="exp" data-i="${i}" rows="2">
${q.explanation || ""}
</textarea>

`

    container.appendChild(div)

  })

  container.querySelectorAll(".qtext,.opt,.exp")
  .forEach(el=>{
    el.addEventListener("input",scheduleAutosave)
  })

  container.querySelectorAll(".correct-radio")
  .forEach(el=>{
    el.addEventListener("change",scheduleAutosave)
  })

}



// ===============================
// CREATE QUESTION
// ===============================
function createNewQuestion(){

  if(!currentDraft){
    console.warn("Draft not loaded yet")
    return
  }

  const questions =
  currentDraft.schema_json.sections[0].questions

  const q = {
    id: crypto.randomUUID(),
    question:"",
    options:["","","",""],
    correct:0,
    explanation:""
  }

  questions.push(q)

  renderDraft(currentDraft)

  scheduleAutosave()

}



// ===============================
// QUESTION ACTIONS
// ===============================
function handleQuestionActions(e){

  if(!currentDraft) return

  const btn = e.target
  const i = +btn.dataset.i

  const questions =
  currentDraft.schema_json.sections[0].questions

  if(btn.classList.contains("delete-q")){

    questions.splice(i,1)

  }

  if(btn.classList.contains("duplicate-q")){

    const copy =
    JSON.parse(JSON.stringify(questions[i]))

    copy.id = crypto.randomUUID()

    questions.splice(i,0,copy)

  }

  if(btn.classList.contains("move-up")){

    if(i===0) return

    const temp = questions[i]
    questions[i] = questions[i-1]
    questions[i-1] = temp

  }

  if(btn.classList.contains("move-down")){

    if(i>=questions.length-1) return

    const temp = questions[i]
    questions[i] = questions[i+1]
    questions[i+1] = temp

  }

  renderDraft(currentDraft)
  scheduleAutosave()

}



// ===============================
// SAVE DRAFT
// ===============================
async function saveDraft(silent=false){

  if(!currentDraft || isSaving) return

  isSaving = true

  try{

    const questions =
    currentDraft.schema_json.sections[0].questions

    document.querySelectorAll(".qtext")
    .forEach(el=>{
      const i=+el.dataset.i
      if(questions[i]) questions[i].question=el.value
    })

    document.querySelectorAll(".opt")
    .forEach(el=>{
      const i=+el.dataset.i
      const oi=+el.dataset.oi
      if(questions[i])
      questions[i].options[oi]=el.value
    })

    document.querySelectorAll(".correct-radio")
    .forEach(el=>{
      if(el.checked){
        const i=+el.dataset.i
        questions[i].correct=+el.value
      }
    })

    document.querySelectorAll(".exp")
    .forEach(el=>{
      const i=+el.dataset.i
      if(questions[i]) questions[i].explanation=el.value
    })

    const durationVal =
    document.getElementById("duration").value

    const {error} = await sb
    .from("draft_exams")
    .update({
      title:document.getElementById("title").value,
      duration:durationVal ? parseInt(durationVal) : null,
      schema_json:currentDraft.schema_json,
      logo_url:logoURL
    })
    .eq("id",draftId)

    if(error) throw error

    const status =
    document.getElementById("status")

    if(status){
      status.textContent="Saved"
    }

  }catch(e){

    console.error(e)
    alert("Save failed")

  }

  isSaving=false

}



// ===============================
// QUESTION BANK SEARCH
// ===============================
let qbTimer

document
.getElementById("qbSearch")
?.addEventListener("input",function(){

  clearTimeout(qbTimer)

  qbTimer=setTimeout(()=>{
    loadQuestionBank(this.value)
  },400)

})



// ===============================
// QB CLOSE PANEL
// ===============================
document
.getElementById("closeQB")
?.addEventListener("click",()=>{
  document
  .getElementById("questionBankPanel")
  ?.classList.remove("active")
})



// ===============================
// INIT
// ===============================
function init(){

  console.log("Draft editor init")

  document
  .getElementById("newQuestionBtn")
  ?.addEventListener("click",createNewQuestion)

  document
  .getElementById("questions")
  ?.addEventListener("click",handleQuestionActions)

  document
  .getElementById("logoUpload")
  ?.addEventListener("change",handleLogoUpload)

  loadDraft()

}

init()



// ===============================
// GLOBALS
// ===============================
window.saveDraft=saveDraft
window.cloneDraft=cloneDraft
window.publishDraft=publishDraft