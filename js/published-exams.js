// =========================
// PUBLISHED EXAMS MANAGEMENT
// =========================

import { bootPage } from "./core/page-boot.js";
import { getClient } from "./core/get-client.js";
import { invokeEdgeFunction } from "./core/edge-invoke.js";
import { resolveAppPath } from "./core/access.js";
import {
  openAssignExamModal,
  initAssignExamModal,
} from "./ui/assign-exam-modal.js";
import { formatExamDuration } from "./student/student-exam-meta.js";

let currentUser = null;
let currentRole = null;
let currentExams = [];
let assignmentSummaries = new Map();

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

async function loadAssignmentSummaries(examIds) {
  const map = new Map();

  if (!examIds.length) {
    return map;
  }

  for (const id of examIds) {
    map.set(id, { batchNames: [], individualCount: 0 });
  }

  const sb = await getClient();

  const [batchRes, assignRes] = await Promise.all([
    sb
      .from("exam_batch_assignments")
      .select("exam_id, student_batches(name)")
      .in("exam_id", examIds),
    sb
      .from("exam_assignments")
      .select("exam_id, source_batch_id")
      .in("exam_id", examIds),
  ]);

  if (batchRes.error) {
    console.warn("Failed to load batch assignment labels", batchRes.error);
  }

  if (assignRes.error) {
    console.warn("Failed to load individual assignment counts", assignRes.error);
  }

  for (const row of assignRes.data || []) {
    const entry = map.get(row.exam_id);
    if (!entry) continue;

    if (!row.source_batch_id) {
      entry.individualCount += 1;
    }
  }

  for (const row of batchRes.data || []) {
    const entry = map.get(row.exam_id);
    if (!entry) continue;

    const batch = row.student_batches;
    const name = Array.isArray(batch) ? batch[0]?.name : batch?.name;

    if (name && !entry.batchNames.includes(name)) {
      entry.batchNames.push(name);
    }
  }

  return map;
}

function formatAssignmentSummary(exam) {
  const total = getAssignedCount(exam);

  if (!total) {
    return "Not assigned yet";
  }

  const summary = assignmentSummaries.get(exam.id) ?? {
    batchNames: [],
    individualCount: 0,
  };

  const parts = [
    `${total} student${total === 1 ? "" : "s"} assigned`,
  ];

  if (summary.batchNames.length) {
    parts.push(`Batches: ${summary.batchNames.join(", ")}`);
  }

  if (summary.individualCount > 0) {
    parts.push(`${summary.individualCount} individual`);
  }

  return parts.join(" · ");
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
      .select(`
        id,
        title,
        created_at,
        duration,
        created_by,
        source_draft_id,
        series_id,
        part_index,
        part_count,
        require_sequential_parts,
        exam_assignments(count)
      `)
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
    assignmentSummaries = await loadAssignmentSummaries(
      currentExams.map((exam) => exam.id)
    );
    renderExams(currentExams);
  } catch (error) {
    console.error(error);
    if (list) list.innerHTML = "<p class='empty-state'>Unable to load exams</p>";
    if (count) count.textContent = "Load failed";
  }
}

function groupPublishedExams(exams = []) {
  const seriesMap = new Map();
  const standalone = [];

  for (const exam of exams) {
    if (exam.series_id && exam.part_index) {
      const bucket = seriesMap.get(exam.series_id) ?? [];
      bucket.push(exam);
      seriesMap.set(exam.series_id, bucket);
      continue;
    }

    standalone.push(exam);
  }

  const groups = [...seriesMap.entries()].map(([seriesId, parts]) => {
    const sortedParts = [...parts].sort(
      (a, b) => Number(a.part_index) - Number(b.part_index)
    );
    const baseTitle =
      sortedParts[0]?.title?.replace(/\s—\sPart\s\d+$/i, "").trim() ||
      sortedParts[0]?.title ||
      "Exam Series";

    return {
      seriesId,
      sourceDraftId: sortedParts[0]?.source_draft_id ?? null,
      title: baseTitle,
      parts: sortedParts,
      createdAt: sortedParts.reduce((latest, part) => {
        const time = new Date(part.created_at).getTime();
        return Number.isFinite(time) && time > latest ? time : latest;
      }, 0),
    };
  });

  groups.sort((a, b) => b.createdAt - a.createdAt);
  standalone.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { groups, standalone };
}

function renderExamActions(exam) {
  const assignmentLabel = formatAssignmentSummary(exam);
  const examTitle = exam.title || "Untitled Exam";

  return `
    <div class="flex gap-10" style="flex-wrap:wrap;">
      <button class="primary-btn" data-action="assign" data-exam-id="${escapeHTML(exam.id)}" data-exam-title="${escapeHTML(examTitle)}">Assign</button>
      <button type="button" class="secondary-btn" data-prepos-href="exam.html?id=${escapeHTML(exam.id)}&amp;mode=inspect">Inspect</button>
      <button type="button" class="secondary-btn" data-action="student-preview" data-exam-id="${escapeHTML(exam.id)}" data-exam-title="${escapeHTML(examTitle)}">Student preview</button>
      <button class="secondary-btn" onclick="viewResults('${escapeHTML(exam.id)}')">Results</button>
      <button class="danger-btn" onclick="deletePublishedExam('${escapeHTML(exam.id)}')">Delete</button>
    </div>
    <div class="text-muted mt-5">${escapeHTML(assignmentLabel)}</div>
  `;
}

function openStudentPreview(examId, examTitle) {
  const confirmed = confirm(
    `Student preview: "${examTitle}"\n\nThis simulates the real exam experience:\n• The timer will start and count down\n• Answers may be saved in this browser\n• Submitting records an attempt\n\nContinue?`
  );

  if (!confirmed) return;

  window.location.href = resolveAppPath(
    `exam.html?id=${encodeURIComponent(examId)}`
  );
}

function renderStandaloneExam(exam) {
  const item = document.createElement("div");
  item.className = "recent-item mt-10";

  const createdAt = exam.created_at
    ? new Date(exam.created_at).toLocaleString()
    : "-";

  item.innerHTML = `
    <div class="flex" style="justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
      <div>
        <b>${escapeHTML(exam.title || "Untitled Exam")}</b>
        <div class="text-muted mt-5">Created: ${createdAt}</div>
        <div class="text-muted mt-5">Duration: ${escapeHTML(formatExamDuration(exam.duration) || "—")}</div>
      </div>
      <div>${renderExamActions(exam)}</div>
    </div>
  `;

  return item;
}

function renderExamSeriesGroup(group) {
  const item = document.createElement("div");
  item.className = "recent-item mt-10 published-series-group";

  const createdAt = group.createdAt
    ? new Date(group.createdAt).toLocaleString()
    : "-";
  const partExamIds = group.parts.map((part) => part.id);
  const assignPayload = JSON.stringify(partExamIds);
  const assignTitle = JSON.stringify(`${group.title} (${group.parts.length} parts)`);

  item.innerHTML = `
    <div class="flex" style="justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
      <div style="flex:1;">
        <b>${escapeHTML(group.title)}</b>
        <div class="text-muted mt-5">${group.parts.length} parts · Latest publish: ${createdAt}</div>
        ${
          group.sourceDraftId
            ? `<div class="text-muted mt-5">From draft · sequential parts enabled</div>`
            : ""
        }
        <div class="mt-10">
          ${group.parts
            .map((part) => {
              const created = part.created_at
                ? new Date(part.created_at).toLocaleString()
                : "-";

              return `
                <div class="question-card mt-10">
                  <div class="flex" style="justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <div>
                      <b>${escapeHTML(part.title || "Untitled Exam")}</b>
                      <div class="text-muted mt-5">Part ${part.part_index}${part.part_count ? ` of ${part.part_count}` : ""}</div>
                      <div class="text-muted mt-5">Created: ${created}</div>
                      <div class="text-muted mt-5">Duration: ${escapeHTML(formatExamDuration(part.duration) || "—")}</div>
                      <div class="text-muted mt-5">${escapeHTML(formatAssignmentSummary(part))}</div>
                    </div>
                    <div>${renderExamActions(part)}</div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="flex gap-10" style="flex-direction:column; align-items:stretch;">
        <button
          type="button"
          class="primary-btn"
          onclick='openAssignExamModal(${assignPayload}, { examTitle: ${assignTitle} })'
        >
          Assign All Parts
        </button>
        <button
          type="button"
          class="danger-btn"
          data-action="delete-series"
          data-series-id="${escapeHTML(group.seriesId)}"
          data-series-title="${escapeHTML(group.title)}"
          data-part-count="${group.parts.length}"
        >
          Delete All Parts
        </button>
      </div>
    </div>
  `;

  return item;
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

  const { groups, standalone } = groupPublishedExams(exams);

  groups.forEach((group) => {
    list.appendChild(renderExamSeriesGroup(group));
  });

  standalone.forEach((exam) => {
    list.appendChild(renderStandaloneExam(exam));
  });
}

function openAssignForExam(examId, examTitle) {
  openAssignExamModal(examId, {
    examTitle,
    onAssigned: loadPublishedExams,
  });
}

async function requestDeletePublishedExam(payload) {
  const result = await invokeEdgeFunction("delete-published-exam", payload);

  if (!result?.success) {
    throw new Error(result?.error || "Delete failed");
  }

  return result;
}

async function deletePublishedExam(examId) {
  const exam = currentExams.find((item) => item.id === examId);
  const title = exam?.title || "this exam";

  const confirmed = confirm(
    `Permanently delete "${title}"?\n\nThis will also remove its assignments and attempts. This cannot be undone.`
  );

  if (!confirmed) return;

  const typed = prompt("Type DELETE to permanently delete this exam.");
  if (typed !== "DELETE") return;

  try {
    await requestDeletePublishedExam({ examId });
    await loadPublishedExams();
  } catch (error) {
    console.error(error);
    alert(error.message || "Delete failed");
  }
}

async function deletePublishedExamSeries(seriesId, seriesTitle, partCount) {
  const title = seriesTitle || "this exam series";
  const count = Number(partCount) || 0;

  const confirmed = confirm(
    `Permanently delete all ${count} part${count === 1 ? "" : "s"} of "${title}"?\n\nThis removes every part, their assignments, and all student attempts. The source draft will be reset so you can publish again. This cannot be undone.`
  );

  if (!confirmed) return;

  const typed = prompt(
    `Type DELETE to permanently delete all ${count} part${count === 1 ? "" : "s"}.`
  );
  if (typed !== "DELETE") return;

  try {
    await requestDeletePublishedExam({ seriesId });
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
  location.href = resolveAppPath(
    `teacher-results.html?examId=${encodeURIComponent(examId)}`
  );
}

async function initPublishedExams() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Published Exams",
      subtitle: "Assign students, inspect exams, and view results",
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
      const assignButton = event.target.closest("[data-action='assign']");
      if (assignButton) {
        openAssignForExam(
          assignButton.dataset.examId,
          assignButton.dataset.examTitle || "Untitled Exam"
        );
        return;
      }

      const previewButton = event.target.closest("[data-action='student-preview']");
      if (previewButton) {
        openStudentPreview(
          previewButton.dataset.examId,
          previewButton.dataset.examTitle || "Untitled Exam"
        );
        return;
      }

      const deleteSeriesButton = event.target.closest("[data-action='delete-series']");
      if (deleteSeriesButton) {
        deletePublishedExamSeries(
          deleteSeriesButton.dataset.seriesId,
          deleteSeriesButton.dataset.seriesTitle,
          deleteSeriesButton.dataset.partCount
        );
      }
    });

  toggleCustomDateInputs();
  await loadPublishedExams();

  const { upgradeLegacyOnclickNav } = await import("./core/navigate.js");
  upgradeLegacyOnclickNav(document.getElementById("publishedExamList") ?? document);
}

window.deletePublishedExam = deletePublishedExam;
window.viewResults = viewResults;
window.openAssignExamModal = openAssignExamModal;

document.addEventListener("DOMContentLoaded", initPublishedExams);
