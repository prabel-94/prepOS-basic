import { TimerEngine } from "./timer.js";
import { renderDashboardSkeleton } from "./student/student-dashboard-renderer.js";
import { PREPOS_ANALYTICS_ENABLED } from "./analytics/analytics-config.js";
import { getClient } from "./core/get-client.js";
import {
  fetchUserRole,
  getHomePathForRole,
  resolveAppPath,
  TEACHER_ROLES,
} from "./core/access.js";
import { openModal, closeModal } from "./ui/modal-system.js";
import {
  extractRawQuestions,
  getExamQuestionCount,
  formatExamDuration,
  collectTopicsFromRawQuestions,
} from "./student/student-exam-meta.js";
import { getLearnerProfile } from "./core/learner-profile.js";
import { resolveActingStudentIdAsync, isActingAsLinkedStudent, resolveActingStudentId } from "./core/learner-context.js";
import { getRuntimeState } from "./core/runtime.js";
import { assertExamSeriesUnlocked } from "./core/exam-series.js";
import {
  assistanceSessionKey,
  examHasMalayalamAssistance,
  resolveQuestionDisplay,
} from "./core/question-assistance.js";

let timer;
let assistanceMaskEnabled = false;
let examStarted = false;
let totalQuestions = 0;
let visibleQuestionIndex = 1;
let questionObserver = null;

const EXAM_NAV_MODES = Object.freeze({
  scroll: "scroll",
  step: "step",
});
let navigationMode = EXAM_NAV_MODES.scroll;

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
  document.getElementById("examOverviewSection")?.classList.add("hidden");
  renderDashboardSkeleton(document.getElementById("examLoadingSkeleton"), { rows: 2 });
}

function showOverview(){
  document.getElementById("loadingState").style.display="none";
  document.getElementById("examOverviewSection")?.classList.remove("hidden");
  document.getElementById("examHeader")?.classList.add("exam-header--overview");
  document.getElementById("examTitle")?.classList.add("hidden");
  document.getElementById("examTimer")?.classList.add("hidden");
}

function leaveOverviewHeader(){
  document.getElementById("examHeader")?.classList.remove("exam-header--overview");
  document.getElementById("examTitle")?.classList.remove("hidden");
}

function showError(message){
  document.getElementById("loadingState").style.display="none";
  document.getElementById("errorState").style.display="block";
  document.getElementById("examContent").style.display="none";
  document.getElementById("examOverviewSection")?.classList.add("hidden");
  document.getElementById("errorMessage").textContent=message;
}

function showExam(){
  document.getElementById("loadingState").style.display="none";
  document.getElementById("errorState").style.display="none";
  document.getElementById("examContent").style.display="block";
}

function getAnswerStats(){
  const total = window.examQuestionsRaw?.length ?? 0;
  let answered = 0;

  for (let i = 0; i < total; i += 1) {
    if (document.querySelector(`input[name="q_${i}"]:checked`)) {
      answered += 1;
    }
  }

  return { total, answered, unanswered: Math.max(0, total - answered) };
}

function updateExamProgress(){
  const { total, answered } = getAnswerStats();
  totalQuestions = total;

  const pct = total ? Math.round((answered / total) * 100) : 0;
  const fill = document.getElementById("examProgressFill");
  const label = document.getElementById("examProgressLabel");
  const bar = document.getElementById("examProgressBar");

  if (fill) {
    fill.style.width = `${pct}%`;
  }

  if (label) {
    label.textContent = `${answered} / ${total} Answered`;
  }

  if (bar) {
    bar.setAttribute("aria-valuenow", String(pct));
  }
}

function updateQuestionIndicator(){
  const el = document.getElementById("examQuestionIndicator");

  if (!el || !totalQuestions) {
    return;
  }

  const index = Math.min(Math.max(visibleQuestionIndex, 1), totalQuestions);
  el.textContent = `Question ${index} of ${totalQuestions}`;
}

function bindQuestionVisibilityObserver(){
  if (questionObserver) {
    questionObserver.disconnect();
  }

  const cards = document.querySelectorAll("#examContent .question-card");

  if (!cards.length) {
    return;
  }

  questionObserver = new IntersectionObserver(
    (entries) => {
      let best = visibleQuestionIndex;
      let bestRatio = 0;

      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const idx = Number(entry.target.dataset.questionIndex);

        if (idx && entry.intersectionRatio >= bestRatio) {
          bestRatio = entry.intersectionRatio;
          best = idx;
        }
      }

      if (best !== visibleQuestionIndex) {
        visibleQuestionIndex = best;
        updateQuestionIndicator();
      }
    },
    { threshold: [0.35, 0.55, 0.75] }
  );

  cards.forEach((card) => questionObserver.observe(card));
}

function getNavigationModeCards(){
  return document.querySelectorAll("[data-exam-nav-mode]");
}

function getSelectedNavigationMode(){
  const active = document.querySelector("[data-exam-nav-mode].active");
  return active?.dataset.examNavMode === EXAM_NAV_MODES.step
    ? EXAM_NAV_MODES.step
    : EXAM_NAV_MODES.scroll;
}

function resolveNavigationModeFromAttempt(){
  return attemptState.navigationMode === EXAM_NAV_MODES.step
    ? EXAM_NAV_MODES.step
    : EXAM_NAV_MODES.scroll;
}

function syncNavigationModePicker(mode){
  const value =
    mode === EXAM_NAV_MODES.step ? EXAM_NAV_MODES.step : EXAM_NAV_MODES.scroll;

  getNavigationModeCards().forEach((card) => {
    const isActive = card.dataset.examNavMode === value;
    card.classList.toggle("active", isActive);
    card.setAttribute("aria-pressed", String(isActive));
  });
}

function bindNavigationModePicker(){
  getNavigationModeCards().forEach((card) => {
    card.addEventListener("click", () => {
      syncNavigationModePicker(card.dataset.examNavMode);
    });
  });
}

function lockNavigationMode(mode){
  navigationMode =
    mode === EXAM_NAV_MODES.step ? EXAM_NAV_MODES.step : EXAM_NAV_MODES.scroll;
  attemptState.navigationMode = navigationMode;

  if (!isInspectSession) {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));
  }
}

function showAllQuestions(){
  document.querySelectorAll("#examContent .question-card").forEach((card) => {
    card.classList.remove("exam-question-hidden");
  });
}

function updateStepNavControls(){
  const total = totalQuestions || window.examQuestionsRaw?.length || 0;
  const prevBtn = document.getElementById("examStepPrevBtn");
  const nextBtn = document.getElementById("examStepNextBtn");
  const label = document.getElementById("examStepNavLabel");
  const isLast = visibleQuestionIndex >= total;

  if (label) {
    label.textContent = `Question ${visibleQuestionIndex} of ${total}`;
  }

  if (prevBtn) {
    prevBtn.disabled = visibleQuestionIndex <= 1;
  }

  if (nextBtn) {
    if (isInspectSession && isLast) {
      nextBtn.textContent = "Last question";
      nextBtn.disabled = true;
      nextBtn.classList.remove("primary-btn");
      nextBtn.classList.add("secondary-btn");
    } else if (isLast) {
      nextBtn.textContent = "Review & Submit";
      nextBtn.disabled = false;
      nextBtn.classList.add("primary-btn");
      nextBtn.classList.remove("secondary-btn");
    } else {
      nextBtn.textContent = "Next →";
      nextBtn.disabled = false;
      nextBtn.classList.remove("primary-btn");
      nextBtn.classList.add("secondary-btn");
    }
  }
}

function showStepQuestion(index){
  const total = totalQuestions || window.examQuestionsRaw?.length || 0;
  const idx = Math.min(Math.max(Number(index) || 1, 1), Math.max(total, 1));
  visibleQuestionIndex = idx;

  document.querySelectorAll("#examContent .question-card").forEach((card) => {
    const cardIndex = Number(card.dataset.questionIndex);
    card.classList.toggle("exam-question-hidden", cardIndex !== idx);
  });

  updateQuestionIndicator();
  updateStepNavControls();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyNavigationModeUI(){
  const container = document.getElementById("examContent");
  const stepNav = document.getElementById("examStepNav");

  if (navigationMode === EXAM_NAV_MODES.step) {
    container?.classList.add("exam-content--step");
    stepNav?.classList.remove("hidden");

    if (questionObserver) {
      questionObserver.disconnect();
      questionObserver = null;
    }

    showStepQuestion(visibleQuestionIndex || 1);
    updateNavModeToggleLabel();
    return;
  }

  container?.classList.remove("exam-content--step");
  stepNav?.classList.add("hidden");
  showAllQuestions();
  bindQuestionVisibilityObserver();
  updateQuestionIndicator();
  updateNavModeToggleLabel();
}

function updateNavModeToggleLabel(){
  const btn = document.getElementById("examNavModeToggle");
  if (!btn) {
    return;
  }

  const isStep = navigationMode === EXAM_NAV_MODES.step;
  btn.textContent = isStep ? "Scroll paper" : "One at a time";
  btn.setAttribute("aria-pressed", String(isStep));
  btn.title = isStep
    ? "Show all questions and scroll through the paper"
    : "Show one question at a time with Previous and Next";
}

function scrollToQuestionCard(index){
  const card = document.querySelector(
    `#examContent .question-card[data-question-index="${index}"]`
  );
  card?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleNavigationMode(){
  if (!examStarted) {
    return;
  }

  const nextMode =
    navigationMode === EXAM_NAV_MODES.step
      ? EXAM_NAV_MODES.scroll
      : EXAM_NAV_MODES.step;

  lockNavigationMode(nextMode);
  syncNavigationModePicker(nextMode);
  applyNavigationModeUI();

  if (nextMode === EXAM_NAV_MODES.scroll) {
    scrollToQuestionCard(visibleQuestionIndex);
  }
}

function showNavModeToggle(){
  document.getElementById("examNavModeToggle")?.classList.remove("hidden");
  updateNavModeToggleLabel();
}

function hideNavModeToggle(){
  document.getElementById("examNavModeToggle")?.classList.add("hidden");
}

function bindStepNavigation(){
  document.getElementById("examStepPrevBtn")?.addEventListener("click", () => {
    if (visibleQuestionIndex > 1) {
      showStepQuestion(visibleQuestionIndex - 1);
    }
  });

  document.getElementById("examStepNextBtn")?.addEventListener("click", () => {
    const total = totalQuestions || window.examQuestionsRaw?.length || 0;

    if (visibleQuestionIndex >= total) {
      if (!isInspectSession) {
        document.getElementById("examReviewFab")?.click();
      }
      return;
    }

    showStepQuestion(visibleQuestionIndex + 1);
  });
}

function formatTimerPreview(seconds = 0){
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function renderExamOverview(exam, topics = []){
  const title = exam.title || "Exam";

  document.getElementById("overviewExamTitle").textContent = title;

  const titleEl = document.getElementById("examTitle");
  if (titleEl) {
    titleEl.textContent = title;
  }

  const metaEl = document.getElementById("examOverviewMeta");
  const count = getExamQuestionCount(exam.schema_json);
  const durationLabel = formatExamDuration(exam.duration);
  const rows = [];

  if (count) {
    rows.push(["Questions", String(count)]);
  }

  if (durationLabel) {
    rows.push(["Duration", durationLabel]);
  }

  metaEl.innerHTML = rows
    .map(
      ([label, value]) =>
        `<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd>`
    )
    .join("");

  const topicsWrap = document.getElementById("examOverviewTopics");
  const topicsList = document.getElementById("examOverviewTopicsList");

  if (topics.length && topicsWrap && topicsList) {
    topicsWrap.classList.remove("hidden");
    topicsList.innerHTML = topics
      .map((topic) => `<li>${escapeHTML(topic)}</li>`)
      .join("");
  } else if (topicsWrap) {
    topicsWrap.classList.add("hidden");
  }
}

async function resolveStudentName(){
  const input = document.getElementById("studentName");
  const manual = input?.value?.trim();

  if (manual) {
    localStorage.setItem("studentName", manual);
    return manual;
  }

  try {
    const sb = await getClient();
    const { data } = await sb.auth.getUser();
    const user = data?.user;

    if (user) {
      const actingStudentId =
        (await resolveActingStudentIdAsync(sb)) ?? user.id;

      try {
        const profile = await getLearnerProfile(actingStudentId);
        if (profile?.displayName) {
          localStorage.setItem("studentName", profile.displayName);
          return profile.displayName;
        }
      } catch {
        /* profile lookup is optional */
      }

      const stored = localStorage.getItem("studentName")?.trim();
      if (stored) {
        return stored;
      }

      const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Student";

      localStorage.setItem("studentName", name);
      return name;
    }
  } catch {
    /* ignore */
  }

  const stored = localStorage.getItem("studentName")?.trim();
  if (stored) {
    return stored;
  }

  return null;
}

async function setupOverviewNameField(){
  const row = document.getElementById("overviewNameRow");
  if (!row) {
    return;
  }

  try {
    const sb = await getClient();
    const { data } = await sb.auth.getUser();

    if (data?.user) {
      row.classList.add("hidden");
      return;
    }
  } catch {
    /* ignore */
  }

  row.classList.remove("hidden");
}

function showActiveExamChrome(){
  document.getElementById("examProgressPanel")?.classList.remove("hidden");
  document.getElementById("examReviewFab")?.classList.remove("hidden");
  document.getElementById("examQuestionIndicator")?.classList.remove("hidden");
  document.getElementById("examHeader")?.classList.add("exam-header--active");
  document.getElementById("examTitle")?.classList.remove("hidden");
  showNavModeToggle();
}

function hideActiveExamChrome(){
  document.getElementById("examProgressPanel")?.classList.add("hidden");
  document.getElementById("examReviewFab")?.classList.add("hidden");
  document.getElementById("examQuestionIndicator")?.classList.add("hidden");
  document.getElementById("examHeader")?.classList.remove("exam-header--active");
  document.getElementById("examStepNav")?.classList.add("hidden");
  hideNavModeToggle();
}

function bindReviewModal(){
  const modal = document.getElementById("examReviewModal");

  document.getElementById("examReviewFab")?.addEventListener("click", () => {
    const { answered, unanswered } = getAnswerStats();
    document.getElementById("examReviewAnswered").textContent = String(answered);
    document.getElementById("examReviewUnanswered").textContent = String(unanswered);
    openModal(modal, {
      overlayType: "critical-dialog",
      closeOnBackdrop: true,
    });
  });

  document.getElementById("examReviewContinueBtn")?.addEventListener("click", () => {
    closeModal(modal);
  });

  document.getElementById("examReviewSubmitBtn")?.addEventListener("click", () => {
    closeModal(modal);
    submitExam();
  });
}

function beginExamSession(examDurationSeconds){
  if (isInspectSession) {
    beginInspectSession();
    return;
  }

  if (examStarted || attemptState.status === "submitted") {
    return;
  }

  if (!attemptState.startedAt) {
    attemptState.startedAt = Date.now();
    attemptState.duration = examDurationSeconds || attemptState.duration || 1800;
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));
  } else {
    navigationMode = resolveNavigationModeFromAttempt();
  }

  timer = new TimerEngine({
    duration: attemptState.duration,
    startedAt: attemptState.startedAt,
  });

  examStarted = true;
  leaveOverviewHeader();
  document.getElementById("examOverviewSection")?.classList.add("hidden");
  showExam();
  showActiveExamChrome();
  document.getElementById("examTimer")?.classList.remove("hidden");

  import("./core/activity-log.js")
    .then(({ logActivity, ACTIVITY_EVENTS }) => {
      logActivity(ACTIVITY_EVENTS.EXAM_STARTED, {
        resourceType: "exam",
        resourceId: examId || null,
        metadata: {
          examTitle: window.examTitle || null,
          questionCount: window.examQuestionsRaw?.length ?? 0,
        },
      });
    })
    .catch(() => {});

  totalQuestions = window.examQuestionsRaw?.length ?? 0;
  visibleQuestionIndex = 1;
  updateExamProgress();
  renderQuiz(getQuestionsForDisplay());
  applyNavigationModeUI();
  updateAssistanceToggleUi();

  timer.start({
    onTick: ({ formatted }) => {
      document.getElementById("examTimer").innerText = `${formatted} remaining`;
    },
    onEnd: () => {
      alert("Time up! Auto submitting...");
      submitExam();
    },
  });
}

function showInspectBanner(){
  document.getElementById("examInspectBanner")?.classList.remove("hidden");
}

function beginInspectSession(){
  if (examStarted) {
    return;
  }

  isInspectSession = true;
  examStarted = true;

  leaveOverviewHeader();
  document.getElementById("examOverviewSection")?.classList.add("hidden");
  showExam();
  showInspectBanner();
  hideActiveExamChrome();
  document.getElementById("examTitle")?.classList.remove("hidden");

  document.getElementById("examTimer")?.classList.add("hidden");

  totalQuestions = window.examQuestionsRaw?.length ?? 0;
  visibleQuestionIndex = 1;
  applyNavigationModeUI();
  showNavModeToggle();
}

async function resolveInspectAccess(sb, exam, userId){
  if (!userId) {
    return false;
  }

  const role = await fetchUserRole(sb, userId);
  if (!role || !TEACHER_ROLES.includes(role)) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  return exam.created_by === userId;
}

function renderExamResults(score, answers, studentName){
  const total = window.examQuestionsRaw.length;
  const accuracy = total ? Math.round((score / total) * 100) : 0;
  const answeredCount = answers.filter((a) => a.chosen && a.chosen !== "-").length;

  window.examScoreText = `${studentName}, your score: ${score}/${total}`;

  document.getElementById("result").innerHTML = `
    <div class="exam-results-card card">
      <div class="exam-results-kicker">Your Score</div>
      <div class="exam-results-score">${escapeHTML(String(score))} / ${escapeHTML(String(total))}</div>
      <div class="exam-results-grid mt-20">
        <div class="exam-results-stat">
          <div class="exam-results-stat-label">Accuracy</div>
          <div class="exam-results-stat-value">${escapeHTML(String(accuracy))}%</div>
        </div>
        <div class="exam-results-stat">
          <div class="exam-results-stat-label">Questions Attempted</div>
          <div class="exam-results-stat-value">${escapeHTML(String(answeredCount))}</div>
        </div>
      </div>
      <button type="button" id="reviewBtn" class="primary-btn mt-20">View Answers</button>
      <button type="button" id="downloadPdfBtn" class="secondary-btn mt-10 hidden">Download Review PDF</button>
    </div>
  `;
}

function buildReviewDataFromStoredAnswers(answers = []){
  return window.examQuestionsRaw.map((q, i) =>
    buildReviewEntry(q, answers[i] || {})
  );
}

function bindResultsReviewActions(){
  const reviewBtn = document.getElementById("reviewBtn");
  if (!reviewBtn) {
    return;
  }

  reviewBtn.onclick = function(){
    this.style.display = "none";
    document.getElementById("downloadPdfBtn")?.classList.remove("hidden");
    if (Array.isArray(attemptState.answers)) {
      window.reviewData = buildReviewDataFromStoredAnswers(attemptState.answers);
    }
    renderReview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

function enterReadOnlyCompletedMode({ score, answers, studentName }){
  examStarted = true;

  document.getElementById("examOverviewSection")?.classList.add("hidden");
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("errorState").style.display = "none";
  document.getElementById("examContent").style.display = "none";
  hideActiveExamChrome();

  if (window.examDuration) {
    document.getElementById("examTimer").textContent = "Completed";
  }

  window.reviewData = buildReviewDataFromStoredAnswers(answers);
  renderExamResults(score, answers, studentName);
  bindResultsReviewActions();
  scrollToResult();
}

async function fetchLatestCanonicalAttempt(sb, userId){
  const { data, error } = await sb
    .from("exam_attempts")
    .select("score, answers, student_name, question_count, submitted_at")
    .eq("exam_id", examId)
    .eq("student_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[Exam] Failed to load canonical attempt", error);
    return null;
  }

  return data;
}

async function restoreCompletedExamState(){
  if (
    attemptState.status === "submitted" &&
    Array.isArray(attemptState.answers) &&
    attemptState.score != null
  ) {
    const studentName =
      attemptState.studentName ||
      localStorage.getItem("studentName") ||
      "Student";

    enterReadOnlyCompletedMode({
      score: attemptState.score,
      answers: attemptState.answers,
      studentName,
    });
    return true;
  }

  try {
    const sb = await getClient();
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;

    if (!user) {
      return false;
    }

    const actingStudentId =
      resolveActingStudentId(getRuntimeState()) ??
      (await resolveActingStudentIdAsync(sb)) ??
      user.id;

    const attempt = await fetchLatestCanonicalAttempt(sb, actingStudentId);

    if (!attempt) {
      return false;
    }

    enterReadOnlyCompletedMode({
      score: attempt.score,
      answers: attempt.answers ?? [],
      studentName:
        attempt.student_name ||
        localStorage.getItem("studentName") ||
        "Student",
    });

    attemptState.status = "submitted";
    attemptState.score = attempt.score;
    attemptState.total = attempt.question_count ?? attempt.answers?.length ?? 0;
    attemptState.answers = attempt.answers ?? [];
    attemptState.studentName =
      attempt.student_name ||
      localStorage.getItem("studentName") ||
      "Student";
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));

    return true;
  } catch (error) {
    console.warn("[Exam] Completed state restore failed", error);
    return false;
  }
}
function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
/* Strip duplicate question label (Q31 / 31.) but keep in-body numbered lists. */
function stripLeadingNumber(text, displayNumber){
  const trimmed = String(text ?? "").trim();
  const n = Number(displayNumber);

  if (!trimmed || !Number.isFinite(n) || n < 1) {
    return trimmed;
  }

  const qPrefix = new RegExp(`^Q\\s*${n}(?:[.)\\s]+)`, "i");
  if (qPrefix.test(trimmed)) {
    return trimmed.replace(qPrefix, "").trim();
  }

  const hasNumberedList =
    /^\d+[.)]\s+\S/.test(trimmed) &&
    /\n\s*2[.)]\s/.test(trimmed);

  if (hasNumberedList) {
    return trimmed;
  }

  const barePrefix = new RegExp(`^${n}(?:[.)\\s]+)`);
  if (barePrefix.test(trimmed)) {
    return trimmed.replace(barePrefix, "").trim();
  }

  return trimmed;
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
    bank_status: q.bank_status || null,
    assistance: q.assistance || null,
  };

}

function getQuestionsForDisplay() {
  return (window.examQuestionsRaw || []).map((question) => {
    const display = resolveQuestionDisplay(question, assistanceMaskEnabled);

    return {
      ...question,
      text: display.text,
      options: display.options,
      explanation: display.explanation,
    };
  });
}

function updateAssistanceToggleUi() {
  const headerToggle = document.getElementById("examAssistanceToggle");
  const overviewToggle = document.getElementById("examAssistanceOverviewToggle");

  if (headerToggle) {
    headerToggle.setAttribute("aria-pressed", String(assistanceMaskEnabled));
    headerToggle.classList.toggle("exam-assistance-toggle--active", assistanceMaskEnabled);
    headerToggle.textContent = assistanceMaskEnabled
      ? "മലയാളം: ON"
      : "മലയാളം";
  }

  if (overviewToggle) {
    overviewToggle.checked = assistanceMaskEnabled;
  }
}

function setAssistanceMaskEnabled(enabled) {
  assistanceMaskEnabled = Boolean(enabled);

  try {
    sessionStorage.setItem(
      assistanceSessionKey(examId),
      assistanceMaskEnabled ? "1" : "0"
    );
  } catch {
    /* ignore */
  }

  updateAssistanceToggleUi();

  if (
    examStarted &&
    attemptState.status !== "submitted" &&
    document.getElementById("examContent")?.style.display !== "none"
  ) {
    rerenderActiveQuiz();
    return;
  }

  if (
    attemptState.status === "submitted" &&
    Array.isArray(attemptState.answers) &&
    document.querySelector(".review-card")
  ) {
    window.reviewData = buildReviewDataFromStoredAnswers(attemptState.answers);
    renderReview();
  }
}

function rerenderActiveQuiz() {
  const scrollY = window.scrollY;
  renderQuiz(getQuestionsForDisplay());

  if (navigationMode === EXAM_NAV_MODES.step) {
    showStepQuestion(visibleQuestionIndex || 1);
  } else {
    applyNavigationModeUI();
  }

  window.scrollTo({ top: scrollY, behavior: "auto" });
}

function setupAssistanceMaskUi() {
  const headerToggle = document.getElementById("examAssistanceToggle");
  const overviewRow = document.getElementById("examAssistanceOverviewRow");
  const overviewToggle = document.getElementById("examAssistanceOverviewToggle");
  const hasAssistance = examHasMalayalamAssistance(window.examQuestionsRaw || []);

  if (!hasAssistance || isInspectSession) {
    headerToggle?.classList.add("hidden");
    overviewRow?.classList.add("hidden");
    return;
  }

  try {
    assistanceMaskEnabled =
      sessionStorage.getItem(assistanceSessionKey(examId)) === "1";
  } catch {
    assistanceMaskEnabled = false;
  }

  headerToggle?.classList.remove("hidden");
  overviewRow?.classList.remove("hidden");
  updateAssistanceToggleUi();

  if (!headerToggle?.dataset.bound) {
    headerToggle.dataset.bound = "1";
    headerToggle.addEventListener("click", () => {
      setAssistanceMaskEnabled(!assistanceMaskEnabled);
    });
  }

  if (overviewToggle && !overviewToggle.dataset.bound) {
    overviewToggle.dataset.bound = "1";
    overviewToggle.addEventListener("change", () => {
      setAssistanceMaskEnabled(overviewToggle.checked);
    });
  }
}

function buildReviewEntry(question, answerEntry = {}) {
  const display = resolveQuestionDisplay(question, assistanceMaskEnabled);
  const student = answerEntry.chosen || "-";

  return {
    question: display.text,
    options: display.options,
    correct: question.correct,
    student,
    explanation: display.explanation,
    isCorrect: student === question.correct,
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
const inspectModeRequested = params.get("mode") === "inspect";
let isInspectSession = false;

if(!examId){
  document.getElementById("quiz").innerText="Invalid exam link";
  throw new Error("Missing examId");
}

const ATTEMPT_KEY = `prepos-attempt-${examId}`;
const ATTEMPT_ID_KEY = `prepos-attempt-id-${examId}`;
const TIMER_KEY = `timer-${examId}`;

function isUuid(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function createAttemptId(){
  return crypto.randomUUID();
}

let attemptId;
let attemptState;

if (inspectModeRequested) {
  attemptId = createAttemptId();
  attemptState = {
    attemptId,
    examId,
    answers: {},
    status: "in_progress",
  };
} else {
  attemptId = localStorage.getItem(ATTEMPT_ID_KEY);

  if (!isUuid(attemptId)) {
    attemptId = createAttemptId();
    localStorage.setItem(ATTEMPT_ID_KEY, attemptId);
  }

  attemptState = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || "null");

  if (!attemptState || attemptState.attemptId !== attemptId) {
    attemptState = {
      attemptId,
      examId,
      answers: {},
      status: "in_progress",
    };
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));
  }
}

function getDeviceId(){

  let id = localStorage.getItem("prepos_device_id")

  if(!id){
    id = crypto.randomUUID()
    localStorage.setItem("prepos_device_id", id)
  }

  return id
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

async function applyExamSurfaceTheme(sb) {
  if (inspectModeRequested) {
    return;
  }

  try {
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;

    if (!user) {
      document.body.classList.add("student-surface");
      return;
    }

    const role = await fetchUserRole(sb, user.id);
    if (!role || !TEACHER_ROLES.includes(role)) {
      document.body.classList.add("student-surface");
    }
  } catch (error) {
    console.warn("[Exam] Surface theme not applied", error);
    document.body.classList.add("student-surface");
  }
}

async function setupExamHomeLink() {
  const btn = document.getElementById("examHomeBtn");
  if (!btn) return;

  try {
    const sb = await getClient();
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const role = await fetchUserRole(sb, user.id);
    if (!role) return;

    if (inspectModeRequested && TEACHER_ROLES.includes(role)) {
      btn.href = resolveAppPath("teacher-student-preview.html");
      btn.textContent = "← Student preview";
    } else if (isActingAsLinkedStudent()) {
      btn.href = resolveAppPath("student-dashboard.html");
      btn.textContent = "← My learning";
    } else {
      btn.href = resolveAppPath(getHomePathForRole(role));
      btn.textContent = role === "student" ? "← Dashboard" : "← Home";
    }
    btn.classList.remove("hidden");
  } catch (error) {
    console.warn("[Exam] Home link not available", error);
  }
}

async function loadExam(){

  console.log("Exam loading started");
  showLoading();

  try{

    const exam = await fetchExamSession(examId);

    const sb = await getClient();
    await applyExamSurfaceTheme(sb);
    await setupExamHomeLink();

    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id ?? null;

    if (inspectModeRequested) {
      if (!userId) {
        throw new Error("Sign in to inspect this exam.");
      }

      const canInspect = await resolveInspectAccess(sb, exam, userId);
      if (!canInspect) {
        throw new Error(
          "Inspect mode is only available to the exam owner or an admin."
        );
      }

      isInspectSession = true;
    } else if (userId) {
      const actingStudentId = (await resolveActingStudentIdAsync(sb)) ?? userId;
      await assertExamSeriesUnlocked(sb, exam, actingStudentId);
    }

    console.log("Exam fetch result:", exam);

    /* ---------- BASIC EXAM INFO ---------- */

    window.examTitle = exam.title || "Exam";
    window.examLogo = exam.logo_url || "";
    window.examDuration = exam.duration || 1800;

    const logoEl = document.getElementById("examLogo");
    if(window.examLogo && logoEl){
      logoEl.src = window.examLogo;
      logoEl.style.display = "block";
    }

    const titleEl = document.getElementById("examTitle");
    if(titleEl){
      titleEl.textContent = window.examTitle;
    }

    /* ---------- EXTRACT QUESTIONS ---------- */

    let questions = extractRawQuestions(exam.schema_json || {});

    if(!questions.length){
      throw new Error("No questions found in exam");
    }

    const overviewTopics = collectTopicsFromRawQuestions(questions);

    /* ---------- NORMALIZE (CORE STEP) ---------- */

    window.examQuestionsRaw = questions.map(normalizeQuestion);

    /* ---------- STORE ORIGINAL ---------- */
    window.examQuestions = questions;

    setupAssistanceMaskUi();

    renderExamOverview(exam, overviewTopics);
    await setupOverviewNameField();

    if (exam.duration && !isInspectSession) {
      document.getElementById("examTimer").textContent =
        formatTimerPreview(exam.duration);
      document.getElementById("examTimer")?.classList.add("hidden");
    } else if (isInspectSession) {
      document.getElementById("examTimer")?.classList.add("hidden");
    }

    renderQuiz(getQuestionsForDisplay());
    bindReviewModal();

    if (!isInspectSession && (await restoreCompletedExamState())) {
      return;
    }

    const resumeInProgress =
      !isInspectSession &&
      attemptState.status === "in_progress" &&
      attemptState.startedAt;

    if (resumeInProgress) {
      navigationMode = resolveNavigationModeFromAttempt();
      syncNavigationModePicker(navigationMode);
      const studentName = await resolveStudentName();
      if (studentName) {
        localStorage.setItem("studentName", studentName);
      }
      beginExamSession(window.examDuration);
      return;
    }

    showOverview();

    const startBtn = document.getElementById("startExamBtn");
    if (isInspectSession && startBtn) {
      startBtn.textContent = "Start preview";
      document.getElementById("overviewNameRow")?.classList.add("hidden");
    }

    startBtn?.addEventListener("click", async () => {
      if (isInspectSession) {
        lockNavigationMode(getSelectedNavigationMode());
        beginInspectSession();
        return;
      }

      const studentName = await resolveStudentName();

      if (!studentName) {
        alert("Please enter your name");
        return;
      }

      localStorage.setItem("studentName", studentName);
      lockNavigationMode(getSelectedNavigationMode());
      beginExamSession(window.examDuration);
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

  const assistanceHint = assistanceMaskEnabled
    ? `<div class="exam-assistance-active-hint">Malayalam help on</div>`
    : "";

  return `
    <div class="question-card" data-question-index="${index + 1}">

      <div class="q-number">
        Q${index + 1}
      </div>
      ${assistanceHint}

     <div class="question-text prepos-text">
  ${escapeHTML(stripLeadingNumber(q.text || "", index + 1))}
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

      if (!isInspectSession) {
        localStorage.setItem(
          ATTEMPT_KEY,
          JSON.stringify(attemptState)
        );
      }

      updateExamProgress();
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

  updateExamProgress();
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

  if (isInspectSession) return;
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

  const elapsed = attemptState.startedAt
    ? Math.floor((Date.now() - attemptState.startedAt) / 1000)
    : 0;
  const time_taken = Math.min(elapsed, attemptState.duration || window.examDuration || 1800);

  const bankAnswers = answers.filter(a => a.question_id);

try{

  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser()
  const user = userData?.user
  const actingStudentId = user ? await resolveActingStudentIdAsync(sb) : null;
  const canonicalStudentId = actingStudentId ?? user?.id ?? null;

  const useCanonical =
    canonicalStudentId &&
    await canSubmitCanonicalAttempt(sb, examId, canonicalStudentId);

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
          student_id: canonicalStudentId,
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

  if (useCanonical) {
    import("./core/activity-log.js")
      .then(({ logActivity, ACTIVITY_EVENTS }) => {
        logActivity(ACTIVITY_EVENTS.EXAM_SUBMITTED, {
          resourceType: "exam",
          resourceId: examId || null,
          metadata: {
            examTitle: window.examTitle || null,
            score,
            questionCount: answers.length,
            timeTaken: time_taken,
          },
        });
      })
      .catch(() => {});
  }

  const submissionMode = useCanonical ? "canonical" : "public";

    /* ---------- lock ---------- */
    attemptState.status = "submitted";
    attemptState.score = score;
    attemptState.total = answers.length;
    attemptState.answers = answers;
    attemptState.studentName = studentName;
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attemptState));

    /* ---------- analytics (disabled via analytics-config.js) ---------- */
    if (PREPOS_ANALYTICS_ENABLED) {
      const { runExamSubmissionAnalyticsWithHistory, buildAttemptRecord } =
        await import("./analytics/analytics-submission.js");

      const attemptRecord = buildAttemptRecord({
        examId,
        attemptId,
        studentName,
        studentId: useCanonical ? canonicalStudentId : null,
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

    hideActiveExamChrome();

    document.querySelectorAll('input[type="radio"]')
      .forEach(el=>el.disabled=true);

    /* ---------- build review ---------- */
   window.reviewData =
  window.examQuestionsRaw.map((q, i) => buildReviewEntry(q, answers[i]));

    renderExamResults(score, answers, studentName);

    scrollToResult();

    bindResultsReviewActions();

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
  ${escapeHTML(stripLeadingNumber(q.question, index + 1))}
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

document.addEventListener("DOMContentLoaded", () => {
  bindStepNavigation();
  bindNavigationModePicker();
  document
    .getElementById("examNavModeToggle")
    ?.addEventListener("click", toggleNavigationMode);
  loadExam();
});