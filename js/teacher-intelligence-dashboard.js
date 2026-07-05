/**
 * PrepOS Teacher Intelligence Dashboard — orchestration bootstrap only.
 */

import { bootPage } from "./core/page-boot.js";
import { listBatches } from "./core/batch-management.js";
import {
  loadTeacherIntelligence,
  buildClassroomLearningState,
} from "./teacher/teacher-intelligence.js";
import {
  selectClassroomSnapshot,
  selectInterventionCards,
  selectWeakTopicDistribution,
  selectHardestConcepts,
  selectQuestionQualitySignals,
  selectConfidenceWarnings,
  selectClassroomTrend,
  selectExamQualityInsights,
  selectStudentDistributionSummary,
} from "./teacher/teacher-selectors.js";
import { renderTeacherDashboard } from "./teacher/teacher-dashboard-renderer.js";
import { renderDashboardSkeleton } from "./student/student-dashboard-renderer.js";

const INTEL_FILTER_KEY = "prepos:teacher-intelligence-filters";

const filters = {
  batchId: "",
  excludeLinkedLearners: true,
};

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(INTEL_FILTER_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    filters.batchId = saved.batchId ?? "";
    filters.excludeLinkedLearners = saved.excludeLinkedLearners !== false;
  } catch {
    /* ignore */
  }
}

function saveFilters() {
  try {
    localStorage.setItem(INTEL_FILTER_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

function readFilterControls() {
  filters.batchId =
    document.getElementById("teacherIntelBatchFilter")?.value ?? "";
  filters.excludeLinkedLearners =
    document.getElementById("teacherIntelExcludeLinked")?.checked !== false;
  saveFilters();
}

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function initBatchFilter() {
  const select = document.getElementById("teacherIntelBatchFilter");
  if (!select) return;

  try {
    const batches = await listBatches();
    select.innerHTML =
      `<option value="">All classroom learners</option>` +
      batches
        .map(
          (batch) =>
            `<option value="${escapeHTML(batch.id)}">${escapeHTML(batch.name)} (${escapeHTML(batch.memberCount)})</option>`
        )
        .join("");

    select.value = filters.batchId;
  } catch (error) {
    console.warn("[Teacher Intelligence] batch list failed", error);
  }
}

function showIntelligenceSkeletons() {
  renderDashboardSkeleton(document.getElementById("classroomSnapshot"), {
    variant: "stats",
  });
  [
    "interventionPriorities",
    "weakTopicDistribution",
    "difficultConcepts",
    "questionInsights",
    "confidenceWarnings",
    "examInsights",
  ].forEach((id) => {
    renderDashboardSkeleton(document.getElementById(id), { rows: 2 });
  });
}

async function refreshTeacherIntelligence() {
  readFilterControls();

  const statusEl = document.getElementById("teacherIntelFilterStatus");
  if (statusEl) {
    statusEl.textContent = "";
  }

  showIntelligenceSkeletons();

  try {
    const intelligence = await loadTeacherIntelligence({
      batchId: filters.batchId || null,
      excludeLinkedLearners: filters.excludeLinkedLearners,
    });
    const classroomState = buildClassroomLearningState(intelligence);
    window.__PREPOS_TEACHER_LEARNING_STATE__ = classroomState;

    renderTeacherDashboard({
      snapshotView: selectClassroomSnapshot(classroomState),
      trendView: selectClassroomTrend(classroomState),
      interventionCards: selectInterventionCards(classroomState),
      weakTopics: selectWeakTopicDistribution(classroomState),
      difficultConcepts: selectHardestConcepts(classroomState),
      questionSignals: selectQuestionQualitySignals(classroomState),
      confidenceWarnings: selectConfidenceWarnings(classroomState),
      examInsights: selectExamQualityInsights(classroomState),
      studentDistribution: selectStudentDistributionSummary(classroomState),
    });

    if (statusEl) {
      const scope = filters.batchId ? "batch-scoped" : "classroom-wide";
      const linkedNote = filters.excludeLinkedLearners
        ? "Linked learners excluded."
        : "Linked learners included.";
      statusEl.textContent = `Showing ${scope} intelligence. ${linkedNote}`;
    }
  } catch (error) {
    console.error("[Teacher Intelligence] load failed", error);
    if (statusEl) {
      statusEl.textContent =
        error.message || "Unable to load classroom intelligence.";
    }
  }
}

async function initTeacherIntelligence() {
  loadSavedFilters();

  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Classroom Intelligence",
      subtitle: "Intervention-oriented classroom analytics",
      preset: "teacherExam",
    },
  });

  if (!runtime) return;

  await initBatchFilter();

  const excludeLinkedEl = document.getElementById("teacherIntelExcludeLinked");
  if (excludeLinkedEl) {
    excludeLinkedEl.checked = filters.excludeLinkedLearners;
  }

  document
    .getElementById("teacherIntelApplyFiltersBtn")
    ?.addEventListener("click", refreshTeacherIntelligence);

  document
    .getElementById("teacherIntelBatchFilter")
    ?.addEventListener("change", refreshTeacherIntelligence);

  document
    .getElementById("teacherIntelExcludeLinked")
    ?.addEventListener("change", refreshTeacherIntelligence);

  await refreshTeacherIntelligence();
}

initTeacherIntelligence().catch((err) => {
  console.error("[Teacher Intelligence] init failed", err);
});
