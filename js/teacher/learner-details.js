/**
 * Teacher learner detail modal — lightweight identity + exam counts.
 */

import { getClient } from "../core/get-client.js";
import { updateLearnerDisplayName } from "../core/learner-profile.js";
import { invokeEdgeFunction } from "../core/edge-invoke.js";
import { openModal, closeModal } from "../ui/modal-system.js";

const MODAL_ID = "learnerDetailModal";
const DELETE_MODAL_ID = "learnerDeleteModal";

let currentUserId = null;
let currentDetails = null;
let currentDeleteImpact = null;
let isEditingName = false;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLastActivity(value) {
  if (!value) {
    return "Never Active";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never Active";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfActivity = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfActivity.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays > 1 && diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return formatDate(value);
}

function normalizeLearnerDetails(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const lastActivityAt = raw.lastActivityAt ?? raw.last_activity_at ?? null;

  const batchMemberships = Array.isArray(raw.batchMemberships)
    ? raw.batchMemberships.map((batch) => ({
        id: batch.id ?? null,
        name: batch.name ?? "",
      }))
    : Array.isArray(raw.batch_memberships)
      ? raw.batch_memberships.map((batch) => ({
          id: batch.id ?? null,
          name: batch.name ?? "",
        }))
      : [];

  return {
    id: raw.id ?? null,
    userId: raw.userId ?? raw.user_id ?? null,
    displayName: raw.displayName ?? raw.display_name ?? "",
    email: raw.email ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    examsAssigned: Number(raw.examsAssigned ?? raw.exams_assigned ?? 0),
    examsAttempted: Number(raw.examsAttempted ?? raw.exams_attempted ?? 0),
    lastActivityAt: lastActivityAt || null,
    batchMemberships,
  };
}

function renderBatchMemberships(memberships = []) {
  if (!memberships.length) {
    return `
      <dt>Member Of</dt>
      <dd class="text-muted">Not in any batches</dd>
    `;
  }

  const items = memberships
    .map((batch) => `<li>${escapeHTML(batch.name || "Batch")}</li>`)
    .join("");

  return `
    <dt>Member Of</dt>
    <dd>
      <ul class="learner-batch-membership-list">
        ${items}
      </ul>
    </dd>
  `;
}

function setFooterMode(mode) {
  const viewActions = document.getElementById("learnerDetailViewActions");
  const editActions = document.getElementById("learnerDetailEditActions");

  if (viewActions) {
    viewActions.classList.toggle("hidden", mode !== "view");
  }

  if (editActions) {
    editActions.classList.toggle("hidden", mode !== "edit");
  }
}

function setEditStatus(message, { isError = false } = {}) {
  const el = document.getElementById("learnerDetailEditStatus");
  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.toggle("student-management-status--error", isError);
  el.classList.toggle("student-management-status--success", Boolean(message) && !isError);
  el.classList.toggle("text-muted", !message);
}

function setDeleteStatus(message, { isError = false } = {}) {
  const el = document.getElementById("learnerDeleteStatus");
  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.toggle("student-management-status--error", isError);
  el.classList.toggle("student-management-status--success", Boolean(message) && !isError);
  el.classList.toggle("text-muted", !message);
}

function normalizeDeletionImpact(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const batchMemberships = Array.isArray(raw.batchMemberships)
    ? raw.batchMemberships
    : Array.isArray(raw.batch_memberships)
      ? raw.batch_memberships
      : [];

  const warnings = Array.isArray(raw.warnings) ? raw.warnings : [];

  return {
    userId: raw.userId ?? raw.user_id ?? null,
    displayName: raw.displayName ?? raw.display_name ?? "",
    email: raw.email ?? null,
    isLinkedLearner: Boolean(raw.isLinkedLearner ?? raw.is_linked_learner),
    examAssignments: Number(raw.examAssignments ?? raw.exam_assignments ?? 0),
    examAttempts: Number(raw.examAttempts ?? raw.exam_attempts ?? 0),
    practiceAttempts: Number(raw.practiceAttempts ?? raw.practice_attempts ?? 0),
    questionStats: Number(raw.questionStats ?? raw.question_stats ?? 0),
    batchMemberships,
    warnings,
  };
}

function renderDeletionImpact(impact) {
  const batchNames = impact.batchMemberships
    .map((batch) => escapeHTML(batch.name || "Batch"))
    .join(", ");

  const warningItems = impact.warnings
    .map((warning) => `<li>${escapeHTML(warning)}</li>`)
    .join("");

  return `
    <p>
      You are about to permanently delete
      <strong>${escapeHTML(impact.displayName || "this learner")}</strong>
      ${impact.email ? `(${escapeHTML(impact.email)})` : ""}.
    </p>
    <ul class="learner-delete-impact-list mt-10">
      <li>${impact.examAssignments} assigned exam(s)</li>
      <li>${impact.examAttempts} exam attempt(s)</li>
      <li>${impact.practiceAttempts} practice attempt(s)</li>
      <li>${impact.questionStats} question stat row(s)</li>
      <li>${impact.batchMemberships.length} batch membership(s)${
        batchNames ? `: ${batchNames}` : ""
      }</li>
    </ul>
    ${
      warningItems
        ? `<ul class="learner-delete-warning-list mt-10">${warningItems}</ul>`
        : ""
    }
  `;
}

async function openDeleteLearnerModal() {
  if (!currentUserId) {
    return;
  }

  currentDeleteImpact = null;
  setDeleteStatus("");

  const confirmInput = document.getElementById("learnerDeleteConfirmInput");
  if (confirmInput) {
    confirmInput.value = "";
  }

  const body = document.getElementById("learnerDeleteBody");
  if (body) {
    body.innerHTML = `<div class="text-muted">Loading impact summary...</div>`;
  }

  openModal(DELETE_MODAL_ID, {
    overlayType: "modal",
    onClose: () => {
      currentDeleteImpact = null;
      setDeleteStatus("");
    },
  });

  try {
    const sb = await getClient();
    const { data: raw, error } = await sb.rpc("get_learner_deletion_impact", {
      target_user_id: currentUserId,
    });

    if (error) {
      throw error;
    }

    const impact = normalizeDeletionImpact(raw);

    if (!impact) {
      throw new Error("Unable to load deletion impact");
    }

    currentDeleteImpact = impact;

    const hint = document.getElementById("learnerDeleteConfirmHint");
    if (hint) {
      hint.textContent = impact.displayName?.trim()
        ? impact.displayName.trim()
        : "DELETE";
    }

    if (body) {
      body.innerHTML = renderDeletionImpact(impact);
    }
  } catch (error) {
    console.error("[Learner Details] delete impact failed", error);
    if (body) {
      body.innerHTML = `<div class="empty-state">${escapeHTML(
        error.message || "Unable to load deletion impact."
      )}</div>`;
    }
    setDeleteStatus(error.message || "Unable to load deletion impact.", {
      isError: true,
    });
  }
}

function closeDeleteLearnerModal() {
  closeModal(DELETE_MODAL_ID);
  currentDeleteImpact = null;
  setDeleteStatus("");
}

async function confirmDeleteLearner() {
  if (!currentUserId || !currentDeleteImpact) {
    return;
  }

  const confirmInput = document.getElementById("learnerDeleteConfirmInput");
  const confirmation = confirmInput?.value?.trim() ?? "";

  if (!confirmation) {
    setDeleteStatus("Type the display name or DELETE to confirm.", {
      isError: true,
    });
    return;
  }

  const deleteBtn = document.getElementById("confirmDeleteLearnerBtn");
  if (deleteBtn) {
    deleteBtn.disabled = true;
  }

  setDeleteStatus("Deleting learner...");

  try {
    await invokeEdgeFunction("delete-learner", {
      userId: currentUserId,
      confirmation,
    });

    const deletedUserId = currentUserId;
    const isLinkedLearner = currentDeleteImpact.isLinkedLearner;

    closeDeleteLearnerModal();
    closeLearnerModal();

    window.dispatchEvent(
      new CustomEvent("prepos:learner-deleted", {
        detail: { deletedUserId, isLinkedLearner },
      })
    );
  } catch (error) {
    console.error("[Learner Details] delete failed", error);
    setDeleteStatus(error.message || "Unable to delete learner.", {
      isError: true,
    });
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
    }
  }
}

/**
 * Load learner details via get_learner_details RPC.
 * @param {string} userId - auth / public.users uuid
 */
export async function loadLearnerDetails(userId) {
  if (!userId) {
    throw new Error("Learner id is required");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("get_learner_details", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Learner Details] load failed", error);
    throw error;
  }

  const details = normalizeLearnerDetails(data);

  if (!details) {
    throw new Error("Learner not found or access denied");
  }

  return details;
}

function renderNameField(details) {
  if (isEditingName) {
    return `
      <dt>Name</dt>
      <dd>
        <input
          id="learnerDetailNameInput"
          type="text"
          class="w-full"
          value="${escapeHTML(details.displayName || "")}"
          maxlength="120"
          autocomplete="off"
        >
      </dd>
    `;
  }

  return `
    <dt>Name</dt>
    <dd>${escapeHTML(details.displayName || "—")}</dd>
  `;
}

/**
 * Render learner details into the modal body.
 * @param {object} details
 */
export function renderLearnerDetails(details) {
  const body = document.getElementById("learnerDetailBody");
  const title = document.getElementById("learnerDetailTitle");

  currentDetails = details;

  if (title) {
    title.textContent = details.displayName || "Learner";
  }

  if (!body) {
    return;
  }

  body.innerHTML = `
    <dl class="learner-detail-meta">
      ${renderNameField(details)}

      <dt>Email</dt>
      <dd>${escapeHTML(details.email || "—")}</dd>

      <dt>Created</dt>
      <dd>${escapeHTML(formatDate(details.createdAt))}</dd>

      <dt>Assigned Exams</dt>
      <dd>${escapeHTML(details.examsAssigned)}</dd>

      <dt>Attempted Exams</dt>
      <dd>${escapeHTML(details.examsAttempted)}</dd>

      <dt>Last Activity</dt>
      <dd>${escapeHTML(formatLastActivity(details.lastActivityAt))}</dd>

      ${renderBatchMemberships(details.batchMemberships)}
    </dl>
    <div id="learnerDetailEditStatus" class="mt-10 text-muted"></div>
  `;

  setFooterMode(isEditingName ? "edit" : "view");
}

function setModalLoading() {
  isEditingName = false;
  setEditStatus("");
  setFooterMode("view");

  const body = document.getElementById("learnerDetailBody");
  const title = document.getElementById("learnerDetailTitle");

  if (title) {
    title.textContent = "Learner Details";
  }

  if (body) {
    body.innerHTML = `<div class="text-muted">Loading learner details...</div>`;
  }
}

function setModalError(message) {
  isEditingName = false;
  setFooterMode("view");

  const body = document.getElementById("learnerDetailBody");

  if (body) {
    body.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
}

function enterEditNameMode() {
  if (!currentDetails) {
    return;
  }

  isEditingName = true;
  setEditStatus("");
  renderLearnerDetails(currentDetails);

  document.getElementById("learnerDetailNameInput")?.focus();
}

function cancelEditNameMode() {
  isEditingName = false;
  setEditStatus("");
  renderLearnerDetails(currentDetails);
}

async function saveDisplayName() {
  if (!currentUserId || !currentDetails) {
    return;
  }

  const input = document.getElementById("learnerDetailNameInput");
  const displayName = input?.value?.trim() ?? "";

  if (!displayName) {
    setEditStatus("Display name is required.", { isError: true });
    return;
  }

  const saveBtn = document.getElementById("saveLearnerNameBtn");
  if (saveBtn) {
    saveBtn.disabled = true;
  }

  setEditStatus("Saving...");

  try {
    await updateLearnerDisplayName({
      userId: currentUserId,
      displayName,
    });

    isEditingName = false;
    const details = await loadLearnerDetails(currentUserId);
    renderLearnerDetails(details);
    setEditStatus("Name updated.");
    window.dispatchEvent(new CustomEvent("prepos:learner-profile-updated"));
  } catch (error) {
    console.error("[Learner Details] save name failed", error);
    setEditStatus(error.message || "Unable to update name.", { isError: true });
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
    }
  }
}

/**
 * Open the learner detail modal for a user id.
 * @param {string} userId
 */
export async function openLearnerModal(userId) {
  currentUserId = userId;
  isEditingName = false;

  openModal(MODAL_ID, {
    overlayType: "modal",
    onClose: () => {
      currentUserId = null;
      currentDetails = null;
      isEditingName = false;
      setEditStatus("");
    },
  });

  setModalLoading();

  try {
    const details = await loadLearnerDetails(userId);
    renderLearnerDetails(details);
  } catch (error) {
    setModalError(error.message || "Unable to load learner details.");
  }
}

export function closeLearnerModal() {
  closeModal(MODAL_ID);
}

/**
 * Wire modal close controls on Teacher Home.
 */
export function initLearnerDetailsModal() {
  document
    .getElementById("closeLearnerDetailModal")
    ?.addEventListener("click", closeLearnerModal);

  document
    .getElementById("editLearnerNameBtn")
    ?.addEventListener("click", enterEditNameMode);

  document
    .getElementById("cancelLearnerNameBtn")
    ?.addEventListener("click", cancelEditNameMode);

  document
    .getElementById("saveLearnerNameBtn")
    ?.addEventListener("click", saveDisplayName);

  document
    .getElementById("deleteLearnerBtn")
    ?.addEventListener("click", openDeleteLearnerModal);

  document
    .getElementById("cancelDeleteLearnerBtn")
    ?.addEventListener("click", closeDeleteLearnerModal);

  document
    .getElementById("confirmDeleteLearnerBtn")
    ?.addEventListener("click", confirmDeleteLearner);
}
