/**
 * PrepOS Analytics Simulation Framework
 * -------------------------------------------------------
 * Isolated fake diagnostics for validation testing only.
 */


import { detectAndRecordAnomalies } from "./analytics-anomaly.js";

import { getVersionMetadata } from "./analytics-version.js";

import { recordMasteryTimelineEvent } from "./analytics-runtime-store.js";


const SIMULATION_FLAG = "__PREPOS_SIMULATION__";


function createFakeSnapshot(overrides = {}) {
  const versions = getVersionMetadata();

  return {
    id: `sim_snap_${Date.now()}`,
    timestamp: new Date().toISOString(),
    traceId: `sim_trace_${Date.now()}`,
    trigger: "simulation",
    ...versions,
    assessmentSummary: { totalAttempts: 0, averageAccuracy: null },
    knowledgeSummary: {
      masteryTopicCount: 1,
      confidenceDistribution: { high: 0, medium: 0, low: 1 }
    },
    scopeSummary: {},
    masterySummary: {},
    warningCounts: {},
    metadata: {
      source: "analytics_simulation",
      [SIMULATION_FLAG]: true,
      ...overrides.metadata
    },
    ...overrides
  };
}


export function simulatePublicKnowledgeContamination() {
  const snapshot = createFakeSnapshot({
    metadata: { simulation: "public_contamination" }
  });

  const masteryRecords = [
    {
      topicId: "sim_topic_public",
      topicName: "Simulated Topic",
      mastery: 85,
      confidence: "medium",
      canonicalAttempts: 0,
      publicAttempts: 3,
      excludedAttempts: 3
    }
  ];

  const classifications = [
    {
      questionId: "sim_q_public",
      knowledgeEligible: true,
      public: true,
      experimental: false,
      scope: "public",
      classificationConfidence: "low"
    }
  ];

  return detectAndRecordAnomalies({
    snapshot,
    masteryRecords,
    classifications,
    warnings: []
  });
}


export function simulateExperimentalContamination() {
  const snapshot = createFakeSnapshot({
    metadata: { simulation: "experimental_contamination" }
  });

  const classifications = [
    {
      questionId: "sim_q_exp",
      knowledgeEligible: true,
      public: false,
      experimental: true,
      scope: "experimental",
      classificationConfidence: "medium"
    }
  ];

  return detectAndRecordAnomalies({
    snapshot,
    masteryRecords: [],
    classifications,
    warnings: []
  });
}


export function simulateImpossibleMasterySpike() {
  const snapshot = createFakeSnapshot({
    metadata: { simulation: "mastery_spike" }
  });

  recordMasteryTimelineEvent({
    topicId: "sim_topic_spike",
    topicName: "Spike Topic",
    mastery: 40,
    confidence: "low",
    canonicalAttempts: 1,
    excludedAttempts: 0,
    metadata: { __PREPOS_SIMULATION__: true }
  });

  const masteryRecords = [
    {
      topicId: "sim_topic_spike",
      topicName: "Spike Topic",
      mastery: 95,
      confidence: "medium",
      canonicalAttempts: 1,
      publicAttempts: 0,
      excludedAttempts: 0
    }
  ];

  return detectAndRecordAnomalies({
    snapshot,
    masteryRecords,
    classifications: [],
    warnings: []
  });
}


export function simulateInvalidConfidence() {
  const snapshot = createFakeSnapshot({
    metadata: { simulation: "invalid_confidence" }
  });

  const masteryRecords = [
    {
      topicId: "sim_topic_conf",
      topicName: "Confidence Topic",
      mastery: 70,
      confidence: "high",
      canonicalAttempts: 1,
      publicAttempts: 0,
      excludedAttempts: 0
    }
  ];

  const classifications = [
    {
      questionId: "sim_q_conf",
      knowledgeEligible: false,
      public: false,
      experimental: false,
      hasTopics: false,
      classificationConfidence: "high"
    }
  ];

  return detectAndRecordAnomalies({
    snapshot,
    masteryRecords,
    classifications,
    warnings: []
  });
}


export function simulateMissingTopics() {
  const snapshot = createFakeSnapshot({
    metadata: { simulation: "missing_topics" }
  });

  const classifications = [
    {
      questionId: "sim_q_notopics",
      knowledgeEligible: false,
      public: false,
      experimental: false,
      hasTopics: false,
      classificationConfidence: "medium"
    }
  ];

  return detectAndRecordAnomalies({
    snapshot,
    masteryRecords: [],
    classifications,
    warnings: []
  });
}


const SIMULATORS = {
  public_contamination: simulatePublicKnowledgeContamination,
  experimental_contamination: simulateExperimentalContamination,
  mastery_spike: simulateImpossibleMasterySpike,
  invalid_confidence: simulateInvalidConfidence,
  missing_topics: simulateMissingTopics
};


/**
 * Run isolated analytics simulation by type.
 */
export function runAnalyticsSimulation(type = "public_contamination") {
  const runner = SIMULATORS[type];

  if (!runner) {
    console.warn("[PrepOS Simulation] Unknown type:", type);
    return { type, anomalies: [], error: "UNKNOWN_SIMULATION_TYPE" };
  }

  const anomalies = runner();

  return {
    type,
    anomalies,
    count: anomalies.length
  };
}


export function registerAnalyticsSimulationGlobals() {
  if (typeof window === "undefined") {
    return;
  }

  window.runAnalyticsSimulation = runAnalyticsSimulation;
}
