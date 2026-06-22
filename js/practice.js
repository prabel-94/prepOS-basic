import { runGenerator } from "./generator-core.js";
import { getClient } from "./core/get-client.js";
import { bootPage } from "./core/page-boot.js";
import { normalizeTopicKey } from "./student/student-intelligence.js";
import { DEFAULT_LEXICON_TOPIC } from "./generators/shared/lexicon-engine.js";
import {
  examHasMalayalamAssistance,
  hasMalayalamAssistance,
  malayalamAssistanceFromMetadata,
  resolveQuestionDisplay,
} from "./core/question-assistance.js";

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
const feedback = document.getElementById("feedback");
const feedbackVerdict = document.getElementById("feedbackVerdict");
const feedbackExplanation = document.getElementById("feedbackExplanation");
const nextBtn = document.getElementById("nextBtn");
const practiceStatus = document.getElementById("practiceStatus");
const practiceProgress = document.getElementById("practiceProgress");
const practiceProgressBar = document.getElementById("practiceProgressBar");
const practiceProgressFill = document.getElementById("practiceProgressFill");
const sessionSummary = document.getElementById("sessionSummary");
const practiceAssistanceToggle = document.getElementById("practiceAssistanceToggle");

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
};

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
  setStatus(
    `Practice focus: ${match.text.replace(/\s+\(\d+\)$/, "")}`
  );
}

async function init() {
  const runtime = await bootPage({
    roles: ["teacher", "admin", "student"],
    nav: {
      title: "Practice",
      subtitle: "Generator and question bank modes",
    },
  });

  if (!runtime) return;

  const sb = await getClient();

  const { data } = await sb.auth.getUser();
  window.currentUser = data?.user || null;
  await loadBankTopics();
  initPracticeAssistanceToggle();
  await applyPracticeTopicFromUrl();
  bindOptionSelection();
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

  return `<span class="practice-pattern-badge">${escapeHTML(label)}</span>`;
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
      ? `${getModeLabel()} | ${getQuestionPositionLabel()} | Correct ${state.correctCount}/${state.answeredCount}`
      : `${getModeLabel()} | Answered ${state.answeredCount}${state.sessionLimit === Infinity ? "" : ` of ${state.sessionLimit}`} | Correct ${state.correctCount}/${state.answeredCount}`;

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
    setStatus(label, false);
  } else if (practiceStatus.textContent === label) {
    setStatus("");
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

  clearPracticeFeedback();
  if (questionPrompt) {
    questionPrompt.innerHTML = "";
  }
  optionsContainer.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.innerHTML = "";
  sessionSummary.classList.add("hidden");
  resetPracticeAssistanceDefaults();
  state.currentAnswer = null;

  updateProgress();
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
  if (questionPrompt) {
    questionPrompt.innerHTML = "";
  }
  optionsContainer.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.classList.add("hidden");
  setStatus("");
  updateProgress();
  syncPracticeAssistanceToggleVisibility();
}

function shuffleQuestions(questions) {
  const shuffled = [...questions];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function normalizeBankQuestion(row, metadataValue = null) {
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

  const assistancePatch = malayalamAssistanceFromMetadata(metadataValue);
  if (assistancePatch) {
    Object.assign(question, assistancePatch);
  }

  return question;
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

async function fetchMalayalamAssistanceByQuestionId(questionIds = []) {
  if (!questionIds.length) {
    return new Map();
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from("question_metadata")
    .select("question_id, value")
    .in("question_id", questionIds)
    .eq("key", "assistance_malayalam");

  if (error) {
    console.error("Malayalam assistance metadata load failed:", error);
    return new Map();
  }

  return new Map(
    (data || []).map((row) => [row.question_id, row.value])
  );
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

  const assistanceMap = await fetchMalayalamAssistanceByQuestionId(
    data.map((row) => row.id)
  );

  state.bankQuestions = data
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .map((row) => normalizeBankQuestion(row, assistanceMap.get(row.id)))
    .filter((question) => question.text && question.options.length >= 2);

  if (bankOrderSelect.value === "random") {
    state.bankQuestions = shuffleQuestions(state.bankQuestions);
  }

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
      state.bankQuestions = shuffleQuestions(state.bankQuestions);
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
  });
});

/* =========================================
Question Flow
========================================= */

async function loadQuestion() {
  if (state.loading) return;

  if (state.answeredCount >= state.sessionLimit) {
    finishSession();
    return;
  }

  clearPracticeFeedback();
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
          finishSession(
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

function bindOptionSelection() {
  if (!optionsContainer || optionsContainer.dataset.bound) {
    return;
  }

  optionsContainer.dataset.bound = "1";

  optionsContainer.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }
    handleOptionSelection(event);
  });

  optionsContainer.addEventListener("click", handleOptionSelection);
}

function handleOptionSelection(event) {
  const button = event.target.closest(".option-btn");
  if (!button || button.disabled || !state.currentQuestion || state.currentAnswer) {
    return;
  }

  const selected = normalizeOptionId(button.dataset.optionId);
  if (!selected) {
    return;
  }

  event.preventDefault();
  handleAnswer(selected);
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
    ${assistanceHint}
    <div class="question-text prepos-text">
      ${escapeHTML(display.text)}
    </div>
  `;

  bindQuestionAssistanceToggle(question);

  optionsContainer.innerHTML = "";

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

function finishSession(message = "Session finished. Start again for a new set.") {
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

  sessionSummary.innerHTML = `
    <div class="exam-results-card">
      <div class="exam-results-kicker">Session Complete</div>
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
      </div>
    </div>
  `;
  sessionSummary.classList.remove("hidden");

  setStatus(message);
  updateProgress();
}

/* =========================================
Adaptive Stats
========================================= */

async function updateStats(isCorrect) {
  const userId = window.currentUser?.id;
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
