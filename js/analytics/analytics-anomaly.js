/**
 * PrepOS Analytics Anomaly Detection
 * -------------------------------------------------------
 * Passive detection of suspicious analytics behavior.
 */


import {
  recordAnalyticsAnomaly,
  recordAnalyticsWarning,
  getAnalyticsRuntimeStore,
  getAnalyticsSnapshotById
} from "./analytics-runtime-store.js";

import { getVersionMetadata } from "./analytics-version.js";


export const ANALYTICS_ANOMALIES = Object.freeze({
  PUBLIC_MASTERY_CONTAMINATION: "PUBLIC_MASTERY_CONTAMINATION",
  EXPERIMENTAL_KNOWLEDGE_CONTAMINATION:
    "EXPERIMENTAL_KNOWLEDGE_CONTAMINATION",
  IMPOSSIBLE_MASTERY_SPIKE: "IMPOSSIBLE_MASTERY_SPIKE",
  IMPOSSIBLE_CONFIDENCE: "IMPOSSIBLE_CONFIDENCE",
  UNSTABLE_DIFFICULTY_CALIBRATION: "UNSTABLE_DIFFICULTY_CALIBRATION",
  LOW_CONFIDENCE_HIGH_MASTERY: "LOW_CONFIDENCE_HIGH_MASTERY",
  INVALID_SCOPE_CLASSIFICATION: "INVALID_SCOPE_CLASSIFICATION"
});


export const ANALYTICS_SEVERITY = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});


let anomalyCounter = 0;


function nextAnomalyId() {
  anomalyCounter += 1;
  return `anom_${Date.now()}_${anomalyCounter}`;
}


export function createAnomalyRecord({
  code,
  severity,
  reason,
  snapshotId = null,
  traceId = null,
  topicId = null,
  questionId = null,
  metadata = {}
} = {}) {
  const versions = getVersionMetadata();

  return {
    id: nextAnomalyId(),
    code,
    severity,
    detectedAt: new Date().toISOString(),
    snapshotId,
    traceId,
    topicId,
    questionId,
    reason,
    metadata,
    analyticsVersion: versions.analyticsVersion,
    masteryVersion: versions.masteryVersion,
    classificationVersion: versions.classificationVersion
  };
}


function getPreviousMastery(topicId, topicName) {
  const timeline =
    getAnalyticsRuntimeStore().masteryTimeline?.topics ?? {};
  const events =
    timeline[topicId] ?? timeline[topicName] ?? [];

  if (events.length < 2) {
    return null;
  }

  return events[events.length - 2]?.mastery ?? null;
}


/**
 * Detect analytics anomalies from diagnostics inputs.
 */
export function detectAnalyticsAnomalies({
  snapshot = null,
  masteryRecords = [],
  classifications = [],
  warnings = []
} = {}) {
  const anomalies = [];
  const snapshotId = snapshot?.id ?? null;
  const traceId = snapshot?.traceId ?? null;

  for (const record of masteryRecords) {
    const mastery = Number(record.mastery ?? 0);
    const publicAttempts = Number(record.publicAttempts ?? 0);
    const canonicalAttempts = Number(record.canonicalAttempts ?? 0);
    const confidence = record.confidence ?? "low";
    const topicId = record.topicId ?? record.topicName;

    if (publicAttempts > 0 && canonicalAttempts === 0 && mastery > 0) {
      anomalies.push(
        createAnomalyRecord({
          code: ANALYTICS_ANOMALIES.PUBLIC_MASTERY_CONTAMINATION,
          severity: ANALYTICS_SEVERITY.CRITICAL,
          reason:
            "Public attempts present with zero canonical attempts but positive mastery.",
          snapshotId,
          traceId,
          topicId,
          metadata: { mastery, publicAttempts, canonicalAttempts }
        })
      );
    }

    const previousMastery = getPreviousMastery(topicId, record.topicName);

    if (previousMastery !== null) {
      const delta = Math.abs(mastery - previousMastery);

      if (delta > 30 && canonicalAttempts <= 1) {
        anomalies.push(
          createAnomalyRecord({
            code: ANALYTICS_ANOMALIES.IMPOSSIBLE_MASTERY_SPIKE,
            severity: ANALYTICS_SEVERITY.HIGH,
            reason: `Mastery changed by ${delta.toFixed(1)}% with only ${canonicalAttempts} canonical attempt(s).`,
            snapshotId,
            traceId,
            topicId,
            metadata: {
              previousMastery,
              currentMastery: mastery,
              delta,
              canonicalAttempts
            }
          })
        );
      }
    }

    if (confidence === "high" && canonicalAttempts < 5) {
      anomalies.push(
        createAnomalyRecord({
          code: ANALYTICS_ANOMALIES.IMPOSSIBLE_CONFIDENCE,
          severity: ANALYTICS_SEVERITY.HIGH,
          reason:
            "High confidence declared with insufficient canonical attempts.",
          snapshotId,
          traceId,
          topicId,
          metadata: { confidence, canonicalAttempts, mastery }
        })
      );
    }

    if (mastery > 80 && confidence === "low") {
      anomalies.push(
        createAnomalyRecord({
          code: ANALYTICS_ANOMALIES.LOW_CONFIDENCE_HIGH_MASTERY,
          severity: ANALYTICS_SEVERITY.MEDIUM,
          reason:
            "High mastery score paired with low confidence — calibration mismatch.",
          snapshotId,
          traceId,
          topicId,
          metadata: { mastery, confidence }
        })
      );
    }
  }

  for (const record of classifications) {
    if (
      record.knowledgeEligible === true &&
      (record.public === true || record.experimental === true)
    ) {
      anomalies.push(
        createAnomalyRecord({
          code: ANALYTICS_ANOMALIES.INVALID_SCOPE_CLASSIFICATION,
          severity: ANALYTICS_SEVERITY.CRITICAL,
          reason:
            "Knowledge eligibility true while scope is public or experimental.",
          snapshotId,
          traceId,
          questionId: record.questionId ?? null,
          metadata: {
            scope: record.scope,
            public: record.public,
            experimental: record.experimental
          }
        })
      );
    }

    if (
      record.experimental === true &&
      record.knowledgeEligible === true
    ) {
      anomalies.push(
        createAnomalyRecord({
          code: ANALYTICS_ANOMALIES.EXPERIMENTAL_KNOWLEDGE_CONTAMINATION,
          severity: ANALYTICS_SEVERITY.CRITICAL,
          reason: "Experimental question marked knowledge-eligible.",
          snapshotId,
          traceId,
          questionId: record.questionId ?? null,
          metadata: { scope: record.scope }
        })
      );
    }
  }

  for (const warning of warnings) {
    if (warning.code === ANALYTICS_ANOMALIES.PUBLIC_MASTERY_CONTAMINATION) {
      anomalies.push(
        createAnomalyRecord({
          code: warning.code,
          severity: ANALYTICS_SEVERITY.CRITICAL,
          reason: warning.message ?? "Linked warning detected.",
          snapshotId: warning.metadata?.snapshotId ?? snapshotId,
          traceId: warning.traceId ?? traceId,
          metadata: warning.metadata ?? {}
        })
      );
    }
  }

  if (snapshot?.assessmentSummary?.totalAttempts === 0) {
    const unstable =
      (snapshot.knowledgeSummary?.masteryTopicCount ?? 0) > 0;

    if (unstable) {
      anomalies.push(
        createAnomalyRecord({
          code: ANALYTICS_ANOMALIES.UNSTABLE_DIFFICULTY_CALIBRATION,
          severity: ANALYTICS_SEVERITY.MEDIUM,
          reason:
            "Knowledge mastery present with zero assessment attempts in snapshot.",
          snapshotId,
          traceId,
          metadata: { assessmentSummary: snapshot.assessmentSummary }
        })
      );
    }
  }

  return anomalies;
}


/**
 * Record detected anomalies and escalate critical/high to warnings.
 */
export function detectAndRecordAnomalies(context = {}) {
  try {
    const anomalies = detectAnalyticsAnomalies(context);

    for (const anomaly of anomalies) {
      recordAnalyticsAnomaly(anomaly);

      if (
        anomaly.severity === ANALYTICS_SEVERITY.CRITICAL ||
        anomaly.severity === ANALYTICS_SEVERITY.HIGH
      ) {
        recordAnalyticsWarning({
          code: anomaly.code,
          severity: anomaly.severity,
          message: anomaly.reason,
          snapshotId: anomaly.snapshotId,
          traceId: anomaly.traceId,
          metadata: {
            anomalyId: anomaly.id,
            ...anomaly.metadata
          }
        });
      }
    }

    return anomalies;
  } catch (error) {
    console.warn(
      "[PrepOS Anomaly Detection] Failed (non-fatal):",
      error
    );
    return [];
  }
}


/**
 * Run anomaly detection for a stored snapshot.
 */
export function runAnomalyDetectionForSnapshot(snapshotId) {
  const snapshot = getAnalyticsSnapshotById(snapshotId);
  const store = getAnalyticsRuntimeStore();

  if (!snapshot) {
    return [];
  }

  return detectAndRecordAnomalies({
    snapshot,
    masteryRecords: store.masteryInspector?.topics ?? [],
    classifications: store.scopeViewer?.classifications ?? [],
    warnings: store.warnings ?? []
  });
}
