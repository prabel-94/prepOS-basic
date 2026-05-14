import { runGenerator } from "./generator-core.js";

const sb = window.supabaseClient;

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
const optionsContainer = document.getElementById("optionsContainer");
const feedback = document.getElementById("feedback");
const nextBtn = document.getElementById("nextBtn");
const practiceStatus = document.getElementById("practiceStatus");
const practiceProgress = document.getElementById("practiceProgress");
const sessionSummary = document.getElementById("sessionSummary");

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
  bankCursor: 0
};

/* =========================================
Init
========================================= */

async function init() {
  if (typeof requireAuth === "function") {
    await requireAuth();
  }

  const { data } = await sb.auth.getUser();
  window.currentUser = data?.user || null;
  await loadBankTopics();
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
    return;
  }

  const limitLabel =
    state.sessionLimit === Infinity ? "Unlimited" : state.sessionLimit;
  const nextQuestionNumber =
    state.sessionLimit === Infinity
      ? state.answeredCount + 1
      : Math.min(state.answeredCount + 1, state.sessionLimit);

  practiceProgress.textContent =
    state.currentQuestion
      ? `${getModeLabel()} | Question ${nextQuestionNumber}${state.sessionLimit === Infinity ? "" : ` of ${limitLabel}`} | Correct ${state.correctCount}/${state.answeredCount}`
      : `${getModeLabel()} | Answered ${state.answeredCount}${state.sessionLimit === Infinity ? "" : ` of ${limitLabel}`} | Correct ${state.correctCount}/${state.answeredCount}`;

  practiceProgress.classList.remove("hidden");
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

function resetSession() {
  state.currentQuestion = null;
  state.loading = false;
  state.answeredCount = 0;
  state.correctCount = 0;
  state.sessionLimit = getSessionLimit();
  state.started = true;

  feedback.innerHTML = "";
  questionCard.innerHTML = "";
  optionsContainer.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.innerHTML = "";
  sessionSummary.classList.add("hidden");

  updateProgress();
}

function getCorrectOption(question) {
  return question.options.find(option => option.id === question.correct);
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
  feedback.innerHTML = "";
  questionCard.innerHTML = "";
  optionsContainer.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.classList.add("hidden");
  setStatus("");
  updateProgress();
}

function shuffleQuestions(questions) {
  const shuffled = [...questions];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function normalizeBankQuestion(row) {
  return {
    id: row.id,
    source: "bank",
    text: row.question_text || "",
    options: [
      { id: "A", text: row.option_a || "" },
      { id: "B", text: row.option_b || "" },
      { id: "C", text: row.option_c || "" },
      { id: "D", text: row.option_d || "" }
    ].filter(option => option.text),
    correct: String(row.correct_option || "A").toUpperCase(),
    explanation: row.explanation || ""
  };
}

async function loadBankTopics() {
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

  let questions = data
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .map(normalizeBankQuestion)
    .filter(question => question.text && question.options.length >= 2);

  if (bankOrderSelect.value === "random") {
    questions = shuffleQuestions(questions);
  }

  state.bankQuestions = questions;
  state.bankCursor = 0;
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

  feedback.innerHTML = "";
  nextBtn.classList.add("hidden");
  sessionSummary.classList.add("hidden");
  state.currentQuestion = null;
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

        throw new Error(
          bankTopicSelect.value
            ? "No saved question bank questions are available for this topic yet."
            : "No saved question bank questions are available yet."
        );
      }

      state.currentQuestion = bankQuestion;
    } else {
      const result = await runGenerator({
        subject: subjectSelect.value,
        pattern: patternSelect.value,
        adaptive: adaptiveToggle.checked
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
    questionCard.innerHTML = `
      <div class="empty-state">${escapeHTML(getFriendlyError(error))}</div>
    `;
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

function renderQuestion(question) {
    questionCard.innerHTML = `
  <div class="question-text prepos-text">
    ${escapeHTML(question.text)}
  </div>
`;

  optionsContainer.innerHTML = "";

  question.options.forEach(option => {
    const button = document.createElement("button");
    button.className = "option-btn";
    button.innerHTML = `
  <span class="prepos-text">
    ${escapeHTML(option.id)}. ${escapeHTML(option.text)}
  </span>
`;
    button.dataset.optionId = option.id;
    button.onclick = () => handleAnswer(option.id);
    optionsContainer.appendChild(button);
  });
}

async function handleAnswer(selected) {
  if (!state.currentQuestion) return;

  const correct = state.currentQuestion.correct;
  const correctOption = getCorrectOption(state.currentQuestion);
  const buttons = document.querySelectorAll(".option-btn");

  buttons.forEach(button => {
    button.disabled = true;

    if (button.dataset.optionId === correct) {
      button.classList.add("correct");
    }

    if (button.dataset.optionId === selected && selected !== correct) {
      button.classList.add("wrong");
    }
  });

  state.answeredCount += 1;

  if (selected === correct) {
    state.correctCount += 1;
    feedback.innerHTML = "Correct";
  } else {
    feedback.innerHTML = `Wrong. Correct answer: ${correct}. ${escapeHTML(correctOption?.text || "")}`;
  }

  if (state.currentQuestion.explanation) {
    feedback.innerHTML += `
      <div class="text-muted mt-10">${escapeHTML(state.currentQuestion.explanation)}</div>
    `;
  }

  nextBtn.classList.remove("hidden");
  updateProgress();

  if (state.mode === "generator") {
    try {
      await updateStats(selected === correct);
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
  questionCard.innerHTML = `
    <div class="qtext">Session complete</div>
  `;
  optionsContainer.innerHTML = "";
  feedback.innerHTML = "";
  nextBtn.classList.add("hidden");

  const accuracy =
    state.answeredCount === 0
      ? 0
      : Math.round((state.correctCount / state.answeredCount) * 100);

  sessionSummary.innerHTML = `
    <div class="h3">Practice Summary</div>
    <div class="mt-10">Answered: ${state.answeredCount}</div>
    <div class="mt-10">Correct: ${state.correctCount}</div>
    <div class="mt-10">Accuracy: ${accuracy}%</div>
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
