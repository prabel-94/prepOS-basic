/**
 * PrepOS Analytics Validation Debug UI
 * -------------------------------------------------------
 * Panels for anomalies, replay validation, confidence, simulation.
 */


import { getAnalyticsRuntimeStore } from "./analytics-runtime-store.js";

import { replayAnalyticsSnapshot } from "./analytics-replay.js";

import {
  validateReplayDeterminism,
  createAnalyticsHash,
  buildReplaySnapshotFromReplay
} from "./replay-validator.js";

import { validateConfidenceCalibration } from "./confidence-validator.js";

import { runAnalyticsSimulation } from "./analytics-simulation.js";


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function formatJson(value) {
  return `<pre class="debug-pre">${escapeHtml(
    JSON.stringify(value, null, 2)
  )}</pre>`;
}


export function renderAnomalyPanel(containerId = "anomalies-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const anomalies =
    getAnalyticsRuntimeStore().anomalies?.records?.slice().reverse() ?? [];

  if (!anomalies.length) {
    el.innerHTML = '<p class="muted">No anomalies detected.</p>';
    return;
  }

  const head = [
    "code",
    "severity",
    "topic/question",
    "snapshot",
    "reason"
  ]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = anomalies
    .map(a => {
      const rowClass =
        a.severity === "critical" ? "scope-row-critical" : "scope-row-warn";

      return `
      <tr class="${rowClass}">
        <td>${escapeHtml(a.code)}</td>
        <td>${escapeHtml(a.severity)}</td>
        <td>${escapeHtml(a.topicId ?? a.questionId ?? "—")}</td>
        <td>${escapeHtml(a.snapshotId ?? "—")}</td>
        <td>${escapeHtml(a.reason)}</td>
      </tr>`;
    })
    .join("");

  const summary = getAnalyticsRuntimeStore().anomalies?.summaries ?? {};

  el.innerHTML = `
    <p class="small">Total: ${escapeHtml(summary.total ?? anomalies.length)} | Critical: ${escapeHtml(summary.criticalCount ?? 0)}</p>
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderReplayValidationPanel(
  containerId = "replay-validation-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const snapshots =
    getAnalyticsRuntimeStore().snapshots?.analytics ?? [];

  if (!snapshots.length) {
    el.innerHTML = '<p class="muted">No snapshots for replay validation.</p>';
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const replay = replayAnalyticsSnapshot(latest.id);
  const replaySnapshot = {
    ...buildReplaySnapshotFromReplay(replay),
    analyticsVersion: latest.analyticsVersion,
    masteryVersion: latest.masteryVersion,
    classificationVersion: latest.classificationVersion,
    difficultyVersion: latest.difficultyVersion
  };

  const validation = validateReplayDeterminism({
    originalSnapshot: latest,
    replaySnapshot
  });

  const storedHash = latest.analyticsHash ?? null;
  const computedHash = createAnalyticsHash(latest);

  el.innerHTML = `
    <table class="debug-table">
      <tbody>
        <tr><th>deterministic</th><td>${escapeHtml(validation.deterministic)}</td></tr>
        <tr><th>reason</th><td>${escapeHtml(validation.reason ?? "OK")}</td></tr>
        <tr><th>stored hash</th><td>${escapeHtml(storedHash ?? "—")}</td></tr>
        <tr><th>computed hash</th><td>${escapeHtml(computedHash)}</td></tr>
        <tr><th>original hash</th><td>${escapeHtml(validation.originalHash)}</td></tr>
        <tr><th>replay hash</th><td>${escapeHtml(validation.replayHash)}</td></tr>
        <tr><th>snapshot id</th><td>${escapeHtml(latest.id)}</td></tr>
      </tbody>
    </table>
    <h4 class="mt-10">Differences</h4>
    ${formatJson(validation.differences)}`;
}


export function renderConfidenceValidationPanel(
  containerId = "confidence-validation-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const store = getAnalyticsRuntimeStore();
  const issues = validateConfidenceCalibration({
    masteryRecords: store.masteryInspector?.topics ?? [],
    classifications: store.scopeViewer?.classifications?.slice(-100) ?? []
  });

  if (!issues.length) {
    el.innerHTML =
      '<p class="muted">No suspicious confidence states detected.</p>';
    return;
  }

  const head = ["code", "severity", "target", "reason"]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = issues
    .map(issue => `
      <tr class="scope-row-warn">
        <td>${escapeHtml(issue.code)}</td>
        <td>${escapeHtml(issue.severity)}</td>
        <td>${escapeHtml(issue.topicId ?? issue.questionId ?? "—")}</td>
        <td>${escapeHtml(issue.reason)}</td>
      </tr>`)
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderSimulationConsole(
  containerId = "simulation-console-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!el.dataset.simBound) {
    el.dataset.simBound = "true";
    el.addEventListener("click", event => {
      const btn = event.target.closest("[data-sim]");

      if (!btn || !el.contains(btn)) {
        return;
      }

      const type = btn.getAttribute("data-sim");
      const result = runAnalyticsSimulation(type);
      const output = document.getElementById("simulation-output");

      if (output) {
        output.innerHTML = formatJson(result);
      }

      renderAnomalyPanel();
      renderConfidenceValidationPanel();
    });
  }

  el.innerHTML = `
    <p class="small">Runs isolated fake diagnostics — does not modify live analytics.</p>
    <div class="flex gap-10 mt-10" style="flex-wrap:wrap;">
      <button type="button" class="secondary-btn" data-sim="public_contamination">Public Contamination</button>
      <button type="button" class="secondary-btn" data-sim="mastery_spike">Mastery Spike</button>
      <button type="button" class="secondary-btn" data-sim="invalid_confidence">Invalid Confidence</button>
      <button type="button" class="secondary-btn" data-sim="experimental_contamination">Experimental</button>
      <button type="button" class="secondary-btn" data-sim="missing_topics">Missing Topics</button>
    </div>
    <div id="simulation-output" class="mt-10 muted small">Select a simulation to run.</div>`;
}


export function renderAllValidationPanels() {
  renderAnomalyPanel();
  renderReplayValidationPanel();
  renderConfidenceValidationPanel();
  renderSimulationConsole();
}
