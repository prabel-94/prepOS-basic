import { invokeEdgeFunction } from "../core/edge-invoke.js";
import { listBatches } from "../core/batch-management.js";
import { openModal, closeModal, isModalOpen } from "./modal-system.js";

const MODAL_ID = "assignModal";

let currentExamId = null;
let selectedStudents = [];
let selectedBatches = [];
let assignedStudentIds = new Set();
let studentSearchTimer = null;
let batchSearchTimer = null;
let onAssignedCallback = null;
let activeAssignTab = "students";
let cachedBatches = [];

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setModalCopy({ examTitle, assignedCount = 0 } = {}) {
  const titleEl = document.getElementById("assignModalTitle");
  const subtitleEl = document.getElementById("assignModalSubtitle");

  if (titleEl) {
    titleEl.textContent = examTitle ? `Assign: ${examTitle}` : "Assign Exam";
  }

  if (subtitleEl) {
    if (assignedCount > 0) {
      subtitleEl.textContent = `${assignedCount} student${assignedCount === 1 ? "" : "s"} already assigned. Select additional students or batches below.`;
      subtitleEl.classList.remove("hidden");
    } else {
      subtitleEl.textContent =
        "Select individual students, entire batches, or both.";
      subtitleEl.classList.remove("hidden");
    }
  }
}

function setAssignTab(tab) {
  activeAssignTab = tab === "batches" ? "batches" : "students";

  document
    .getElementById("assignTabStudents")
    ?.classList.toggle("student-management-tab--active", activeAssignTab === "students");
  document
    .getElementById("assignTabBatches")
    ?.classList.toggle("student-management-tab--active", activeAssignTab === "batches");

  document
    .getElementById("assignStudentsPanel")
    ?.classList.toggle("hidden", activeAssignTab !== "students");
  document
    .getElementById("assignBatchesPanel")
    ?.classList.toggle("hidden", activeAssignTab !== "batches");
}

function renderStudentList(students = []) {
  const list = document.getElementById("studentList");
  if (!list) return;

  if (!students.length) {
    list.innerHTML = `<div class="empty-state">No students found in your roster</div>`;
    return;
  }

  list.innerHTML = students
    .map((student) => {
      const alreadyAssigned = assignedStudentIds.has(student.id);
      const checked =
        alreadyAssigned || selectedStudents.includes(student.id) ? "checked" : "";
      const disabled = alreadyAssigned ? "disabled" : "";
      const label = student.name || student.email || "Unnamed student";
      const suffix = alreadyAssigned ? ' <span class="text-muted">(assigned)</span>' : "";

      return `
        <label class="radio-row${alreadyAssigned ? " text-muted" : ""}">
          <input
            type="checkbox"
            value="${escapeHTML(student.id)}"
            ${checked}
            ${disabled}
          >
          ${escapeHTML(label)}${suffix}
        </label>
      `;
    })
    .join("");
}

function renderBatchList(batches = [], search = "") {
  const list = document.getElementById("batchList");
  if (!list) return;

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = batches.filter((batch) => {
    if (!normalizedSearch) {
      return true;
    }

    const name = (batch.name ?? "").toLowerCase();
    const description = (batch.description ?? "").toLowerCase();
    return name.includes(normalizedSearch) || description.includes(normalizedSearch);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No batches match your search</div>`;
    return;
  }

  list.innerHTML = filtered
    .map((batch) => {
      const checked = selectedBatches.includes(batch.id) ? "checked" : "";
      const memberLabel =
        batch.memberCount === 1 ? "1 member" : `${batch.memberCount} members`;
      const description = batch.description
        ? `<div class="text-muted mt-5 batch-card-description">${escapeHTML(batch.description)}</div>`
        : "";

      return `
        <label class="radio-row assign-batch-row">
          <input
            type="checkbox"
            class="assign-batch-checkbox"
            value="${escapeHTML(batch.id)}"
            ${checked}
          >
          <span class="assign-batch-row-label">
            <b>${escapeHTML(batch.name)}</b>
            <span class="text-muted"> · ${escapeHTML(memberLabel)}</span>
            ${description}
          </span>
        </label>
      `;
    })
    .join("");
}

async function loadAssignedStudents(examId) {
  assignedStudentIds = new Set();

  try {
    const { getClient } = await import("../core/get-client.js");
    const sb = await getClient();
    const { data, error } = await sb
      .from("exam_assignments")
      .select("student_id")
      .eq("exam_id", examId);

    if (error) throw error;

    assignedStudentIds = new Set((data || []).map((row) => row.student_id));
  } catch (error) {
    console.error("Failed to load existing assignments", error);
  }

  return assignedStudentIds.size;
}

async function loadStudents(search = "") {
  const list = document.getElementById("studentList");
  if (list) list.innerHTML = "Loading students...";

  try {
    const result = await invokeEdgeFunction("list-students", {
      search: search.trim(),
      managedOnly: true,
    });

    renderStudentList(result.students || []);
  } catch (error) {
    console.error(error);
    if (list) {
      list.innerHTML = `<div class="empty-state">Unable to load students</div>`;
    }
  }
}

async function loadBatches(search = "") {
  const list = document.getElementById("batchList");
  if (list) list.innerHTML = "Loading batches...";

  try {
    cachedBatches = await listBatches();
    renderBatchList(cachedBatches, search);
  } catch (error) {
    console.error(error);
    if (list) {
      list.innerHTML = `<div class="empty-state">Unable to load batches</div>`;
    }
  }
}

function resetAssignModalState() {
  currentExamId = null;
  selectedStudents = [];
  selectedBatches = [];
  assignedStudentIds = new Set();
  onAssignedCallback = null;
  activeAssignTab = "students";
  cachedBatches = [];
}

export async function openAssignExamModal(examId, { examTitle, onAssigned } = {}) {
  if (!examId) return;

  currentExamId = examId;
  selectedStudents = [];
  selectedBatches = [];
  onAssignedCallback = typeof onAssigned === "function" ? onAssigned : null;

  const studentSearch = document.getElementById("studentSearch");
  const batchSearch = document.getElementById("batchSearch");
  if (studentSearch) studentSearch.value = "";
  if (batchSearch) batchSearch.value = "";

  setAssignTab("students");

  const assignedCount = await loadAssignedStudents(examId);
  setModalCopy({ examTitle, assignedCount });

  openModal(MODAL_ID, {
    overlayType: "modal",
    onClose: resetAssignModalState,
  });

  loadStudents();
  loadBatches();
}

export function closeAssignExamModal() {
  closeModal(MODAL_ID);
}

export async function assignSelectedStudents() {
  if (!currentExamId) {
    alert("No exam selected");
    return false;
  }

  const newStudentIds = selectedStudents.filter((id) => !assignedStudentIds.has(id));
  const batchIds = [...selectedBatches];

  if (!newStudentIds.length && !batchIds.length) {
    alert("Select at least one student or batch to assign");
    return false;
  }

  const assignBtn = document.getElementById("assignSelectedBtn");
  const originalText = assignBtn?.innerText;

  try {
    if (assignBtn) {
      assignBtn.disabled = true;
      assignBtn.innerText = "Assigning...";
    }

    const result = await invokeEdgeFunction("assign-exam", {
      examId: currentExamId,
      studentIds: newStudentIds,
      batchIds,
    });

    const assigned = Number(result.assigned ?? 0);
    const skipped = Number(result.skipped ?? 0);
    const batchesRecorded = Number(result.batchesRecorded ?? 0);

    let message = `Assigned to ${assigned} student${assigned === 1 ? "" : "s"}.`;

    if (batchesRecorded > 0) {
      message += ` ${batchesRecorded} batch${batchesRecorded === 1 ? "" : "es"} recorded.`;
    }

    if (skipped > 0) {
      message += ` ${skipped} already assigned.`;
    }

    alert(message);

    const assignedExamId = currentExamId;
    const callback = onAssignedCallback;
    closeAssignExamModal();
    if (callback) {
      await callback(assignedExamId);
    }
    return true;
  } catch (error) {
    console.error(error);
    alert(error.message || "Assignment failed");
    return false;
  } finally {
    if (assignBtn) {
      assignBtn.disabled = false;
      assignBtn.innerText = originalText || "Assign";
    }

    if (!isModalOpen(MODAL_ID) && currentExamId) {
      resetAssignModalState();
    }
  }
}

export function initAssignExamModal() {
  document
    .getElementById("assignSelectedBtn")
    ?.addEventListener("click", assignSelectedStudents);

  document
    .getElementById("closeAssignModal")
    ?.addEventListener("click", closeAssignExamModal);

  document
    .getElementById("assignTabStudents")
    ?.addEventListener("click", () => setAssignTab("students"));

  document
    .getElementById("assignTabBatches")
    ?.addEventListener("click", () => setAssignTab("batches"));

  document.getElementById("studentSearch")?.addEventListener("input", (event) => {
    clearTimeout(studentSearchTimer);
    studentSearchTimer = setTimeout(() => {
      loadStudents(event.target.value);
    }, 250);
  });

  document.getElementById("batchSearch")?.addEventListener("input", (event) => {
    clearTimeout(batchSearchTimer);
    batchSearchTimer = setTimeout(() => {
      renderBatchList(cachedBatches, event.target.value ?? "");
    }, 250);
  });

  document.getElementById("studentList")?.addEventListener("change", (event) => {
    if (event.target.type !== "checkbox") return;

    const studentId = event.target.value;

    if (assignedStudentIds.has(studentId)) {
      event.target.checked = true;
      return;
    }

    if (event.target.checked) {
      if (!selectedStudents.includes(studentId)) {
        selectedStudents.push(studentId);
      }
    } else {
      selectedStudents = selectedStudents.filter((id) => id !== studentId);
    }
  });

  document.getElementById("batchList")?.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".assign-batch-checkbox");
    if (!checkbox) {
      return;
    }

    if (checkbox.checked) {
      if (!selectedBatches.includes(checkbox.value)) {
        selectedBatches.push(checkbox.value);
      }
    } else {
      selectedBatches = selectedBatches.filter((id) => id !== checkbox.value);
    }
  });
}

export const openAssignModal = openAssignExamModal;
