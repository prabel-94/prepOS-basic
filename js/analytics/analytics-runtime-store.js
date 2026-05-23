/**
 * PrepOS Analytics Runtime Store
 * -------------------------------------------------------
 * Lightweight diagnostics store — NOT application state.
 *
 * PrepOS Analytics Observability Architecture
 */


const MAX_EVENTS = 100;
const MAX_TRACES = 100;
const MAX_WARNINGS = 100;
const MAX_SCOPE_CLASSIFICATIONS = 500;
const MAX_SCOPE_EXCLUSIONS = 500;
const MAX_MASTERY_TOPICS = 500;
const MAX_MASTERY_WARNINGS = 100;
const MAX_ANALYTICS_SNAPSHOTS = 200;
const MAX_MASTERY_SNAPSHOTS = 200;
const MAX_WARNING_SNAPSHOTS = 100;
const MAX_TIMELINE_EVENTS_PER_TOPIC = 100;
const MAX_TIMELINE_EVENTS_GLOBAL = 500;
const MAX_ANOMALIES = 500;


const runtimeStore = {
  runtime: null,
  lastAssessmentAnalytics: null,
  lastKnowledgeAnalytics: null,
  lastSubmission: null,
  events: [],
  traces: [],
  warnings: [],
  diagnostics: {},
  scopeViewer: {
    classifications: [],
    exclusions: [],
    summaries: {}
  },
  masteryInspector: {
    topics: [],
    summaries: {},
    warnings: []
  },
  snapshots: {
    analytics: [],
    mastery: [],
    warnings: []
  },
  masteryTimeline: {
    topics: {},
    events: []
  },
  anomalies: {
    records: [],
    summaries: {},
    criticalCount: 0
  }
};


function trimBuffer(buffer, max) {
  while (buffer.length > max) {
    buffer.shift();
  }
}


function shallowClone(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return [...value];
  }

  return { ...value };
}


/**
 * Immutable snapshot of diagnostics store.
 */
export function getAnalyticsRuntimeStore() {
  return Object.freeze({
    runtime: shallowClone(runtimeStore.runtime),
    lastAssessmentAnalytics: shallowClone(
      runtimeStore.lastAssessmentAnalytics
    ),
    lastKnowledgeAnalytics: shallowClone(
      runtimeStore.lastKnowledgeAnalytics
    ),
    lastSubmission: shallowClone(runtimeStore.lastSubmission),
    events: runtimeStore.events.map(shallowClone),
    traces: runtimeStore.traces.map(shallowClone),
    warnings: runtimeStore.warnings.map(shallowClone),
    diagnostics: { ...runtimeStore.diagnostics },
    scopeViewer: Object.freeze({
      classifications: runtimeStore.scopeViewer.classifications.map(
        shallowClone
      ),
      exclusions: runtimeStore.scopeViewer.exclusions.map(shallowClone),
      summaries: { ...runtimeStore.scopeViewer.summaries }
    }),
    masteryInspector: Object.freeze({
      topics: runtimeStore.masteryInspector.topics.map(shallowClone),
      summaries: { ...runtimeStore.masteryInspector.summaries },
      warnings: runtimeStore.masteryInspector.warnings.map(shallowClone)
    }),
    snapshots: Object.freeze({
      analytics: runtimeStore.snapshots.analytics.map(shallowClone),
      mastery: runtimeStore.snapshots.mastery.map(shallowClone),
      warnings: runtimeStore.snapshots.warnings.map(shallowClone)
    }),
    masteryTimeline: Object.freeze({
      topics: Object.fromEntries(
        Object.entries(runtimeStore.masteryTimeline.topics).map(
          ([key, events]) => [key, events.map(shallowClone)]
        )
      ),
      events: runtimeStore.masteryTimeline.events.map(shallowClone)
    }),
    anomalies: Object.freeze({
      records: runtimeStore.anomalies.records.map(shallowClone),
      summaries: { ...runtimeStore.anomalies.summaries },
      criticalCount: runtimeStore.anomalies.criticalCount
    })
  });
}


export function updateRuntimeDiagnostics(data = {}) {
  runtimeStore.runtime = {
    capturedAt: new Date().toISOString(),
    ...shallowClone(data)
  };

  runtimeStore.diagnostics.runtimeUpdatedAt =
    runtimeStore.runtime.capturedAt;
}


export function recordAnalyticsEvent(event = {}) {
  const entry = {
    name: event.name ?? event.eventName ?? "unknown",
    timestamp: event.timestamp ?? new Date().toISOString(),
    durationMs: event.durationMs ?? null,
    payloadSize: event.payloadSize ?? 0,
    payloadSummary: event.payloadSummary ?? {},
    analyticsVersion: event.analyticsVersion ?? null,
    masteryVersion: event.masteryVersion ?? null,
    classificationVersion: event.classificationVersion ?? null,
    difficultyVersion: event.difficultyVersion ?? null
  };

  runtimeStore.events.push(entry);
  trimBuffer(runtimeStore.events, MAX_EVENTS);
}


export function recordAnalyticsTrace(trace = {}) {
  runtimeStore.traces.push(shallowClone(trace));
  trimBuffer(runtimeStore.traces, MAX_TRACES);
}


export function linkTraceToSnapshot(traceId, snapshotId) {
  const trace = runtimeStore.traces.find(t => t.id === traceId);

  if (trace) {
    trace.snapshotId = snapshotId;
  }
}


export function recordAnalyticsWarning(warning = {}) {
  const entry = {
    code: warning.code ?? "UNKNOWN_WARNING",
    severity: warning.severity ?? "warning",
    message: warning.message ?? "",
    timestamp: warning.timestamp ?? new Date().toISOString(),
    metadata: warning.metadata ?? {},
    traceId: warning.traceId ?? null,
    snapshotId: warning.snapshotId ?? null
  };

  runtimeStore.warnings.push(entry);
  trimBuffer(runtimeStore.warnings, MAX_WARNINGS);

  if (entry.severity === "critical" || entry.severity === "high") {
    import("./analytics-snapshots.js")
      .then(({ triggerWarningSnapshot }) => {
        triggerWarningSnapshot(entry);
      })
      .catch(() => {});
  }

  return entry;
}


export function updateLastAnalyticsSnapshot({
  assessment = null,
  knowledge = null,
  submission = null
} = {}) {
  if (assessment !== null && assessment !== undefined) {
    runtimeStore.lastAssessmentAnalytics = shallowClone(assessment);
  }

  if (knowledge !== null && knowledge !== undefined) {
    runtimeStore.lastKnowledgeAnalytics = shallowClone(knowledge);
  }

  if (submission !== null && submission !== undefined) {
    runtimeStore.lastSubmission = shallowClone(submission);
  }

  runtimeStore.diagnostics.lastSnapshotAt =
    new Date().toISOString();
}


export function updateDiagnosticsPatch(patch = {}) {
  runtimeStore.diagnostics = {
    ...runtimeStore.diagnostics,
    ...patch
  };
}


export function recordScopeClassification(record = {}) {
  runtimeStore.scopeViewer.classifications.push(shallowClone(record));
  trimBuffer(
    runtimeStore.scopeViewer.classifications,
    MAX_SCOPE_CLASSIFICATIONS
  );
}


export function recordScopeExclusion(record = {}) {
  runtimeStore.scopeViewer.exclusions.push(shallowClone(record));
  trimBuffer(runtimeStore.scopeViewer.exclusions, MAX_SCOPE_EXCLUSIONS);
}


export function updateScopeSummary(summary = {}) {
  runtimeStore.scopeViewer.summaries = {
    ...summary,
    updatedAt: new Date().toISOString()
  };
}


export function recordTopicMastery(record = {}) {
  const topicId = record.topicId ?? record.topicName ?? null;

  const existingIndex = runtimeStore.masteryInspector.topics.findIndex(
    t => (t.topicId ?? t.topicName) === topicId
  );

  const entry = shallowClone({
    ...record,
    lastUpdated: record.lastUpdated ?? new Date().toISOString()
  });

  if (existingIndex >= 0) {
    runtimeStore.masteryInspector.topics[existingIndex] = entry;
  } else {
    runtimeStore.masteryInspector.topics.push(entry);
    trimBuffer(runtimeStore.masteryInspector.topics, MAX_MASTERY_TOPICS);
  }
}


export function recordMasteryInspectorWarning(warning = {}) {
  runtimeStore.masteryInspector.warnings.push(
    shallowClone({
      timestamp: new Date().toISOString(),
      ...warning
    })
  );
  trimBuffer(runtimeStore.masteryInspector.warnings, MAX_MASTERY_WARNINGS);
}


export function updateMasterySummary(summary = {}) {
  runtimeStore.masteryInspector.summaries = {
    ...summary,
    updatedAt: new Date().toISOString()
  };
}


export function recordAnalyticsSnapshot(snapshot = {}) {
  runtimeStore.snapshots.analytics.push(shallowClone(snapshot));
  trimBuffer(runtimeStore.snapshots.analytics, MAX_ANALYTICS_SNAPSHOTS);
}


export function updateAnomalySnapshot(snapshot = {}) {
  const records = runtimeStore.anomalies.records;
  const criticalCount = records.filter(
    a => a.severity === "critical"
  ).length;

  runtimeStore.anomalies.summaries = {
    ...snapshot,
    total: records.length,
    criticalCount,
    updatedAt: new Date().toISOString()
  };

  runtimeStore.anomalies.criticalCount = criticalCount;
}


export function recordAnalyticsAnomaly(anomaly = {}) {
  runtimeStore.anomalies.records.push(shallowClone(anomaly));
  trimBuffer(runtimeStore.anomalies.records, MAX_ANOMALIES);
  updateAnomalySnapshot();
}


export function recordMasterySnapshot(snapshot = {}) {
  runtimeStore.snapshots.mastery.push(shallowClone(snapshot));
  trimBuffer(runtimeStore.snapshots.mastery, MAX_MASTERY_SNAPSHOTS);
}


export function recordWarningSnapshot(snapshot = {}) {
  runtimeStore.snapshots.warnings.push(shallowClone(snapshot));
  trimBuffer(runtimeStore.snapshots.warnings, MAX_WARNING_SNAPSHOTS);
}


export function getAnalyticsSnapshotById(snapshotId) {
  const snapshot = runtimeStore.snapshots.analytics.find(
    s => s.id === snapshotId
  );

  return snapshot ? shallowClone(snapshot) : null;
}


export function recordMasteryTimelineEvent(event = {}) {
  const topicId = event.topicId ?? event.topicName ?? "unknown";

  if (!runtimeStore.masteryTimeline.topics[topicId]) {
    runtimeStore.masteryTimeline.topics[topicId] = [];
  }

  runtimeStore.masteryTimeline.topics[topicId].push(shallowClone(event));
  trimBuffer(
    runtimeStore.masteryTimeline.topics[topicId],
    MAX_TIMELINE_EVENTS_PER_TOPIC
  );

  runtimeStore.masteryTimeline.events.push(shallowClone(event));
  trimBuffer(runtimeStore.masteryTimeline.events, MAX_TIMELINE_EVENTS_GLOBAL);
}
