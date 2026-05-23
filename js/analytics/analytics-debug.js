/**
 * PrepOS Analytics Debug UI
 * -------------------------------------------------------
 * Lightweight diagnostics renderer for admin dashboard.
 *
 * PrepOS Analytics Observability Architecture
 */


import { getAnalyticsRuntimeStore } from "./analytics-runtime-store.js";


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function formatValue(value) {
  if (value === null || value === undefined) {
    return '<span class="muted">—</span>';
  }

  if (typeof value === "boolean") {
    return value
      ? '<span class="tag tag-ok">true</span>'
      : '<span class="tag tag-warn">false</span>';
  }

  if (typeof value === "object") {
    return `<pre class="debug-pre">${escapeHtml(
      JSON.stringify(value, null, 2)
    )}</pre>`;
  }

  return escapeHtml(value);
}


function renderKeyValueTable(rows = []) {
  if (!rows.length) {
    return '<p class="muted">No data.</p>';
  }

  const body = rows
    .map(
      ([label, value]) => `
      <tr>
        <th>${escapeHtml(label)}</th>
        <td>${formatValue(value)}</td>
      </tr>`
    )
    .join("");

  return `
    <table class="debug-table">
      <tbody>${body}</tbody>
    </table>`;
}


function renderDataTable(headers = [], rows = []) {
  if (!rows.length) {
    return '<p class="muted">No records.</p>';
  }

  const head = headers
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = rows
    .map(row => {
      const cells = row
        .map(cell => `<td>${formatValue(cell)}</td>`)
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderRuntimePanel(containerId = "runtime-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const store = getAnalyticsRuntimeStore();
  const runtime =
    (typeof window !== "undefined" && window.__PREPOS_RUNTIME__) ||
    store.runtime ||
    {};

  el.innerHTML = renderKeyValueTable([
    ["hydrated", runtime.hydrated],
    ["user", runtime.user?.email ?? runtime.user ?? store.runtime?.user],
    ["role", runtime.role ?? store.runtime?.role],
    ["analyticsEnabled", runtime.analyticsEnabled],
    ["listenersRegistered", runtime.listenersRegistered],
    ["bootedAt", runtime.bootedAt],
    ["version", runtime.version],
    ["bootDurationMs", runtime.bootDurationMs]
  ]);
}


export function renderSubmissionPanel(containerId = "submission-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const last =
    (typeof window !== "undefined" && window.__preposLastAnalytics) ||
    getAnalyticsRuntimeStore().lastSubmission ||
    {};

  const scope = last.submissionScope ?? {};

  el.innerHTML = renderKeyValueTable([
    ["submissionMode", last.submissionMode],
    ["analyticsScope", scope.scope],
    ["canonical", scope.canonical],
    ["assessmentEligible", scope.assessmentEligible],
    ["knowledgeEligible", scope.knowledgeEligible],
    ["examId", last.examId],
    ["attemptId", last.attemptId],
    ["processedAt", last.processedAt]
  ]);
}


export function renderEventPanel(containerId = "events-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const events = getAnalyticsRuntimeStore().events.slice().reverse();

  el.innerHTML = renderDataTable(
    ["event", "timestamp", "payload size", "summary"],
    events.map(event => [
      event.name,
      event.timestamp,
      event.payloadSize,
      event.payloadSummary
    ])
  );
}


export function renderTracePanel(containerId = "traces-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const traces = getAnalyticsRuntimeStore().traces.slice().reverse();

  el.innerHTML = renderDataTable(
    ["trace", "duration (ms)", "steps", "warnings"],
    traces.map(trace => [
      trace.name,
      trace.duration,
      trace.steps?.length ?? 0,
      trace.warnings?.length ?? 0
    ])
  );
}


export function renderWarningPanel(containerId = "warnings-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const warnings = getAnalyticsRuntimeStore().warnings.slice().reverse();

  el.innerHTML = renderDataTable(
    ["code", "severity", "timestamp", "message"],
    warnings.map(w => [
      w.code,
      w.severity,
      w.timestamp,
      w.message
    ])
  );
}


export function renderAllDebugPanels() {
  renderRuntimePanel();
  renderSubmissionPanel();
  renderEventPanel();
  renderTracePanel();
  renderWarningPanel();
}


export function startDebugPanelRefresh(intervalMs = 2000) {
  renderAllDebugPanels();

  return window.setInterval(() => {
    renderAllDebugPanels();
  }, intervalMs);
}
