/**
 * PrepOS Analytics Snapshots
 * -------------------------------------------------------
 * Lightweight historical analytics state checkpoints.
 */


import {
  recordAnalyticsSnapshot,
  recordMasterySnapshot,
  recordWarningSnapshot,
  getAnalyticsRuntimeStore,
  linkTraceToSnapshot,
  getAnalyticsSnapshotById
} from "./analytics-runtime-store.js";

import { getVersionMetadata } from "./analytics-version.js";

import { createAnalyticsHash } from "./replay-validator.js";

import { detectAndRecordAnomalies } from "./analytics-anomaly.js";

import { validateAndRecordConfidenceCalibration } from "./confidence-validator.js";


let snapshotCounter = 0;


function nextSnapshotId() {
  snapshotCounter += 1;
  return `snap_${Date.now()}_${snapshotCounter}`;
}


function summarizeAssessment(assessment = {}) {
  const questionStats = assessment.questionStats ?? [];
  const examStats = assessment.examStats ?? {};

  const sorted = [...questionStats].sort((a, b) => {
    return (b.difficulty ?? b.accuracy ?? 0) - (a.difficulty ?? a.accuracy ?? 0);
  });

  return {
    hardestQuestions: sorted.slice(0, 5).map(s => ({
      questionId: s.questionId ?? null,
      accuracy: s.accuracy ?? null,
      attempts: s.attempts ?? 0
    })),
    averageAccuracy: examStats.averageAccuracy ?? examStats.meanAccuracy ?? null,
    totalAttempts: examStats.attemptCount ?? questionStats.length ?? 0
  };
}


function summarizeKnowledge(knowledge = {}) {
  const topicMastery = knowledge.topicMastery ?? [];
  const weakTopics = knowledge.weakTopics ?? [];

  const confidenceDistribution = {
    high: 0,
    medium: 0,
    low: 0
  };

  for (const topic of topicMastery) {
    const level = topic.confidence ?? topic.masteryLevel ?? "low";

    if (level === "high" || level === "strong") {
      confidenceDistribution.high += 1;
    } else if (level === "medium" || level === "developing") {
      confidenceDistribution.medium += 1;
    } else {
      confidenceDistribution.low += 1;
    }
  }

  return {
    weakTopics: weakTopics.slice(0, 10).map(t => ({
      topicName: t.topicName ?? t.name ?? null,
      masteryScore: t.masteryScore ?? t.accuracy ?? null
    })),
    masteryTopicCount: topicMastery.length,
    confidenceDistribution
  };
}


function countWarnings(warnings = []) {
  const counts = {};

  for (const warning of warnings) {
    const code = warning.code ?? "UNKNOWN";
    counts[code] = (counts[code] ?? 0) + 1;
  }

  return counts;
}


/**
 * Create a lightweight analytics snapshot (passive).
 */
export function createAnalyticsSnapshot({
  runtime = null,
  assessment = null,
  knowledge = null,
  scopeSummary = null,
  masterySummary = null,
  warnings = [],
  metadata = {},
  traceId = null,
  trigger = "manual"
} = {}) {
  try {
    const versions = getVersionMetadata();
    const snapshotId = nextSnapshotId();
    const timestamp = new Date().toISOString();

    const allWarnings = warnings.length
      ? warnings
      : getAnalyticsRuntimeStore().warnings ?? [];

    const snapshot = {
      id: snapshotId,
      timestamp,
      traceId,
      trigger,
      ...versions,
      assessmentSummary: summarizeAssessment(assessment ?? {}),
      knowledgeSummary: summarizeKnowledge(knowledge ?? {}),
      scopeSummary: scopeSummary ?? {},
      masterySummary: masterySummary ?? {},
      warningCounts: countWarnings(allWarnings),
      runtimeSummary: runtime
        ? {
            hydrated: runtime.hydrated ?? false,
            analyticsEnabled: runtime.analyticsEnabled ?? false,
            role: runtime.role ?? null
          }
        : null,
      metadata: {
        source: metadata.source ?? trigger,
        submissionMode: metadata.submissionMode ?? null,
        examId: metadata.examId ?? null,
        attemptId: metadata.attemptId ?? null,
        ...metadata
      }
    };

    snapshot.analyticsHash = createAnalyticsHash(snapshot);

    recordAnalyticsSnapshot(snapshot);

    const store = getAnalyticsRuntimeStore();

    detectAndRecordAnomalies({
      snapshot,
      masteryRecords: store.masteryInspector?.topics ?? [],
      classifications: store.scopeViewer?.classifications?.slice(-100) ?? [],
      warnings: allWarnings
    });

    validateAndRecordConfidenceCalibration({
      masteryRecords: store.masteryInspector?.topics ?? [],
      classifications: store.scopeViewer?.classifications?.slice(-100) ?? [],
      snapshotId,
      traceId
    });

    if (traceId) {
      linkTraceToSnapshot(traceId, snapshotId);
    }

    if (knowledge && Object.keys(knowledge).length) {
      recordMasterySnapshot({
        snapshotId,
        timestamp,
        ...versions,
        knowledgeSummary: snapshot.knowledgeSummary,
        masterySummary: snapshot.masterySummary,
        metadata: snapshot.metadata
      });
    }

    const criticalWarnings = allWarnings.filter(w => {
      return w.severity === "critical" || w.severity === "high";
    });

    if (criticalWarnings.length) {
      recordWarningSnapshot({
        snapshotId,
        timestamp,
        ...versions,
        warningCounts: countWarnings(criticalWarnings),
        codes: criticalWarnings.map(w => w.code),
        metadata: snapshot.metadata
      });
    }

    return snapshot;
  } catch (error) {
    console.warn(
      "[PrepOS Analytics Snapshots] Creation failed (non-fatal):",
      error
    );
    return null;
  }
}


/**
 * Trigger snapshot after exam submission completes.
 */
export function triggerSubmissionSnapshot({
  combined = {},
  trace = null,
  runtime = null
} = {}) {
  const store = getAnalyticsRuntimeStore();

  return createAnalyticsSnapshot({
    runtime: runtime ?? store.runtime,
    assessment: combined.assessment ?? null,
    knowledge: combined.knowledge ?? null,
    scopeSummary: store.scopeViewer?.summaries ?? {},
    masterySummary: store.masteryInspector?.summaries ?? {},
    warnings: store.warnings ?? [],
    traceId: trace?.id ?? null,
    metadata: {
      source: "exam_submission_complete",
      submissionMode: combined.submissionMode ?? null,
      examId: combined.examId ?? null,
      attemptId: combined.attemptId ?? null
    },
    trigger: "exam_submission_complete"
  });
}


/**
 * Trigger snapshot when knowledge analytics completes.
 */
export function triggerKnowledgeSnapshot({
  knowledge = {},
  metadata = {},
  traceId = null
} = {}) {
  const store = getAnalyticsRuntimeStore();

  return createAnalyticsSnapshot({
    assessment: null,
    knowledge,
    scopeSummary: store.scopeViewer?.summaries ?? {},
    masterySummary: store.masteryInspector?.summaries ?? {},
    warnings: store.warnings ?? [],
    traceId,
    metadata: {
      source: "knowledge_analytics_complete",
      ...metadata
    },
    trigger: "knowledge_analytics_complete"
  });
}


/**
 * Trigger snapshot on major warning.
 */
export function triggerWarningSnapshot(warning = {}) {
  const store = getAnalyticsRuntimeStore();

  return createAnalyticsSnapshot({
    scopeSummary: store.scopeViewer?.summaries ?? {},
    masterySummary: store.masteryInspector?.summaries ?? {},
    warnings: [warning, ...(store.warnings ?? [])].slice(0, 20),
    metadata: {
      source: "major_warning",
      warningCode: warning.code ?? null,
      ...(warning.metadata ?? {})
    },
    trigger: "major_warning"
  });
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


export function renderSnapshotsPanel(containerId = "snapshots-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const snapshots =
    getAnalyticsRuntimeStore().snapshots?.analytics?.slice().reverse() ?? [];

  if (!snapshots.length) {
    el.innerHTML = '<p class="muted">No analytics snapshots recorded.</p>';
    return;
  }

  const head = [
    "timestamp",
    "analytics version",
    "weak topics",
    "warnings",
    "confidence (low/med/high)",
    "trigger"
  ]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = snapshots
    .map(snap => {
      const dist = snap.knowledgeSummary?.confidenceDistribution ?? {};
      const confidenceLabel = `low:${dist.low ?? 0} med:${dist.medium ?? 0} high:${dist.high ?? 0}`;
      const weakCount = snap.knowledgeSummary?.weakTopics?.length ?? 0;
      const warningTotal = Object.values(snap.warningCounts ?? {}).reduce(
        (sum, n) => sum + n,
        0
      );

      return `
      <tr data-snapshot-id="${escapeHtml(snap.id)}">
        <td>${escapeHtml(snap.timestamp)}</td>
        <td>${escapeHtml(snap.analyticsVersion)}</td>
        <td>${escapeHtml(weakCount)}</td>
        <td>${escapeHtml(warningTotal)}</td>
        <td>${escapeHtml(confidenceLabel)}</td>
        <td>${escapeHtml(snap.trigger ?? snap.metadata?.source)}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function registerAnalyticsSnapshotsDebugGlobals() {
  if (typeof window === "undefined") {
    return;
  }

  window.debugAnalyticsSnapshots = function debugAnalyticsSnapshots() {
    const snapshots = getAnalyticsRuntimeStore().snapshots ?? {};

    console.group("[PrepOS Analytics Snapshots]");

    console.log("Analytics:", snapshots.analytics?.slice(-20));
    console.log("Mastery:", snapshots.mastery?.slice(-10));
    console.log("Warning snapshots:", snapshots.warnings?.slice(-10));

    console.groupEnd();

    return snapshots;
  };

  window.getAnalyticsSnapshotById = getAnalyticsSnapshotById;
}
