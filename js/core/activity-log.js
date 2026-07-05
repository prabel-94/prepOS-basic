/**
 * PrepOS Activity Log — fire-and-forget student activity events for teacher monitoring.
 *
 * Events are persisted via log_student_activity RPC. Only logs when the user
 * is acting as a student (real student or teacher in linked student mode).
 */

import { getClient } from "./get-client.js";

export const ACTIVITY_EVENTS = Object.freeze({
  PAGE_VIEW: "page.view",
  EXAM_STARTED: "exam.started",
  EXAM_SUBMITTED: "exam.submitted",
  PRACTICE_STARTED: "practice.session_started",
  PRACTICE_COMPLETED: "practice.session_completed",
  NOTE_OPENED: "note.opened",
});

const pendingQueue = [];
let flushTimer = null;
const FLUSH_DEBOUNCE_MS = 400;

function getDeviceId() {
  try {
    let id = localStorage.getItem("prepos_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("prepos_device_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

function getPagePath() {
  return `${window.location.pathname.split("/").pop() || ""}${window.location.search || ""}`;
}

async function flushQueue() {
  if (!pendingQueue.length) return;

  const batch = pendingQueue.splice(0, pendingQueue.length);
  clearTimeout(flushTimer);
  flushTimer = null;

  try {
    const sb = await getClient();

    for (const event of batch) {
      await sb.rpc("log_student_activity", {
        p_event_type: event.eventType,
        p_resource_type: event.resourceType ?? null,
        p_resource_id: event.resourceId ?? null,
        p_metadata: event.metadata ?? {},
        p_page_path: event.pagePath ?? getPagePath(),
        p_device_id: event.deviceId ?? getDeviceId(),
      });
    }
  } catch (err) {
    console.warn("[Activity Log] Flush failed:", err.message);
  }
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, FLUSH_DEBOUNCE_MS);
}

/**
 * Log a student activity event. Non-blocking; failures are silent.
 *
 * @param {string} eventType - one of ACTIVITY_EVENTS
 * @param {object} [options]
 * @param {string} [options.resourceType] - e.g. 'exam', 'practice', 'note'
 * @param {string} [options.resourceId] - uuid of the resource
 * @param {object} [options.metadata] - extra context
 */
export function logActivity(eventType, options = {}) {
  if (!eventType) return;

  pendingQueue.push({
    eventType,
    resourceType: options.resourceType ?? null,
    resourceId: options.resourceId ?? null,
    metadata: options.metadata ?? {},
    pagePath: options.pagePath ?? getPagePath(),
    deviceId: options.deviceId ?? getDeviceId(),
  });

  scheduleFlush();
}

/**
 * Log a page view for student surfaces.
 * @param {string} [pageName] - optional override; defaults to current page
 */
export function logPageView(pageName) {
  logActivity(ACTIVITY_EVENTS.PAGE_VIEW, {
    resourceType: "page",
    metadata: { page: pageName ?? getPagePath() },
  });
}

/**
 * Initialize activity logging after bootPage when user is in student mode.
 * @param {object} runtime - from bootPage / bootRuntime
 */
export function initStudentActivityLogging(runtime) {
  if (!runtime) return;
  if (runtime.appMode !== "student") return;

  logPageView();
}
