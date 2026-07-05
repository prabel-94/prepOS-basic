import { bootPage } from "./core/page-boot.js";
import { resolveAppPath } from "./core/access.js";
import { teacherStudentPreviewHubPath } from "./core/student-preview.js";
import { getClient } from "./core/get-client.js";
import { loadTopicNotesSection } from "./notes/note-home.js";
import { initStudentManagement } from "./teacher/student-management.js";
import {
  applyStudentManagementVisibility,
  ensureStudentManagementReady,
  initStudentManagementSecretToggle,
} from "./teacher/student-management-visibility.js";
import { mountLinkedLearnerUI } from "./teacher/linked-learner-ui.js";
import { getTimeGreeting, getFirstName } from "./student/student-welcome.js";
import { renderDashboardSkeleton } from "./student/student-dashboard-renderer.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveTeacherDisplayName(runtime = {}) {
  const user = runtime.user;
  const fromMeta = user?.user_metadata?.full_name;
  if (fromMeta?.trim()) {
    return fromMeta.trim();
  }

  const emailPrefix = user?.email?.split("@")?.[0];
  if (emailPrefix) {
    return emailPrefix;
  }

  return "Teacher";
}

function renderTeacherWelcome(runtime = {}) {
  const container = document.getElementById("teacherWelcome");
  if (!container) {
    return;
  }

  const displayName = resolveTeacherDisplayName(runtime);
  const greeting = getTimeGreeting();
  const firstName = getFirstName(displayName);

  container.innerHTML = `
    <div class="teacher-welcome-inner">
      <div class="teacher-welcome-headline">${escapeHTML(greeting)}, ${escapeHTML(firstName)}.</div>
      <div class="teacher-welcome-detail">
        Create exams, manage learners, and review classroom intelligence below.
      </div>
    </div>
  `;
}

function formatRecentDate(iso) {
  if (!iso) {
    return "";
  }

  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function markListLoaded(container) {
  container?.removeAttribute("aria-busy");
}

function renderTeacherEmptyState(container, message) {
  if (!container) {
    return;
  }

  markListLoaded(container);
  container.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function goToStudentPreview() {
  location.href = teacherStudentPreviewHubPath();
}

function goToCreatorMode() {
  location.href = resolveAppPath("creator-mode.html");
}

function openExam() {
  const id = document.getElementById("examId2")?.value.trim();
  if (!id) {
    alert("Enter exam id");
    return;
  }
  location.href = resolveAppPath(`exam.html?id=${id}`);
}

function viewResults(examId) {
  localStorage.setItem("results_exam", examId);
  location.href = resolveAppPath(
    `teacher-results.html?examId=${encodeURIComponent(examId)}`
  );
}

async function loadRecentExams() {
  const container = document.getElementById("recentExams");
  if (!container) return;

  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("exam_sessions")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    container.innerHTML = "";

    if (!data?.length) {
      renderTeacherEmptyState(container, "No exams yet — create your first draft above.");
      return;
    }

    markListLoaded(container);

    data.forEach((exam) => {
      const row = document.createElement("div");
      row.className = "teacher-recent-row";
      row.innerHTML = `
        <div class="teacher-recent-row-main">
          <div class="teacher-recent-row-title">${escapeHTML(exam.title)}</div>
          <div class="teacher-recent-row-meta">${escapeHTML(formatRecentDate(exam.created_at))}</div>
        </div>
        <div class="teacher-recent-row-actions">
          <button type="button" class="secondary-btn" data-prepos-href="exam.html?id=${escapeHTML(exam.id)}">Open</button>
          <button type="button" class="secondary-btn" data-action="view-results" data-exam-id="${escapeHTML(exam.id)}">Results</button>
        </div>
      `;
      container.appendChild(row);
    });

    container.querySelectorAll('[data-action="view-results"]').forEach((button) => {
      button.addEventListener("click", () => {
        viewResults(button.dataset.examId);
      });
    });
  } catch (error) {
    console.error(error);
    renderTeacherEmptyState(container, "Unable to load exams");
  }
}

async function loadRecentDraft() {
  const container = document.getElementById("recentDraft");
  if (!container) return;

  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("draft_exams")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data?.length) {
      renderTeacherEmptyState(container, "No drafts yet — start with Create New Exam.");
      return;
    }

    const draft = data[0];
    markListLoaded(container);
    container.innerHTML = `
      <div class="teacher-recent-row">
        <div class="teacher-recent-row-main">
          <div class="teacher-recent-row-title">${escapeHTML(draft.title)}</div>
          <div class="teacher-recent-row-meta">Updated ${escapeHTML(formatRecentDate(draft.updated_at))}</div>
        </div>
        <div class="teacher-recent-row-actions">
          <button type="button" class="primary-btn" data-prepos-href="draft.html?id=${escapeHTML(draft.id)}">
            Resume Draft
          </button>
        </div>
      </div>
    `;
  } catch (error) {
    renderTeacherEmptyState(container, "Unable to load draft");
  }
}

function showTeacherHomeSkeletons() {
  renderDashboardSkeleton(document.getElementById("recentExams"), { rows: 3 });
  renderDashboardSkeleton(document.getElementById("recentDraft"), { rows: 1 });
  renderDashboardSkeleton(document.getElementById("teacherTopicNotes"), { rows: 2 });
}

async function initTeacherHome() {
  showTeacherHomeSkeletons();

  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      variant: "home",
      showHome: false,
      title: "Teacher Console",
      subtitle: "Manage exams, question bank, and results",
      links: [
        { label: "Question Bank", href: "qb-manager.html" },
        { label: "Published", href: "published-exams.html" },
        { label: "Results", href: "teacher-results.html" },
      ],
    },
  });

  if (!runtime) return;

  renderTeacherWelcome(runtime);

  const { upgradeLegacyOnclickNav } = await import("./core/navigate.js");
  upgradeLegacyOnclickNav(document);

  applyStudentManagementVisibility();
  initStudentManagementSecretToggle();

  window.addEventListener("prepos:student-management-unlocked", () => {
    ensureStudentManagementReady(initStudentManagement).catch((error) => {
      console.error("[Teacher Home] Student Management init failed", error);
    });
  });

  await Promise.all([
    loadRecentExams(),
    loadRecentDraft(),
    mountLinkedLearnerUI(),
  ]);

  window.addEventListener("prepos:learner-deleted", (event) => {
    if (event.detail?.isLinkedLearner) {
      mountLinkedLearnerUI().catch((error) => {
        console.error("[Teacher Home] linked learner refresh failed", error);
      });
    }
  });

  await ensureStudentManagementReady(initStudentManagement);
  await loadTopicNotesSection(document.getElementById("teacherTopicNotes"), {
    role: "teacher",
  });
  document.getElementById("teacherTopicNotes")?.removeAttribute("aria-busy");
  upgradeLegacyOnclickNav(document);
}

window.goToStudentPreview = goToStudentPreview;
window.goToCreatorMode = goToCreatorMode;
window.openExam = openExam;
window.viewResults = viewResults;

initTeacherHome();
