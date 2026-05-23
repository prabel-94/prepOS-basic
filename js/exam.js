import { TimerEngine } from "./timer.js";
import { PREPOS_ANALYTICS_ENABLED } from "./analytics/analytics-config.js";
import { getClient } from "./core/get-client.js";

console.log("SCRIPT STARTED");

let timer; // global timer instance

/* ---------- watermark image ---------- */

let watermarkImage = new Image();
watermarkImage.src = "assets/logo_full.png";

/* ---------- convert image to faint version ---------- */

function getTransparentImage(img, opacity = 0.08){

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.globalAlpha = opacity;
  ctx.drawImage(img,0,0);

  return canvas.toDataURL("image/png");
}

/* ---------- watermark renderer ---------- */

function drawPrepOSWatermark(pdf){

  const pageCount = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const size = 60;
  const gap = 100;

  const faintLogo = getTransparentImage(watermarkImage,0.08);

const aspect = watermarkImage.height / watermarkImage.width;
const width = size;
const height = size * aspect;

for(let page=1; page<=pageCount; page++){

  pdf.setPage(page);

  for(let x=0; x<pageWidth; x+=gap){
    for(let y=0; y<pageHeight; y+=gap){

      pdf.addImage(
        faintLogo,
        "JPEG",
        x,
        y,
        width,
        height,
        null,
        "FAST"
      );

    }
  }
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

/* ---------- question normalizer ---------- */
function normalizeQuestion(q){

  let correct = q.correct;

  // Convert numeric index → letter
  if(typeof correct === "number"){
    correct = String.fromCharCode(65 + correct);
  }

  correct = String(correct || "").toUpperCase();

  return {
    question_id: q.question_id || q.id || null,
    text: q.text || q.question || q.question_text || "",
    options: (q.options || []).map(o =>
      typeof o === "string"
        ? { id: "", text: o }
        : o
    ),
    correct,
    explanation: q.explanation || q.explanation_text || "",
    topics: Array.isArray(q.topics) ? q.topics : [],
    bank_status: q.bank_status || null
  };

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
const TIMER_KEY = `timer-${examId}`;

function createAttemptId(examId){
  const rand = Math.random().toString(36).slice(2,7);
  return `${examId}-${rand}`;
}

let attemptId = localStorage.getItem(ATTEMPT_ID_KEY);

if(!attemptId){
  attemptId = createAttemptId(examId);
  localStorage.setItem(ATTEMPT_ID_KEY, attemptId);
}

function getDeviceId(){

  let id = localStorage.getItem("prepos_device_id")

  if(!id){
    id = crypto.randomUUID()
    localStorage.setItem("prepos_device_id", id)
  }

  return id
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
   FETCH EXAM (session-aware + public link fallback)
====================================================== */

async function fetchExamSession(examId) {

  const sb = await getClient();

  const { data: sessionData } = await sb.auth.getSession();
  const hasUserSession = Boolean(sessionData?.session?.access_token);

  console.log("Exam fetch auth:", {
    examId,
    hasUserSession,
    userId: sessionData?.session?.user?.id ?? null
  });

  const { data: exam, error } = await sb
    .from("exam_sessions")
    .select("*")
    .eq("id", examId)
    .maybeSingle();

  if (error) {
    console.error("Exam fetch error:", error);
    throw new Error(
      error.message || `Server error loading exam`
    );
  }

  if (!exam) {
    const hint = hasUserSession
      ? "This exam does not exist, or your account is not allowed to view it."
      : "This exam does not exist, or the link requires you to sign in first.";

    throw new Error(`Exam not found. ${hint}`);
  }

  return exam;
}

async function loadExam(){

  console.log("Exam loading started");
  showLoading();

  try{

    const exam = await fetchExamSession(examId);

    console.log("Exam fetch result:", exam);

    /* ---------- BASIC EXAM INFO ---------- */

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

    /* ---------- EXTEND ATTEMPT STATE ---------- */

    if (!attemptState.startedAt) {
      attemptState.startedAt = Date.now();
      attemptState.duration = exam.duration || 1800; // default 30 min
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));
    }

    /* ---------- INITIALIZE TIMER (NOT STARTED YET) ---------- */

    timer = new TimerEngine({
      duration: attemptState.duration,
      startedAt: attemptState.startedAt
    });

    /* ---------- EXTRACT QUESTIONS ---------- */

    let questions = [];

    if(exam.schema_json?.sections){
      // New schema
      questions = exam.schema_json.sections.flatMap(section => section.questions || []);
    }
    else if(exam.schema_json?.questions){
      // Old schema
      questions = exam.schema_json.questions;
    }

    if(!questions.length){
      throw new Error("No questions found in exam");
    }

    /* ---------- NORMALIZE (CORE STEP) ---------- */

    window.examQuestionsRaw = questions.map(normalizeQuestion);

    /* ---------- UI STRUCTURE ---------- */

    /* ---------- STORE ORIGINAL ---------- */
    window.examQuestions = questions;

    console.log("Normalized Questions:", window.examQuestionsRaw);

    /* ---------- RENDER ---------- */

    renderQuiz(window.examQuestionsRaw);

    /* ---------- START EXAM BUTTON ---------- */

    document.getElementById("startExamBtn").addEventListener("click", () => {
      const studentName = document.getElementById("studentName").value.trim();
      if (!studentName) {
        alert("Please enter your name");
        return;
      }

      // Store student name
      localStorage.setItem("studentName", studentName);

      // Hide student info
      document.getElementById("studentInfoSection").style.display = "none";

      // Show exam
      showExam();

      // Start timer
      timer.start({
        onTick: ({ formatted }) => {
          document.getElementById("examTimer").innerText = formatted;
        },
        onEnd: () => {
          alert("Time up! Auto submitting...");
          submitExam();
        }
      });
    });

  }
  catch(err){

    console.error("Exam loading failed:", err);
    showError(err.message || "Failed to load exam");

  }

  }

/* ---------- COMPONENT: OPTION ROW ---------- */
function createOptionRow(qIndex, optionText, optionIndex){

  const letter = String.fromCharCode(65 + optionIndex);

  return `
    <label class="option-row">

      <input
        type="radio"
        name="q_${qIndex}"
        value="${letter}"
      >

      <span class="option-text">
        ${letter}. ${escapeHTML(optionText)}
      </span>

    </label>
  `;
}


/* ---------- COMPONENT: QUESTION CARD ---------- */
function createQuestionCard(q, index){

  const optionsHTML = (q.options || [])
    .map((opt, i) => createOptionRow(index, opt?.text || "", i))
    .join("");

  return `
    <div class="question-card">

      <div class="q-number">
        Q${index + 1}
      </div>

     <div class="question-text prepos-text">
  ${escapeHTML(stripLeadingNumber(q.text || ""))}
</div>

      <div class="question-options">
        ${optionsHTML}
      </div>

    </div>
  `;
}


/* ======================================================
   RENDER QUIZ
====================================================== */

function renderQuiz(questions){

  const container = document.getElementById("examContent");
  container.innerHTML = "";

  /* ---------- RENDER QUESTIONS ---------- */

  const html = questions
    .map((q, i) => createQuestionCard(q, i))
    .join("");

  container.innerHTML = html;

  /* ---------- AUTOSAVE ---------- */

  container.querySelectorAll('input[type="radio"]').forEach(r=>{
    r.addEventListener("change", e=>{

      const name = e.target.name;
      attemptState.answers[name] = e.target.value;

      localStorage.setItem(
        ATTEMPT_KEY,
        JSON.stringify(attemptState)
      );

    });
  });

  /* ---------- RESTORE ANSWERS ---------- */

  if(attemptState.answers){

    Object.entries(attemptState.answers).forEach(([name,val])=>{

      const el = container.querySelector(
        `input[name="${name}"][value="${val}"]`
      );

      if(el) el.checked = true;

    });

  }

  /* ---------- SUBMIT BUTTON ---------- */

  const btn = document.createElement("button");
  btn.innerText = "Submit";
  btn.onclick = submitExam;

  container.appendChild(btn);
}

/* ======================================================
   SUBMISSION MODE (canonical vs public)
====================================================== */

async function canSubmitCanonicalAttempt(sb, examId, userId) {

  if (!userId) {
    return false;
  }

  const { data, error } = await sb
    .from("exam_assignments")
    .select("id")
    .eq("exam_id", examId)
    .eq("student_id", userId)
    .maybeSingle();

  return !!data && !error;
}

/* ======================================================
   SUBMIT
====================================================== */
async function submitExam(){

  if(attemptState.status==="submitted") return;

  if (timer) timer.stop(); // stop timer if exists

  if(!window.examQuestionsRaw){
    console.error("Raw questions missing");
    alert("Exam not loaded properly");
    return;
  }

  const studentName = localStorage.getItem("studentName") || "";

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
  document.querySelector(`input[name="q_${i}"]:checked`);

    const chosen = selected ? selected.value : "-";

    answers.push({
  question_id: q.question_id || null, // 🔥 KEY FIELD
  chosen,
  correct: q.correct,
  is_correct: chosen === q.correct
});

    if(chosen === q.correct) score++;
  });

  /* ---------- CALCULATE TIME TAKEN ---------- */

  const elapsed = Math.floor((Date.now() - attemptState.startedAt) / 1000);
  const time_taken = Math.min(elapsed, attemptState.duration);

  const bankAnswers = answers.filter(a => a.question_id);

try{

  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser()
  const user = userData?.user

  const useCanonical =
    user &&
    await canSubmitCanonicalAttempt(sb, examId, user.id);

  let attemptError = null;

  if (useCanonical) {

    console.log("[PrepOS Exam Submission]", {
      mode: "canonical"
    });

    const result = await sb
      .from("exam_attempts")
      .insert([
        {
          exam_id: examId,
          device_id: getDeviceId(),
          attempt_id: attemptId,
          student_name: studentName,
          student_id: user.id,
          answers,
          score,
          question_count: answers.length,
          time_taken,
          submitted_at: new Date().toISOString()
        }
      ]);

    attemptError = result.error;

  } else {

    console.log("[PrepOS Exam Submission]", {
      mode: "public"
    });

    const result = await sb
      .from("public_exam_attempts")
      .insert([
        {
          exam_id: examId,
          guest_name: studentName,
          device_id: getDeviceId(),
          attempt_id: attemptId,
          answers,
          score,
          question_count: answers.length,
          time_taken,
          submitted_at: new Date().toISOString()
        }
      ]);

    attemptError = result.error;

  }

  if (attemptError) {
    console.error("Failed to save attempt", attemptError)
    alert("Submission failed. Please try again.")
    return
  }

  const submissionMode = useCanonical ? "canonical" : "public";

    /* ---------- lock ---------- */
    attemptState.status="submitted";
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));

    /* ---------- analytics (disabled via analytics-config.js) ---------- */
    if (PREPOS_ANALYTICS_ENABLED) {
      const { runExamSubmissionAnalyticsWithHistory, buildAttemptRecord } =
        await import("./analytics/analytics-submission.js");

      const attemptRecord = buildAttemptRecord({
        examId,
        attemptId,
        studentName,
        studentId: useCanonical ? user.id : null,
        answers,
        score,
        timeTaken: time_taken,
        submissionMode
      });

      runExamSubmissionAnalyticsWithHistory({
        examId,
        examTitle: window.examTitle || "Exam",
        attempt: attemptRecord,
        rawQuestions: window.examQuestionsRaw,
        sourceQuestions: window.examQuestions || [],
        submissionMode,
        sb
      }).catch(err => {
        console.warn(
          "[PrepOS Analytics] Submission analytics failed (non-fatal):",
          err
        );
      });
    }

    /* ---------- clean up timer ---------- */
    localStorage.removeItem(TIMER_KEY);

    document.querySelectorAll('input[type="radio"]')
      .forEach(el=>el.disabled=true);

    /* ---------- build review ---------- */
   window.reviewData =
  window.examQuestionsRaw.map((q,i)=>{

    const student = answers[i]?.chosen || "-";

    return {
      question: q.text,
      options: (q.options || []).map(o =>
        typeof o === "string"
          ? { id: "", text: o }
          : o
      ),
      correct: q.correct,   // ✅ already normalized
      student,
      explanation: q.explanation,
      isCorrect: student === q.correct
    };
  });

window.examScoreText = `${studentName}, your score: ${score}/${window.examQuestionsRaw.length}`;
    document.getElementById("result").innerHTML =
`<h3>${window.examScoreText}</h3>
 <button id="reviewBtn">View Answers</button>
 <button id="downloadPdfBtn" style="display:none">Download Review PDF</button>`;

scrollToResult()

    document.getElementById("reviewBtn").onclick = function(){

  this.style.display = "none";

  document.getElementById("downloadPdfBtn").style.display = "inline-block";

  renderReview();

  window.scrollTo({top:0,behavior:"smooth"});

};

  }catch(err){
    console.error(err);
    alert("Failed to save response");
  }
}

/* ======================================================
   REVIEW MODE
====================================================== */

/* ---------- COMPONENT: REVIEW OPTION ---------- */
function createReviewOption(opt, idx, correct, student){

  const letter = String.fromCharCode(65 + idx);

  let className = "review-option";

  if(letter === correct){
    className += " option-correct";
  }

  if(letter === student && letter !== correct){
    className += " option-wrong";
  }

  if(letter === student){
    className += " option-selected";
  }

  return `
    <div class="${className}">
      <span class="option-letter">${letter}</span>
      <span class="option-text prepos-text">
        ${letter}. ${escapeHTML(opt?.text || "")}
      </span>
    </div>
  `;
}
/* ---------- COMPONENT: REVIEW CARD ---------- */
function createReviewCard(q, index){

  const optionsHTML = q.options
    .map((opt, i) =>
      createReviewOption(opt, i, q.correct, q.student)
    )
    .join("");

  const explanationHTML = q.explanation && q.explanation.trim()
    ? `
      <div class="review-explanation-block">
        <button class="explain-btn secondary-btn">
          Show Explanation
        </button>

        <div class="explanation hidden">
          <div class="explanation-title">Explanation</div>
          <div class="explanation-text prepos-text">
  ${escapeHTML(q.explanation)}
</div>
        </div>
      </div>
    `
    : "";

  return `
    <div class="review-card">

      <div class="review-header">

        <div class="review-q-number">
          Q${index + 1}
        </div>

        <div class="review-status ${
          q.isCorrect ? "status-correct" : "status-wrong"
        }">
          ${q.isCorrect ? "✔ Correct" : "✘ Wrong"}
        </div>

      </div>

      <div class="review-question prepos-text">
  ${escapeHTML(stripLeadingNumber(q.question))}
</div>

      <div class="review-options">
        ${optionsHTML}
      </div>

      ${explanationHTML}

    </div>
  `;
}

function renderReview(){

  window.scrollTo({ top: 0, behavior: "smooth" });

  const container = document.getElementById("quiz");
  container.innerHTML = "";

  /* ---------- RENDER ALL CARDS ---------- */

  const html = window.reviewData
    .map((q, i) => createReviewCard(q, i))
    .join("");

  container.innerHTML = html;

  /* ---------- EXPLANATION TOGGLE ---------- */

  container.querySelectorAll(".explain-btn").forEach(btn=>{
  btn.addEventListener("click", function(){

    const explanation = this.nextElementSibling;

    explanation.classList.toggle("hidden");

    this.textContent =
      explanation.classList.contains("hidden")
        ? "Show Explanation"
        : "Hide Explanation";

  });
});

  /* ---------- PDF BUTTON ---------- */

  let pdfBtn = document.getElementById("downloadPdfBtn");

  if(!pdfBtn){
    pdfBtn = document.createElement("button");
    pdfBtn.id = "downloadPdfBtn";
    pdfBtn.textContent = "Download Answer Key PDF";
    container.appendChild(pdfBtn);
  }

  pdfBtn.style.display = "block";
  pdfBtn.style.margin = "20px auto";

  /* ---------- PDF LOGIC (UNCHANGED) ---------- */
  pdfBtn.onclick = async function(){

    const reviewContainer = document.getElementById("quiz");
    const viewBtn = document.getElementById("reviewBtn");

    const originalMaxHeight = reviewContainer.style.maxHeight;
    const originalOverflow = reviewContainer.style.overflow;

    try{

      reviewContainer.style.maxHeight = "none";
      reviewContainer.style.overflow = "visible";

      if(viewBtn) viewBtn.style.display = "none";

      await addPDFHeader();

      document.querySelectorAll(".explanation").forEach(el=>{
        el.style.display = "block";
      });

      document.querySelectorAll(".explain-btn").forEach(btn=>{
        btn.style.display = "none";
      });

      const safeTitle = (window.examTitle || "exam")
        .replace(/[^a-z0-9]/gi,"_")
        .toLowerCase();

      const worker = html2pdf()
        .set({
          margin:10,
          filename: safeTitle + "_review.pdf",
          image:{ type:"jpeg", quality:0.75 },
          html2canvas:{ scale:1, scrollY:0, useCORS:true, logging:false },
          jsPDF:{ unit:"mm", format:"a4", orientation:"portrait" }
        })
        .from(reviewContainer)
        .toPdf();

      const pdf = await worker.get("pdf");

      drawPrepOSWatermark(pdf);

      pdf.save(safeTitle + "_review.pdf");

    } catch(err){
      console.error(err);
      alert("PDF generation failed");
    }
    finally{
      reviewContainer.style.maxHeight = originalMaxHeight;
      reviewContainer.style.overflow = originalOverflow;

      if(viewBtn) viewBtn.style.display = "inline-block";

      removePDFHeader();
      collapseAllExplanations();
    }

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

  const scoreText = window.examScoreText || "";

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

      ${logo ? `
  <img 
    src="${logo}" 
    class="pdf-logo"
    style="max-height:60px;max-width:120px;display:block;margin:0 auto 10px;"
  >
` : ""}

      <h2>${examTitle}</h2>

      <p><b>Student:</b> ${escapeHTML(studentName)}</p>
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