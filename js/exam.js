console.log("SCRIPT STARTED")

/* ---------- helpers ---------- */
function escapeHTML(str){
return String(str)
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");
}

/* ---------- get exam id ---------- */
const params = new URLSearchParams(location.search)
const examId = params.get("id")
const ATTEMPT_KEY = `prepos-attempt-${examId}`;
const ATTEMPT_ID_KEY = `prepos-attempt-id-${examId}`;

/* ---------- attempt id ---------- */
console.log("ExamId:", examId)

function createAttemptId(examId){
  const rand = Math.random().toString(36).slice(2,7)
  return `${examId}-${rand}`
}

let attemptId = localStorage.getItem(ATTEMPT_ID_KEY)

if(!attemptId){
  attemptId = createAttemptId(examId)
  localStorage.setItem(ATTEMPT_ID_KEY, attemptId)
}

console.log("Attempt:", attemptId)

let attemptState = JSON.parse(
  localStorage.getItem(ATTEMPT_KEY) || "null"
);

if(!attemptState || attemptState.attemptId !== attemptId){
  attemptState = {
  attemptId,
  examId,
  answers:{},
  status: "in_progress"
};

  // ✅ save initial attempt immediately
  localStorage.setItem(
    ATTEMPT_KEY,
    JSON.stringify(attemptState)
  );
}

if(!examId){
document.getElementById("quiz").innerText="Invalid exam link"
}

/* ---------- fetch quiz ---------- */
async function loadExam(){

const res = await fetch(
`${SUPABASE_URL}/rest/v1/exams?id=eq.${examId}`,
{
headers:{
apikey: SUPABASE_ANON_KEY,
Authorization: `Bearer ${SUPABASE_ANON_KEY}`
}
}
)

const data = await res.json()

if(!data.length){
document.getElementById("quiz").innerText="Exam not found"
return
}

renderQuiz(data[0].questions)
}

function renderQuiz(questions){

const container=document.getElementById("quiz")
container.innerHTML=""

questions.forEach((q,i)=>{

const div=document.createElement("div")
div.className="question"

div.innerHTML=
`<p style="white-space:pre-line">${escapeHTML(q.q)}</p>`+

q.options.map((o,idx)=>
`<label>
<input type="radio" name="q${i}" value="${String.fromCharCode(65+idx)}">
${String.fromCharCode(65+idx)}. ${escapeHTML(o)}
</label><br>`
).join("")

container.appendChild(div)
})

/* ---------- autosave answers ---------- */

document.querySelectorAll('input[type="radio"]').forEach(r=>{
  r.addEventListener("change", e=>{
    const name = e.target.name;   // q0 q1 q2
    attemptState.answers[name] = e.target.value;

    localStorage.setItem(
      ATTEMPT_KEY,
      JSON.stringify(attemptState)
    );

    console.log("Autosaved:", attemptState.answers);
  });
});
/* ---------- restore answers ---------- */

if(attemptState.answers){
  Object.entries(attemptState.answers).forEach(([name,val])=>{
    const el = container.querySelector(
      `input[name="${name}"][value="${val}"]`
    );
    if(el) el.checked = true;
  });
}
window.examQuestions=questions

const btn=document.createElement("button")
btn.innerText="Submit"
btn.onclick=submitExam
container.appendChild(btn)
}

/* ---------- submit ---------- */
async function submitExam(){

if(attemptState.status === "submitted"){
  console.log("Already submitted");
  return;
}
/* ---- student name ---- */
const studentName = document.getElementById("studentName").value.trim()

if(!studentName){
alert("Please enter your name")
return
}

/* ---- collect answers ---- */
let score = 0
const answers = []

window.examQuestions.forEach((q,i)=>{

const selected = document.querySelector(`input[name=q${i}]:checked`)
const chosen = selected ? selected.value : "-"

answers.push({
q: i,
chosen,
correct: q.answer
})

if(chosen === q.answer) score++

})

/* ---- save to supabase ---- */
try{

await fetch(
`${SUPABASE_URL}/rest/v1/responses`,
{
method: "POST",
headers:{
apikey: SUPABASE_ANON_KEY,
Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
"Content-Type": "application/json",
Prefer: "return=minimal"
},
body: JSON.stringify({
exam_id: examId,
attempt_id: attemptId,
student_name: studentName,
answers,
score
})
}
)
// mark attempt submitted HERE
attemptState.status = "submitted";

localStorage.setItem(
  ATTEMPT_KEY,
  JSON.stringify(attemptState)
);

// optional UX lock
document
.querySelectorAll('input[type="radio"]')
.forEach(el=>el.disabled=true);

// disable answers HERE
document
.querySelectorAll('input[type="radio"]')
.forEach(el=>el.disabled=true);

/* ---- show result ---- */
document.getElementById("result").innerHTML =
`<h3>${studentName}, your score: ${score}/${window.examQuestions.length}</h3>`

}catch(err){

console.error(err)
alert("Failed to save response")

}

}

loadExam()