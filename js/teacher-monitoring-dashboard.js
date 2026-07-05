/**
 * PrepOS Teacher Monitoring Dashboard — beta learner activity overview.
 */

import { bootPage } from "./core/page-boot.js";
import { getClient } from "./core/get-client.js";
import { openLearnerModal, initLearnerDetailsModal } from "./teacher/learner-details.js";

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
  };
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
            <div class="monitoring-learner-name">${escapeHTML(learner.displayName)}</div>
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
  const { data, error } = await sb.rpc("get_teacher_monitoring_overview");

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeOverviewRow).filter(Boolean);
}

async function refreshMonitoring() {
  const listEl = document.getElementById("monitoringLearnerList");
  if (listEl) {
    listEl.innerHTML = '<div class="text-muted">Loading learner activity...</div>';
  }

  setStatus("");

  try {
    const learners = await loadMonitoringOverview();
    renderSummary(learners);
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

async function init() {
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
  document
    .getElementById("refreshMonitoringBtn")
    ?.addEventListener("click", refreshMonitoring);

  await refreshMonitoring();
}

init().catch((err) => {
  console.error("[Monitoring] init failed", err);
});
