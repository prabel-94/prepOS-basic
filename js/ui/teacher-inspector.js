/**
 * PrepOS Teacher Inspector Hooks
 * Foundation for future classroom inspectors — readable placeholder UI.
 */

import { openModal, closeModal } from "./modal-system.js";

const INSPECTOR_LABELS = {
  "mastery-inspector": "Mastery Inspector",
  "topic-inspector": "Topic Inspector",
  "question-inspector": "Question Inspector",
  "classroom-breakdown": "Classroom Breakdown",
  "confidence-inspector": "Confidence Inspector",
};

let inspectorOverlay = null;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureInspectorOverlay() {
  if (inspectorOverlay) return inspectorOverlay;

  const overlay = document.createElement("div");
  overlay.id = "teacher-inspector-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content teacher-intel-inspector-content">
      <div class="prepos-modal-header">
        <div id="teacher-inspector-title" class="h2">Inspector</div>
        <p class="text-muted mt-5 teacher-intel-inspector-subtitle">
          Classroom intelligence drill-down (preview)
        </p>
      </div>
      <div id="teacher-inspector-body" class="prepos-modal-body teacher-intel-inspector-body"></div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-close-inspector>Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("[data-close-inspector]")?.addEventListener("click", () => {
    closeModal(overlay);
  });

  inspectorOverlay = overlay;
  return overlay;
}

function renderDetailRows(rows = []) {
  const items = rows.filter((row) => row.value != null && row.value !== "");
  if (!items.length) return "";

  return `
    <dl class="teacher-intel-inspector-dl">
      ${items
        .map(
          (row) => `
        <dt>${escapeHTML(row.label)}</dt>
        <dd>${escapeHTML(row.value)}</dd>
      `
        )
        .join("")}
    </dl>
  `;
}

function renderTagList(tags = []) {
  if (!tags.length) return "";
  return `
    <div class="teacher-intel-inspector-tags mt-10">
      ${tags.map((tag) => `<span class="teacher-intel-flag">${escapeHTML(tag)}</span>`).join("")}
    </div>
  `;
}

function renderQuestionInspector(data = {}) {
  const question = data.question ?? data;
  const flags = (question.qualityFlags ?? []).map((f) => f.replace(/_/g, " "));

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(question.summary ?? "Question quality signal")}</p>
    ${renderTagList(flags)}
    ${renderDetailRows([
      { label: "Question", value: question.questionText },
      { label: "Accuracy", value: question.accuracy != null ? `${question.accuracy}%` : null },
      { label: "Skip rate", value: question.skipRate != null ? `${question.skipRate}%` : null },
      { label: "Difficulty", value: question.difficultyLabel },
      {
        label: "Topics",
        value: (question.topics ?? []).length ? (question.topics ?? []).join(", ") : "None linked",
      },
      { label: "Question ID", value: question.questionId ?? data.questionId },
    ])}
  `;
}

function renderTopicInspector(data = {}) {
  const topic = data.topic ?? data.signal ?? data;
  const signal = data.signal ?? {};

  return `
    <p class="teacher-intel-inspector-lead">
      ${escapeHTML(signal.recommendation ?? `Review ${topic.topicName ?? data.topicName ?? "this topic"} with targeted formative checks.`)}
    </p>
    ${renderDetailRows([
      { label: "Topic", value: topic.topicName ?? data.topicName ?? signal.topicName },
      {
        label: "Classroom average",
        value:
          topic.classroomAverage != null
            ? `${Math.round(topic.classroomAverage)}%`
            : topic.masteryAverage != null
              ? `${topic.masteryAverage}%`
              : signal.classroomAverage != null
                ? `${signal.classroomAverage}%`
                : null,
      },
      {
        label: "Students affected",
        value:
          topic.affectedStudents != null && topic.totalStudents != null
            ? `${topic.affectedStudents} of ${topic.totalStudents}`
            : signal.affectedStudents != null
              ? `${signal.affectedStudents} of ${signal.totalStudents ?? "—"}`
              : null,
      },
      {
        label: "Struggle rate",
        value:
          topic.struggleRate != null
            ? `${topic.struggleRate}%`
            : signal.struggleRate != null
              ? `${signal.struggleRate}%`
              : null,
      },
      { label: "Confidence", value: signal.confidence ?? topic.confidence },
      { label: "Trend", value: topic.trend },
    ])}
  `;
}

function renderMasteryInspector(data = {}) {
  const concept = data.concept ?? data;

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(concept.summary ?? "Classroom mastery drill-down")}</p>
    ${renderDetailRows([
      { label: "Topic", value: concept.topicName ?? data.topicName },
      { label: "Mastery", value: concept.masteryScore != null ? `${concept.masteryScore}%` : null },
      { label: "Difficulty", value: concept.difficulty ?? concept.analyticsDifficulty },
      { label: "Linked questions", value: concept.questionCount },
      {
        label: "Hardest question accuracy",
        value:
          concept.hardestQuestionAccuracy != null
            ? `${concept.hardestQuestionAccuracy}%`
            : null,
      },
    ])}
  `;
}

function renderClassroomBreakdown(data = {}) {
  const exam = data.exam;
  const profile = data.profile;

  if (exam) {
    return `
      <p class="teacher-intel-inspector-lead">${escapeHTML(exam.summary ?? "Exam classroom breakdown")}</p>
      ${renderDetailRows([
        { label: "Exam", value: exam.title },
        { label: "Average score", value: exam.averageScore != null ? `${exam.averageScore}%` : null },
        { label: "Score spread", value: exam.scoreSpread != null ? `${exam.scoreSpread}%` : null },
        { label: "Students", value: exam.studentCount },
        { label: "Attempts", value: exam.attemptCount },
        { label: "Spread label", value: exam.spreadLabel },
      ])}
    `;
  }

  if (profile) {
    return `
      <p class="teacher-intel-inspector-lead">${escapeHTML(profile.recommendation ?? profile.label ?? "Student support profile")}</p>
      ${renderDetailRows([
        { label: "Category", value: data.category?.replace(/_/g, " ") },
        { label: "Average score", value: profile.averageScore != null ? `${profile.averageScore}%` : null },
        { label: "Attempts", value: profile.attemptCount },
        { label: "Critical topics", value: profile.criticalTopicCount },
        { label: "Score variance", value: profile.scoreVariance },
        { label: "Mastery spread", value: profile.masterySpread },
      ])}
    `;
  }

  return `<p class="text-muted">No breakdown details available.</p>`;
}

function renderConfidenceInspector(data = {}) {
  const topic = data.topic;
  const overall = data.overall;

  if (topic) {
    return `
      <p class="teacher-intel-inspector-lead">${escapeHTML(topic.message ?? "Low confidence for this topic")}</p>
      ${renderDetailRows([{ label: "Topic", value: topic.topicName }])}
    `;
  }

  if (data.reason === "insufficient_coverage") {
    return `
      <p class="teacher-intel-inspector-lead">
        More verified topic-linked assessments are needed for reliable classroom intelligence.
      </p>
    `;
  }

  if (data.publicAttemptCount != null) {
    return `
      <p class="teacher-intel-inspector-lead">
        Public practice attempts do not contribute to classroom mastery intelligence.
      </p>
      ${renderDetailRows([
        { label: "Public attempts observed", value: data.publicAttemptCount },
      ])}
    `;
  }

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(overall?.reason ?? "Treat insights as directional until more canonical data is collected.")}</p>
    ${renderDetailRows([
      { label: "Confidence level", value: overall?.level },
      { label: "Unstable topics", value: data.count },
    ])}
  `;
}

function renderInspectorContent(inspectorId, data = {}) {
  switch (inspectorId) {
    case "question-inspector":
      return renderQuestionInspector(data);
    case "topic-inspector":
      return renderTopicInspector(data);
    case "mastery-inspector":
      return renderMasteryInspector(data);
    case "classroom-breakdown":
      return renderClassroomBreakdown(data);
    case "confidence-inspector":
      return renderConfidenceInspector(data);
    default:
      return `<p class="text-muted">Inspector type not recognized.</p>`;
  }
}

function renderInspectorPlaceholder(inspectorId, data = {}) {
  const label = INSPECTOR_LABELS[inspectorId] ?? inspectorId;
  const body = document.getElementById("teacher-inspector-body");
  const title = document.getElementById("teacher-inspector-title");

  if (title) title.textContent = label;
  if (!body) return;

  body.innerHTML = `
    <p class="text-muted teacher-intel-inspector-note">
      Full interactive inspectors arrive in a later phase. Below is a readable summary of this signal.
    </p>
    ${renderInspectorContent(inspectorId, data)}
  `;
}

export function openTeacherInspector(inspectorId, data = {}) {
  const overlay = ensureInspectorOverlay();
  renderInspectorPlaceholder(inspectorId, data);

  window.__PREPOS_TEACHER_INSPECTOR__ = {
    id: inspectorId,
    data,
    openedAt: Date.now(),
  };

  openModal(overlay, { overlayType: "inspector" });
}

export function openInspector(inspectorId, data = {}) {
  return openTeacherInspector(inspectorId, data);
}

window.openTeacherInspector = openTeacherInspector;
window.openInspector = openInspector;
