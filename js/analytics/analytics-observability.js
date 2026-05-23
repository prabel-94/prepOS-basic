/**
 * PrepOS Analytics Observability
 * -------------------------------------------------------
 * Passive diagnostics layer — observes only, never mutates analytics.
 *
 * PrepOS Analytics Observability Architecture
 */


import { on } from "./analytics-events.js";

import {
  getAnalyticsRuntimeStore,
  recordAnalyticsEvent,
  recordAnalyticsWarning,
  updateRuntimeDiagnostics,
  updateLastAnalyticsSnapshot,
  updateDiagnosticsPatch
} from "./analytics-runtime-store.js";


const OBSERVED_EVENTS = [
  "assessment_analytics_updated",
  "knowledge_analytics_updated",
  "analytics_updated",
  "knowledge_analytics_snapshot"
];


let observabilityInitialized = false;


function estimatePayloadSize(payload = {}) {
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
}


function summarizePayload(payload = {}) {
  return {
    examId: payload.examId ?? null,
    attemptId: payload.attemptId ?? null,
    analyticsMode: payload.analyticsMode ?? null,
    questionStatsCount: payload.questionStats?.length ?? 0,
    topicMasteryCount: payload.topicMastery?.length ?? 0,
    knowledgeTopics:
      payload.knowledgeAnalytics?.topicMastery?.length ?? 0,
    submissionMode: payload.submissionMode ?? null
  };
}


function captureRuntimeSnapshot() {
  if (typeof window === "undefined") {
    return;
  }

  const runtime = window.__PREPOS_RUNTIME__ ?? null;

  if (!runtime) {
    return;
  }

  updateRuntimeDiagnostics({
    hydrated: runtime.hydrated ?? false,
    user: runtime.user?.email ?? runtime.user?.id ?? null,
    role: runtime.role ?? null,
    analyticsEnabled: runtime.analyticsEnabled ?? false,
    listenersRegistered: runtime.listenersRegistered ?? false,
    bootedAt: runtime.bootedAt ?? null,
    version: runtime.version ?? null,
    bootDurationMs: runtime.bootDurationMs ?? null
  });
}


function checkPublicKnowledgeContamination(submission = {}) {
  const submissionMode =
    submission.submissionMode ??
    submission.submissionScope?.scope;

  const mode =
    typeof submissionMode === "string" &&
    submissionMode.includes("public")
      ? "public"
      : submission.submissionMode;

  const knowledgeEligible =
    submission.submissionScope?.knowledgeEligible ??
    submission.knowledgeEligible;

  if (mode === "public" && knowledgeEligible === true) {
    recordAnalyticsWarning({
      code: "PUBLIC_KNOWLEDGE_CONTAMINATION",
      severity: "critical",
      message:
        "Public submission marked knowledge-eligible — scope contamination risk.",
      metadata: {
        submissionMode: mode,
        knowledgeEligible
      }
    });
  }
}


function checkLowConfidence({
  attempts = 0,
  canonicalAttempts = 0
} = {}) {
  if (attempts < 5 || canonicalAttempts < 3) {
    recordAnalyticsWarning({
      code: "LOW_CONFIDENCE_ANALYTICS",
      severity: "warning",
      message:
        "Insufficient attempt sample for high-confidence analytics.",
      metadata: {
        attempts,
        canonicalAttempts
      }
    });
  }
}


function handleAnalyticsEvent(eventName, payload = {}) {
  const started = performance.now();

  recordAnalyticsEvent({
    name: eventName,
    timestamp: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    payloadSize: estimatePayloadSize(payload),
    payloadSummary: summarizePayload(payload)
  });

  if (eventName === "assessment_analytics_updated") {
    updateLastAnalyticsSnapshot({ assessment: summarizePayload(payload) });
  }

  if (
    eventName === "knowledge_analytics_updated" ||
    eventName === "knowledge_analytics_snapshot"
  ) {
    updateLastAnalyticsSnapshot({ knowledge: summarizePayload(payload) });

    const attempts =
      payload.analyticsMeta?.attempts ??
      payload.attemptCount ??
      0;

    const canonicalAttempts =
      payload.scopeReport?.canonical ??
      payload.canonicalAttempts ??
      attempts;

    checkLowConfidence({ attempts, canonicalAttempts });
  }
}


/**
 * Record submission diagnostics (passive).
 */
export function observeSubmissionAnalytics(result = {}) {
  try {
    const submission = {
      examId: result.examId ?? null,
      attemptId: result.attemptId ?? null,
      submissionMode: result.submissionMode ?? null,
      submissionScope: result.submissionScope ?? null,
      assessmentEligible:
        result.submissionScope?.assessmentEligible ?? null,
      knowledgeEligible:
        result.submissionScope?.knowledgeEligible ?? null,
      processedAt: result.processedAt ?? null
    };

    updateLastAnalyticsSnapshot({ submission });

    checkPublicKnowledgeContamination(submission);

    const attempts =
      result.knowledge?.analyticsMeta?.attempts ??
      result.assessment?.analyticsMeta?.attempts ??
      0;

    const canonicalAttempts =
      result.knowledge?.scopeReport?.canonical ??
      (result.submissionMode === "public" ? 0 : attempts);

    checkLowConfidence({ attempts, canonicalAttempts });

    updateDiagnosticsPatch({
      lastSubmissionMode: submission.submissionMode,
      lastKnowledgeEligible: submission.knowledgeEligible
    });
  } catch (error) {
    console.warn("[PrepOS Observability] observeSubmission failed:", error);
  }
}


/**
 * Register passive analytics event listeners.
 */
export function initAnalyticsObservability() {
  if (observabilityInitialized) {
    return;
  }

  observabilityInitialized = true;

  captureRuntimeSnapshot();

  for (const eventName of OBSERVED_EVENTS) {
    on(eventName, payload => {
      try {
        handleAnalyticsEvent(eventName, payload);
      } catch (error) {
        console.warn(
          `[PrepOS Observability] Event handler failed: ${eventName}`,
          error
        );
      }
    });
  }

  if (typeof window !== "undefined") {
    window.__PREPOS_ANALYTICS_STORE__ = getAnalyticsRuntimeStore;

    window.debugPrepOSAnalytics = function debugPrepOSAnalytics() {
      const store = getAnalyticsRuntimeStore();

      console.group("[PrepOS Analytics Observability]");

      console.log("Runtime:", store.runtime);
      console.log("Last submission:", store.lastSubmission);
      console.log("Assessment:", store.lastAssessmentAnalytics);
      console.log("Knowledge:", store.lastKnowledgeAnalytics);
      console.log("Warnings:", store.warnings);
      console.log("Traces:", store.traces);
      console.log("Events:", store.events);

      console.groupEnd();

      return store;
    };
  }
}
