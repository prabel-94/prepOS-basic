console.log("SCRIPT STARTED");

/* ---------- helpers ---------- */
/* ===============================
   WATERMARK FUNCTIONS
================================ */

function addPDFWatermark(){

  const quiz = document.getElementById("quiz");

  const watermark = document.createElement("div");

  watermark.className = "pdf-watermark-pattern";
  watermark.id = "pdfWatermark";

  quiz.prepend(watermark);

}
function removePDFWatermark(){
  const watermark = document.getElementById("pdfWatermark");
  if(watermark){
    watermark.remove();
  }
}

function showLoading(){
  document.getElementById("loadingState").style.display="block";
  document.getElementById("errorState").style.display="none";
  document.getElementById("examContent").style.display="none";
}

function showError(message){
  document.getElementById("loadingState").style.display="none";
  document.getElementById("errorState").style.display="block";
  document.getElementById("examContent").style.display="none";
  document.getElementById("errorMessage").textContent=message;
}

function showExam(){
  document.getElementById("loadingState").style.display="none";
  document.getElementById("errorState").style.display="none";
  document.getElementById("examContent").style.display="block";
}
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

  console.log("Exam loading started");

  showLoading();

  try{

    const res = await fetch(
      SUPABASE_URL + "/rest/v1/exams?id=eq." + examId,
      {
        headers:{
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        }
      }
    );

    /* HTTP failure */
    if(!res.ok){
      throw new Error("Server error (" + res.status + ")");
    }

    const data = await res.json();
    console.log("Exam fetch result:", data);

    if(!data || !data.length){
      throw new Error("Exam not found");
    }

    const exam = data[0];
window.examTitle = exam.title || "Exam";
window.examLogo = exam.logo_url || "";

    const logoEl = document.getElementById("examLogo");

if(window.examLogo && logoEl){
  logoEl.src = window.examLogo;
  logoEl.style.display = "block";
}

const titleEl = document.getElementById("examTitle");
if(titleEl){
  titleEl.textContent = window.examTitle;
}

    let questions = [];

    /* ---------- NEW SCHEMA (sections) ---------- */

    if(exam.schema_json && exam.schema_json.sections){

      questions = exam.schema_json.sections.flatMap(function(section){
        return section.questions;
      });

    }

    /* ---------- OLD SCHEMA (direct questions) ---------- */

    else if(exam.schema_json && exam.schema_json.questions){

      questions = exam.schema_json.questions;

    }

    if(!questions || !questions.length){
      throw new Error("No questions found in exam");
    }

    /* RAW QUESTIONS */

    window.examQuestionsRaw = questions;

    /* STUDENT ATTEMPT STRUCTURE */

    window.examQuestionsAttempt = questions.map(function(q){

      return {
        question: q.question,
        options: q.options
      };

    });

    window.examQuestions = questions;

    /* RENDER QUIZ */

    renderQuiz(window.examQuestionsAttempt);

    showExam();

  }
  catch(err){

    console.error("Exam loading failed:", err);

    showError(err.message || "Failed to load exam");

  }

}
/* ======================================================
   RENDER QUIZ
====================================================== */
function renderQuiz(questions){

  const container = document.getElementById("examContent");
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
/* store student name for PDF header */
localStorage.setItem("studentName", studentName);

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
    const correct = String.fromCharCode(65 + q.correct);

    return{
      question:q.question,
      options:q.options,
      correct,
      student,
      explanation:q.explanation || q.explanation_text || "",
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

  window.reviewData.forEach(function(q,i){

    const card = document.createElement("div");
    card.className = "review-card";

    const question = document.createElement("div");
    question.className = "review-question";
    question.textContent = (i+1) + ". " + q.question;

    card.appendChild(question);

    const optionsWrap = document.createElement("div");

    q.options.forEach(function(opt,idx){

      const letter = String.fromCharCode(65+idx);

      const option = document.createElement("div");
      option.className = "option";

      if(letter === q.correct){
        option.classList.add("correct");
      }

      if(letter === q.student && letter !== q.correct){
        option.classList.add("wrong");
      }

      option.textContent = letter + ". " + opt;

      optionsWrap.appendChild(option);

    });

    card.appendChild(optionsWrap);

    /* ---------- explanation ---------- */

    if(q.explanation && q.explanation.trim()){

      const explainBtn = document.createElement("button");
      explainBtn.className = "explain-btn";
      explainBtn.textContent = "Show Explanation";

      const explanation = document.createElement("div");
      explanation.className = "explanation";
      explanation.style.display = "none";
      explanation.innerHTML = "<b>Explanation:</b> " + escapeHTML(q.explanation);

      explainBtn.onclick = function(){
        explanation.style.display =
          explanation.style.display === "none" ? "block" : "none";
      };

      card.appendChild(explainBtn);
      card.appendChild(explanation);
    }

    container.appendChild(card);

  });

  /* ---------- CREATE PDF BUTTON ---------- */

  let pdfBtn = document.getElementById("downloadPdfBtn");

  if(!pdfBtn){
    pdfBtn = document.createElement("button");
    pdfBtn.id = "downloadPdfBtn";
    pdfBtn.textContent = "Download Answer Key PDF";
    container.appendChild(pdfBtn);
  }

  pdfBtn.style.display = "block";
  pdfBtn.style.margin = "20px auto";

  /* ---------- PDF EXPORT ---------- */

  pdfBtn.onclick = async function(){

    const reviewContainer = document.getElementById("quiz");

    const originalMaxHeight = reviewContainer.style.maxHeight;
    const originalOverflow = reviewContainer.style.overflow;

    reviewContainer.style.maxHeight = "none";
    reviewContainer.style.overflow = "visible";

    pdfBtn.style.display = "none";

    const viewBtn = document.getElementById("reviewBtn");
    if(viewBtn) viewBtn.style.display = "none";

    /* add header */
    await addPDFHeader();
    addPDFWatermark();

    /* expand explanations */
    document.querySelectorAll(".explanation").forEach(el=>{
      el.style.display = "block";
    });

    document.querySelectorAll(".explain-btn").forEach(btn=>{
      btn.style.display = "none";
    });

    const safeTitle = (window.examTitle || "exam")
      .replace(/[^a-z0-9]/gi,"_")
      .toLowerCase();

    await html2pdf()
      .set({
        margin:10,
        filename: safeTitle + "_review.pdf",
        html2canvas:{
          scale:2,
          scrollY:0,
          useCORS:true
        },
        jsPDF:{
          unit:"mm",
          format:"a4",
          orientation:"portrait"
        }
      })
      .from(reviewContainer)
      .save();

    /* restore UI */

    reviewContainer.style.maxHeight = originalMaxHeight;
    reviewContainer.style.overflow = originalOverflow;

    pdfBtn.style.display = "block";
    if(viewBtn) viewBtn.style.display = "inline-block";

    removePDFHeader();
    removePDFWatermark();
    collapseAllExplanations();

  };

}

/* ======================================================
   COLLAPSE EXPLANATIONS
====================================================== */

function collapseAllExplanations(){

  document.querySelectorAll(".explanation").forEach(el=>{
    el.style.display = "none";
  });

  document.querySelectorAll(".explain-btn").forEach(btn=>{
    btn.style.display = "inline-block";
  });

}

/* ======================================================
   ADD PDF HEADER
====================================================== */

async function addPDFHeader(){

  const container = document.getElementById("quiz");

  if(document.getElementById("pdfHeader")) return;

  const studentName = localStorage.getItem("studentName") || "Student";
  const examTitle = window.examTitle || "Exam";

  const scoreText =
    document.getElementById("result")
      ? document.getElementById("result").innerText
      : "";

  const date = new Date().toLocaleDateString();

  /* cache logo conversion */

  if(window.examLogo && !window.examLogoBase64){
    window.examLogoBase64 = await imageToBase64(window.examLogo);
  }

  const logo = window.examLogoBase64 || "";

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

/* ======================================================
   REMOVE PDF HEADER
====================================================== */

function removePDFHeader(){

  const header = document.getElementById("pdfHeader");

  if(header){
    header.remove();
  }

}

/* ======================================================
   IMAGE → BASE64
====================================================== */

async function imageToBase64(url){

  const res = await fetch(url);
  const blob = await res.blob();

  return new Promise(resolve=>{
    const reader = new FileReader();
    reader.onloadend = ()=> resolve(reader.result);
    reader.readAsDataURL(blob);
  });

}
/* start exam loading */

document.addEventListener("DOMContentLoaded", loadExam);