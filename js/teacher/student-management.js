/**
 * Teacher-managed learner roster — create and list learners.
 * Uses create-learner and list-students edge functions (no duplicate loading logic).
 */

import { invokeEdgeFunction } from "../core/edge-invoke.js";
import { openLearnerModal, initLearnerDetailsModal } from "./learner-details.js";
import {
  initBatchManagement,
  refreshBatches,
  loadBatchesIfActive,
} from "./batch-management.js";

const TAB_STORAGE_KEY = "prepos_student_management_tab";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message, { isError = false } = {}) {
  const el = document.getElementById("studentManagementStatus");
  if (!el) return;

  el.textContent = message;
  el.classList.toggle("text-muted", !message);
  el.classList.toggle("student-management-status--error", isError);
  el.classList.toggle(
    "student-management-status--success",
    Boolean(message) && !isError
  );
}

function getFormValues() {
  return {
    displayName:
      document.getElementById("learnerDisplayName")?.value?.trim() ?? "",
    email: document.getElementById("learnerEmail")?.value?.trim() ?? "",
    password: document.getElementById("learnerPassword")?.value ?? "",
  };
}

function resetCreateForm() {
  const displayNameEl = document.getElementById("learnerDisplayName");
  const emailEl = document.getElementById("learnerEmail");
  const passwordEl = document.getElementById("learnerPassword");

  if (displayNameEl) displayNameEl.value = "";
  if (emailEl) emailEl.value = "";
  if (passwordEl) passwordEl.value = "";
}

/**
 * Create a learner via the create-learner edge function.
 * @param {{ email: string, password: string, displayName: string }} params
 */
export async function createLearner({ email, password, displayName }) {
  return invokeEdgeFunction("create-learner", {
    email,
    password,
    displayName,
  });
}

/**
 * Preview what will be removed when deleting a learner.
 * @param {string} userId
 */
export async function getLearnerDeletionImpact(userId) {
  const { getClient } = await import("../core/get-client.js");
  const sb = await getClient();
  const { data, error } = await sb.rpc("get_learner_deletion_impact", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Student Management] deletion impact failed", error);
    throw error;
  }

  return data;
}

/**
 * Permanently delete a teacher-managed learner.
 * @param {{ userId: string, confirmation: string }} params
 */
export async function deleteLearner({ userId, confirmation }) {
  return invokeEdgeFunction("delete-learner", {
    userId,
    confirmation,
  });
}

/**
 * Load learners managed by the current teacher.
 * @returns {Promise<Array<{ id: string, email: string|null, name: string|null }>>}
 */
export async function loadLearners() {
  const result = await invokeEdgeFunction("list-students", {
    managedOnly: true,
  });

  return result.students ?? [];
}

/**
 * Reload and render the learner list.
 */
export async function refreshLearners() {
  const listEl = document.getElementById("learnerList");
  if (listEl) {
    listEl.innerHTML = `<div class="text-muted">Loading learners...</div>`;
  }

  try {
    const learners = await loadLearners();
    renderLearnerList(learners);
    return learners;
  } catch (error) {
    console.error("[Student Management] refreshLearners failed", error);
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state">Unable to load learners</div>`;
    }
    throw error;
  }
}

/**
 * Future lifecycle hook — not implemented in Phase 2.
 * @param {string} _userId
 */
export async function archiveLearner(_userId) {
  throw new Error("archiveLearner is not implemented yet");
}

function renderLearnerList(learners = []) {
  const listEl = document.getElementById("learnerList");
  if (!listEl) return;

  if (!learners.length) {
    listEl.innerHTML =
      `<div class="empty-state">No learners yet. Create your first learner above.</div>`;
    return;
  }

  listEl.innerHTML = learners
    .map((learner) => {
      const displayName = learner.name || learner.email || "Learner";
      const email = learner.email || "No email on file";

      return `
        <div class="recent-item mt-10 student-learner-row">
          <div class="topic-note-row">
            <div class="topic-note-row-main">
              <b>${escapeHTML(displayName)}</b>
              <div class="text-muted mt-5">${escapeHTML(email)}</div>
            </div>
            <div class="topic-note-row-actions">
              <button
                type="button"
                class="secondary-btn learner-view-btn"
                data-user-id="${escapeHTML(learner.id)}"
              >
                View
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function handleCreateLearnerSubmit(event) {
  event.preventDefault();

  const submitBtn = document.getElementById("createLearnerBtn");
  const { displayName, email, password } = getFormValues();

  if (!displayName || !email || !password) {
    setStatus("Display name, email, and password are required.", {
      isError: true,
    });
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  setStatus("Creating learner...");

  try {
    const created = await createLearner({ email, password, displayName });
    resetCreateForm();
    await refreshLearners();
    setStatus(
      `Learner created: ${created.displayName || displayName} (${created.email || email})`
    );
  } catch (error) {
    console.error("[Student Management] create failed", error);
    setStatus(error.message || "Unable to create learner.", { isError: true });
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function setStudentManagementTab(tab) {
  const studentsPanel = document.getElementById("studentManagementStudentsPanel");
  const batchesPanel = document.getElementById("studentManagementBatchesPanel");
  const studentsTab = document.getElementById("studentManagementTabStudents");
  const batchesTab = document.getElementById("studentManagementTabBatches");

  const showStudents = tab !== "batches";

  studentsPanel?.classList.toggle("hidden", !showStudents);
  batchesPanel?.classList.toggle("hidden", showStudents);

  studentsTab?.classList.toggle("student-management-tab--active", showStudents);
  batchesTab?.classList.toggle("student-management-tab--active", !showStudents);
  studentsTab?.setAttribute("aria-selected", showStudents ? "true" : "false");
  batchesTab?.setAttribute("aria-selected", showStudents ? "false" : "true");

  try {
    localStorage.setItem(TAB_STORAGE_KEY, showStudents ? "students" : "batches");
  } catch {
    /* ignore storage errors */
  }

  if (!showStudents) {
    refreshBatches().catch((error) => {
      console.error("[Student Management] batch list refresh failed", error);
    });
  }
}

function initStudentManagementTabs() {
  const studentsTab = document.getElementById("studentManagementTabStudents");
  const batchesTab = document.getElementById("studentManagementTabBatches");

  studentsTab?.addEventListener("click", () => setStudentManagementTab("students"));
  batchesTab?.addEventListener("click", () => setStudentManagementTab("batches"));

  let initialTab = "students";

  try {
    if (localStorage.getItem(TAB_STORAGE_KEY) === "batches") {
      initialTab = "batches";
    }
  } catch {
    /* ignore storage errors */
  }

  setStudentManagementTab(initialTab);
}

/**
 * Wire Student Management UI on Teacher Home.
 */
export async function initStudentManagement() {
  const form = document.getElementById("createLearnerForm");
  form?.addEventListener("submit", handleCreateLearnerSubmit);

  initLearnerDetailsModal();
  initBatchManagement();
  initStudentManagementTabs();

  window.addEventListener("prepos:learner-profile-updated", () => {
    refreshLearners().catch((error) => {
      console.error("[Student Management] list refresh failed", error);
    });
    loadBatchesIfActive().catch((error) => {
      console.error("[Student Management] batch refresh failed", error);
    });
  });

  window.addEventListener("prepos:learner-deleted", () => {
    refreshLearners().catch((error) => {
      console.error("[Student Management] list refresh failed", error);
    });
    loadBatchesIfActive().catch((error) => {
      console.error("[Student Management] batch refresh failed", error);
    });
  });

  window.addEventListener("prepos:batch-updated", () => {
    loadBatchesIfActive().catch((error) => {
      console.error("[Student Management] batch refresh failed", error);
    });
  });

  document.getElementById("learnerList")?.addEventListener("click", (event) => {
    const button = event.target.closest(".learner-view-btn");
    if (!button) {
      return;
    }

    const userId = button.dataset.userId;
    if (userId) {
      openLearnerModal(userId);
    }
  });

  await refreshLearners();
  await loadBatchesIfActive();
}
