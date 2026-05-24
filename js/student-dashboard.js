/**
 * PrepOS Student Dashboard — orchestration bootstrap only.
 */

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

async function requireStudentAccess() {
  const { getClient } = await import("./core/get-client.js");
  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser();
  const user = userData?.user;

  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  const { data, error } = await sb
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    window.location.href = "login.html";
    return false;
  }

  if (data.role !== "student" && data.role !== "admin") {
    window.location.href = "login.html";
    return false;
  }

  return true;
}

function startExam() {
  const id = document.getElementById("examId")?.value.trim();
  if (!id) {
    alert("Enter exam id");
    return;
  }
  location.href = `exam.html?id=${id}`;
}

function startExamById(id) {
  location.href = `exam.html?id=${id}`;
}

function goToPractice() {
  location.href = "practice.html";
}

function goToPracticeTopic(topic) {
  const key = normalizeTopicKey(topic);
  location.href = `practice.html?topic=${encodeURIComponent(key)}`;
}

async function initStudent() {
  if (typeof window.requireAuth === "function") {
    const authed = await window.requireAuth();
    if (!authed) return;
  }

  const allowed = await requireStudentAccess();
  if (!allowed) return;

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
