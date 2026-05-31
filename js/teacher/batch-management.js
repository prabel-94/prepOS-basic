/**
 * Teacher batch management UI — list, CRUD, membership modals.
 */

import {
  createBatch,
  listBatches,
  getBatchDetails,
  updateBatch,
  deleteBatch,
  addBatchMembers,
  removeBatchMember,
  listManagedLearnerProfiles,
} from "../core/batch-management.js";
import { openModal, closeModal } from "../ui/modal-system.js";

const CREATE_MODAL_ID = "createBatchModal";
const EDIT_MODAL_ID = "editBatchModal";
const DETAIL_MODAL_ID = "batchDetailModal";
const ADD_MEMBERS_MODAL_ID = "addBatchMembersModal";

let currentBatchId = null;
let currentBatchDetails = null;
let addMembersSelection = new Set();
let addMembersExistingProfileIds = new Set();
let managedProfilesCache = [];

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCreatedDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const datePart = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart}, ${timePart}`;
}

function formatMemberCount(count) {
  const total = Number(count ?? 0);
  return total === 1 ? "1 Member" : `${total} Members`;
}

function renderBatchDescription(description) {
  const text = String(description ?? "").trim();
  if (!text) {
    return "";
  }

  return `<p class="batch-card-description">${escapeHTML(text)}</p>`;
}

function renderBatchListCard(batch) {
  const description = renderBatchDescription(batch.description);

  return `
    <div class="recent-item mt-10 student-batch-row">
      <div class="topic-note-row">
        <div class="topic-note-row-main batch-card">
          <div class="batch-card-name">${escapeHTML(batch.name)}</div>
          <div class="batch-card-meta">${escapeHTML(formatMemberCount(batch.memberCount))}</div>
          ${description}
        </div>
        <div class="topic-note-row-actions student-batch-row-actions">
          <button
            type="button"
            class="primary-btn batch-open-btn"
            data-batch-id="${escapeHTML(batch.id)}"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderBatchDetailHeader(batch) {
  const description = renderBatchDescription(batch.description);
  const createdBy = batch.createdByDisplay || "Teacher";

  return `
    <div class="batch-detail-header">
      <div class="batch-card-name batch-card-name--detail">${escapeHTML(batch.name || "Batch")}</div>
      ${description}
      <div class="batch-card-meta batch-card-meta--detail">${escapeHTML(formatMemberCount(batch.memberCount))}</div>
      <div class="batch-detail-provenance-compact">
        <div class="batch-detail-provenance-line">Created by ${escapeHTML(createdBy)}</div>
        <div class="batch-detail-provenance-date">${escapeHTML(formatCreatedDate(batch.createdAt))}</div>
      </div>
    </div>
  `;
}

function renderAddStudentPlaceholder() {
  return `
    <div class="batch-add-student-cta">
      <button
        type="button"
        class="secondary-btn batch-add-student-placeholder w-full"
        disabled
        aria-disabled="true"
      >
        + Add Student
      </button>
      <div class="batch-add-student-soon text-muted">Coming Soon</div>
    </div>
  `;
}

function renderMembersEmptyState() {
  return `
    <div class="batch-members-empty">
      <p class="batch-members-empty-title">No students in this batch yet.</p>
      <p class="batch-members-empty-hint text-muted">Add students to begin assigning exams.</p>
    </div>
  `;
}

function closeBatchDetailMenu() {
  const menu = document.getElementById("batchDetailMenu");
  const button = document.getElementById("batchDetailMenuBtn");

  menu?.classList.add("hidden");
  button?.setAttribute("aria-expanded", "false");
}

function toggleBatchDetailMenu() {
  const menu = document.getElementById("batchDetailMenu");
  const button = document.getElementById("batchDetailMenuBtn");

  if (!menu || !button) {
    return;
  }

  const willOpen = menu.classList.contains("hidden");
  closeBatchDetailMenu();

  if (willOpen) {
    menu.classList.remove("hidden");
    button.setAttribute("aria-expanded", "true");
  }
}

function setBatchStatus(message, { isError = false } = {}) {
  const el = document.getElementById("batchManagementStatus");
  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.toggle("text-muted", !message);
  el.classList.toggle("student-management-status--error", isError);
  el.classList.toggle(
    "student-management-status--success",
    Boolean(message) && !isError
  );
}

function setAddMembersStatus(message, { isError = false } = {}) {
  const el = document.getElementById("addBatchMembersStatus");
  if (!el) {
    return;
  }

  el.textContent = message;
  el.classList.toggle("text-muted", !message);
  el.classList.toggle("student-management-status--error", isError);
}

export async function refreshBatches() {
  const listEl = document.getElementById("batchList");
  if (listEl) {
    listEl.innerHTML = `<div class="text-muted">Loading batches...</div>`;
  }

  try {
    const batches = await listBatches();
    renderBatchList(batches);
    return batches;
  } catch (error) {
    console.error("[Batch Management] refreshBatches failed", error);
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state">Unable to load batches</div>`;
    }
    throw error;
  }
}

function renderBatchList(batches = []) {
  const listEl = document.getElementById("batchList");
  if (!listEl) {
    return;
  }

  if (!batches.length) {
    listEl.innerHTML =
      `<div class="empty-state">No batches yet. Create your first batch above.</div>`;
    return;
  }

  listEl.innerHTML = batches.map((batch) => renderBatchListCard(batch)).join("");
}

function openCreateBatchModal() {
  document.getElementById("createBatchName")?.value = "";
  document.getElementById("createBatchDescription")?.value = "";
  setBatchStatus("");

  openModal(CREATE_MODAL_ID, { overlayType: "modal" });
}

async function handleCreateBatchSubmit(event) {
  event.preventDefault();

  const name = document.getElementById("createBatchName")?.value?.trim() ?? "";
  const description =
    document.getElementById("createBatchDescription")?.value?.trim() ?? "";
  const submitBtn = document.getElementById("createBatchSubmitBtn");

  if (!name) {
    setBatchStatus("Batch name is required.", { isError: true });
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  setBatchStatus("Creating batch...");

  try {
    const batch = await createBatch({ name, description });
    closeModal(CREATE_MODAL_ID);
    await refreshBatches();
    setBatchStatus(`Batch created: ${batch.name}`);
  } catch (error) {
    console.error("[Batch Management] create failed", error);
    setBatchStatus(error.message || "Unable to create batch.", { isError: true });
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }
}

async function openEditBatchModal(batchId) {
  if (!batchId) {
    return;
  }

  try {
    const batch = await getBatchDetails(batchId);
    document.getElementById("editBatchId").value = batch.id;
    document.getElementById("editBatchName").value = batch.name || "";
    document.getElementById("editBatchDescription").value = batch.description || "";
    document.getElementById("editBatchStatus").textContent = "";

    openModal(EDIT_MODAL_ID, { overlayType: "modal" });
  } catch (error) {
    console.error("[Batch Management] open edit failed", error);
    setBatchStatus(error.message || "Unable to load batch.", { isError: true });
  }
}

async function handleEditBatchSubmit(event) {
  event.preventDefault();

  const batchId = document.getElementById("editBatchId")?.value ?? "";
  const name = document.getElementById("editBatchName")?.value?.trim() ?? "";
  const description =
    document.getElementById("editBatchDescription")?.value?.trim() ?? "";
  const statusEl = document.getElementById("editBatchStatus");
  const submitBtn = document.getElementById("editBatchSubmitBtn");

  if (!name) {
    if (statusEl) {
      statusEl.textContent = "Batch name is required.";
      statusEl.classList.add("student-management-status--error");
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  if (statusEl) {
    statusEl.textContent = "Saving...";
    statusEl.classList.remove("student-management-status--error");
  }

  try {
    await updateBatch({ batchId, name, description });
    closeModal(EDIT_MODAL_ID);

    if (currentBatchId === batchId && currentBatchDetails) {
      await openBatchDetailModal(batchId);
    }

    await refreshBatches();
    setBatchStatus("Batch updated.");
  } catch (error) {
    console.error("[Batch Management] edit failed", error);
    if (statusEl) {
      statusEl.textContent = error.message || "Unable to update batch.";
      statusEl.classList.add("student-management-status--error");
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }
}

async function handleDeleteBatch(batchId, batchName) {
  const label = batchName || "this batch";
  const confirmed = window.confirm(
    `Delete "${label}"? Members will be removed from the batch. Learner profiles are not deleted.`
  );

  if (!confirmed) {
    return;
  }

  setBatchStatus("Deleting batch...");

  try {
    await deleteBatch(batchId);

    if (currentBatchId === batchId) {
      closeModal(DETAIL_MODAL_ID);
      currentBatchId = null;
      currentBatchDetails = null;
    }

    await refreshBatches();
    setBatchStatus(`Batch deleted: ${label}`);
    window.dispatchEvent(new CustomEvent("prepos:batch-updated"));
  } catch (error) {
    console.error("[Batch Management] delete failed", error);
    setBatchStatus(error.message || "Unable to delete batch.", { isError: true });
  }
}

function renderBatchDetailBody(batch) {
  const body = document.getElementById("batchDetailBody");
  const title = document.getElementById("batchDetailTitle");

  if (title) {
    title.textContent = "Batch Details";
  }

  if (!body) {
    return;
  }

  const members = batch.members ?? [];

  const memberRows = members.length
    ? members
        .map((member) => {
          const displayName = member.displayName || member.email || "Learner";
          const email = member.email || "No email on file";

          return `
            <div class="recent-item mt-10 student-batch-member-row">
              <div class="topic-note-row">
                <div class="topic-note-row-main">
                  <b>${escapeHTML(displayName)}</b>
                  <div class="text-muted mt-5">${escapeHTML(email)}</div>
                </div>
                <div class="topic-note-row-actions">
                  <button
                    type="button"
                    class="secondary-btn batch-remove-member-btn"
                    data-profile-id="${escapeHTML(member.profileId)}"
                    data-display-name="${escapeHTML(displayName)}"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : renderMembersEmptyState();

  body.innerHTML = `
    ${renderBatchDetailHeader(batch)}
    <div class="batch-members-section">
      <div class="h3 batch-members-heading">Members</div>
      <div id="batchDetailMemberList">${memberRows}</div>
      ${renderAddStudentPlaceholder()}
    </div>
  `;

  closeBatchDetailMenu();
}

export async function openBatchDetailModal(batchId) {
  currentBatchId = batchId;

  openModal(DETAIL_MODAL_ID, {
    overlayType: "modal",
    onClose: () => {
      currentBatchId = null;
      currentBatchDetails = null;
      closeBatchDetailMenu();
    },
  });

  const body = document.getElementById("batchDetailBody");
  const title = document.getElementById("batchDetailTitle");

  if (title) {
    title.textContent = "Batch Details";
  }

  if (body) {
    body.innerHTML = `<div class="text-muted">Loading batch details...</div>`;
  }

  try {
    const batch = await getBatchDetails(batchId);
    currentBatchDetails = batch;
    renderBatchDetailBody(batch);
  } catch (error) {
    console.error("[Batch Management] detail load failed", error);
    if (body) {
      body.innerHTML = `<div class="empty-state">${escapeHTML(
        error.message || "Unable to load batch details."
      )}</div>`;
    }
  }
}

async function handleRemoveMember(profileId, displayName) {
  if (!currentBatchId || !profileId) {
    return;
  }

  const label = displayName || "this student";
  const confirmed = window.confirm(
    `Remove ${label} from this batch? Their profile and assignments are not affected.`
  );

  if (!confirmed) {
    return;
  }

  try {
    await removeBatchMember(currentBatchId, profileId);
    await openBatchDetailModal(currentBatchId);
    await refreshBatches();
    window.dispatchEvent(new CustomEvent("prepos:batch-updated"));
  } catch (error) {
    console.error("[Batch Management] remove member failed", error);
    alert(error.message || "Unable to remove student from batch.");
  }
}

function renderAddMembersList(profiles = [], search = "") {
  const listEl = document.getElementById("addBatchMembersList");
  if (!listEl) {
    return;
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = profiles.filter((profile) => {
    if (!normalizedSearch) {
      return true;
    }

    const name = (profile.displayName ?? "").toLowerCase();
    const email = (profile.email ?? "").toLowerCase();
    return name.includes(normalizedSearch) || email.includes(normalizedSearch);
  });

  const available = filtered.filter(
    (profile) => !addMembersExistingProfileIds.has(profile.profileId)
  );

  if (!available.length) {
    listEl.innerHTML = `<div class="empty-state">No available learners match your search.</div>`;
    return;
  }

  listEl.innerHTML = available
    .map((profile) => {
      const checked = addMembersSelection.has(profile.profileId);
      const displayName = profile.displayName || profile.email || "Learner";
      const email = profile.email || "No email on file";

      return `
        <label class="batch-add-member-option mt-10">
          <input
            type="checkbox"
            class="batch-add-member-checkbox"
            value="${escapeHTML(profile.profileId)}"
            ${checked ? "checked" : ""}
          >
          <span>
            <b>${escapeHTML(displayName)}</b>
            <span class="text-muted"> · ${escapeHTML(email)}</span>
          </span>
        </label>
      `;
    })
    .join("");

  updateAddMembersSelectedCount();
}

function updateAddMembersSelectedCount() {
  const el = document.getElementById("addBatchMembersSelectedCount");
  if (!el) {
    return;
  }

  const count = addMembersSelection.size;
  el.textContent =
    count === 1 ? "1 student selected" : `${count} students selected`;
}

async function openAddMembersModal() {
  if (!currentBatchId) {
    return;
  }

  addMembersSelection = new Set();
  addMembersExistingProfileIds = new Set(
    (currentBatchDetails?.members ?? []).map((member) => member.profileId)
  );

  const searchEl = document.getElementById("addBatchMembersSearch");
  if (searchEl) {
    searchEl.value = "";
  }

  setAddMembersStatus("");

  openModal(ADD_MEMBERS_MODAL_ID, { overlayType: "modal" });

  const listEl = document.getElementById("addBatchMembersList");
  if (listEl) {
    listEl.innerHTML = `<div class="text-muted">Loading learners...</div>`;
  }

  try {
    managedProfilesCache = await listManagedLearnerProfiles();
    renderAddMembersList(managedProfilesCache, "");
  } catch (error) {
    console.error("[Batch Management] load profiles failed", error);
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state">Unable to load learners</div>`;
    }
    setAddMembersStatus(error.message || "Unable to load learners.", {
      isError: true,
    });
  }
}

async function handleAddMembersSubmit(event) {
  event.preventDefault();

  const profileIds = [...addMembersSelection];
  const submitBtn = document.getElementById("addBatchMembersSubmitBtn");

  if (!profileIds.length) {
    setAddMembersStatus("Select at least one student.", { isError: true });
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  setAddMembersStatus("Adding students...");

  try {
    const result = await addBatchMembers(currentBatchId, profileIds);
    closeModal(ADD_MEMBERS_MODAL_ID);
    await openBatchDetailModal(currentBatchId);
    await refreshBatches();
    setAddMembersStatus("");

    const added = result.added ?? 0;
    const skipped = result.skipped ?? 0;
    let message = `${added} student${added === 1 ? "" : "s"} added to batch.`;

    if (skipped > 0) {
      message += ` ${skipped} already in batch.`;
    }

    setBatchStatus(message);
    window.dispatchEvent(new CustomEvent("prepos:batch-updated"));
  } catch (error) {
    console.error("[Batch Management] add members failed", error);
    setAddMembersStatus(error.message || "Unable to add students.", {
      isError: true,
    });
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }
}

export function initBatchManagement() {
  document
    .getElementById("openCreateBatchModalBtn")
    ?.addEventListener("click", openCreateBatchModal);

  document
    .getElementById("createBatchForm")
    ?.addEventListener("submit", handleCreateBatchSubmit);

  document
    .getElementById("closeCreateBatchModal")
    ?.addEventListener("click", () => closeModal(CREATE_MODAL_ID));

  document
    .getElementById("editBatchForm")
    ?.addEventListener("submit", handleEditBatchSubmit);

  document
    .getElementById("closeEditBatchModal")
    ?.addEventListener("click", () => closeModal(EDIT_MODAL_ID));

  document
    .getElementById("closeBatchDetailModal")
    ?.addEventListener("click", () => closeModal(DETAIL_MODAL_ID));

  document
    .getElementById("batchDetailMenuBtn")
    ?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleBatchDetailMenu();
    });

  document
    .getElementById("batchDetailMenuEdit")
    ?.addEventListener("click", () => {
      closeBatchDetailMenu();
      if (currentBatchId) {
        openEditBatchModal(currentBatchId);
      }
    });

  document
    .getElementById("batchDetailMenuDelete")
    ?.addEventListener("click", () => {
      closeBatchDetailMenu();
      if (currentBatchDetails) {
        handleDeleteBatch(currentBatchDetails.id, currentBatchDetails.name);
      }
    });

  document.addEventListener("click", (event) => {
    const wrap = document.querySelector(".batch-detail-menu-wrap");
    if (!wrap || wrap.contains(event.target)) {
      return;
    }

    closeBatchDetailMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBatchDetailMenu();
    }
  });

  document.getElementById("batchList")?.addEventListener("click", (event) => {
    const openBtn = event.target.closest(".batch-open-btn");
    if (openBtn?.dataset.batchId) {
      openBatchDetailModal(openBtn.dataset.batchId);
    }
  });

  document
    .getElementById("addBatchMembersForm")
    ?.addEventListener("submit", handleAddMembersSubmit);

  document
    .getElementById("closeAddBatchMembersModal")
    ?.addEventListener("click", () => closeModal(ADD_MEMBERS_MODAL_ID));

  document
    .getElementById("addBatchMembersSearch")
    ?.addEventListener("input", (event) => {
      renderAddMembersList(managedProfilesCache, event.target.value ?? "");
    });

  document
    .getElementById("batchDetailBody")
    ?.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".batch-remove-member-btn");
      if (removeBtn?.dataset.profileId) {
        handleRemoveMember(removeBtn.dataset.profileId, removeBtn.dataset.displayName);
      }
    });

  document
    .getElementById("addBatchMembersList")
    ?.addEventListener("change", (event) => {
      const checkbox = event.target.closest(".batch-add-member-checkbox");
      if (!checkbox) {
        return;
      }

      if (checkbox.checked) {
        addMembersSelection.add(checkbox.value);
      } else {
        addMembersSelection.delete(checkbox.value);
      }

      updateAddMembersSelectedCount();
    });
}

export async function loadBatchesIfActive() {
  const panel = document.getElementById("studentManagementBatchesPanel");
  if (panel && !panel.classList.contains("hidden")) {
    await refreshBatches();
  }
}
