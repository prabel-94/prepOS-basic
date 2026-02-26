document.body.insertAdjacentHTML(
  "afterbegin",
  "<div style='background:red;color:white;padding:6px'>EXAM JS LOADED</div>"
);
console.log("SCRIPT STARTED")
const SUPABASE_URL = "https://bcqjfosxneuyoyuzhdiq.supabase.co"
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA"

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

/* ---------- attempt id ---------- */
console.log("ExamId:", examId)

function createAttemptId(examId){
  const rand = Math.random().toString(36).slice(2,7)
  return `${examId}-${rand}`
}

let attemptId = localStorage.getItem("prepos-attempt")

if(!attemptId){
  attemptId = createAttemptId(examId)
  localStorage.setItem("prepos-attempt", attemptId)
}

console.log("Attempt:", attemptId)

let attemptState = JSON.parse(
  localStorage.getItem("prepos-attempt-state") || "null"
);

if(!attemptState || attemptState.attemptId !== attemptId){
  attemptState = {
    attemptId,
    examId,
    answers:{}
  };
}

if(!examId){
document.getElementById("quiz").innerText="Invalid exam link"
}

/* ---------- fetch quiz ---------- */
async function loadExam(){

const res = await fetch(
`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${examId}`,
{
headers:{
apikey:ANON,
Authorization:`Bearer ${ANON}`
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
      "prepos-attempt-state",
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
apikey: ANON,
Authorization: `Bearer ${ANON}`,
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

/* ---- show result ---- */
document.getElementById("result").innerHTML =
`<h3>${studentName}, your score: ${score}/${window.examQuestions.length}</h3>`

}catch(err){

console.error(err)
alert("Failed to save response")

}

}

loadExam()