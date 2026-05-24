/**
 * PrepOS Student Dashboard Renderer
 * Pure presentation — no analytics computation, no Supabase.
 */

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderEmptyState(container, message, { variant = "default" } = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="student-intel-empty student-intel-empty--${escapeHTML(variant)}">
      ${escapeHTML(message)}
    </div>
  `;
}

export function renderConfidenceState(container, confidenceView = {}) {
  if (!container) return;

  container.innerHTML = `
    <div class="student-intel-confidence student-intel-confidence--${escapeHTML(confidenceView.level ?? "low")}">
      <div class="student-intel-confidence-label">${escapeHTML(confidenceView.label ?? "Low Confidence")}</div>
      <div class="text-muted mt-5">${escapeHTML(confidenceView.message ?? "")}</div>
      <div class="text-muted mt-5">${escapeHTML(confidenceView.trend ?? "")}</div>
    </div>
  `;
}

export function renderLearningSnapshot(container, snapshot = {}, confidenceView = {}) {
  if (!container) return;

  if (!snapshot.hasData) {
    renderEmptyState(
      container,
      confidenceView.message ??
        "Complete more verified practice to unlock learning intelligence insights.",
      { variant: "no-data" }
    );
    return;
  }

  container.innerHTML = `
    <div class="student-intel-grid">
      <div class="student-intel-stat">
        <div class="student-intel-stat-value">${escapeHTML(snapshot.topicsMastered)}</div>
        <div class="student-intel-stat-label">Topics Mastered</div>
      </div>
      <div class="student-intel-stat">
        <div class="student-intel-stat-value">${escapeHTML(snapshot.weakTopicCount)}</div>
        <div class="student-intel-stat-label">Weak Topics</div>
      </div>
      <div class="student-intel-stat">
        <div class="student-intel-stat-value">${escapeHTML(snapshot.knowledgeConfidence)}</div>
        <div class="student-intel-stat-label">Knowledge Confidence</div>
      </div>
    </div>
    <div class="mt-10 text-muted">${escapeHTML(snapshot.recentTrend ?? "")}</div>
    ${
      snapshot.recommendedFocus
        ? `<div class="mt-10"><b>Recommended focus:</b> ${escapeHTML(snapshot.recommendedFocus)}</div>`
        : ""
    }
  `;
}

function renderPracticeButton(action = {}) {
  const topicKey = escapeHTML(action.topicKey ?? "");
  const label = escapeHTML(action.label ?? "Practice");

  return `
    <button
      type="button"
      class="primary-btn mt-10 student-practice-btn"
      data-topic-key="${topicKey}"
    >
      ${label}
    </button>
  `;
}

export function renderWeakTopics(container, cards = []) {
  if (!container) return;

  if (!cards.length) {
    renderEmptyState(
      container,
      "No weak topics detected yet. Keep practicing with topic-linked questions.",
      { variant: "weak-empty" }
    );
    return;
  }

  container.innerHTML = cards
    .map(
      card => `
    <div class="student-intel-card recent-item mt-10">
      <b>${escapeHTML(card.topic)}</b>
      <div class="text-muted mt-5">Mastery: ${escapeHTML(card.mastery)}%</div>
      <div class="text-muted mt-5">${escapeHTML(card.confidence)} — ${escapeHTML(card.confidenceMessage)}</div>
      <div class="mt-10">${escapeHTML(card.recommendation)}</div>
      ${renderPracticeButton(card.practiceAction)}
    </div>
  `
    )
    .join("");
}

export function renderStrongTopics(container, cards = []) {
  if (!container) return;

  if (!cards.length) {
    renderEmptyState(
      container,
      "Strong topics will appear here as your verified mastery grows.",
      { variant: "strong-empty" }
    );
    return;
  }

  container.innerHTML = cards
    .map(
      card => `
    <div class="student-intel-card recent-item mt-10 student-intel-card--strong">
      <b>${escapeHTML(card.topic)}</b>
      <div class="text-muted mt-5">Mastery: ${escapeHTML(card.mastery)}%</div>
      <div class="mt-10">${escapeHTML(card.message)}</div>
    </div>
  `
    )
    .join("");
}

export function renderRecommendations(container, items = []) {
  if (!container) return;

  if (!items.length) {
    renderEmptyState(
      container,
      "Revision recommendations will appear after enough verified topic-linked practice.",
      { variant: "recommendations-empty" }
    );
    return;
  }

  container.innerHTML = items
    .map(
      item => `
    <div class="student-intel-card recent-item mt-10">
      <b>${escapeHTML(item.topic)}</b>
      ${
        item.mastery != null
          ? `<div class="text-muted mt-5">Current mastery: ${escapeHTML(item.mastery)}%</div>`
          : ""
      }
      <div class="mt-10">${escapeHTML(item.message)}</div>
      ${renderPracticeButton(item.practiceAction)}
    </div>
  `
    )
    .join("");
}

export function renderAvailableExams(container, exams = []) {
  if (!container) return;

  container.innerHTML = "";

  if (!exams.length) {
    renderEmptyState(container, "No exams available", { variant: "exams-empty" });
    return;
  }

  exams.forEach(exam => {
    const div = document.createElement("div");
    div.className = "recent-item mt-10";
    div.innerHTML = `
      <b>${escapeHTML(exam.title || "Untitled Exam")}</b><br>
      <div class="text-muted mt-5">
        ${escapeHTML(new Date(exam.created_at).toLocaleString())}
      </div>
      <button
        type="button"
        class="primary-btn mt-10"
        data-exam-id="${escapeHTML(exam.id)}"
      >
        Start
      </button>
    `;
    container.appendChild(div);
  });
}

export function renderRecentAttempts(container, attempts = []) {
  if (!container) return;

  container.innerHTML = "";

  if (!attempts.length) {
    renderEmptyState(container, "No attempts yet", { variant: "attempts-empty" });
    return;
  }

  attempts.forEach(attempt => {
    const div = document.createElement("div");
    div.className = "recent-item mt-10";
    div.innerHTML = `
      <b>Exam ID: ${escapeHTML(attempt.examId ?? attempt.exam_id)}</b><br>
      Score: ${escapeHTML(attempt.score)}<br>
      <div class="text-muted mt-5">
        ${escapeHTML(new Date(attempt.submittedAt ?? attempt.submitted_at).toLocaleString())}
      </div>
    `;
    container.appendChild(div);
  });
}

export function renderStudentDashboard({
  snapshotView = {},
  confidenceView = {},
  weakTopicCards = [],
  strongTopicCards = [],
  recommendations = [],
  exams = [],
  recentAttempts = [],
} = {}) {
  renderLearningSnapshot(
    document.getElementById("learningSnapshot"),
    snapshotView,
    confidenceView
  );

  renderConfidenceState(
    document.getElementById("confidenceState"),
    confidenceView
  );

  renderWeakTopics(document.getElementById("weakTopicsList"), weakTopicCards);
  renderStrongTopics(document.getElementById("strongTopicsList"), strongTopicCards);
  renderRecommendations(
    document.getElementById("revisionRecommendations"),
    recommendations
  );

  renderAvailableExams(document.getElementById("availableExams"), exams);
  renderRecentAttempts(document.getElementById("recentAttempts"), recentAttempts);
}

export function bindPracticeActions(onPracticeTopic) {
  document.querySelectorAll(".student-practice-btn").forEach(button => {
    button.addEventListener("click", () => {
      const topicKey = button.dataset.topicKey;
      if (topicKey && typeof onPracticeTopic === "function") {
        onPracticeTopic(topicKey);
      }
    });
  });
}

export function bindExamStartActions(onStartExam) {
  const container = document.getElementById("availableExams");
  if (!container) return;

  container.querySelectorAll("[data-exam-id]").forEach(button => {
    button.addEventListener("click", () => {
      const examId = button.dataset.examId;
      if (examId && typeof onStartExam === "function") {
        onStartExam(examId);
      }
    });
  });
}
