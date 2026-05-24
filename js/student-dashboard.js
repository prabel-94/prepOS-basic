/**
 * PrepOS Student Dashboard — orchestration bootstrap only.
 */

import { bootPage } from "./core/page-boot.js";
import { resolveAppPath } from "./core/access.js";
import {
  loadStudentIntelligence,
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
  bindPracticeActions,
  bindExamStartActions,
  renderEmptyState,
} from "./student/student-dashboard-renderer.js";

function startExam() {
  const id = document.getElementById("examId")?.value.trim();
  if (!id) {
    alert("Enter exam id");
    return;
  }
  location.href = resolveAppPath(`exam.html?id=${id}`);
}

function startExamById(id) {
  location.href = resolveAppPath(`exam.html?id=${id}`);
}

function goToPractice() {
  location.href = resolveAppPath("practice.html");
}

function goToPracticeTopic(topic) {
  const key = normalizeTopicKey(topic);
  location.href = resolveAppPath(`practice.html?topic=${encodeURIComponent(key)}`);
}

async function initStudent() {
  const runtime = await bootPage({
    roles: ["student", "admin"],
    nav: {
      variant: "home",
      showHome: false,
      title: "Student Dashboard",
      subtitle: "Exams, practice, and learning intelligence",
      preset: "studentHome",
    },
  });

  if (!runtime) return;

  try {
    const intelligence = await loadStudentIntelligence();
    const learningState = buildStudentLearningState(intelligence);
    window.__PREPOS_STUDENT_LEARNING_STATE__ = learningState;

    const snapshotView = selectLearningSnapshot(learningState);
    const confidenceView = selectKnowledgeConfidence(learningState);
    const weakTopicCards = selectWeakTopicCards(learningState);
    const strongTopicCards = selectStrongTopicCards(learningState);
    const recommendations = selectRevisionRecommendations(learningState);
    const recentAttempts = selectRecentProgress(learningState);

    renderStudentDashboard({
      snapshotView,
      confidenceView,
      weakTopicCards,
      strongTopicCards,
      recommendations,
      exams: intelligence.exams ?? [],
      recentAttempts,
    });

    bindPracticeActions(goToPracticeTopic);
    bindExamStartActions(startExamById);
  } catch (error) {
    console.error("[Student Dashboard]", error);

    renderEmptyState(
      document.getElementById("learningSnapshot"),
      "Unable to load learning intelligence right now.",
      { variant: "error" }
    );

    renderEmptyState(
      document.getElementById("weakTopicsList"),
      "Weak topic insights are unavailable.",
      { variant: "error" }
    );
  }
}

window.startExam = startExam;
window.startExamById = startExamById;
window.goToPractice = goToPractice;
window.goToPracticeTopic = goToPracticeTopic;
window.initStudent = initStudent;

function bootStudentDashboard() {
  initStudent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootStudentDashboard);
} else {
  bootStudentDashboard();
}
