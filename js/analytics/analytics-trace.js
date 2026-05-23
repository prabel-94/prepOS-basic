/**
 * PrepOS Analytics Trace System
 * -------------------------------------------------------
 * Trace analytics execution flow for diagnostics.
 *
 * PrepOS Analytics Observability Architecture
 */


import { recordAnalyticsTrace } from "./analytics-runtime-store.js";

import { getVersionMetadata } from "./analytics-version.js";


let traceCounter = 0;


function nextTraceId() {
  traceCounter += 1;
  return `trace_${Date.now()}_${traceCounter}`;
}


/**
 * Start a new analytics trace.
 */
export function startAnalyticsTrace(name = "analytics") {
  const versions = getVersionMetadata();

  return {
    id: nextTraceId(),
    name,
    startedAt: new Date().toISOString(),
    startedAtMs: performance.now(),
    steps: [],
    warnings: [],
    ...versions
  };
}


/**
 * Record an execution step on a trace.
 */
export function recordAnalyticsStep(
  trace,
  {
    step = "unknown",
    payloadSummary = {},
    metadata = {}
  } = {}
) {
  if (!trace) {
    return;
  }

  const now = performance.now();
  const previousStep = trace.steps[trace.steps.length - 1];
  const previousAt = previousStep?.endedAtMs ?? trace.startedAtMs;
  const duration = Math.max(0, Math.round(now - previousAt));

  trace.steps.push({
    step,
    timestamp: new Date().toISOString(),
    duration,
    payloadSummary,
    metadata,
    endedAtMs: now
  });
}


/**
 * Record a warning on a trace.
 */
export function recordAnalyticsWarning(
  trace,
  {
    code = "ANALYTICS_WARNING",
    message = "",
    metadata = {}
  } = {}
) {
  if (!trace) {
    return;
  }

  const warning = {
    code,
    message,
    metadata,
    timestamp: new Date().toISOString()
  };

  trace.warnings.push(warning);
}


/**
 * Complete trace and persist to runtime store.
 */
export function endAnalyticsTrace(trace) {
  if (!trace) {
    return null;
  }

  const completedAt = new Date().toISOString();
  const duration = Math.max(
    0,
    Math.round(performance.now() - trace.startedAtMs)
  );

  const versions = getVersionMetadata();

  const completed = {
    id: trace.id,
    name: trace.name,
    startedAt: trace.startedAt,
    completedAt,
    duration,
    steps: trace.steps.map(step => ({ ...step })),
    warnings: trace.warnings.map(w => ({ ...w })),
    snapshotId: trace.snapshotId ?? null,
    ...versions
  };

  recordAnalyticsTrace(completed);

  return completed;
}
