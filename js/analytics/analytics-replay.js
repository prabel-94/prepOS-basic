/**
 * PrepOS Analytics Replay Diagnostics
 * -------------------------------------------------------
 * Observability reconstruction from snapshots (not full re-execution).
 */


import {
  getAnalyticsRuntimeStore,
  getAnalyticsSnapshotById
} from "./analytics-runtime-store.js";


/**
 * Reconstruct diagnostics linked to a snapshot.
 */
export function replayAnalyticsSnapshot(snapshotId) {
  const snapshot = getAnalyticsSnapshotById(snapshotId);

  if (!snapshot) {
    return {
      snapshot: null,
      traces: [],
      warnings: [],
      classifications: [],
      masteryEvents: [],
      error: "SNAPSHOT_NOT_FOUND"
    };
  }

  const store = getAnalyticsRuntimeStore();
  const examId = snapshot.metadata?.examId ?? null;
  const attemptId = snapshot.metadata?.attemptId ?? null;
  const traceId = snapshot.traceId ?? null;

  const traces = (store.traces ?? []).filter(trace => {
    return (
      trace.id === traceId ||
      trace.snapshotId === snapshotId
    );
  });

  const warnings = (store.warnings ?? []).filter(w => {
    return (
      w.metadata?.snapshotId === snapshotId ||
      (examId && w.metadata?.examId === examId) ||
      isNearTimestamp(w.timestamp, snapshot.timestamp, 120000)
    );
  });

  const classifications = (store.scopeViewer?.classifications ?? []).filter(
    record => {
      return (
        record.metadata?.snapshotId === snapshotId ||
        (examId && record.metadata?.examId === examId) ||
        isNearTimestamp(record.timestamp, snapshot.timestamp, 120000)
      );
    }
  );

  const masteryEvents = (store.masteryTimeline?.events ?? []).filter(event => {
    return (
      event.snapshotId === snapshotId ||
      event.metadata?.snapshotId === snapshotId ||
      (examId && event.metadata?.examId === examId) ||
      isNearTimestamp(event.timestamp, snapshot.timestamp, 120000)
    );
  });

  const masteryInspectorTopics = (store.masteryInspector?.topics ?? []).filter(
    topic => {
      return (
        topic.metadata?.snapshotId === snapshotId ||
        (examId && topic.metadata?.examId === examId)
      );
    }
  );

  return {
    snapshot,
    traces,
    warnings,
    classifications,
    masteryEvents,
    masteryInspectorTopics
  };
}


function isNearTimestamp(a, b, windowMs = 60000) {
  if (!a || !b) {
    return false;
  }

  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= windowMs;
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function formatJsonBlock(value) {
  return `<pre class="debug-pre">${escapeHtml(
    JSON.stringify(value, null, 2)
  )}</pre>`;
}


export function renderReplayDiagnostics(containerId = "replay-diagnostics-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const snapshots =
    getAnalyticsRuntimeStore().snapshots?.analytics ?? [];

  if (!snapshots.length) {
    el.innerHTML = '<p class="muted">No snapshots available for replay.</p>';
    return;
  }

  const existingSelect = document.getElementById("replay-snapshot-select");
  const previousSelection = existingSelect?.value ?? null;
  const defaultId = snapshots[snapshots.length - 1]?.id ?? null;
  const activeSnapshotId = previousSelection || defaultId;

  const options = snapshots
    .slice()
    .reverse()
    .map(snap => {
      const selected = snap.id === activeSnapshotId ? "selected" : "";
      return `<option value="${escapeHtml(snap.id)}" ${selected}>${escapeHtml(
        snap.timestamp
      )} — ${escapeHtml(snap.trigger ?? "snapshot")}</option>`;
    })
    .join("");

  const replay = activeSnapshotId
    ? replayAnalyticsSnapshot(activeSnapshotId)
    : null;

  el.innerHTML = `
    <label class="small">Select snapshot</label>
    <select id="replay-snapshot-select" class="mt-10" style="max-width:100%;">
      ${options}
    </select>
    <div id="replay-output" class="mt-10">
      ${
        replay
          ? `
        <h4>Snapshot</h4>
        ${formatJsonBlock(replay.snapshot)}
        <h4>Traces (${replay.traces.length})</h4>
        ${formatJsonBlock(replay.traces)}
        <h4>Warnings (${replay.warnings.length})</h4>
        ${formatJsonBlock(replay.warnings)}
        <h4>Classifications (${replay.classifications.length})</h4>
        ${formatJsonBlock(replay.classifications.slice(0, 25))}
        <h4>Mastery Events (${replay.masteryEvents.length})</h4>
        ${formatJsonBlock(replay.masteryEvents)}
      `
          : "<p class='muted'>Select a snapshot to replay diagnostics.</p>"
      }
    </div>`;

  const select = document.getElementById("replay-snapshot-select");

  if (select) {
    select.value = activeSnapshotId ?? "";

    if (!select.dataset.bound) {
      select.dataset.bound = "true";
      select.addEventListener("change", () => {
        renderReplayDiagnostics(containerId);
      });
    }
  }
}


export function registerAnalyticsReplayDebugGlobals() {
  if (typeof window === "undefined") {
    return;
  }

  window.debugAnalyticsReplay = function debugAnalyticsReplay(snapshotId) {
    const id =
      snapshotId ??
      getAnalyticsRuntimeStore().snapshots?.analytics?.slice(-1)[0]?.id;

    const replay = replayAnalyticsSnapshot(id);

    console.group("[PrepOS Analytics Replay]");

    console.log("Snapshot ID:", id);
    console.log("Replay:", replay);

    console.groupEnd();

    return replay;
  };
}
