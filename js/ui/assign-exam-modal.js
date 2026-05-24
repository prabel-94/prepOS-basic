import { getClient } from "../core/get-client.js";
import { openModal, closeModal, isModalOpen } from "./modal-system.js";

const MODAL_ID = "assignModal";

let currentExamId = null;
let selectedStudents = [];
let assignedStudentIds = new Set();
let studentSearchTimer = null;
let onAssignedCallback = null;

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getAccessToken() {
  const sb = await getClient();
  const { data: sessionData } = await sb.auth.getSession();
  let accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
    if (refreshError || !refreshed?.session?.access_token) {
      throw new Error("Your session expired. Please sign in again.");
    }
    accessToken = refreshed.session.access_token;
  }

  return accessToken;
}

async function invokeEdgeFunction(name, body) {
  const sb = await getClient();
  const accessToken = await getAccessToken();

  const { data, error } = await sb.functions.invoke(name, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    let message = error.message || `${name} failed`;

    if (error.context instanceof Response) {
      const details = await error.context.clone().json().catch(() => null);
      message = details?.error || message;
    }

    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

function setModalCopy({ examTitle, assignedCount = 0 } = {}) {
  const titleEl = document.getElementById("assignModalTitle");
  const subtitleEl = document.getElementById("assignModalSubtitle");

  if (titleEl) {
    titleEl.textContent = examTitle ? `Assign: ${examTitle}` : "Assign Exam";
  }

  if (subtitleEl) {
    if (assignedCount > 0) {
      subtitleEl.textContent = `${assignedCount} student${assignedCount === 1 ? "" : "s"} already assigned. Select additional students below.`;
      subtitleEl.classList.remove("hidden");
    } else {
      subtitleEl.textContent = "Select students to assign this exam.";
      subtitleEl.classList.remove("hidden");
    }
  }
}

function renderStudentList(students = []) {
  const list = document.getElementById("studentList");
  if (!list) return;

  if (!students.length) {
    list.innerHTML = `<div class="empty-state">No students found</div>`;
    return;
  }

  list.innerHTML = students.map((student) => {
    const alreadyAssigned = assignedStudentIds.has(student.id);
    const checked = alreadyAssigned || selectedStudents.includes(student.id) ? "checked" : "";
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
  }).join("");
}

async function loadAssignedStudents(examId) {
  assignedStudentIds = new Set();

  try {
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
    });

    renderStudentList(result.students || []);
  } catch (error) {
    console.error(error);
    if (list) {
      list.innerHTML = `<div class="empty-state">Unable to load students</div>`;
    }
  }
}

function resetAssignModalState() {
  currentExamId = null;
  selectedStudents = [];
  assignedStudentIds = new Set();
  onAssignedCallback = null;
}

export async function openAssignExamModal(examId, { examTitle, onAssigned } = {}) {
  if (!examId) return;

  currentExamId = examId;
  selectedStudents = [];
  onAssignedCallback = typeof onAssigned === "function" ? onAssigned : null;

  const search = document.getElementById("studentSearch");
  if (search) search.value = "";

  const assignedCount = await loadAssignedStudents(examId);
  setModalCopy({ examTitle, assignedCount });

  openModal(MODAL_ID, {
    overlayType: "modal",
    onClose: resetAssignModalState,
  });

  loadStudents();
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

  if (!newStudentIds.length) {
    alert("Select at least one student who is not already assigned");
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
    });

    alert(`Assigned successfully (${result.assigned ?? newStudentIds.length} student${newStudentIds.length === 1 ? "" : "s"})`);
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
  document.getElementById("assignSelectedBtn")
    ?.addEventListener("click", assignSelectedStudents);

  document.getElementById("closeAssignModal")
    ?.addEventListener("click", closeAssignExamModal);

  document.getElementById("studentSearch")
    ?.addEventListener("input", (event) => {
      clearTimeout(studentSearchTimer);
      studentSearchTimer = setTimeout(() => {
        loadStudents(event.target.value);
      }, 250);
    });

  document.getElementById("studentList")
    ?.addEventListener("change", (event) => {
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
}

// Back-compat alias used by draft publish button onclick.
export const openAssignModal = openAssignExamModal;
