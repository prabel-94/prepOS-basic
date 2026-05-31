/**
 * Teacher learner detail modal — lightweight identity + exam counts.
 */

import { getClient } from "../core/get-client.js";
import { openModal, closeModal } from "../ui/modal-system.js";

const MODAL_ID = "learnerDetailModal";

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

/**
 * Relative activity label for lastActivityAt.
 * @param {string|null|undefined} value - ISO timestamp
 * @returns {string}
 */
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

/**
 * @typedef {Object} LearnerDetails
 * @property {string|null} id
 * @property {string|null} userId
 * @property {string} displayName
 * @property {string|null} email
 * @property {string|null} createdAt
 * @property {number} examsAssigned
 * @property {number} examsAttempted
 * @property {string|null} lastActivityAt
 */

function normalizeLearnerDetails(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const lastActivityAt = raw.lastActivityAt ?? raw.last_activity_at ?? null;

  return {
    id: raw.id ?? null,
    userId: raw.userId ?? raw.user_id ?? null,
    displayName: raw.displayName ?? raw.display_name ?? "",
    email: raw.email ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    examsAssigned: Number(raw.examsAssigned ?? raw.exams_assigned ?? 0),
    examsAttempted: Number(raw.examsAttempted ?? raw.exams_attempted ?? 0),
    lastActivityAt: lastActivityAt || null,
  };
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

/**
 * Render learner details into the modal body.
 * @param {object} details
 */
export function renderLearnerDetails(details) {
  const body = document.getElementById("learnerDetailBody");
  const title = document.getElementById("learnerDetailTitle");

  if (title) {
    title.textContent = details.displayName || "Learner";
  }

  if (!body) {
    return;
  }

  body.innerHTML = `
    <dl class="learner-detail-meta">
      <dt>Name</dt>
      <dd>${escapeHTML(details.displayName || "—")}</dd>

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
    </dl>
  `;
}

function setModalLoading() {
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
  const body = document.getElementById("learnerDetailBody");

  if (body) {
    body.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
}

/**
 * Open the learner detail modal for a user id.
 * @param {string} userId
 */
export async function openLearnerModal(userId) {
  openModal(MODAL_ID, { overlayType: "modal" });
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
}
