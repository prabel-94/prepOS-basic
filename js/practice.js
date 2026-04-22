import { runGenerator } from "./generator-core.js";

const patternSelect = document.getElementById("patternSelect");
const startBtn = document.getElementById("startBtn");

const practiceArea = document.getElementById("practiceArea");
const questionCard = document.getElementById("questionCard");
const optionsContainer = document.getElementById("optionsContainer");
const feedback = document.getElementById("feedback");
const nextBtn = document.getElementById("nextBtn");

let currentQuestion = null;

/* =========================================
Start Practice
========================================= */

startBtn.addEventListener("click", async () => {
  practiceArea.classList.remove("hidden");
  await loadQuestion();
});

/* =========================================
Load Question
========================================= */

async function loadQuestion() {

  feedback.innerHTML = "";
  nextBtn.classList.add("hidden");

  const pattern = patternSelect.value;

  const result = await runGenerator({
    subject: "malayalam",
    pattern
  });

  if (!result || !result.length) {
    questionCard.innerHTML = "No question generated";
    return;
  }

  currentQuestion = result[0];

  renderQuestion(currentQuestion);
}

/* =========================================
Render Question
========================================= */

function renderQuestion(q) {

  questionCard.innerHTML = `
    <div class="qtext">${q.text}</div>
  `;

  optionsContainer.innerHTML = "";

  q.options.forEach(opt => {
    const btn = document.createElement("button");

    btn.className = "option-btn";
    btn.innerText = `${opt.id}. ${opt.text}`;

    btn.onclick = () => handleAnswer(opt.id);

    optionsContainer.appendChild(btn);
  });
}

/* =========================================
Handle Answer
========================================= */

function handleAnswer(selected) {

  const correct = currentQuestion.correct;

  const buttons = document.querySelectorAll(".option-btn");

  buttons.forEach(btn => {
    btn.disabled = true;

    if (btn.innerText.startsWith(correct)) {
      btn.classList.add("correct");
    }

    if (btn.innerText.startsWith(selected) && selected !== correct) {
      btn.classList.add("wrong");
    }
  });

  if (selected === correct) {
    feedback.innerHTML = "✅ Correct";
  } else {
    feedback.innerHTML = `❌ Wrong. Correct answer: ${correct}`;
  }

  nextBtn.classList.remove("hidden");

  // 🔥 Hook for adaptive stats later
  updateStats(selected === correct);
}

/* =========================================
Next Question
========================================= */

nextBtn.addEventListener("click", loadQuestion);

/* =========================================
Adaptive Hook (Future Ready)
========================================= */

function updateStats(isCorrect) {
  // TODO: update user_lexicon_word_stats
}