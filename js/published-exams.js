// =========================
// PUBLISHED EXAMS MANAGEMENT
// =========================

import { bootPage } from "./core/page-boot.js";
import { getClient } from "./core/get-client.js";
import {
  openAssignExamModal,
  initAssignExamModal,
} from "./ui/assign-exam-modal.js";

let currentUser = null;
let currentRole = null;
let currentExams = [];

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getAssignedCount(exam) {
  return Number(exam.exam_assignments?.[0]?.count ?? 0);
}

function getDateRange() {
  const filter = document.getElementById("dateFilter")?.value || "all";
  const now = new Date();
  let from = null;
  let to = null;

  if (filter === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  }

  if (filter === "7" || filter === "30") {
    from = new Date(now);
    from.setDate(from.getDate() - Number(filter));
    from.setHours(0, 0, 0, 0);
    to = now;
  }

  if (filter === "custom") {
    const fromValue = document.getElementById("fromDate")?.value;
    const toValue = document.getElementById("toDate")?.value;

    if (fromValue) {
      from = new Date(`${fromValue}T00:00:00`);
    }

    if (toValue) {
      to = new Date(`${toValue}T23:59:59`);
    }
  }

  return {
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
  };
}

function toggleCustomDateInputs() {
  const isCustom = document.getElementById("dateFilter")?.value === "custom";
  document.getElementById("fromDate")?.classList.toggle("hidden", !isCustom);
  document.getElementById("toDate")?.classList.toggle("hidden", !isCustom);
}

async function loadPublishedExams() {
  const sb = await getClient();
  const list = document.getElementById("publishedExamList");
  const count = document.getElementById("examCount");

  if (list) list.innerHTML = "Loading exams...";
  if (count) count.textContent = "Loading...";

  try {
    const range = getDateRange();

    let query = sb
      .from("exam_sessions")
      .select("id,title,created_at,duration,created_by, exam_assignments(count)")
      .order("created_at", { ascending: false });

    if (currentRole !== "admin") {
      query = query.eq("created_by", currentUser.id);
    }

    if (range.from) {
      query = query.gte("created_at", range.from);
    }

    if (range.to) {
      query = query.lte("created_at", range.to);
    }

    const { data, error } = await query;
    if (error) throw error;

    currentExams = data || [];
    renderExams(currentExams);
  } catch (error) {
    console.error(error);
    if (list) list.innerHTML = "<p class='empty-state'>Unable to load exams</p>";
    if (count) count.textContent = "Load failed";
  }
}

function renderExams(exams) {
  const list = document.getElementById("publishedExamList");
  const count = document.getElementById("examCount");

  if (count) {
    count.textContent = `${exams.length} published exam${exams.length === 1 ? "" : "s"}`;
  }

  if (!list) return;

  list.innerHTML = "";

  if (!exams.length) {
    list.innerHTML = "<div class='empty-state'>No published exams found</div>";
    return;
  }

  exams.forEach((exam) => {
    const item = document.createElement("div");
    item.className = "recent-item mt-10";

    const createdAt = exam.created_at
      ? new Date(exam.created_at).toLocaleString()
      : "-";

    const assignedCount = getAssignedCount(exam);
    const assignmentLabel = assignedCount === 1
      ? "1 student assigned"
      : `${assignedCount} students assigned`;

    item.innerHTML = `
      <div class="flex" style="justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
        <div>
          <b>${escapeHTML(exam.title || "Untitled Exam")}</b>
          <div class="text-muted mt-5">Created: ${createdAt}</div>
          <div class="text-muted mt-5">Duration: ${Number(exam.duration || 0)} minutes</div>
          <div class="text-muted mt-5">${escapeHTML(assignmentLabel)}</div>
        </div>
        <div class="flex gap-10" style="flex-wrap:wrap;">
          <button class="primary-btn" data-action="assign" data-exam-id="${escapeHTML(exam.id)}" data-exam-title="${escapeHTML(exam.title || "Untitled Exam")}">Assign</button>
          <button class="secondary-btn" onclick="location.href='exam.html?id=${escapeHTML(exam.id)}'">Open</button>
          <button class="secondary-btn" onclick="viewResults('${escapeHTML(exam.id)}')">Results</button>
          <button class="danger-btn" onclick="deletePublishedExam('${escapeHTML(exam.id)}')">Delete</button>
        </div>
      </div>
    `;

    list.appendChild(item);
  });
}

function openAssignForExam(examId, examTitle) {
  openAssignExamModal(examId, {
    examTitle,
    onAssigned: loadPublishedExams,
  });
}

async function deletePublishedExam(examId) {
  const sb = await getClient();
  const exam = currentExams.find((item) => item.id === examId);
  const title = exam?.title || "this exam";

  const confirmed = confirm(
    `Permanently delete "${title}"?\n\nThis will also remove its assignments and attempts. This cannot be undone.`
  );

  if (!confirmed) return;

  const typed = prompt("Type DELETE to permanently delete this exam.");
  if (typed !== "DELETE") return;

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-published-exam`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ examId }),
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok || !result.success) {
      throw new Error(result.error || `Delete failed (${res.status})`);
    }

    await loadPublishedExams();
  } catch (error) {
    console.error(error);
    alert(error.message || "Delete failed");
  }
}

function clearFilters() {
  document.getElementById("dateFilter").value = "all";
  document.getElementById("fromDate").value = "";
  document.getElementById("toDate").value = "";
  toggleCustomDateInputs();
  loadPublishedExams();
}

function viewResults(examId) {
  localStorage.setItem("results_exam", examId);
  location.href = `teacher-results.html?examId=${encodeURIComponent(examId)}`;
}

async function initPublishedExams() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Published Exams",
      subtitle: "Assign students, open exams, and view results",
      preset: "teacherExam",
    },
  });

  if (!runtime) return;

  currentUser = runtime.user;
  currentRole = runtime.role;

  initAssignExamModal();

  document.getElementById("dateFilter")
    ?.addEventListener("change", toggleCustomDateInputs);

  document.getElementById("applyFiltersBtn")
    ?.addEventListener("click", loadPublishedExams);

  document.getElementById("clearFiltersBtn")
    ?.addEventListener("click", clearFilters);

  document.getElementById("refreshExamsBtn")
    ?.addEventListener("click", loadPublishedExams);

  document.getElementById("publishedExamList")
    ?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='assign']");
      if (!button) return;

      openAssignForExam(
        button.dataset.examId,
        button.dataset.examTitle || "Untitled Exam"
      );
    });

  toggleCustomDateInputs();
  await loadPublishedExams();
}

window.deletePublishedExam = deletePublishedExam;
window.viewResults = viewResults;

document.addEventListener("DOMContentLoaded", initPublishedExams);
