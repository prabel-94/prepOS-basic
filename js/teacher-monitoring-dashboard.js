/**
 * PrepOS Teacher Monitoring Dashboard — beta learner activity overview.
 */

import { bootPage } from "./core/page-boot.js";
import { getClient } from "./core/get-client.js";
import { listBatches } from "./core/batch-management.js";
import { openLearnerModal, initLearnerDetailsModal } from "./teacher/learner-details.js";
import { renderDashboardSkeleton } from "./student/student-dashboard-renderer.js";

const MONITORING_FILTER_KEY = "prepos:monitoring-filters";

const state = {
  batchId: "",
  includeLinked: false,
  learners: [],
};

const EVENT_LABELS = Object.freeze({
  "page.view": "Viewed page",
  "exam.started": "Started exam",
  "exam.submitted": "Submitted exam",
  "practice.session_started": "Started practice",
  "practice.session_completed": "Completed practice",
  "note.opened": "Opened note",
});

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRelativeTime(value) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getActivityStatus(lastActivityAt) {
  if (!lastActivityAt) {
    return { label: "Inactive", className: "monitoring-status--inactive" };
  }

  const date = new Date(lastActivityAt);
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
    return { label: "Active today", className: "monitoring-status--today" };
  }

  if (diffDays < 7) {
    return { label: "Active this week", className: "monitoring-status--week" };
  }

  return { label: "Inactive", className: "monitoring-status--inactive" };
}

function formatEventLabel(eventType) {
  return EVENT_LABELS[eventType] || eventType || "Activity";
}

function normalizeOverviewRow(raw) {
  if (!raw || typeof raw !== "object") return null;

  return {
    userId: raw.userId ?? raw.user_id ?? null,
    displayName: raw.displayName ?? raw.display_name ?? "Learner",
    email: raw.email ?? null,
    lastActivityAt: raw.lastActivityAt ?? raw.last_activity_at ?? null,
    lastEventType: raw.lastEventType ?? raw.last_event_type ?? null,
    lastEventAt: raw.lastEventAt ?? raw.last_event_at ?? null,
    eventsLast7Days: Number(raw.eventsLast7Days ?? raw.events_last_7_days ?? 0),
    practiceSessions7Days: Number(
      raw.practiceSessions7Days ?? raw.practice_sessions_7_days ?? 0
    ),
    examAttempts7Days: Number(
      raw.examAttempts7Days ?? raw.exam_attempts_7_days ?? 0
    ),
    isLinkedLearner: Boolean(raw.isLinkedLearner ?? raw.is_linked_learner),
  };
}

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(MONITORING_FILTER_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.batchId = saved.batchId ?? "";
    state.includeLinked = saved.includeLinked === true;
  } catch {
    /* ignore */
  }
}

function saveFilters() {
  try {
    localStorage.setItem(
      MONITORING_FILTER_KEY,
      JSON.stringify({
        batchId: state.batchId,
        includeLinked: state.includeLinked,
      })
    );
  } catch {
    /* ignore */
  }
}

function readFilterControls() {
  state.batchId = document.getElementById("monitoringBatchFilter")?.value ?? "";
  state.includeLinked =
    document.getElementById("monitoringIncludeLinked")?.checked === true;
  saveFilters();
}

function renderSummary(learners = []) {
  let activeToday = 0;
  let activeWeek = 0;
  let inactive = 0;

  for (const learner of learners) {
    const status = getActivityStatus(learner.lastActivityAt);
    if (status.className === "monitoring-status--today") activeToday += 1;
    else if (status.className === "monitoring-status--week") activeWeek += 1;
    else inactive += 1;
  }

  document.getElementById("monitoringTotalLearners").textContent = String(
    learners.length
  );
  document.getElementById("monitoringActiveToday").textContent = String(activeToday);
  document.getElementById("monitoringActiveWeek").textContent = String(activeWeek);
  document.getElementById("monitoringInactive").textContent = String(inactive);
}

function renderLearnerList(learners = []) {
  const listEl = document.getElementById("monitoringLearnerList");
  if (!listEl) return;

  if (!learners.length) {
    listEl.innerHTML =
      '<div class="empty-state">No learners yet. Create learners in Student Management to start monitoring.</div>';
    return;
  }

  const sorted = [...learners].sort((a, b) => {
    const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bTime - aTime;
  });

  listEl.innerHTML = sorted
    .map((learner) => {
      const status = getActivityStatus(learner.lastActivityAt);
      const lastAction = learner.lastEventType
        ? formatEventLabel(learner.lastEventType)
        : learner.examAttempts7Days || learner.practiceSessions7Days
          ? "Completed session"
          : "No recent events";

      return `
        <div class="monitoring-learner-row">
          <div class="monitoring-learner-main">
            <div class="monitoring-learner-name">
              ${escapeHTML(learner.displayName)}
              ${
                learner.isLinkedLearner
                  ? `<span class="monitoring-linked-badge">Linked</span>`
                  : ""
              }
            </div>
            <div class="monitoring-learner-email text-muted">${escapeHTML(learner.email || "No email")}</div>
          </div>
          <div class="monitoring-learner-stats">
            <div class="monitoring-stat">
              <span class="monitoring-stat-label">Last seen</span>
              <span class="monitoring-stat-value">${escapeHTML(formatRelativeTime(learner.lastActivityAt))}</span>
            </div>
            <div class="monitoring-stat">
              <span class="monitoring-stat-label">Last action</span>
              <span class="monitoring-stat-value">${escapeHTML(lastAction)}</span>
            </div>
            <div class="monitoring-stat">
              <span class="monitoring-stat-label">7-day events</span>
              <span class="monitoring-stat-value">${escapeHTML(learner.eventsLast7Days)}</span>
            </div>
            <div class="monitoring-stat">
              <span class="monitoring-stat-label">Practice / Exams</span>
              <span class="monitoring-stat-value">${escapeHTML(learner.practiceSessions7Days)} / ${escapeHTML(learner.examAttempts7Days)}</span>
            </div>
          </div>
          <div class="monitoring-learner-actions">
            <span class="monitoring-status ${status.className}">${escapeHTML(status.label)}</span>
            <button
              type="button"
              class="secondary-btn monitoring-view-btn"
              data-user-id="${escapeHTML(learner.userId)}"
            >
              Details
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll(".monitoring-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.dataset.userId;
      if (userId) openLearnerModal(userId);
    });
  });
}

function setStatus(message, isError = false) {
  const el = document.getElementById("monitoringStatus");
  if (!el) return;

  el.textContent = message;
  el.classList.toggle("text-muted", !isError);
  el.classList.toggle("monitoring-status-message--error", isError);
}

async function loadMonitoringOverview() {
  const sb = await getClient();
  const { data, error } = await sb.rpc("get_teacher_monitoring_overview", {
    p_batch_id: state.batchId || null,
    p_include_linked: state.includeLinked,
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeOverviewRow).filter(Boolean);
}

async function loadBatchSummary() {
  if (!state.batchId) {
    return null;
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("get_batch_monitoring_summary", {
    p_batch_id: state.batchId,
  });

  if (error) {
    console.warn("[Monitoring] batch summary failed", error);
    return null;
  }

  return data;
}

function renderBatchSummaryBanner(summary) {
  const el = document.getElementById("monitoringBatchSummary");
  if (!el) return;

  if (!summary) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="monitoring-batch-banner">
      <strong>${escapeHTML(summary.batchName ?? summary.batch_name ?? "Batch")}</strong>
      <span class="text-muted">
        ${escapeHTML(summary.memberCount ?? summary.member_count ?? 0)} members ·
        ${escapeHTML(summary.activeToday ?? summary.active_today ?? 0)} active today ·
        ${escapeHTML(summary.activeThisWeek ?? summary.active_this_week ?? 0)} active this week ·
        ${escapeHTML(summary.inactive ?? 0)} inactive
      </span>
    </div>
  `;
}

function exportMonitoringCsv() {
  if (!state.learners.length) {
    setStatus("Nothing to export.", { isError: true });
    return;
  }

  const headers = [
    "Display Name",
    "Email",
    "Linked Learner",
    "Last Activity",
    "Last Event",
    "Events (7d)",
    "Practice (7d)",
    "Exams (7d)",
    "Status",
  ];

  const rows = state.learners.map((learner) => {
    const status = getActivityStatus(learner.lastActivityAt).label;
    return [
      learner.displayName,
      learner.email || "",
      learner.isLinkedLearner ? "Yes" : "No",
      learner.lastActivityAt || "",
      learner.lastEventType || "",
      learner.eventsLast7Days,
      learner.practiceSessions7Days,
      learner.examAttempts7Days,
      status,
    ];
  });

  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `prepos-monitoring-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("CSV exported.");
}

function showMonitoringSkeletons() {
  for (const id of [
    "monitoringTotalLearners",
    "monitoringActiveToday",
    "monitoringActiveWeek",
    "monitoringInactive",
  ]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  }
  renderDashboardSkeleton(document.getElementById("monitoringLearnerList"), {
    rows: 4,
  });
}

async function refreshMonitoring() {
  const listEl = document.getElementById("monitoringLearnerList");
  showMonitoringSkeletons();

  setStatus("");

  try {
    const [learners, batchSummary] = await Promise.all([
      loadMonitoringOverview(),
      loadBatchSummary(),
    ]);

    state.learners = learners;
    renderSummary(learners);
    renderBatchSummaryBanner(batchSummary);
    renderLearnerList(learners);

    const updatedAt = new Date().toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    setStatus(`Updated ${updatedAt}`);
  } catch (error) {
    console.error("[Monitoring] load failed", error);
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state">${escapeHTML(
        error.message || "Unable to load monitoring data."
      )}</div>`;
    }
    setStatus(error.message || "Unable to load monitoring data.", { isError: true });
  }
}

async function initBatchFilter() {
  const select = document.getElementById("monitoringBatchFilter");
  if (!select) return;

  try {
    const batches = await listBatches();
    select.innerHTML =
      `<option value="">All learners</option>` +
      batches
        .map(
          (batch) =>
            `<option value="${escapeHTML(batch.id)}">${escapeHTML(batch.name)} (${escapeHTML(batch.memberCount)})</option>`
        )
        .join("");

    select.value = state.batchId;
  } catch (error) {
    console.warn("[Monitoring] batch list failed", error);
  }
}

async function init() {
  loadSavedFilters();

  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      title: "Student Monitoring",
      subtitle: "Beta activity tracking",
      preset: "teacherExam",
    },
  });

  if (!runtime) return;

  initLearnerDetailsModal();
  await initBatchFilter();

  const includeLinkedEl = document.getElementById("monitoringIncludeLinked");
  if (includeLinkedEl) {
    includeLinkedEl.checked = state.includeLinked;
  }

  document
    .getElementById("refreshMonitoringBtn")
    ?.addEventListener("click", () => {
      readFilterControls();
      refreshMonitoring();
    });

  document
    .getElementById("exportMonitoringBtn")
    ?.addEventListener("click", exportMonitoringCsv);

  document
    .getElementById("monitoringBatchFilter")
    ?.addEventListener("change", () => {
      readFilterControls();
      refreshMonitoring();
    });

  document
    .getElementById("monitoringIncludeLinked")
    ?.addEventListener("change", () => {
      readFilterControls();
      refreshMonitoring();
    });

  await refreshMonitoring();
}

init().catch((err) => {
  console.error("[Monitoring] init failed", err);
});
