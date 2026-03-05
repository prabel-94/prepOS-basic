console.log("SCRIPT STARTED");

/* ---------- helpers ---------- */
function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
/* ---solves double question number -- */
function stripLeadingNumber(text){
  return String(text)
    .replace(/^(Q?\d+[\).\s]+)/i, "")
    .trim();
}
/* ---------- scroll to result ---------- */
function scrollToResult(){
  const resultEl = document.getElementById("result")

  if(!resultEl){
    console.warn("Result container not found")
    return
  }

  setTimeout(()=>{

    // ✅ ADD highlight class HERE
    resultEl.classList.add("result-highlight")

    resultEl.scrollIntoView({
      behavior: "smooth",
      block: "start"
    })

    // ✅ REMOVE highlight after animation
    setTimeout(()=>{
      resultEl.classList.remove("result-highlight")
    }, 800)

  }, 120)
}
/* ---------- get exam id ---------- */
const params = new URLSearchParams(location.search);
const examId = params.get("id");

if(!examId){
  document.getElementById("quiz").innerText="Invalid exam link";
  throw new Error("Missing examId");
}

const ATTEMPT_KEY = `prepos-attempt-${examId}`;
const ATTEMPT_ID_KEY = `prepos-attempt-id-${examId}`;

function createAttemptId(examId){
  const rand = Math.random().toString(36).slice(2,7);
  return `${examId}-${rand}`;
}

let attemptId = localStorage.getItem(ATTEMPT_ID_KEY);

if(!attemptId){
  attemptId = createAttemptId(examId);
  localStorage.setItem(ATTEMPT_ID_KEY, attemptId);
}

/* ---------- attempt state ---------- */
let attemptState = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || "null");

if(!attemptState || attemptState.attemptId !== attemptId){
  attemptState = {
    attemptId,
    examId,
    answers:{},
    status:"in_progress"
  };
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));
}

/* ======================================================
   FETCH EXAM
====================================================== */
async function loadExam(){

  try{

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exams?id=eq.${examId}`,
      {
        headers:{
          apikey: SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const data = await res.json();
    console.log("Exam fetch result:", data);

    if(!data.length){
      document.getElementById("quiz").innerText="Exam not found";
      return;
    }

    const exam = data[0];

let questions = [];

/* new schema (sections) */
if (exam.schema_json?.sections) {
  questions = exam.schema_json.sections.flatMap(s => s.questions);
}

/* old schema (direct questions) */
else if (exam.schema_json?.questions) {
  questions = exam.schema_json.questions;
}

window.examTitle = exam.title || "Exam";
window.examLogo = exam.logo_url || "";

    /* RAW */
    window.examQuestionsRaw = questions;

    /* ATTEMPT */
    window.examQuestionsAttempt =
      questions.map(q=>({
        question:q.question,
        options:q.options
      }));

    /* ⭐ CRITICAL — restore legacy variable */
    window.examQuestions = questions;

    /* render */
    renderQuiz(window.examQuestionsAttempt);

  }catch(err){
    console.error(err);
    document.getElementById("quiz").innerText="Failed to load exam";
  }
}
/* ======================================================
   RENDER QUIZ
====================================================== */
function renderQuiz(questions){

  const container=document.getElementById("quiz");
  container.innerHTML="";

  questions.forEach((q,i)=>{

    const div=document.createElement("div");
    div.className="question";

    div.innerHTML =
      `<p style="white-space:pre-line">${escapeHTML(q.question)}</p>`+
      q.options.map((o,idx)=>
        `<label>
        <input type="radio" name="q${i}" value="${String.fromCharCode(65+idx)}">
        ${String.fromCharCode(65+idx)}. ${escapeHTML(o)}
        </label><br>`
      ).join("");

    container.appendChild(div);
  });

  /* autosave */
  document.querySelectorAll('input[type="radio"]').forEach(r=>{
    r.addEventListener("change", e=>{
      const name = e.target.name;
      attemptState.answers[name] = e.target.value;
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));
    });
  });

  /* restore */
  if(attemptState.answers){
    Object.entries(attemptState.answers).forEach(([name,val])=>{
      const el = container.querySelector(
        `input[name="${name}"][value="${val}"]`
      );
      if(el) el.checked = true;
    });
  }

  const btn=document.createElement("button");
  btn.innerText="Submit";
  btn.onclick=submitExam;
  container.appendChild(btn);
}

/* ======================================================
   SUBMIT
====================================================== */
async function submitExam(){

  if(attemptState.status==="submitted") return;

  if(!window.examQuestionsRaw){
    console.error("Raw questions missing");
    alert("Exam not loaded properly");
    return;
  }

  const studentInput =
    document.getElementById("studentName");

  const studentName = studentInput.value.trim();

  if(!studentName){
    alert("Please enter your name");
    return;
  }

  let score=0;
  const answers=[];

  window.examQuestionsRaw.forEach((q,i)=>{

    const selected =
      document.querySelector(`input[name=q${i}]:checked`);

    const chosen = selected ? selected.value : "-";

    const correctLetter =
      String.fromCharCode(65 + q.correct);

    answers.push({q:i,chosen});

    if(chosen===correctLetter) score++;
  });

  try{

    await fetch(`${SUPABASE_URL}/rest/v1/responses`,{
      method:"POST",
      headers:{
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type":"application/json",
        Prefer:"return=minimal"
      },
      body:JSON.stringify({
        exam_id:examId,
        device_id:attemptId,
        student_name:studentName,
        answers,
        score,
        submitted_at:new Date().toISOString()
      })
    });

    /* ---------- lock ---------- */
    attemptState.status="submitted";
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));

    document.querySelectorAll('input[type="radio"]')
      .forEach(el=>el.disabled=true);

    studentInput.disabled = true; // ⭐ polish

    /* ---------- build review ---------- */
    window.reviewData =
      window.examQuestionsRaw.map((q,i)=>{

        const student = answers[i]?.chosen || "-";
        const correct =
          String.fromCharCode(65 + q.correct);

        return{
          question:q.question,
          options:q.options,
          correct,
          student,
          explanation:q.explanation,
          isCorrect:student===correct
        };
      });

    document.getElementById("result").innerHTML =
`<h3>${studentName}, your score: ${score}/${window.examQuestionsRaw.length}</h3>
 <button id="reviewBtn">View Answers</button>
 <button id="downloadPdfBtn" style="display:none">Download Review PDF</button>`;

scrollToResult()

    document.getElementById("reviewBtn")
      .onclick = renderReview;

  }catch(err){
    console.error(err);
    alert("Failed to save response");
  }
}

/* ======================================================
   REVIEW MODE
====================================================== */
function renderReview(){

  const container = document.getElementById("quiz");
  container.innerHTML = "";

  window.reviewData.forEach((q,i)=>{

    const card = document.createElement("div");
    card.className = "review-card";

    const optionsHTML = q.options.map((o,idx)=>{

      const letter = String.fromCharCode(65+idx);

      let cls = "option";

      if(letter === q.correct) cls += " correct";
      if(letter === q.student && letter !== q.correct) cls += " wrong";
      if(letter === q.student) cls += " chosen";

      return `
        <div class="${cls}">
          <b>${letter}.</b> ${escapeHTML(o)}
        </div>
      `;
    }).join("");

    const cleanQuestion = stripLeadingNumber(q.question);

    card.innerHTML = `
      <div class="review-q">
        <span class="question-number"><b>Q${i+1}.</b></span>
        <span class="question-text">
          ${escapeHTML(cleanQuestion)}
        </span>
      </div>

      <div class="review-options">
        ${optionsHTML}
      </div>

      <button class="explain-btn">Explanation</button>
      <div class="explanation" style="display:none">
        ${escapeHTML(q.explanation || "No explanation provided")}
      </div>
    `;

    /* accordion */
    const btn = card.querySelector(".explain-btn");
    const exp = card.querySelector(".explanation");

    btn.onclick = ()=>{
      exp.style.display =
        exp.style.display === "none" ? "block" : "none";
    };

    container.appendChild(card);
  });
const pdfBtn = document.getElementById("downloadPdfBtn");
if(pdfBtn){
  pdfBtn.style.display = "inline-block";
  pdfBtn.onclick = downloadReviewPDF;
}
const pdfBtn = document.getElementById("downloadPdfBtn");

if(pdfBtn){
  pdfBtn.style.display = "inline-block";
  pdfBtn.onclick = downloadReviewPDF;
}
}

function expandAllExplanations(){

  const explanations = document.querySelectorAll(".explanation");
  const buttons = document.querySelectorAll(".explain-btn");

  explanations.forEach(el=>{
    el.style.display = "block";
  });

  // hide buttons for PDF
  buttons.forEach(btn=>{
    btn.style.display = "none";
  });

}
function downloadReviewPDF(){

  const element = document.getElementById("quiz");

  // 1️⃣ show all explanations
  expandAllExplanations();

  const opt = {
    margin: 10,
    filename: ((window.examTitle || "exam").replace(/[^\w\s]/gi,"")).replace(/\s+/g,"-") + "-review.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  // 2️⃣ generate pdf
  html2pdf().set(opt).from(element).save().then(()=>{

    // 3️⃣ restore UI after export
    collapseAllExplanations();

  });

}

function collapseAllExplanations(){

  const explanations = document.querySelectorAll(".explanation");
  const buttons = document.querySelectorAll(".explain-btn");

  explanations.forEach(el=>{
    el.style.display = "none";
  });

  // restore buttons
  buttons.forEach(btn=>{
    btn.style.display = "inline-block";
  });

}

function addPDFHeader(){

  const container = document.getElementById("quiz");

  if(document.getElementById("pdfHeader")) return;

  const studentName = localStorage.getItem("studentName") || "Student";
  const examTitle = window.examTitle || "Exam";

  const scoreText = document.getElementById("result")
      ? document.getElementById("result").innerText
      : "";

  const date = new Date().toLocaleDateString();

  const logo = window.examLogo || "";

  const header = document.createElement("div");
  header.id = "pdfHeader";

  header.innerHTML = `
    <div class="pdf-header">

      ${logo ? `<img src="${logo}" class="pdf-logo">` : ""}

      <h2>${examTitle}</h2>

      <p><b>Student:</b> ${studentName}</p>
      <p><b>Date:</b> ${date}</p>
      <p><b>${scoreText}</b></p>

      <hr>

    </div>
  `;

  container.prepend(header);
}

function removePDFHeader(){

  const header = document.getElementById("pdfHeader");

  if(header){
    header.remove();
  }

}

document.addEventListener("DOMContentLoaded", loadExam);