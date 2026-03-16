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

  // Convert legacy format
  if(!draft.schema_json.sections && draft.schema_json.questions){

    draft.schema_json.sections = [
      {
        questions: draft.schema_json.questions
      }
    ]

  }

  // Ensure structure exists
  if(!draft.schema_json.sections){
    draft.schema_json.sections = [
      {
        questions:[]
      }
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
    currentDraft.schema_json.sections = [{
      questions:[]
    }]
  }

  if(!currentDraft.schema_json.sections[0].questions){
    currentDraft.schema_json.sections[0].questions = []
  }

}


// ===============================
// Autosave scheduler
// ===============================
function scheduleAutosave(){

  if (autosaveTimer) clearTimeout(autosaveTimer)

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

    if (error) throw error

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

  titleEl.value = draft.title || ""
  durationEl.value = draft.duration || ""

  titleEl.addEventListener("input", scheduleAutosave)
  durationEl.addEventListener("input", scheduleAutosave)

  const preview = document.getElementById("logoPreview")

  if(logoURL && preview){
    preview.src = logoURL
    preview.style.display = "block"
  }

  const container = document.getElementById("questions")
  container.innerHTML = ""

  const questions = draft.schema_json.sections[0].questions

  if(!questions.length){
    container.innerHTML = "<p>No questions</p>"
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

    const opts = q.options || ["","","",""]

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

    div.querySelectorAll(".qtext,.opt,.exp")
      .forEach(el => el.addEventListener("input", scheduleAutosave))

    div.querySelectorAll(".correct-radio")
      .forEach(el => el.addEventListener("change", scheduleAutosave))

  })

}



// ===============================
// Create New Question
// ===============================
function createNewQuestion(){

  // Ensure schema exists
  if(!currentDraft.schema_json){
    currentDraft.schema_json = {}
  }

  if(!currentDraft.schema_json.sections){
    currentDraft.schema_json.sections = [{
      questions:[]
    }]
  }

  if(!currentDraft.schema_json.sections[0].questions){
    currentDraft.schema_json.sections[0].questions = []
  }

  const questions =
  currentDraft.schema_json.sections[0].questions

  // Create proper question object
  questions.push({
    id: crypto.randomUUID(),
    question: "",
    options: ["","","",""],
    correct: 0,
    explanation: ""
  })

  renderDraft(currentDraft)

  scheduleAutosave()
}


// ===============================
// Question Action Handlers
// ===============================
document
.getElementById("questions")
?.addEventListener("click",function(e){

  const i = e.target.dataset.i

  if(i === undefined) return

  const questions =
  currentDraft.schema_json.sections[0].questions


  // Delete
  if(e.target.classList.contains("delete-q")){

    if(!confirm("Delete this question?")) return

    questions.splice(i,1)

    renderDraft(currentDraft)

    scheduleAutosave()

  }


  // Duplicate
  if(e.target.classList.contains("duplicate-q")){

    const copy =
    JSON.parse(JSON.stringify(questions[i]))

    copy.id = crypto.randomUUID()

    questions.splice(i,0,copy)

    renderDraft(currentDraft)

    scheduleAutosave()

  }


  // Move up
  if(e.target.classList.contains("move-up")){

    if(i == 0) return

    const temp = questions[i]

    questions[i] = questions[i-1]

    questions[i-1] = temp

    renderDraft(currentDraft)

    scheduleAutosave()

  }


  // Move down
  if(e.target.classList.contains("move-down")){

    if(i >= questions.length-1) return

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

  if(!currentDraft) return
  if(isSaving) return

  isSaving = true

  try{

    const questions =
      currentDraft.schema_json?.sections?.[0]?.questions || []

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

        if(questions[i]){

          questions[i].correct = +el.value

        }

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
      const status = document.getElementById("status")
      if(status) status.textContent = "Saved"
    }

  }catch(e){
    console.error(e)
    alert("Save failed")
  }

  isSaving = false
}



// ===============================
// QUESTION BANK
// ===============================

async function loadQuestionBank(search=""){

  try{

    let query = sb
      .from("questions")
      .select("*")
      .limit(50)

    if(search){

      query = query.ilike(
        "question_text",
        `%${search}%`
      )

    }

    const { data, error } = await query

    if(error) throw error

    renderQuestionBank(data)

  }catch(e){
    console.error("QB load error",e)
  }

}


function renderQuestionBank(questions){

  const container =
  document.getElementById("questionBankResults")

  if(!container) return

  container.innerHTML = ""

  if(!questions.length){
    container.innerHTML = "<p>No results</p>"
    return
  }

  questions.forEach(q=>{

    const div = document.createElement("div")
    div.className = "qb-question"

    div.innerHTML = `
      <span>${q.question_text}</span>
      <button class="insertQB" data-id="${q.id}">
        Insert
      </button>
    `

    container.appendChild(div)

  })

}


// ===============================
// Insert question from bank
// ===============================
async function insertQuestionFromBank(id){

  ensureQuestionSection()

  const { data, error } = await sb
    .from("questions")
    .select("*")
    .eq("id", id)
    .single()

  if(error){
    console.error(error)
    return
  }

  const questions =
  currentDraft.schema_json.sections[0].questions

  questions.push({

    id: crypto.randomUUID(),

    question: data.question_text,

    options:[
      data.option_a,
      data.option_b,
      data.option_c,
      data.option_d
    ],

    correct:["A","B","C","D"].indexOf(data.correct_option),

    explanation: data.explanation || "",

    source_question_id: data.id

  })

  renderDraft(currentDraft)

  scheduleAutosave()

}



// ===============================
// Question Bank Listeners
// ===============================
document
.getElementById("questionBankResults")
?.addEventListener("click",function(e){

  if(e.target.classList.contains("insertQB")){

    const id = e.target.dataset.id

    insertQuestionFromBank(id)

  }

})


document
.getElementById("qbSearch")
?.addEventListener("input",function(){

  loadQuestionBank(this.value)

})


const openQBBtn =
document.getElementById("openQuestionBankBtn")

const qbPanel =
document.getElementById("questionBankPanel")

openQBBtn?.addEventListener("click",()=>{

  qbPanel.classList.add("active")

  loadQuestionBank()

})


// ===============================
// Logo Upload
// ===============================
async function handleLogoUpload(e){

  const file = e.target.files[0]
  if(!file) return

  const compressed = await compressImage(file)

  const fileName = `logo-${Date.now()}.png`
  const path = `drafts/${draftId}/${fileName}`

  const uploadUrl =
  `${SUPABASE_URL}/storage/v1/object/logos/${path}`

  const res = await fetch(uploadUrl,{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type":"image/png",
      "x-upsert":"true"
    },
    body:compressed
  })

  if(!res.ok){
    const err = await res.text()
    console.error(err)
    alert("Logo upload failed")
    return
  }

  logoURL =
  `${SUPABASE_URL}/storage/v1/object/public/logos/${path}`

  localStorage.setItem("defaultLogo", logoURL)

  const preview =
  document.getElementById("logoPreview")

  if(preview){
    preview.src = logoURL
    preview.style.display = "block"
  }

  saveDraft(true)
}



// ===============================
// Image Compression
// ===============================
async function compressImage(file){

  const img = await createImageBitmap(file)

  const canvas = document.createElement("canvas")

  const maxWidth = 600
  const scale = maxWidth / img.width

  canvas.width = maxWidth
  canvas.height = img.height * scale

  const ctx = canvas.getContext("2d")

  ctx.drawImage(img,0,0,canvas.width,canvas.height)

  return new Promise(resolve=>{
    canvas.toBlob(resolve,"image/png",0.8)
  })
}



// ===============================
// Clone Draft
// ===============================
async function cloneDraft(){

  await saveDraft(true)

  try{

    const res = await fetch(CLONE_FUNCTION_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":SUPABASE_ANON_KEY,
        "Authorization":`Bearer ${SUPABASE_ANON_KEY}`
      },
      body:JSON.stringify({ draftId })
    })

    if(!res.ok){
      alert("Clone request failed")
      return
    }

    const data = await res.json()

    if(!data.success){
      alert(data.error || "Clone failed")
      return
    }

    window.location.href = data.draftLink

  }catch(e){
    console.error(e)
    alert("Network error")
  }

}



// ===============================
// Publish Draft
// ===============================
async function publishDraft(){

  await saveDraft(true)

  try{

    const res = await fetch(PUBLISH_FUNCTION_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":SUPABASE_ANON_KEY,
        "Authorization":`Bearer ${SUPABASE_ANON_KEY}`
      },
      body:JSON.stringify({ draftId })
    })

    if(!res.ok){
      alert("Publish request failed")
      return
    }

    const data = await res.json()

    if(!data.success){
      alert(data.error || "Publish failed")
      return
    }

    if(data.examLink){

      navigator.clipboard.writeText(data.examLink)

      alert("Exam link copied:\n"+data.examLink)

      window.open(data.examLink,"_blank")

    }

  }catch(e){
    console.error(e)
    alert("Network error")
  }

}



// ===============================
// Init
// ===============================
document
.getElementById("logoUpload")
?.addEventListener("change", handleLogoUpload)

document
.getElementById("newQuestionBtn")
?.addEventListener("click", createNewQuestion)

window.saveDraft = saveDraft
window.cloneDraft = cloneDraft
window.publishDraft = publishDraft