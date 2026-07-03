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
  renderWelcomeBanner,
} from "./student/student-dashboard-renderer.js";
import {
  resolveStudentDisplayName,
  buildAchievementHint,
} from "./student/student-welcome.js";
import { loadTopicNotesSection } from "./notes/note-home.js";
import { mountAppNav } from "./ui/app-nav.js";
import {
  bindStudentSectionNav,
  renderStudentSectionNav,
  scrollToStudentSection,
} from "./student/student-section-nav.js";

function startExamById(id) {
  location.href = resolveAppPath(`exam.html?id=${id}`);
}

function goToPractice() {
  location.href = resolveAppPath("practice.html");
}

function scrollToTopicNotes() {
  scrollToStudentSection("topicNotesSection");
}

function handleNotesHashOnLoad() {
  if (window.location.hash === "#topicNotesSection") {
    window.requestAnimationFrame(() => scrollToTopicNotes());
  }
}

function mountStudentDashboardNav(runtime) {
  const title =
    runtime.learnerContext?.studentModeActive ? "My Learning" : "Student Dashboard";

  mountAppNav({
    variant: "home",
    showHome: false,
    title,
    subtitle: "Exams, practice, and learning intelligence",
    role: runtime.role,
    links: [
      { label: "Practice", href: "practice.html" },
      {
        label: "Notes",
        href: "student-dashboard.html#topicNotesSection",
        active: true,
      },
    ],
  });
}

async function updateWelcomeBanner(displayName, exams = [], learningState = null) {
  renderWelcomeBanner(document.getElementById("studentWelcome"), {
    displayName,
    exams,
    achievementHint: learningState ? buildAchievementHint(learningState) : "",
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
  renderWelcomeBanner(document.getElementById("studentWelcome"));

  const runtime = await bootPage({
    roles: ["student", "admin"],
    allowLinkedStudentMode: true,
    nav: false,
  });

  if (!runtime) return;

  mountStudentDashboardNav(runtime);
  renderStudentSectionNav(document.getElementById("studentSectionNavRoot"));
  bindStudentSectionNav();
  handleNotesHashOnLoad();

  document.querySelector('a[href="#topicNotesSection"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    scrollToTopicNotes();
  });

  const { mountStudentModeNav } = await import("./teacher/linked-learner-ui.js");
  await mountStudentModeNav(runtime);

  const displayName = await resolveStudentDisplayName(runtime);

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

    await updateWelcomeBanner(displayName, examDashboardData.exams ?? []);

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

    await updateWelcomeBanner(displayName, []);

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
    await updateWelcomeBanner(
      displayName,
      examDashboardData?.exams ?? [],
      learningState
    );

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
