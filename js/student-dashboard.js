/**
 * PrepOS Student Dashboard — orchestration bootstrap only.
 */

import { bootPage } from "./core/page-boot.js";
import { resolveAppPath } from "./core/access.js";
import {
  loadStudentIntelligence,
  loadStudentExamDashboardData,
  buildStudentLearningState,
  normalizeTopicKey,
} from "./student/student-intelligence.js";

import {
  selectLearningSnapshot,
  selectWeakTopicCards,
  selectStrongTopicCards,
  selectRevisionRecommendations,
  selectKnowledgeConfidence,
  selectRecentProgress,
} from "./student/student-selectors.js";

import {
  renderStudentDashboard,
  renderAvailableExams,
  renderRecentAttempts,
  bindPracticeActions,
  bindExamStartActions,
  renderEmptyState,
  renderDashboardSkeleton,
} from "./student/student-dashboard-renderer.js";
import { loadTopicNotesSection } from "./notes/note-home.js";

function startExamById(id) {
  location.href = resolveAppPath(`exam.html?id=${id}`);
}

function goToPractice() {
  location.href = resolveAppPath("practice.html");
}

function scrollToTopicNotes() {
  document.getElementById("topicNotesSection")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function goToPracticeTopic(topic) {
  const key = normalizeTopicKey(topic);
  location.href = resolveAppPath(`practice.html?topic=${encodeURIComponent(key)}`);
}

function showInitialDashboardSkeletons() {
  renderDashboardSkeleton(document.getElementById("availableExams"), { rows: 2 });
  renderDashboardSkeleton(document.getElementById("studentTopicNotes"), { rows: 2 });
  renderDashboardSkeleton(document.getElementById("learningIntelligence"), {
    variant: "stats",
  });
  renderDashboardSkeleton(document.getElementById("myProgress"), { variant: "tabs", rows: 2 });
  renderDashboardSkeleton(document.getElementById("recentAttempts"), { rows: 2 });
}

function renderIntelligenceSections(learningState) {
  const snapshotView = selectLearningSnapshot(learningState);
  const confidenceView = selectKnowledgeConfidence(learningState);
  const weakTopicCards = selectWeakTopicCards(learningState);
  const strongTopicCards = selectStrongTopicCards(learningState);
  const recommendations = selectRevisionRecommendations(learningState);

  renderStudentDashboard({
    snapshotView,
    confidenceView,
    weakTopicCards,
    strongTopicCards,
    recommendations,
  });

  bindPracticeActions(goToPracticeTopic);
}

function renderIntelligenceErrorStates() {
  renderEmptyState(
    document.getElementById("learningIntelligence"),
    "Unable to load learning intelligence right now.",
    { variant: "error" }
  );

  renderEmptyState(
    document.getElementById("myProgress"),
    "Progress insights are unavailable right now.",
    { variant: "error" }
  );
}

async function initStudent() {
  showInitialDashboardSkeletons();

  const runtime = await bootPage({
    roles: ["student", "admin"],
    allowLinkedStudentMode: true,
    nav: {
      variant: "home",
      showHome: false,
      title: "Student Dashboard",
      subtitle: "Exams, practice, and learning intelligence",
    },
  });

  if (!runtime) return;

  const { mountStudentModeNav } = await import("./teacher/linked-learner-ui.js");
  await mountStudentModeNav(runtime);

  const dashboardTitle = document.querySelector(".prepos-app-nav-title");
  if (runtime.learnerContext?.studentModeActive && dashboardTitle) {
    dashboardTitle.textContent = "My Learning";
  }

  const topicNotesEl = document.getElementById("studentTopicNotes");

  async function loadStudentTopicNotes() {
    renderDashboardSkeleton(topicNotesEl, { rows: 2 });
    await loadTopicNotesSection(topicNotesEl, { role: "student" });
    topicNotesEl?.removeAttribute("aria-busy");
    const { upgradeLegacyOnclickNav } = await import("./core/navigate.js");
    if (topicNotesEl) {
      upgradeLegacyOnclickNav(topicNotesEl);
    }
  }

  let examDashboardData = null;

  try {
    examDashboardData = await loadStudentExamDashboardData();

    renderAvailableExams(
      document.getElementById("availableExams"),
      examDashboardData.exams ?? []
    );

    renderRecentAttempts(
      document.getElementById("recentAttempts"),
      examDashboardData.recentAttempts ?? []
    );

    bindExamStartActions(startExamById);
  } catch (error) {
    console.error("[Student Dashboard] Exam data load failed", error);

    renderEmptyState(
      document.getElementById("availableExams"),
      "Unable to load assigned exams right now.",
      { variant: "error" }
    );

    renderEmptyState(
      document.getElementById("recentAttempts"),
      "Recent attempts are unavailable.",
      { variant: "error" }
    );
  }

  try {
    const intelligence = await loadStudentIntelligence({
      attemptRows: examDashboardData?.attemptRows,
    });
    const learningState = buildStudentLearningState(intelligence);
    window.__PREPOS_STUDENT_LEARNING_STATE__ = learningState;

    renderIntelligenceSections(learningState);

    if (!examDashboardData) {
      renderRecentAttempts(
        document.getElementById("recentAttempts"),
        selectRecentProgress(learningState)
      );
      bindExamStartActions(startExamById);
    }
  } catch (error) {
    console.error("[Student Dashboard] Intelligence load failed", error);
    renderIntelligenceErrorStates();
  }

  await loadStudentTopicNotes();
}

window.startExamById = startExamById;
window.goToPractice = goToPractice;
window.goToPracticeTopic = goToPracticeTopic;
window.scrollToTopicNotes = scrollToTopicNotes;
window.initStudent = initStudent;

function bootStudentDashboard() {
  initStudent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootStudentDashboard);
} else {
  bootStudentDashboard();
}
