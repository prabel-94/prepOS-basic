/**
 * PrepOS Teacher Dashboard Renderer
 * Pure presentation — no analytics computation, no Supabase.
 */

import { openTeacherInspector } from "../ui/teacher-inspector.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function confidenceClass(level = "low") {
  const normalized = String(level).toLowerCase();
  if (normalized === "high") return "teacher-intel-confidence--high";
  if (normalized === "medium") return "teacher-intel-confidence--medium";
  return "teacher-intel-confidence--low";
}

function priorityClass(priority = "low") {
  if (priority === "high") return "teacher-intel-priority--high";
  if (priority === "medium") return "teacher-intel-priority--medium";
  return "teacher-intel-priority--low";
}

function trendClass(direction = "stable") {
  if (direction === "improving") return "teacher-intel-trend--up";
  if (direction === "declining") return "teacher-intel-trend--down";
  return "teacher-intel-trend--stable";
}

function inspectorButton(inspectorId, inspectorData, label = "Inspect") {
  if (!inspectorId) return "";
  const payload = escapeHTML(JSON.stringify(inspectorData ?? {}));
  return `
    <button
      type="button"
      class="teacher-intel-inspect-btn"
      data-inspector-id="${escapeHTML(inspectorId)}"
      data-inspector-data="${payload}"
    >
      ${escapeHTML(label)}
    </button>
  `;
}

export function renderEmptyState(container, message, { variant = "default", hint = "" } = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="teacher-intel-empty teacher-intel-empty--${escapeHTML(variant)}">
      <div>${escapeHTML(message)}</div>
      ${hint ? `<div class="text-muted mt-10">${escapeHTML(hint)}</div>` : ""}
    </div>
  `;
}

export function renderClassroomSnapshot(container, snapshot = {}, trend = {}) {
  if (!container) return;

  if (!snapshot.hasData) {
    renderEmptyState(container, emptyMessageForReason(snapshot.emptyReason), {
      variant: snapshot.emptyReason ?? "no-data",
      hint: emptyHintForReason(snapshot.emptyReason),
    });
    return;
  }

  container.innerHTML = `
    <div class="teacher-intel-grid">
      <div class="teacher-intel-stat">
        <div class="teacher-intel-stat-value">${escapeHTML(snapshot.topicsMastered)}</div>
        <div class="teacher-intel-stat-label">Topics Mastered</div>
      </div>
      <div class="teacher-intel-stat">
        <div class="teacher-intel-stat-value">${escapeHTML(snapshot.weakTopics)}</div>
        <div class="teacher-intel-stat-label">Weak Topics</div>
      </div>
      <div class="teacher-intel-stat">
        <div class="teacher-intel-stat-value">${escapeHTML(snapshot.atRiskTopics)}</div>
        <div class="teacher-intel-stat-label">At-Risk Topics</div>
      </div>
      <div class="teacher-intel-stat">
        <div class="teacher-intel-stat-value teacher-intel-stat-value--compact">${escapeHTML(snapshot.classroomConfidenceLabel)}</div>
        <div class="teacher-intel-stat-label">Classroom Confidence</div>
      </div>
    </div>
    <div class="teacher-intel-meta mt-15">
      <span class="${trendClass(trend.direction)}">${escapeHTML(trend.message ?? "")}</span>
      · ${escapeHTML(snapshot.studentCount)} students tracked
      · ${escapeHTML(snapshot.atRiskStudentCount)} at-risk profiles
    </div>
  `;
}

function emptyMessageForReason(reason) {
  if (reason === "public_only_history") {
    return "Public practice attempts do not contribute to classroom mastery intelligence.";
  }
  if (reason === "no_topic_linked_data") {
    return "No topic-linked canonical data available yet.";
  }
  return "No canonical classroom analytics available yet.";
}

function emptyHintForReason(reason) {
  if (reason === "public_only_history") {
    return "Assign exams to students and collect verified attempts to unlock classroom intelligence.";
  }
  if (reason === "no_topic_linked_data") {
    return "Link questions to topics in your question bank for mastery aggregation.";
  }
  return "Publish exams, assign students, and collect canonical attempts.";
}

export function renderInterventionCards(container, cards = []) {
  if (!container) return;

  if (!cards.length) {
    renderEmptyState(container, "No intervention priorities detected yet.", {
      variant: "intervention-empty",
    });
    return;
  }

  container.innerHTML = cards
    .map(
      (card) => `
    <div class="teacher-intel-card teacher-intel-card--intervention ${priorityClass(card.priority)} mt-10">
      <div class="teacher-intel-card-header">
        <b>${escapeHTML(card.title)}</b>
        <span class="teacher-intel-badge ${confidenceClass(card.confidence)}">${escapeHTML(card.confidenceLabel)}</span>
      </div>
      <div class="text-muted mt-5">${escapeHTML(card.body)}</div>
      <div class="teacher-intel-intervention-meta mt-10">
        <span>${escapeHTML(card.affectedStudents)} / ${escapeHTML(card.totalStudents)} students</span>
        ${card.struggleRate ? `<span> · ${escapeHTML(card.struggleRate)}% struggle rate</span>` : ""}
      </div>
      <div class="mt-10"><b>Recommendation:</b> ${escapeHTML(card.recommendation)}</div>
      ${inspectorButton(card.inspectorId, card.inspectorData)}
    </div>
  `
    )
    .join("");
}

export function renderWeakTopicDistribution(container, topics = []) {
  if (!container) return;

  if (!topics.length) {
    renderEmptyState(
      container,
      "Weak topic distribution will appear after enough canonical classroom data.",
      { variant: "weak-empty" }
    );
    return;
  }

  container.innerHTML = `
    <div class="teacher-intel-heat-list">
      ${topics
        .map(
          (topic) => `
        <div class="teacher-intel-heat-row mt-10">
          <div class="teacher-intel-heat-topic">
            <b>${escapeHTML(topic.topicName)}</b>
            <div class="text-muted mt-5">${escapeHTML(topic.affectedStudents)} students · avg ${escapeHTML(topic.masteryAverage)}%</div>
          </div>
          <div class="teacher-intel-heat-bar-wrap">
            <div class="teacher-intel-heat-bar" style="width: ${Math.min(100, topic.struggleRate ?? 0)}%"></div>
          </div>
          <span class="teacher-intel-badge ${confidenceClass(topic.confidence)}">${escapeHTML(topic.confidence)}</span>
          ${inspectorButton(topic.inspectorId, topic.inspectorData, "Topic")}
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

export function renderDifficultConcepts(container, concepts = []) {
  if (!container) return;

  if (!concepts.length) {
    renderEmptyState(
      container,
      "Difficult concepts will surface from classroom mastery and question difficulty.",
      { variant: "concepts-empty" }
    );
    return;
  }

  container.innerHTML = concepts
    .map(
      (concept) => `
    <div class="teacher-intel-card mt-10">
      <b>${escapeHTML(concept.topicName)}</b>
      <div class="text-muted mt-5">Mastery ${escapeHTML(concept.masteryScore)}% · ${escapeHTML(concept.questionCount)} linked questions</div>
      <div class="mt-10">${escapeHTML(concept.summary)}</div>
      ${inspectorButton(concept.inspectorId, concept.inspectorData)}
    </div>
  `
    )
    .join("");
}

export function renderQuestionInsights(container, questions = [], distribution = {}) {
  if (!container) return;

  if (!questions.length) {
    renderEmptyState(
      container,
      "Question quality insights require canonical attempts on topic-linked questions.",
      { variant: "questions-empty" }
    );
    return;
  }

  const distributionHtml = distribution.totalStudents
    ? `
    <div class="teacher-intel-distribution mt-15">
      <div class="text-muted">${escapeHTML(distribution.message ?? "")}</div>
      <div class="teacher-intel-distribution-grid mt-10">
        <span>High: ${escapeHTML(distribution.highPerformers ?? 0)}</span>
        <span>Average: ${escapeHTML(distribution.averagePerformers ?? 0)}</span>
        <span>At-risk: ${escapeHTML(distribution.atRisk ?? 0)}</span>
        <span>Unstable: ${escapeHTML(distribution.unstableMastery ?? 0)}</span>
      </div>
    </div>
  `
    : "";

  container.innerHTML = `
    ${distributionHtml}
    ${questions
      .map(
        (q) => `
      <div class="teacher-intel-card mt-10">
        <div class="teacher-intel-card-header">
          <b>${escapeHTML(q.questionText)}</b>
          ${renderQualityFlags(q.qualityFlags)}
        </div>
        <div class="text-muted mt-5">
          ${escapeHTML(q.accuracy)}% accuracy · ${escapeHTML(q.skipRate)}% skip rate · ${escapeHTML(q.difficultyLabel)}
        </div>
        <div class="mt-10">${escapeHTML(q.summary)}</div>
        ${inspectorButton(q.inspectorId, q.inspectorData)}
      </div>
    `
      )
      .join("")}
  `;
}

function renderQualityFlags(flags = []) {
  if (!flags.length) return "";
  return flags
    .map((flag) => `<span class="teacher-intel-flag">${escapeHTML(flag.replace(/_/g, " "))}</span>`)
    .join("");
}

export function renderConfidenceWarnings(container, warnings = []) {
  if (!container) return;

  if (!warnings.length) {
    renderEmptyState(
      container,
      "Classroom confidence is sufficient for current insight levels.",
      { variant: "confidence-ok" }
    );
    return;
  }

  container.innerHTML = warnings
    .map(
      (warning) => `
    <div class="teacher-intel-confidence ${confidenceClass(warning.level)} mt-10">
      <div class="teacher-intel-confidence-label">${escapeHTML(warning.title)}</div>
      <div class="text-muted mt-5">${escapeHTML(warning.message)}</div>
      ${inspectorButton(warning.inspectorId, warning.inspectorData, "Details")}
    </div>
  `
    )
    .join("");
}

export function renderExamInsights(container, exams = []) {
  if (!container) return;

  if (!exams.length) {
    renderEmptyState(
      container,
      "Recent exam insights will appear after canonical student submissions.",
      { variant: "exams-empty" }
    );
    return;
  }

  container.innerHTML = exams
    .map(
      (exam) => `
    <div class="teacher-intel-card teacher-intel-card--compact mt-10">
      <b>${escapeHTML(exam.title)}</b>
      <div class="text-muted mt-5">${escapeHTML(exam.summary)}</div>
      <div class="text-muted mt-5">${escapeHTML(exam.spreadLabel)}</div>
      ${inspectorButton(exam.inspectorId, exam.inspectorData, "Breakdown")}
    </div>
  `
    )
    .join("");
}

export function renderTeacherDashboard({
  snapshotView = {},
  trendView = {},
  interventionCards = [],
  weakTopics = [],
  difficultConcepts = [],
  questionSignals = [],
  confidenceWarnings = [],
  examInsights = [],
  studentDistribution = {},
} = {}) {
  renderClassroomSnapshot(
    document.getElementById("classroomSnapshot"),
    snapshotView,
    trendView
  );
  renderInterventionCards(
    document.getElementById("interventionPriorities"),
    interventionCards
  );
  renderWeakTopicDistribution(
    document.getElementById("weakTopicDistribution"),
    weakTopics
  );
  renderDifficultConcepts(
    document.getElementById("difficultConcepts"),
    difficultConcepts
  );
  renderQuestionInsights(
    document.getElementById("questionInsights"),
    questionSignals,
    studentDistribution
  );
  renderConfidenceWarnings(
    document.getElementById("confidenceWarnings"),
    confidenceWarnings
  );
  renderExamInsights(
    document.getElementById("examInsights"),
    examInsights
  );

  bindInspectorActions(document);
}

export function bindInspectorActions(root = document) {
  root.querySelectorAll("[data-inspector-id]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const inspectorId = button.dataset.inspectorId;
      let data = {};
      try {
        data = JSON.parse(button.dataset.inspectorData || "{}");
      } catch {
        data = {};
      }
      openTeacherInspector(inspectorId, data);
    });
  });
}
