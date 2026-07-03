/**
 * PrepOS Student Dashboard Renderer
 * Pure presentation — no analytics computation, no Supabase.
 */

import { formatExamDuration } from "./student-exam-meta.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderDashboardSkeleton(
  container,
  { variant = "list", rows = 3 } = {}
) {
  if (!container) {
    return;
  }

  if (variant === "stats") {
    container.innerHTML = `
      <div class="student-dashboard-skeleton student-dashboard-skeleton--stats" aria-hidden="true">
        <div class="student-dashboard-skeleton-stat"></div>
        <div class="student-dashboard-skeleton-stat"></div>
        <div class="student-dashboard-skeleton-stat"></div>
        <div class="student-dashboard-skeleton-band"></div>
      </div>
    `;
    return;
  }

  if (variant === "tabs") {
    container.innerHTML = `
      <div class="student-dashboard-skeleton student-dashboard-skeleton--tabs" aria-hidden="true">
        <div class="student-dashboard-skeleton-tab-row">
          <div class="student-dashboard-skeleton-pill"></div>
          <div class="student-dashboard-skeleton-pill"></div>
          <div class="student-dashboard-skeleton-pill"></div>
        </div>
        ${Array.from({ length: rows }, () => '<div class="student-dashboard-skeleton-card"></div>').join("")}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="student-dashboard-skeleton student-dashboard-skeleton--list" aria-hidden="true">
      ${Array.from({ length: rows }, () => '<div class="student-dashboard-skeleton-card"></div>').join("")}
    </div>
  `;
}

function markLoaded(container) {
  container?.removeAttribute("aria-busy");
}

export function renderEmptyState(container, message, { variant = "default" } = {}) {
  if (!container) {
    return;
  }

  markLoaded(container);
  container.innerHTML = `
    <div class="student-intel-empty student-intel-empty--${escapeHTML(variant)}">
      ${escapeHTML(message)}
    </div>
  `;
}

function renderConfidenceStrip(confidenceView = {}) {
  return `
    <div class="student-intel-confidence student-intel-confidence--${escapeHTML(confidenceView.level ?? "low")}">
      <div class="student-intel-confidence-label">${escapeHTML(confidenceView.label ?? "Learning Profile Building")}</div>
      <div class="text-muted mt-5">${escapeHTML(confidenceView.message ?? "")}</div>
      ${
        confidenceView.trend
          ? `<div class="text-muted mt-5">${escapeHTML(confidenceView.trend)}</div>`
          : ""
      }
    </div>
  `;
}

export function renderLearningIntelligence(container, snapshot = {}, confidenceView = {}) {
  if (!container) {
    return;
  }

  markLoaded(container);

  if (!snapshot.hasData) {
    container.innerHTML = `
      <div class="student-intel-composed student-intel-composed--empty">
        <div class="student-intel-empty student-intel-empty--no-data">
          ${escapeHTML(
            confidenceView.message ??
              "Your learning profile is still being built. Complete more verified practice to unlock topic mastery insights."
          )}
        </div>
        ${renderConfidenceStrip(confidenceView)}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="student-intel-composed">
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
      ${
        snapshot.recentTrend || snapshot.recommendedFocus
          ? `<div class="student-intel-composed-meta">
              ${
                snapshot.recentTrend
                  ? `<div class="text-muted">${escapeHTML(snapshot.recentTrend)}</div>`
                  : ""
              }
              ${
                snapshot.recommendedFocus
                  ? `<div class="mt-5"><strong>Recommended focus:</strong> ${escapeHTML(snapshot.recommendedFocus)}</div>`
                  : ""
              }
            </div>`
          : ""
      }
      ${renderConfidenceStrip(confidenceView)}
    </div>
  `;
}

function renderPracticeButton(action = {}, { compact = true } = {}) {
  const topicKey = escapeHTML(action.topicKey ?? "");
  const label = escapeHTML(action.label ?? "Practice");
  const className = compact
    ? "secondary-btn student-practice-btn student-dashboard-row-action"
    : "primary-btn mt-10 student-practice-btn";

  return `
    <button
      type="button"
      class="${className}"
      data-topic-key="${topicKey}"
    >
      ${label}
    </button>
  `;
}

function renderWeakTopicRows(cards = []) {
  if (!cards.length) {
    return `
      <div class="student-intel-empty student-intel-empty--weak-empty">
        No weak topics identified yet. Complete more practice and PrepOS will highlight areas that need attention.
      </div>
    `;
  }

  return cards
    .map(
      (card) => `
    <div class="student-dashboard-row student-dashboard-row--weak">
      <div class="student-dashboard-row-main">
        <div class="student-dashboard-row-title">${escapeHTML(card.topic)}</div>
        <div class="student-dashboard-row-meta">Mastery: ${escapeHTML(card.mastery)}%</div>
        <div class="student-dashboard-row-meta">${escapeHTML(card.confidence)} — ${escapeHTML(card.confidenceMessage)}</div>
        <div class="student-dashboard-row-body">${escapeHTML(card.recommendation)}</div>
      </div>
      ${renderPracticeButton(card.practiceAction)}
    </div>
  `
    )
    .join("");
}

function renderStrongTopicRows(cards = []) {
  if (!cards.length) {
    return `
      <div class="student-intel-empty student-intel-empty--strong-empty">
        No strong topics identified yet. Keep practicing to build your mastery profile.
      </div>
    `;
  }

  return cards
    .map(
      (card) => `
    <div class="student-dashboard-row student-dashboard-row--strong">
      <div class="student-dashboard-row-main">
        <div class="student-dashboard-row-title">${escapeHTML(card.topic)}</div>
        <div class="student-dashboard-row-meta">Mastery: ${escapeHTML(card.mastery)}%</div>
        <div class="student-dashboard-row-body">${escapeHTML(card.message)}</div>
      </div>
    </div>
  `
    )
    .join("");
}

function renderRecommendationRows(items = []) {
  if (!items.length) {
    return `
      <div class="student-intel-empty student-intel-empty--recommendations-empty">
        Revision recommendations will appear after enough verified topic-linked practice.
      </div>
    `;
  }

  return items
    .map(
      (item) => `
    <div class="student-dashboard-row">
      <div class="student-dashboard-row-main">
        <div class="student-dashboard-row-title">${escapeHTML(item.topic)}</div>
        ${
          item.mastery != null
            ? `<div class="student-dashboard-row-meta">Current mastery: ${escapeHTML(item.mastery)}%</div>`
            : ""
        }
        <div class="student-dashboard-row-body">${escapeHTML(item.message)}</div>
      </div>
      ${renderPracticeButton(item.practiceAction)}
    </div>
  `
    )
    .join("");
}

export function renderMyProgress(
  container,
  { weakTopicCards = [], strongTopicCards = [], recommendations = [] } = {}
) {
  if (!container) {
    return;
  }

  markLoaded(container);

  container.innerHTML = `
    <div class="student-progress-tabs" role="tablist" aria-label="Progress views">
      <button
        type="button"
        role="tab"
        class="student-progress-tab is-active"
        data-progress-tab="weak"
        aria-selected="true"
        id="progress-tab-weak"
        aria-controls="progress-panel-weak"
      >
        Weak Topics
      </button>
      <button
        type="button"
        role="tab"
        class="student-progress-tab"
        data-progress-tab="strong"
        aria-selected="false"
        id="progress-tab-strong"
        aria-controls="progress-panel-strong"
      >
        Strong Topics
      </button>
      <button
        type="button"
        role="tab"
        class="student-progress-tab"
        data-progress-tab="revision"
        aria-selected="false"
        id="progress-tab-revision"
        aria-controls="progress-panel-revision"
      >
        Revision
      </button>
    </div>
    <div class="student-dashboard-list student-dashboard-list--progress mt-10">
      <div
        class="student-progress-panel"
        role="tabpanel"
        id="progress-panel-weak"
        data-progress-panel="weak"
        aria-labelledby="progress-tab-weak"
      >
        ${renderWeakTopicRows(weakTopicCards)}
      </div>
      <div
        class="student-progress-panel hidden"
        role="tabpanel"
        id="progress-panel-strong"
        data-progress-panel="strong"
        aria-labelledby="progress-tab-strong"
        hidden
      >
        ${renderStrongTopicRows(strongTopicCards)}
      </div>
      <div
        class="student-progress-panel hidden"
        role="tabpanel"
        id="progress-panel-revision"
        data-progress-panel="revision"
        aria-labelledby="progress-tab-revision"
        hidden
      >
        ${renderRecommendationRows(recommendations)}
      </div>
    </div>
  `;
}

export function bindMyProgressTabs(root = document) {
  const section = root.getElementById?.("myProgress") ?? root.querySelector?.("#myProgress");
  if (!section) {
    return;
  }

  section.querySelectorAll("[data-progress-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.progressTab;

      section.querySelectorAll(".student-progress-tab").forEach((button) => {
        const active = button === tab;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });

      section.querySelectorAll("[data-progress-panel]").forEach((panel) => {
        const active = panel.dataset.progressPanel === key;
        panel.classList.toggle("hidden", !active);
        panel.toggleAttribute("hidden", !active);
      });
    });
  });
}

export function renderAvailableExams(container, exams = []) {
  if (!container) {
    return;
  }

  markLoaded(container);
  container.innerHTML = "";

  if (!exams.length) {
    renderEmptyState(
      container,
      "No exams assigned yet. Your teacher will add exams here when they are ready.",
      { variant: "exams-empty" }
    );
    return;
  }

  exams.forEach((exam) => {
    const metaLines = [];

    if (exam.questionCount) {
      metaLines.push(`${exam.questionCount} Question${exam.questionCount === 1 ? "" : "s"}`);
    }

    const durationLabel = exam.durationLabel ?? formatExamDuration(exam.duration);
    if (durationLabel) {
      metaLines.push(durationLabel);
    }

    metaLines.push("Assigned by Teacher");

    if (exam.attemptStatus === "completed" && exam.score != null) {
      metaLines.push("Completed");
      metaLines.push(`Score ${exam.score}/${exam.total ?? exam.questionCount ?? "?"}`);
    } else if (exam.attemptStatus === "in_progress") {
      metaLines.push("In Progress");
    } else if (exam.attemptStatus === "locked") {
      metaLines.push(exam.lockReason || "Complete the previous part first");
    }

    if (exam.part_index) {
      metaLines.push(`Part ${exam.part_index}${exam.part_count ? ` of ${exam.part_count}` : ""}`);
    }

    const buttonLabel = exam.buttonLabel ?? "Start Exam";
    const isLocked = exam.attemptStatus === "locked";

    const div = document.createElement("div");
    div.className = "student-exam-card";
    div.innerHTML = `
      <div class="student-exam-card-title">${escapeHTML(exam.title || "Untitled Exam")}</div>
      <ul class="student-exam-card-meta">
        ${metaLines.map((line) => `<li>${escapeHTML(line)}</li>`).join("")}
      </ul>
      <button
        type="button"
        class="primary-btn student-dashboard-row-action"
        data-exam-id="${escapeHTML(exam.id)}"
        ${isLocked ? "disabled" : ""}
      >
        ${escapeHTML(buttonLabel)}
      </button>
    `;
    container.appendChild(div);
  });
}

export function renderRecentAttempts(container, attempts = []) {
  if (!container) {
    return;
  }

  markLoaded(container);
  container.innerHTML = "";

  if (!attempts.length) {
    renderEmptyState(container, "No attempts yet", { variant: "attempts-empty" });
    return;
  }

  attempts.forEach((attempt) => {
    const title = attempt.examTitle ?? "Exam";
    const score = attempt.score ?? 0;
    const total = attempt.total ?? attempt.question_count;
    const scoreLabel = total != null ? `${score} / ${total}` : String(score);
    const submittedAt = attempt.submittedAt ?? attempt.submitted_at;
    const examId = attempt.examId ?? attempt.exam_id;
    const submittedLabel = submittedAt
      ? new Date(submittedAt).toLocaleString()
      : "Submitted";

    const div = document.createElement("div");
    div.className = "student-exam-card student-exam-card--attempt";
    div.innerHTML = `
      <div class="student-exam-card-title">${escapeHTML(title)}</div>
      <ul class="student-exam-card-meta">
        <li>Score ${escapeHTML(scoreLabel)}</li>
        <li>${escapeHTML(submittedLabel)}</li>
      </ul>
      <button
        type="button"
        class="secondary-btn student-dashboard-row-action"
        data-exam-id="${escapeHTML(examId)}"
      >
        View Results
      </button>
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
  exams = null,
  recentAttempts = null,
} = {}) {
  renderLearningIntelligence(
    document.getElementById("learningIntelligence"),
    snapshotView,
    confidenceView
  );

  renderMyProgress(document.getElementById("myProgress"), {
    weakTopicCards,
    strongTopicCards,
    recommendations,
  });

  bindMyProgressTabs();

  if (Array.isArray(exams)) {
    renderAvailableExams(document.getElementById("availableExams"), exams);
  }

  if (Array.isArray(recentAttempts)) {
    renderRecentAttempts(document.getElementById("recentAttempts"), recentAttempts);
  }
}

export function bindPracticeActions(onPracticeTopic) {
  document.querySelectorAll(".student-practice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const topicKey = button.dataset.topicKey;
      if (topicKey && typeof onPracticeTopic === "function") {
        onPracticeTopic(topicKey);
      }
    });
  });
}

export function bindExamStartActions(onStartExam) {
  const containerIds = ["availableExams", "recentAttempts"];

  containerIds.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.querySelectorAll("[data-exam-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const examId = button.dataset.examId;
        if (examId && typeof onStartExam === "function") {
          onStartExam(examId);
        }
      });
    });
  });
}
