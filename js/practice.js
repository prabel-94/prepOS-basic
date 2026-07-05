import { runGenerator } from "./generator-core.js";
import { getClient } from "./core/get-client.js";
import { bootPage } from "./core/page-boot.js";
import { resolveAppPath } from "./core/access.js";
import {
  resolveActingStudentId,
  isLinkedStudentMode,
} from "./core/learner-context.js";
import { normalizeTopicKey } from "./student/student-intelligence.js";
import { submitPracticeBankSession } from "./analytics/analytics-submission.js";
import { loadTopicQuestionProgress, loadQuestionKnowledgeContext } from "./practice/topic-progress-service.js";
import {
  sortQuestionsByFocusGaps,
  countNewlyMasteredQuestions,
  buildQuestionStateById,
} from "./analytics/topic-question-progress.js";
import {
  upsertBankQuestionStat,
  applyPersistedStatLocally,
} from "./practice/question-stats.js";
import {
  hideTopicProgressPanel,
  renderTopicProgressLoading,
  renderTopicProgressPanel,
} from "./practice/topic-progress-ui.js";
import { DEFAULT_LEXICON_TOPIC } from "./generators/shared/lexicon-engine.js";
import {
  examHasMalayalamAssistance,
  hasMalayalamAssistance,
  malayalamAssistanceFromMetadata,
  resolveQuestionDisplay,
  ML_VARIANT_VERIFICATION_KEY,
  ASSISTANCE_LANG_MALAYALAM,
  fetchQuestionMetadataMaps,
  enrichQuestionMalayalamVerification,
  certifyMalayalamVariant,
  revokeMalayalamVariantVerification,
  parseMlVariantVerificationValue,
} from "./core/question-assistance.js";
import { renderDashboardSkeleton } from "./student/student-dashboard-renderer.js";

const subjectSelect = document.getElementById("subjectSelect");
const patternSelect = document.getElementById("patternSelect");
const sessionLimitSelect = document.getElementById("sessionLimitSelect");
const adaptiveToggle = document.getElementById("adaptiveToggle");
const startBtn = document.getElementById("startBtn");
const generatorControls = document.getElementById("generatorControls");
const bankControls = document.getElementById("bankControls");
const bankTopicSelect = document.getElementById("bankTopicSelect");
const bankOrderSelect = document.getElementById("bankOrderSelect");
const modeButtons = document.querySelectorAll(".practice-mode-card");

const practiceArea = document.getElementById("practiceArea");
const questionCard = document.getElementById("questionCard");
const questionPrompt = document.getElementById("questionPrompt");
const optionsContainer = document.getElementById("optionsContainer");
const practiceOptionShield = document.getElementById("practiceOptionShield");
const practiceOptionShieldText = document.getElementById("practiceOptionShieldText");
const feedback = document.getElementById("feedback");
const feedbackVerdict = document.getElementById("feedbackVerdict");
const feedbackExplanation = document.getElementById("feedbackExplanation");
const nextBtn = document.getElementById("nextBtn");
const practiceStatus = document.getElementById("practiceStatus");
const practiceProgress = document.getElementById("practiceProgress");
const practiceProgressBar = document.getElementById("practiceProgressBar");
const practiceProgressFill = document.getElementById("practiceProgressFill");
const sessionSummary = document.getElementById("sessionSummary");
const practiceSetup = document.getElementById("practiceSetup");
const practiceSessionStrip = document.getElementById("practiceSessionStrip");
const practiceAssistanceToggle = document.getElementById("practiceAssistanceToggle");
const topicProgressPanel = document.getElementById("topicProgressPanel");

const LEXICON_EXPLANATION_LABELS = {
  why: "എന്തുകൊണ്ട്",
  sameGroup: "ഇതേ കൂട്ടം",
  oppositeGroup: "വിരുദ്ധ കൂട്ടം",
};

const PATTERN_LABELS = {
  SYNONYM: { ml: "പര്യായം", en: "Synonym" },
  OPPOSITE_WORD: { ml: "വിരുദ്ധം", en: "Opposite" },
};

startBtn.disabled = true;

let practiceRuntime = null;
let topicProgressRequestId = 0;

const state = {
  currentQuestion: null,
  loading: false,
  answeredCount: 0,
  correctCount: 0,
  sessionLimit: 10,
  started: false,
  mode: "generator",
  bankQuestions: [],
  bankCursor: 0,
  assistanceMaskEnabled: false,
  questionMaskOverrides: new Map(),
  currentAnswer: null,
  optionGateId: 0,
  optionGateOpen: false,
  sessionAnswers: [],
  sessionStartedAt: null,
  knowledgeContext: null,
  questionStateAtSessionStart: null,
};

const OPTION_GATE_MIN_MS = 320;
const OPTION_GATE_MAX_MS = 1000;
const OPTION_TAP_MOVE_THRESHOLD_PX = 10;
const OPTION_TAP_MAX_MS = 450;

let pointerIsDown = false;
let optionTouchTap = null;
let suppressOptionClick = false;

function trackPracticePointerState() {
  window.addEventListener("pointerdown", () => {
    pointerIsDown = true;
  });

  window.addEventListener("pointerup", () => {
    pointerIsDown = false;
  });

  window.addEventListener("pointercancel", () => {
    pointerIsDown = false;
  });
}

/* =========================================
Init
========================================= */

async function applyPracticeTopicFromUrl() {
  const topicParam = new URLSearchParams(window.location.search).get("topic");
  if (!topicParam) {
    return;
  }

  const key = normalizeTopicKey(topicParam);
  const match = [...bankTopicSelect.options].find(option => {
    if (!option.value) {
      return false;
    }

    const label = option.text.replace(/\s+\(\d+\)$/, "");
    return normalizeTopicKey(label) === key;
  });

  if (!match) {
    setStatus(
      `Topic "${topicParam}" was not found. Choose a topic from the bank list.`,
      true
    );
    return;
  }

  setPracticeMode("bank");
  bankTopicSelect.value = match.value;
  bankOrderSelect.value = "focus_gaps";
  setStatus(
    `Practice focus: ${match.text.replace(/\s+\(\d+\)$/, "")}`
  );
}

async function init() {
  const runtime = await bootPage({
    roles: ["teacher", "admin", "student"],
    allowLinkedStudentMode: true,
    nav: {
      title: "Practice",
      subtitle: "Generator and question bank modes",
    },
  });

  if (!runtime) return;

  practiceRuntime = runtime;

  const sb = await getClient();

  const { data } = await sb.auth.getUser();
  window.currentUser = data?.user || null;
  window.actingStudentId = resolveActingStudentId(runtime);

  const { mountStudentModeNav } = await import("./teacher/linked-learner-ui.js");
  await mountStudentModeNav(runtime);

  await loadBankTopics();
  initPracticeAssistanceToggle();
  await applyPracticeTopicFromUrl();
  await refreshTopicProgressPanel();
  bindOptionSelection();
  trackPracticePointerState();
  renderPracticePersistenceNotice();
  startBtn.disabled = false;
}

init().catch(error => {
  console.error("Practice init failed:", error);
  setStatus("Unable to start practice right now.", true);
});

/* =========================================
Helpers
========================================= */

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeOptionId(value = "") {
  return String(value ?? "").trim().toUpperCase();
}

function stripLeadingOptionLabel(text = "") {
  return String(text)
    .replace(/^[A-Da-d][\).\:\-]\s*/, "")
    .trim();
}

function renderExplanationSection(label, body) {
  if (!body) {
    return "";
  }

  return `
    <div class="practice-explanation-section">
      <div class="practice-explanation-label">${escapeHTML(label)}</div>
      <div class="practice-explanation-body prepos-text">${escapeHTML(body)}</div>
    </div>
  `;
}

function renderWordChipList(words = []) {
  if (!words.length) {
    return "";
  }

  return `
    <div class="practice-word-chips">
      ${words.map((word) => `<span class="practice-word-chip prepos-text">${escapeHTML(word)}</span>`).join("")}
    </div>
  `;
}

function renderLexiconExplanationHtml(meta = {}, { isCorrect = false } = {}) {
  if (!meta?.pattern) {
    return "";
  }

  if (isCorrect) {
    const lines = [meta.compact || meta.why].filter(Boolean);

    return `
      <div class="practice-explanation practice-explanation--compact">
        ${lines.map((line) => `<div class="practice-explanation-body prepos-text">${escapeHTML(line)}</div>`).join("")}
        ${
          meta.pattern === "SYNONYM" && meta.siblings?.length
            ? `
              <div class="practice-explanation-section mt-10">
                <div class="practice-explanation-label">${escapeHTML(LEXICON_EXPLANATION_LABELS.sameGroup)}</div>
                ${renderWordChipList(meta.siblings)}
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  const sections = [renderExplanationSection(LEXICON_EXPLANATION_LABELS.why, meta.why)];

  if (meta.pattern === "SYNONYM" && meta.siblings?.length) {
    sections.push(`
      <div class="practice-explanation-section">
        <div class="practice-explanation-label">${escapeHTML(LEXICON_EXPLANATION_LABELS.sameGroup)}</div>
        ${renderWordChipList(meta.siblings)}
      </div>
    `);
  }

  if (meta.pattern === "OPPOSITE_WORD" && meta.relatedWords?.length) {
    sections.push(`
      <div class="practice-explanation-section">
        <div class="practice-explanation-label">${escapeHTML(LEXICON_EXPLANATION_LABELS.oppositeGroup)}</div>
        ${renderWordChipList(meta.relatedWords)}
      </div>
    `);
  }

  return `
    <div class="practice-explanation">
      ${sections.filter(Boolean).join("")}
    </div>
  `;
}

function renderPracticeExplanationHtml(question, { isCorrect = false } = {}) {
  if (question?.explanationMeta?.pattern) {
    return renderLexiconExplanationHtml(question.explanationMeta, { isCorrect });
  }

  const display = getQuestionDisplay(question);
  if (!display.explanation) {
    return "";
  }

  return `
    <div class="practice-explanation">
      ${renderExplanationSection("Explanation", display.explanation)}
    </div>
  `;
}

function clearPracticeFeedback() {
  if (feedbackVerdict) {
    feedbackVerdict.innerHTML = "";
    feedbackVerdict.classList.add("hidden");
  }

  if (feedbackExplanation) {
    feedbackExplanation.innerHTML = "";
    feedbackExplanation.classList.add("hidden");
  }
}

function renderPracticeFeedbackVerdict({ isCorrect, correct, correctOptionText }) {
  const className = isCorrect
    ? "practice-feedback-card practice-feedback-card--correct"
    : "practice-feedback-card practice-feedback-card--wrong";

  if (isCorrect) {
    return `
      <div class="${className}" role="status">
        <div class="practice-feedback-title">Correct</div>
      </div>
    `;
  }

  return `
    <div class="${className}" role="status">
      <div class="practice-feedback-title">Wrong</div>
      <div class="practice-feedback-answer">
        Correct answer:
        <strong class="prepos-text">${escapeHTML(correct)}. ${escapeHTML(correctOptionText || "")}</strong>
      </div>
    </div>
  `;
}

function getQuestionPositionLabel() {
  const nextQuestionNumber =
    state.sessionLimit === Infinity
      ? state.answeredCount + 1
      : Math.min(state.answeredCount + 1, state.sessionLimit);

  if (state.sessionLimit === Infinity) {
    return `Question ${nextQuestionNumber}`;
  }

  return `Question ${nextQuestionNumber} of ${state.sessionLimit}`;
}

function getPatternBadgeHtml(question) {
  const pattern = question?.primary_pattern || question?.explanationMeta?.pattern;
  if (!pattern || !PATTERN_LABELS[pattern]) {
    return "";
  }

  const useMalayalam =
    state.mode === "generator" && subjectSelect.value === "malayalam";
  const label = useMalayalam
    ? PATTERN_LABELS[pattern].ml
    : PATTERN_LABELS[pattern].en;

  return `<span class="student-status-badge student-status-badge--ready practice-pattern-badge">${escapeHTML(label)}</span>`;
}

function showPracticeSetup() {
  practiceSetup?.classList.remove("hidden");
  practiceSessionStrip?.classList.add("hidden");
}

function showPracticeSession() {
  practiceSetup?.classList.add("hidden");
  practiceSessionStrip?.classList.remove("hidden");
}

function isPracticeFeedbackVisible() {
  if (!feedback || feedback.classList.contains("hidden")) {
    return true;
  }

  const rect = feedback.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  return rect.top >= 0 && rect.bottom <= viewportHeight + 2;
}

function scrollPracticeFeedbackIntoView() {
  if (!feedback || isPracticeFeedbackVisible()) {
    return;
  }

  const startY = window.scrollY;
  const rect = feedback.getBoundingClientRect();
  const targetY = Math.max(0, startY + rect.top - 24);
  const distance = targetY - startY;

  if (Math.abs(distance) < 12) {
    return;
  }

  const duration = Math.min(900, Math.max(500, Math.abs(distance) * 1.1));
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = progress * (2 - progress);
    window.scrollTo(0, startY + distance * eased);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function focusPracticeFeedback() {
  requestAnimationFrame(() => {
    if (feedbackVerdict && !feedbackVerdict.classList.contains("hidden")) {
      feedbackVerdict.focus({ preventScroll: true });
    }

    scrollPracticeFeedbackIntoView();
  });
}

function getOptionShieldMessage() {
  if (pointerIsDown) {
    return "Release to continue";
  }

  return "Choose an answer";
}

function closeOptionGate() {
  state.optionGateId += 1;
  state.optionGateOpen = false;
  questionCard?.classList.remove("practice-question-card--gated");
  practiceOptionShield?.classList.add("hidden");
  practiceOptionShield?.setAttribute("aria-hidden", "true");
  optionsContainer?.classList.remove("practice-options--ready");
}

function updateOptionShieldMessage() {
  if (!practiceOptionShieldText) {
    return;
  }

  practiceOptionShieldText.textContent = getOptionShieldMessage();
}

function beginOptionGate() {
  const gateId = ++state.optionGateId;
  state.optionGateOpen = false;

  questionCard?.classList.add("practice-question-card--gated");
  optionsContainer?.classList.remove("practice-options--ready");

  if (practiceOptionShield) {
    updateOptionShieldMessage();
    practiceOptionShield.classList.remove("hidden");
    practiceOptionShield.setAttribute("aria-hidden", "false");
  }

  const gateStartedAt = performance.now();

  const tryOpenGate = () => {
    if (gateId !== state.optionGateId || state.optionGateOpen) {
      return;
    }

    const elapsed = performance.now() - gateStartedAt;
    const pointerClear = !pointerIsDown;
    const minDelayMet = elapsed >= OPTION_GATE_MIN_MS;

    if (!minDelayMet || !pointerClear) {
      updateOptionShieldMessage();
      requestAnimationFrame(tryOpenGate);
      return;
    }

    state.optionGateOpen = true;
    questionCard?.classList.remove("practice-question-card--gated");
    practiceOptionShield?.classList.add("hidden");
    practiceOptionShield?.setAttribute("aria-hidden", "true");
    optionsContainer?.classList.add("practice-options--ready");

    window.setTimeout(() => {
      optionsContainer?.classList.remove("practice-options--ready");
    }, 450);
  };

  requestAnimationFrame(tryOpenGate);

  window.setTimeout(() => {
    if (gateId !== state.optionGateId || state.optionGateOpen) {
      return;
    }

    state.optionGateOpen = true;
    questionCard?.classList.remove("practice-question-card--gated");
    practiceOptionShield?.classList.add("hidden");
    practiceOptionShield?.setAttribute("aria-hidden", "true");
    optionsContainer?.classList.add("practice-options--ready");

    window.setTimeout(() => {
      optionsContainer?.classList.remove("practice-options--ready");
    }, 450);
  }, OPTION_GATE_MAX_MS);
}

function getSessionLimit() {
  const value = Number(sessionLimitSelect.value || 0);
  return value > 0 ? value : Infinity;
}

function getModeLabel() {
  if (state.mode !== "bank") {
    return "Generator";
  }

  const selectedTopic =
    bankTopicSelect.options[bankTopicSelect.selectedIndex]?.text || "";

  return bankTopicSelect.value
    ? `Question Bank | ${selectedTopic.replace(/\s+\(\d+\)$/, "")}`
    : "Question Bank";
}

function setStatus(message = "", isError = false) {
  if (!message) {
    practiceStatus.textContent = "";
    practiceStatus.classList.add("hidden");
    practiceStatus.classList.remove("error");
    return;
  }

  practiceStatus.textContent = message;
  practiceStatus.classList.remove("hidden");
  practiceStatus.classList.toggle("error", isError);
}

function updateProgress() {
  if (!state.started) {
    practiceProgress.textContent = "";
    practiceProgress.classList.add("hidden");
    practiceProgressBar?.classList.add("hidden");
    return;
  }

  practiceProgress.textContent =
    state.currentQuestion
      ? `${getModeLabel()} · ${getQuestionPositionLabel()} · ${state.correctCount}/${state.answeredCount} correct`
      : `${getModeLabel()} · Answered ${state.answeredCount}${state.sessionLimit === Infinity ? "" : ` of ${state.sessionLimit}`} · ${state.correctCount}/${state.answeredCount} correct`;

  practiceProgress.classList.remove("hidden");

  if (practiceProgressBar && practiceProgressFill) {
    if (state.sessionLimit === Infinity) {
      practiceProgressBar.classList.add("hidden");
      return;
    }

    const pct = Math.min(
      100,
      Math.round((state.answeredCount / state.sessionLimit) * 100)
    );

    practiceProgressFill.style.width = `${pct}%`;
    practiceProgressBar.setAttribute("aria-valuenow", String(pct));
    practiceProgressBar.classList.remove("hidden");
  }
}

function setLoading(isLoading, label = "Generating question...") {
  state.loading = isLoading;
  startBtn.disabled = isLoading;
  nextBtn.disabled = isLoading;
  modeButtons.forEach(button => {
    button.disabled = isLoading;
  });
  patternSelect.disabled = isLoading;
  subjectSelect.disabled = isLoading;
  bankTopicSelect.disabled = isLoading;
  bankOrderSelect.disabled = isLoading;
  sessionLimitSelect.disabled = isLoading;
  adaptiveToggle.disabled = isLoading;
  startBtn.innerText = isLoading ? "Loading..." : "Start Practice";

  if (isLoading) {
    renderDashboardSkeleton(questionPrompt, { rows: 1 });
    setStatus(label, false);
  } else {
    if (practiceStatus.textContent === label) {
      setStatus("");
    }
  }
}

function getFriendlyError(error) {
  if (error?.message) {
    return error.message;
  }

  return "No question could be generated right now.";
}

function getEmptyBankMessage() {
  const topicLabel =
    bankTopicSelect.options[bankTopicSelect.selectedIndex]?.text?.replace(
      /\s+\(\d+\)$/,
      ""
    ) || "";

  if (bankTopicSelect.value && topicLabel) {
    return `No saved questions are available for "${topicLabel}" yet. Try All Topics or switch to Generator mode.`;
  }

  return "No saved question bank questions are available yet. Try Generator mode, or ask your teacher to add bank questions.";
}

function showBankUnavailable(message) {
  if (questionPrompt) {
    questionPrompt.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
  optionsContainer.innerHTML = "";
  clearPracticeFeedback();
  closeOptionGate();
  nextBtn.classList.add("hidden");
  setStatus(message, true);
  updateProgress();
}

function resetSession() {
  state.currentQuestion = null;
  state.loading = false;
  state.answeredCount = 0;
  state.correctCount = 0;
  state.sessionLimit = getSessionLimit();
  state.started = true;
  state.sessionAnswers = [];
  state.sessionStartedAt = Date.now();
  state.questionStateAtSessionStart = state.knowledgeContext?.questionStateById
    ? new Map(state.knowledgeContext.questionStateById)
    : new Map();

  clearPracticeFeedback();
  closeOptionGate();
  if (questionPrompt) {
    questionPrompt.innerHTML = "";
  }
  optionsContainer.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.innerHTML = "";
  sessionSummary.classList.add("hidden");
  resetPracticeAssistanceDefaults();
  state.currentAnswer = null;

  import("./core/activity-log.js")
    .then(({ logActivity, ACTIVITY_EVENTS }) => {
      const topicLabel =
        bankTopicSelect?.options?.[bankTopicSelect.selectedIndex]?.text?.replace(
          /\s+\(\d+\)$/,
          ""
        ) || null;

      logActivity(ACTIVITY_EVENTS.PRACTICE_STARTED, {
        resourceType: "practice",
        resourceId: bankTopicSelect?.value || null,
        metadata: {
          mode: state.mode,
          topicName: topicLabel,
          sessionLimit:
            state.sessionLimit === Infinity ? 0 : state.sessionLimit,
        },
      });
    })
    .catch(() => {});

  updateProgress();
}

function syncKnowledgeContextFromProgress(progress = null) {
  if (!progress?.questionStateById) {
    return;
  }

  state.knowledgeContext = {
    knowledgeAttempts: progress.knowledgeAttempts ?? [],
    examAttempts: progress.examAttempts ?? [],
    questions: progress.questions ?? [],
    questionStateById: progress.questionStateById,
    persistedStatsById: progress.persistedStatsById ?? new Map(),
    topicId: progress.topicId ?? null,
  };
}

function rebuildKnowledgeContextQuestionStates(questionIds = []) {
  const context = state.knowledgeContext;

  if (!context) {
    return;
  }

  const ids =
    questionIds.length > 0
      ? questionIds
      : state.bankQuestions.map(question => question.id).filter(Boolean);

  if (!ids.length) {
    return;
  }

  context.questionStateById = buildQuestionStateById({
    questionIds: ids,
    knowledgeAttempts: context.knowledgeAttempts ?? [],
    examAttempts: context.examAttempts ?? [],
    questions: context.questions ?? [],
    persistedStatsById: context.persistedStatsById ?? new Map(),
  });
}

function getPracticeStudentId() {
  return (
    window.actingStudentId ??
    resolveActingStudentId(practiceRuntime) ??
    window.currentUser?.id ??
    null
  );
}

function canPersistPracticeStats() {
  if (practiceRuntime?.role === "student") {
    return Boolean(getPracticeStudentId());
  }

  return isLinkedStudentMode(practiceRuntime);
}

function renderPracticePersistenceNotice() {
  if (!practiceRuntime) {
    return;
  }

  if (!canPersistPracticeStats()) {
    setStatus(
      "Practice is not saving to a student profile. Log in as a student, or switch to My Learning mode on Teacher Home.",
      true
    );
    return;
  }

  if (state.mode === "generator") {
    setStatus(
      "Generator mode saves Malayalam word stats only. Use Question Bank mode for dashboard learning analytics.",
      false
    );
    return;
  }

  setStatus("");
}

async function updateBankQuestionStat(questionId, isCorrect) {
  if (!canPersistPracticeStats()) {
    return;
  }

  const userId = getPracticeStudentId();
  if (!userId || !questionId) {
    return;
  }

  const row = await upsertBankQuestionStat({
    userId,
    questionId,
    isCorrect,
  });

  if (!row || !state.knowledgeContext) {
    return;
  }

  state.knowledgeContext.persistedStatsById = applyPersistedStatLocally(
    state.knowledgeContext.persistedStatsById ?? new Map(),
    row
  );
  rebuildKnowledgeContextQuestionStates([questionId]);
}

async function ensureBankKnowledgeContext(questionIds = []) {
  const userId = getPracticeStudentId();
  const topicId = bankTopicSelect.value || null;

  if (!userId || !questionIds.length) {
    state.knowledgeContext = {
      knowledgeAttempts: [],
      questions: [],
      questionStateById: new Map(),
      topicId,
    };
    return;
  }

  if (
    topicId &&
    state.knowledgeContext?.topicId === topicId
  ) {
    return;
  }

  const sb = await getClient();

  if (topicId) {
    const topicName = getSelectedBankTopicLabel();
    const progress = await loadTopicQuestionProgress({
      topicId,
      topicName,
      userId,
      sb,
    });
    syncKnowledgeContextFromProgress(progress);
    return;
  }

  state.knowledgeContext = {
    topicId: null,
    ...(await loadQuestionKnowledgeContext({
      userId,
      questionIds,
      sb,
    })),
  };
}

function getEffectiveQuestionStates() {
  return new Map(state.knowledgeContext?.questionStateById ?? []);
}

function orderBankQuestions(questions = []) {
  const order = bankOrderSelect.value;

  if (order === "latest") {
    return questions;
  }

  if (order === "focus_gaps") {
    return sortQuestionsByFocusGaps(
      questions,
      state.knowledgeContext?.questionStateById ?? new Map()
    );
  }

  return shuffleQuestions(questions);
}

function getSelectedBankTopicLabel() {
  return (
    bankTopicSelect.options[bankTopicSelect.selectedIndex]?.text?.replace(
      /\s+\(\d+\)$/,
      ""
    ) || ""
  );
}

async function refreshTopicProgressPanel() {
  if (!topicProgressPanel) {
    return;
  }

  if (state.mode !== "bank" || !bankTopicSelect.value) {
    hideTopicProgressPanel(topicProgressPanel);
    return;
  }

  const userId = getPracticeStudentId();
  const topicId = bankTopicSelect.value;
  const topicName = getSelectedBankTopicLabel();

  if (!userId) {
    hideTopicProgressPanel(topicProgressPanel);
    return;
  }

  const requestId = ++topicProgressRequestId;
  renderTopicProgressLoading(topicProgressPanel, topicName);

  try {
    const sb = await getClient();
    const progress = await loadTopicQuestionProgress({
      topicId,
      topicName,
      userId,
      sb,
    });

    if (requestId !== topicProgressRequestId) {
      return;
    }

    renderTopicProgressPanel(topicProgressPanel, progress);
    syncKnowledgeContextFromProgress(progress);
  } catch (error) {
    console.warn("[PrepOS Practice] Topic progress load failed:", error);

    if (requestId !== topicProgressRequestId) {
      return;
    }

    topicProgressPanel.classList.remove("hidden");
    topicProgressPanel.innerHTML = `
      <div class="practice-topic-progress-card practice-topic-progress-card--empty">
        <div class="practice-topic-progress-kicker">Question bank progress</div>
        <div class="practice-topic-progress-title">${escapeHTML(topicName)}</div>
        <div class="text-muted mt-10">Could not load your topic progress right now.</div>
      </div>
    `;
  }
}

function setPracticeMode(mode) {
  state.mode = mode;

  modeButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  generatorControls.classList.toggle("hidden", mode !== "generator");
  bankControls.classList.toggle("hidden", mode !== "bank");

  practiceArea.classList.add("hidden");
  state.started = false;
  state.currentQuestion = null;
  clearPracticeFeedback();
  closeOptionGate();
  if (questionPrompt) {
    questionPrompt.innerHTML = "";
  }
  optionsContainer.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.classList.add("hidden");
  showPracticeSetup();
  updateProgress();
  syncPracticeAssistanceToggleVisibility();
  refreshTopicProgressPanel();
  renderPracticePersistenceNotice();
}

function shuffleQuestions(questions) {
  const shuffled = [...questions];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function normalizeBankQuestion(row, metadata = {}) {
  const rawOptions = [
    { id: "A", text: String(row.option_a || "").trim() },
    { id: "B", text: String(row.option_b || "").trim() },
    { id: "C", text: String(row.option_c || "").trim() },
    { id: "D", text: String(row.option_d || "").trim() },
  ];

  const options = rawOptions.filter((option) => option.text);
  let correct = normalizeOptionId(row.correct_option || "A");

  if (!options.some((option) => option.id === correct)) {
    const intended = rawOptions.find((option) => option.id === correct);
    const match = intended?.text
      ? options.find((option) => option.text === intended.text)
      : null;

    if (match) {
      correct = match.id;
    }
  }

  const question = {
    id: row.id,
    source: "bank",
    text: row.question_text || "",
    options,
    correct,
    explanation: row.explanation || "",
  };

  const assistancePatch = malayalamAssistanceFromMetadata(
    metadata[ASSISTANCE_LANG_MALAYALAM] ?? metadata.assistance_malayalam ?? null
  );
  if (assistancePatch) {
    Object.assign(question, assistancePatch);
  }

  const verificationRecord = parseMlVariantVerificationValue(
    metadata[ML_VARIANT_VERIFICATION_KEY] ?? null
  );
  if (verificationRecord) {
    question.mlVerificationRecord = verificationRecord;
  }

  return question;
}

function canReviewMalayalamMasks() {
  const role = practiceRuntime?.role;
  return role === "teacher" || role === "admin";
}

function syncBankQuestionVerificationState(sourceQuestion) {
  if (!sourceQuestion?.id) {
    return;
  }

  const bankQuestion = state.bankQuestions.find(
    (entry) => entry.id === sourceQuestion.id
  );
  if (!bankQuestion) {
    return;
  }

  bankQuestion.mlVerificationRecord = sourceQuestion.mlVerificationRecord;
  bankQuestion._mlHasContent = sourceQuestion._mlHasContent;
  bankQuestion._mlVerified = sourceQuestion._mlVerified;
  bankQuestion._mlNeedsReview = sourceQuestion._mlNeedsReview;
}

function renderMalayalamVerificationBar(question) {
  if (!canReviewMalayalamMasks() || state.mode !== "bank") {
    return "";
  }

  const hasMl =
    question._mlHasContent ?? hasMalayalamAssistance(question);
  if (!hasMl) {
    return "";
  }

  const verified = Boolean(question._mlVerified);
  const needsReview = Boolean(question._mlNeedsReview);
  const hasStaleRecord = Boolean(question.mlVerificationRecord?.content_hash);

  let badgeClass = "practice-ml-verify-badge--pending";
  let badgeText = "ML unverified";

  if (verified) {
    badgeClass = "practice-ml-verify-badge--verified";
    badgeText = "ML verified";
  } else if (needsReview && hasStaleRecord) {
    badgeClass = "practice-ml-verify-badge--stale";
    badgeText = "ML needs re-review";
  }

  const qbHref = resolveAppPath("qb-manager.html");
  const actionButton = verified
    ? `<button type="button" class="secondary-btn practice-ml-revoke-btn" data-question-id="${escapeHTML(question.id)}">Revoke verification</button>`
    : `<button type="button" class="primary-btn practice-ml-certify-btn" data-question-id="${escapeHTML(question.id)}">Mark Malayalam verified</button>`;

  return `
    <div class="practice-ml-verify-bar">
      <span class="practice-ml-verify-badge ${badgeClass}">${escapeHTML(badgeText)}</span>
      <div class="practice-ml-verify-actions">
        ${actionButton}
        <a
          href="${escapeHTML(qbHref)}"
          class="secondary-btn practice-ml-qb-link"
          target="_blank"
          rel="noopener noreferrer"
        >Edit in Question Bank</a>
      </div>
    </div>
  `;
}

function bindMalayalamVerificationActions(question) {
  const certifyBtn = questionPrompt?.querySelector(".practice-ml-certify-btn");
  const revokeBtn = questionPrompt?.querySelector(".practice-ml-revoke-btn");

  certifyBtn?.addEventListener("click", () => {
    handlePracticeCertifyMalayalam(question).catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not verify Malayalam mask", true);
    });
  });

  revokeBtn?.addEventListener("click", () => {
    handlePracticeRevokeMalayalam(question).catch((error) => {
      console.error(error);
      setStatus(error.message || "Could not revoke verification", true);
    });
  });
}

async function handlePracticeCertifyMalayalam(question) {
  if (!question?.id) {
    return;
  }

  const sb = await getClient();
  await certifyMalayalamVariant(sb, question);
  syncBankQuestionVerificationState(question);
  refreshCurrentQuestionDisplay();
  setStatus("Malayalam mask marked as verified.");
}

async function handlePracticeRevokeMalayalam(question) {
  if (!question?.id) {
    return;
  }

  const sb = await getClient();
  await revokeMalayalamVariantVerification(sb, question.id, question);
  syncBankQuestionVerificationState(question);
  refreshCurrentQuestionDisplay();
  setStatus("Malayalam verification revoked.");
}

function isMaskEnabledForQuestion(question) {
  if (!question?.id) {
    return state.assistanceMaskEnabled;
  }

  if (state.questionMaskOverrides.has(question.id)) {
    return state.questionMaskOverrides.get(question.id);
  }

  return state.assistanceMaskEnabled;
}

function getQuestionDisplay(question) {
  return resolveQuestionDisplay(question, isMaskEnabledForQuestion(question));
}

function updatePracticeAssistanceToggleUi() {
  if (!practiceAssistanceToggle) {
    return;
  }

  practiceAssistanceToggle.setAttribute(
    "aria-pressed",
    String(state.assistanceMaskEnabled)
  );
  practiceAssistanceToggle.classList.toggle(
    "exam-assistance-toggle--active",
    state.assistanceMaskEnabled
  );
  practiceAssistanceToggle.textContent = state.assistanceMaskEnabled
    ? "മലയാളം: ON"
    : "മലയാളം";
}

function syncPracticeAssistanceToggleVisibility() {
  if (!practiceAssistanceToggle) {
    return;
  }

  const showToggle =
    state.mode === "bank" &&
    examHasMalayalamAssistance(state.bankQuestions);

  practiceAssistanceToggle.classList.toggle("hidden", !showToggle);

  if (!showToggle) {
    return;
  }

  updatePracticeAssistanceToggleUi();
}

function setPracticeAssistanceMaskEnabled(enabled) {
  state.assistanceMaskEnabled = Boolean(enabled);
  updatePracticeAssistanceToggleUi();

  if (state.currentQuestion && state.started) {
    refreshCurrentQuestionDisplay();
  }
}

function toggleQuestionMask(question) {
  if (!question?.id || !hasMalayalamAssistance(question)) {
    return;
  }

  state.questionMaskOverrides.set(
    question.id,
    !isMaskEnabledForQuestion(question)
  );
  refreshCurrentQuestionDisplay();
}

function refreshCurrentQuestionDisplay() {
  const question = state.currentQuestion;
  if (!question) {
    return;
  }

  const selected = state.currentAnswer?.questionId === question.id
    ? state.currentAnswer.selected
    : null;

  renderQuestion(question);

  if (selected) {
    applyAnswerUi(question, selected);
  }
}

function resetPracticeAssistanceDefaults() {
  state.assistanceMaskEnabled = false;
  state.questionMaskOverrides = new Map();
  updatePracticeAssistanceToggleUi();
}

function initPracticeAssistanceToggle() {
  if (!practiceAssistanceToggle || practiceAssistanceToggle.dataset.bound) {
    return;
  }

  state.assistanceMaskEnabled = false;

  try {
    sessionStorage.removeItem("prepos-practice-assistance-mask");
  } catch {
    /* ignore */
  }

  practiceAssistanceToggle.dataset.bound = "1";
  practiceAssistanceToggle.addEventListener("click", () => {
    setPracticeAssistanceMaskEnabled(!state.assistanceMaskEnabled);
  });
}

async function fetchBankQuestionMetadata(questionIds = []) {
  if (!questionIds.length) {
    return new Map();
  }

  try {
    const sb = await getClient();
    return await fetchQuestionMetadataMaps(sb, questionIds, [
      ASSISTANCE_LANG_MALAYALAM,
      "assistance_malayalam",
      ML_VARIANT_VERIFICATION_KEY,
    ]);
  } catch (error) {
    console.error("Bank question metadata load failed:", error);
    return new Map();
  }
}

async function loadBankTopics() {
  const sb = await getClient();
  const { data, error } = await sb
    .from("question_topics")
    .select(`
      topic_id,
      topics ( id, name )
    `);

  if (error) {
    console.error("Topic load failed:", error);
    setStatus("Topics could not be loaded. Bank practice will still work.", true);
    return;
  }

  const topicMap = new Map();

  (data || []).forEach(row => {
    if (!row.topics) return;

    const current = topicMap.get(row.topic_id) || {
      id: row.topics.id,
      name: row.topics.name,
      count: 0
    };

    current.count += 1;
    topicMap.set(row.topic_id, current);
  });

  const topics = [...topicMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  bankTopicSelect.innerHTML = `
    <option value="">All Topics</option>
    ${topics.map(topic => `
      <option value="${escapeHTML(topic.id)}">
        ${escapeHTML(topic.name)} (${topic.count})
      </option>
    `).join("")}
  `;
}

async function loadBankQuestions() {
  const sb = await getClient();
  let data;
  let error;

  if (bankTopicSelect.value) {
    const response = await sb
      .from("question_topics")
      .select(`
        questions (
          id,
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          correct_option,
          explanation,
          created_at
        )
      `)
      .eq("topic_id", bankTopicSelect.value)
      .limit(200);

    data = (response.data || [])
      .map(row => row.questions)
      .filter(Boolean);
    error = response.error;
  } else {
    const response = await sb
      .from("questions")
      .select("id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    data = response.data || [];
    error = response.error;
  }

  if (error) {
    throw error;
  }

  const assistanceMap = await fetchBankQuestionMetadata(
    data.map((row) => row.id)
  );

  state.bankQuestions = data
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .map((row) => {
      const metadata = assistanceMap.get(row.id) ?? {};
      const normalizedMetadata = {
        [ASSISTANCE_LANG_MALAYALAM]:
          metadata[ASSISTANCE_LANG_MALAYALAM] ?? metadata.assistance_malayalam,
        [ML_VARIANT_VERIFICATION_KEY]: metadata[ML_VARIANT_VERIFICATION_KEY],
      };
      return normalizeBankQuestion(row, normalizedMetadata);
    })
    .filter((question) => question.text && question.options.length >= 2);

  if (canReviewMalayalamMasks()) {
    await Promise.all(
      state.bankQuestions.map((question) =>
        enrichQuestionMalayalamVerification(question)
      )
    );
  }

  const questionIds = state.bankQuestions.map((question) => question.id).filter(Boolean);

  if (bankOrderSelect.value === "focus_gaps") {
    await ensureBankKnowledgeContext(questionIds);
  }

  state.bankQuestions = orderBankQuestions(state.bankQuestions);

  state.bankCursor = 0;
  syncPracticeAssistanceToggleVisibility();
}

function scrollToPracticeQuestion() {
  requestAnimationFrame(() => {
    const target = questionCard?.textContent?.trim()
      ? questionCard
      : practiceArea;

    target?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function getNextBankQuestion() {
  if (!state.bankQuestions.length) {
    return null;
  }

  if (state.bankCursor >= state.bankQuestions.length) {
    if (state.sessionLimit === Infinity) {
      const order = bankOrderSelect.value;

      if (order === "focus_gaps") {
        state.bankQuestions = sortQuestionsByFocusGaps(
          state.bankQuestions,
          getEffectiveQuestionStates()
        );
      } else {
        state.bankQuestions = shuffleQuestions(state.bankQuestions);
      }

      state.bankCursor = 0;
    } else {
      return null;
    }
  }

  const question = state.bankQuestions[state.bankCursor];
  state.bankCursor += 1;
  return question;
}

/* =========================================
Session Controls
========================================= */

startBtn.addEventListener("click", async () => {
  showPracticeSession();
  practiceArea.classList.remove("hidden");
  resetSession();
  if (state.mode === "bank") {
    state.bankQuestions = [];
    state.bankCursor = 0;
  }
  await loadQuestion();
  scrollToPracticeQuestion();
});

nextBtn.addEventListener("click", loadQuestion);

modeButtons.forEach(button => {
  button.addEventListener("click", () => setPracticeMode(button.dataset.mode));
});

[bankTopicSelect, bankOrderSelect].forEach(select => {
  select.addEventListener("change", () => {
    state.bankQuestions = [];
    state.bankCursor = 0;
    refreshTopicProgressPanel();
  });
});

/* =========================================
Question Flow
========================================= */

async function loadQuestion() {
  if (state.loading) return;

  if (state.answeredCount >= state.sessionLimit) {
    await finishSession();
    return;
  }

  clearPracticeFeedback();
  closeOptionGate();
  resetOptionTouchTap();
  nextBtn.classList.add("hidden");
  sessionSummary.classList.add("hidden");
  state.currentQuestion = null;
  state.currentAnswer = null;
  updateProgress();

  const loadingLabel =
    state.mode === "bank" ? "Loading bank question..." : "Generating question...";

  setLoading(true, loadingLabel);

  try {
    if (state.mode === "bank") {
      if (!state.bankQuestions.length) {
        await loadBankQuestions();
      }

      const bankQuestion = getNextBankQuestion();

      if (!bankQuestion) {
        if (state.answeredCount > 0) {
          await finishSession(
            bankTopicSelect.value
              ? "No more questions are available for this topic."
              : "No more bank questions are available in this session."
          );
          return;
        }

        showBankUnavailable(getEmptyBankMessage());
        return;
      }

      state.currentQuestion = bankQuestion;
    } else {
      const result = await runGenerator({
        subject: subjectSelect.value,
        pattern: patternSelect.value,
        adaptive: adaptiveToggle.checked,
        topic: DEFAULT_LEXICON_TOPIC,
      });

      if (!result || !result.length) {
        throw new Error("No question could be generated for the current settings.");
      }

      state.currentQuestion = result[0];
    }

    renderQuestion(state.currentQuestion);
    setStatus("");
    updateProgress();
  } catch (error) {
    console.error("Question load failed:", error);
    if (questionPrompt) {
      questionPrompt.innerHTML = `
        <div class="empty-state">${escapeHTML(getFriendlyError(error))}</div>
      `;
    }
    optionsContainer.innerHTML = "";
    closeOptionGate();
    nextBtn.classList.add("hidden");
    setStatus(
      error?.message ||
      (state.mode === "bank"
        ? "Practice is waiting for saved bank questions."
        : "Practice is waiting for more generator data."),
      true
    );
    updateProgress();
  } finally {
    setLoading(false);
  }
}

function renderQuestionAssistanceToggle(question) {
  if (state.mode !== "bank" || !hasMalayalamAssistance(question)) {
    return "";
  }

  const maskOn = isMaskEnabledForQuestion(question);

  return `
    <div class="practice-question-assistance-row">
      <button
        type="button"
        class="exam-assistance-toggle practice-question-assistance-btn${maskOn ? " exam-assistance-toggle--active" : ""}"
        aria-pressed="${maskOn}"
        title="${maskOn ? "Back to English (default)" : "Malayalam help for this question only"}"
      >
        ${maskOn ? "English" : "മലയാളം"}
      </button>
    </div>
  `;
}

function bindQuestionAssistanceToggle(question) {
  const button = questionPrompt?.querySelector(".practice-question-assistance-btn");
  if (!button) {
    return;
  }

  button.addEventListener("click", () => toggleQuestionMask(question));
}

function resetOptionTouchTap() {
  optionTouchTap = null;
}

function beginOptionTouchTap(event) {
  if (event.pointerType === "mouse") {
    return;
  }

  const button = event.target.closest(".option-btn");
  if (!button) {
    resetOptionTouchTap();
    return;
  }

  optionTouchTap = {
    pointerId: event.pointerId,
    button,
    x: event.clientX,
    y: event.clientY,
    startedAt: performance.now(),
    cancelled: false,
  };
}

function trackOptionTouchTap(event) {
  if (!optionTouchTap || event.pointerId !== optionTouchTap.pointerId || optionTouchTap.cancelled) {
    return;
  }

  const dx = event.clientX - optionTouchTap.x;
  const dy = event.clientY - optionTouchTap.y;

  if (Math.hypot(dx, dy) > OPTION_TAP_MOVE_THRESHOLD_PX) {
    optionTouchTap.cancelled = true;
  }
}

function commitOptionTouchTap(event) {
  if (!optionTouchTap || event.pointerId !== optionTouchTap.pointerId) {
    return;
  }

  const candidate = optionTouchTap;
  resetOptionTouchTap();

  if (candidate.cancelled) {
    return;
  }

  if (performance.now() - candidate.startedAt > OPTION_TAP_MAX_MS) {
    return;
  }

  selectPracticeOption(candidate.button, event);
}

function selectPracticeOption(button, event) {
  if (!state.optionGateOpen) {
    event?.preventDefault();
    event?.stopPropagation();
    return;
  }

  if (!button || button.disabled || !state.currentQuestion || state.currentAnswer) {
    return;
  }

  const selected = normalizeOptionId(button.dataset.optionId);
  if (!selected) {
    return;
  }

  if (event?.pointerType && event.pointerType !== "mouse") {
    suppressOptionClick = true;
    window.setTimeout(() => {
      suppressOptionClick = false;
    }, 400);
  }

  event?.preventDefault();
  handleAnswer(selected);
}

function bindOptionSelection() {
  if (!optionsContainer || optionsContainer.dataset.bound) {
    return;
  }

  optionsContainer.dataset.bound = "1";

  optionsContainer.addEventListener("pointerdown", beginOptionTouchTap);
  optionsContainer.addEventListener("pointermove", trackOptionTouchTap);
  optionsContainer.addEventListener("pointerup", commitOptionTouchTap);
  optionsContainer.addEventListener("pointercancel", resetOptionTouchTap);

  optionsContainer.addEventListener("click", (event) => {
    if (suppressOptionClick) {
      event.preventDefault();
      return;
    }

    const button = event.target.closest(".option-btn");
    selectPracticeOption(button, event);
  });
}

function renderQuestion(question) {
  const display = getQuestionDisplay(question);
  const maskOn = isMaskEnabledForQuestion(question);
  const assistanceHint =
    maskOn && hasMalayalamAssistance(question)
      ? `<div class="exam-assistance-active-hint">Malayalam help on</div>`
      : "";
  const patternBadge = getPatternBadgeHtml(question);
  const metaHtml = `
    <div class="practice-question-meta">
      <span class="q-number">${escapeHTML(getQuestionPositionLabel())}</span>
      ${patternBadge}
    </div>
  `;

  questionPrompt.innerHTML = `
    <div class="practice-question-header">
      ${metaHtml}
      ${renderQuestionAssistanceToggle(question)}
    </div>
    ${renderMalayalamVerificationBar(question)}
    ${assistanceHint}
    <div class="question-text prepos-text">
      ${escapeHTML(display.text)}
    </div>
  `;

  bindQuestionAssistanceToggle(question);
  bindMalayalamVerificationActions(question);

  optionsContainer.innerHTML = "";
  resetOptionTouchTap();

  display.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-btn practice-option-btn";
    const optionText = stripLeadingOptionLabel(option.text);
    button.innerHTML = `
      <span class="option-letter">${escapeHTML(option.id)}</span>
      <span class="prepos-text option-btn-text">${escapeHTML(optionText)}</span>
    `;
    button.dataset.optionId = normalizeOptionId(option.id);
    optionsContainer.appendChild(button);
  });

  if (state.answeredCount > 0) {
    beginOptionGate();
  } else {
    closeOptionGate();
    state.optionGateOpen = true;
  }
}

function applyAnswerUi(question, selected) {
  const display = getQuestionDisplay(question);
  const correct = normalizeOptionId(question.correct);
  const selectedId = normalizeOptionId(selected);
  const correctOption =
    display.options.find((option) => normalizeOptionId(option.id) === correct) ||
    question.options.find((option) => normalizeOptionId(option.id) === correct);
  const buttons = optionsContainer.querySelectorAll(".option-btn");

  buttons.forEach((button) => {
    button.disabled = true;

    const optionId = normalizeOptionId(button.dataset.optionId);

    if (optionId === correct) {
      button.classList.add("correct");
    }

    if (optionId === selectedId && selectedId !== correct) {
      button.classList.add("wrong");
    }
  });

  if (selectedId === correct) {
    if (feedbackVerdict) {
      feedbackVerdict.innerHTML = renderPracticeFeedbackVerdict({
        isCorrect: true,
        correct,
        correctOptionText: correctOption?.text || "",
      });
      feedbackVerdict.classList.remove("hidden");
      feedbackVerdict.setAttribute("tabindex", "-1");
    }
  } else {
    if (feedbackVerdict) {
      feedbackVerdict.innerHTML = renderPracticeFeedbackVerdict({
        isCorrect: false,
        correct,
        correctOptionText: correctOption?.text || "",
      });
      feedbackVerdict.classList.remove("hidden");
      feedbackVerdict.setAttribute("tabindex", "-1");
    }
  }

  const explanationHtml = renderPracticeExplanationHtml(question, {
    isCorrect: selectedId === correct,
  });

  if (explanationHtml && feedbackExplanation) {
    feedbackExplanation.innerHTML = explanationHtml;
    feedbackExplanation.classList.remove("hidden");
  } else if (feedbackExplanation) {
    feedbackExplanation.innerHTML = "";
    feedbackExplanation.classList.add("hidden");
  }

  focusPracticeFeedback();
}

async function handleAnswer(selected) {
  if (!state.currentQuestion || state.currentAnswer) return;

  const question = state.currentQuestion;
  const correct = normalizeOptionId(question.correct);
  const selectedId = normalizeOptionId(selected);

  state.currentAnswer = {
    questionId: question.id,
    selected: selectedId,
  };

  applyAnswerUi(question, selectedId);

  state.answeredCount += 1;

  if (selectedId === correct) {
    state.correctCount += 1;
  }

  if (state.mode === "bank" && question.id) {
    state.sessionAnswers.push({
      question_id: question.id,
      chosen: selectedId,
      correct,
      is_correct: selectedId === correct,
    });

    try {
      await updateBankQuestionStat(question.id, selectedId === correct);
    } catch (error) {
      console.warn("[PrepOS Practice] Question stat update failed:", error);
      setStatus(
        "Answer recorded locally, but your question progress could not be saved.",
        true
      );
    }
  }

  nextBtn.classList.remove("hidden");
  updateProgress();

  if (state.mode === "generator") {
    try {
      await updateStats(selectedId === correct);
    } catch (error) {
      console.error("Stats update failed:", error);
      setStatus("Question saved locally, but adaptive stats could not be updated.", true);
    }
  }

  if (state.answeredCount >= state.sessionLimit) {
    nextBtn.innerText = "Finish Session";
  } else {
    nextBtn.innerText = "Next Question";
  }
}

async function finishSession(message = "Session finished. Start again for a new set.") {
  state.currentQuestion = null;
  if (questionPrompt) {
    questionPrompt.innerHTML = `<div class="qtext">Session complete</div>`;
  }
  optionsContainer.innerHTML = "";
  clearPracticeFeedback();
  nextBtn.classList.add("hidden");

  const accuracy =
    state.answeredCount === 0
      ? 0
      : Math.round((state.correctCount / state.answeredCount) * 100);

  const newlyMastered =
    state.mode === "bank" &&
    state.sessionAnswers.length > 0 &&
    state.knowledgeContext
      ? countNewlyMasteredQuestions({
          questionStateByIdBefore:
            state.questionStateAtSessionStart ?? new Map(),
          questionStateByIdAfter:
            state.knowledgeContext.questionStateById ?? new Map(),
        })
      : 0;

  sessionSummary.innerHTML = `
    <div class="exam-results-card card student-practice-results">
      <div class="exam-results-kicker">Session complete</div>
      <div class="exam-results-grid mt-20">
        <div class="exam-results-stat">
          <div class="exam-results-stat-label">Answered</div>
          <div class="exam-results-stat-value">${state.answeredCount}</div>
        </div>
        <div class="exam-results-stat">
          <div class="exam-results-stat-label">Correct</div>
          <div class="exam-results-stat-value">${state.correctCount}</div>
        </div>
        <div class="exam-results-stat">
          <div class="exam-results-stat-label">Accuracy</div>
          <div class="exam-results-stat-value">${accuracy}%</div>
        </div>
        ${
          newlyMastered > 0
            ? `
        <div class="exam-results-stat">
          <div class="exam-results-stat-label">Newly Mastered</div>
          <div class="exam-results-stat-value">${newlyMastered}</div>
        </div>
        `
            : ""
        }
      </div>
      ${
        state.mode === "bank" && bankOrderSelect.value === "focus_gaps"
          ? `<div class="text-muted mt-10">Focus Gaps mode prioritized new and weak questions in this session.</div>`
          : ""
      }
      ${
        newlyMastered > 0
          ? `<div class="mt-10"><strong>+${newlyMastered}</strong> question${newlyMastered === 1 ? "" : "s"} newly mastered this session.</div>`
          : ""
      }
    </div>
  `;
  sessionSummary.classList.remove("hidden");
  showPracticeSetup();

  let statusMessage = message;

  if (
    state.mode === "bank" &&
    state.sessionAnswers.length > 0 &&
    canPersistPracticeStats()
  ) {
    const practiceStudentId = getPracticeStudentId();
    if (!practiceStudentId) {
      statusMessage = message;
    } else {
    const elapsed = state.sessionStartedAt
      ? Math.floor((Date.now() - state.sessionStartedAt) / 1000)
      : 0;
    const topicLabel =
      bankTopicSelect.options[bankTopicSelect.selectedIndex]?.text?.replace(
        /\s+\(\d+\)$/,
        ""
      ) || null;

    try {
      const profileName = practiceRuntime?.learnerContext?.displayName;
      await submitPracticeBankSession({
        answers: state.sessionAnswers,
        score: state.correctCount,
        questionCount: state.sessionAnswers.length,
        timeTaken: elapsed,
        topicId: bankTopicSelect.value || null,
        topicName: topicLabel,
        studentId: practiceStudentId,
        studentName:
          profileName ??
          window.currentUser?.user_metadata?.full_name ??
          window.currentUser?.user_metadata?.name ??
          "",
      });
      statusMessage = `${message} Your learning profile was updated.`;

      const completedQuestionCount = state.sessionAnswers.length;
      const completedScore = state.correctCount;

      import("./core/activity-log.js")
        .then(({ logActivity, ACTIVITY_EVENTS }) => {
          logActivity(ACTIVITY_EVENTS.PRACTICE_COMPLETED, {
            resourceType: "practice",
            resourceId: bankTopicSelect.value || null,
            metadata: {
              mode: state.mode,
              topicName: topicLabel,
              score: completedScore,
              questionCount: completedQuestionCount,
              timeTaken: elapsed,
              accuracy,
            },
          });
        })
        .catch(() => {});
    } catch (error) {
      console.warn("[PrepOS Practice] Knowledge analytics submission failed:", error);
      statusMessage =
        "Session complete. Your answers were not saved to your learning profile.";
    }
    }
  }

  state.sessionAnswers = [];
  state.sessionStartedAt = null;

  setStatus(statusMessage);
  updateProgress();
  await refreshTopicProgressPanel();
}

/* =========================================
Adaptive Stats
========================================= */

async function updateStats(isCorrect) {
  const userId = getPracticeStudentId();
  const entryIds = [...new Set(state.currentQuestion?.tracking?.promptEntryIds || [])];

  if (!userId || !entryIds.length) {
    return;
  }

  const sb = await getClient();
  const { data: existingRows, error: selectError } = await sb
    .from("user_lexicon_word_stats")
    .select("word_id, seen_count, wrong_count")
    .eq("user_id", userId)
    .in("word_id", entryIds);

  if (selectError) {
    throw selectError;
  }

  const existingMap = new Map(
  (existingRows || []).map(row => [row.word_id, row])
);

  const rows = entryIds.map(lexiconEntryId => {
    const existing = existingMap.get(lexiconEntryId);
    const seenCount = (existing?.seen_count || 0) + 1;
    const wrongCount = (existing?.wrong_count || 0) + (isCorrect ? 0 : 1);

    return {
  user_id: userId,
  word_id: lexiconEntryId,
  seen_count: seenCount,
  wrong_count: wrongCount
};
  });

  const { error: upsertError } = await sb
    .from("user_lexicon_word_stats")
    .upsert(rows, {
      onConflict: "user_id,word_id"
    });

  if (upsertError) {
    throw upsertError;
  }
}
