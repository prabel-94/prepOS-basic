/**
 * PrepOS Activity Log — fire-and-forget student activity events for teacher monitoring.
 *
 * Events are persisted via log_student_activity_batch RPC (single round trip).
 * Only logs when the user is acting as a student (real student or linked teacher mode).
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
const PAGE_VIEW_DEDUPE_MS = 5 * 60 * 1000;
const PAGE_VIEW_DEDUPE_KEY = "prepos:activity:last-page-view";

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

function shouldSkipDuplicatePageView(pagePath) {
  try {
    const raw = sessionStorage.getItem(PAGE_VIEW_DEDUPE_KEY);
    if (!raw) return false;

    const last = JSON.parse(raw);
    if (last.page !== pagePath) return false;

    return Date.now() - last.at < PAGE_VIEW_DEDUPE_MS;
  } catch {
    return false;
  }
}

function rememberPageView(pagePath) {
  try {
    sessionStorage.setItem(
      PAGE_VIEW_DEDUPE_KEY,
      JSON.stringify({ page: pagePath, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

function buildRpcPayload(event) {
  return {
    eventType: event.eventType,
    resourceType: event.resourceType ?? null,
    resourceId: event.resourceId ?? null,
    metadata: event.metadata ?? {},
    pagePath: event.pagePath ?? getPagePath(),
    deviceId: event.deviceId ?? getDeviceId(),
    occurredAt: new Date().toISOString(),
  };
}

async function flushQueue() {
  if (!pendingQueue.length) return;

  const batch = pendingQueue.splice(0, pendingQueue.length);
  clearTimeout(flushTimer);
  flushTimer = null;

  try {
    const sb = await getClient();
    const payload = batch.map(buildRpcPayload);

    if (payload.length === 1) {
      const event = payload[0];
      await sb.rpc("log_student_activity", {
        p_event_type: event.eventType,
        p_resource_type: event.resourceType,
        p_resource_id: event.resourceId,
        p_metadata: event.metadata,
        p_page_path: event.pagePath,
        p_device_id: event.deviceId,
      });
      return;
    }

    await sb.rpc("log_student_activity_batch", {
      p_events: payload,
    });
  } catch (err) {
    console.warn("[Activity Log] Flush failed:", err.message);
  }
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, FLUSH_DEBOUNCE_MS);
}

/**
 * Force-flush pending events (use on pagehide).
 */
export function flushActivityLogSync() {
  if (!pendingQueue.length) return;

  const batch = pendingQueue.splice(0, pendingQueue.length);
  clearTimeout(flushTimer);
  flushTimer = null;

  try {
    const sb = window.supabaseClient;
    if (!sb) return;

    const token = sb.auth?.session?.()?.access_token;
    const apikey = window.SUPABASE_ANON_KEY;
    if (!token || !window.SUPABASE_URL || !apikey) return;

    const payload = batch.map(buildRpcPayload);
    const rpcName =
      payload.length === 1 ? "log_student_activity" : "log_student_activity_batch";
    const body =
      payload.length === 1
        ? JSON.stringify({
            p_event_type: payload[0].eventType,
            p_resource_type: payload[0].resourceType,
            p_resource_id: payload[0].resourceId,
            p_metadata: payload[0].metadata,
            p_page_path: payload[0].pagePath,
            p_device_id: payload[0].deviceId,
          })
        : JSON.stringify({ p_events: payload });

    fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey,
      },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort on page leave */
  }
}

window.addEventListener("pagehide", flushActivityLogSync);

/**
 * Log a student activity event. Non-blocking; failures are silent.
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
 */
export function logPageView(pageName) {
  const pagePath = pageName ?? getPagePath();

  if (shouldSkipDuplicatePageView(pagePath)) {
    return;
  }

  rememberPageView(pagePath);

  logActivity(ACTIVITY_EVENTS.PAGE_VIEW, {
    resourceType: "page",
    metadata: { page: pagePath },
    pagePath,
  });
}

/**
 * Initialize activity logging after bootPage when user is in student mode.
 */
export function initStudentActivityLogging(runtime) {
  if (!runtime) return;
  if (runtime.appMode !== "student") return;

  logPageView();
}
