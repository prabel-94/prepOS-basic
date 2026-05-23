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


const runtimeStore = {
  runtime: null,
  lastAssessmentAnalytics: null,
  lastKnowledgeAnalytics: null,
  lastSubmission: null,
  events: [],
  traces: [],
  warnings: [],
  diagnostics: {}
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
    diagnostics: { ...runtimeStore.diagnostics }
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
    payloadSummary: event.payloadSummary ?? {}
  };

  runtimeStore.events.push(entry);
  trimBuffer(runtimeStore.events, MAX_EVENTS);
}


export function recordAnalyticsTrace(trace = {}) {
  runtimeStore.traces.push(shallowClone(trace));
  trimBuffer(runtimeStore.traces, MAX_TRACES);
}


export function recordAnalyticsWarning(warning = {}) {
  const entry = {
    code: warning.code ?? "UNKNOWN_WARNING",
    severity: warning.severity ?? "warning",
    message: warning.message ?? "",
    timestamp: warning.timestamp ?? new Date().toISOString(),
    metadata: warning.metadata ?? {}
  };

  runtimeStore.warnings.push(entry);
  trimBuffer(runtimeStore.warnings, MAX_WARNINGS);
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
