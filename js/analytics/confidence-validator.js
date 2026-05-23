/**
 * PrepOS Confidence Calibration Validator
 * -------------------------------------------------------
 * Validates truthfulness of confidence metadata.
 */


import { recordAnalyticsAnomaly } from "./analytics-runtime-store.js";

import {
  ANALYTICS_ANOMALIES,
  ANALYTICS_SEVERITY,
  createAnomalyRecord
} from "./analytics-anomaly.js";


/**
 * Validate confidence calibration across mastery + classifications.
 */
export function validateConfidenceCalibration({
  masteryRecords = [],
  classifications = [],
  snapshotId = null,
  traceId = null
} = {}) {
  const issues = [];

  for (const record of masteryRecords) {
    const canonicalAttempts = Number(record.canonicalAttempts ?? 0);
    const confidence = record.confidence ?? "low";
    const mastery = Number(record.mastery ?? 0);
    const topicId = record.topicId ?? record.topicName;

    if (canonicalAttempts <= 2 && confidence === "high") {
      issues.push({
        code: ANALYTICS_ANOMALIES.IMPOSSIBLE_CONFIDENCE,
        severity: ANALYTICS_SEVERITY.HIGH,
        reason:
          "High confidence with two or fewer canonical attempts.",
        topicId,
        snapshotId,
        traceId,
        metadata: { canonicalAttempts, confidence, mastery }
      });
    }
  }

  for (const record of classifications) {
    const confidence = record.classificationConfidence ?? "low";
    const hasTopics = record.hasTopics === true;
    const knowledgeEligible = record.knowledgeEligible === true;

    if (knowledgeEligible === false && confidence === "high") {
      issues.push({
        code: ANALYTICS_ANOMALIES.IMPOSSIBLE_CONFIDENCE,
        severity: ANALYTICS_SEVERITY.HIGH,
        reason:
          "High classification confidence on non-knowledge-eligible entity.",
        questionId: record.questionId ?? null,
        snapshotId,
        traceId,
        metadata: {
          knowledgeEligible,
          classificationConfidence: confidence
        }
      });
    }

    if (!hasTopics && confidence !== "low") {
      issues.push({
        code: ANALYTICS_ANOMALIES.IMPOSSIBLE_CONFIDENCE,
        severity: ANALYTICS_SEVERITY.MEDIUM,
        reason:
          "Missing topics but classification confidence is not low.",
        questionId: record.questionId ?? null,
        snapshotId,
        traceId,
        metadata: { hasTopics, classificationConfidence: confidence }
      });
    }
  }

  return issues;
}


/**
 * Validate and record confidence anomalies.
 */
export function validateAndRecordConfidenceCalibration(context = {}) {
  try {
    const issues = validateConfidenceCalibration(context);

    for (const issue of issues) {
      recordAnalyticsAnomaly(createAnomalyRecord(issue));
    }

    return issues;
  } catch (error) {
    console.warn(
      "[PrepOS Confidence Validator] Failed (non-fatal):",
      error
    );
    return [];
  }
}
