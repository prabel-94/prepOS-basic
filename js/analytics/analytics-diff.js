/**
 * PrepOS Analytics Diff Engine
 * -------------------------------------------------------
 * Foundation for comparing analytics snapshots (no UI).
 */


/**
 * Compare two analytics snapshots.
 */
export function compareAnalyticsSnapshots(a = {}, b = {}) {
  return {
    masteryChanges: diffMasterySummaries(
      a.masterySummary ?? {},
      b.masterySummary ?? {}
    ),
    confidenceChanges: diffConfidenceDistributions(
      a.knowledgeSummary?.confidenceDistribution ?? {},
      b.knowledgeSummary?.confidenceDistribution ?? {}
    ),
    warningChanges: diffWarningCounts(
      a.warningCounts ?? {},
      b.warningCounts ?? {}
    ),
    scopeChanges: diffScopeSummaries(
      a.scopeSummary ?? {},
      b.scopeSummary ?? {}
    ),
    versionChanges: diffVersions(a, b),
    metadata: {
      snapshotA: a.id ?? null,
      snapshotB: b.id ?? null,
      timestampA: a.timestamp ?? null,
      timestampB: b.timestamp ?? null
    }
  };
}


function diffVersions(a, b) {
  const fields = [
    "analyticsVersion",
    "masteryVersion",
    "classificationVersion",
    "difficultyVersion"
  ];

  const changes = {};

  for (const field of fields) {
    if ((a[field] ?? null) !== (b[field] ?? null)) {
      changes[field] = {
        before: a[field] ?? null,
        after: b[field] ?? null
      };
    }
  }

  return changes;
}


function diffMasterySummaries(before = {}, after = {}) {
  const keys = new Set([
    ...Object.keys(before),
    ...Object.keys(after)
  ]);

  const changes = {};

  for (const key of keys) {
    if (["updatedAt", "processedAt"].includes(key)) {
      continue;
    }

    const prev = before[key];
    const next = after[key];

    if (prev !== next) {
      changes[key] = { before: prev, after: next };
    }
  }

  return changes;
}


function diffConfidenceDistributions(before = {}, after = {}) {
  const levels = ["high", "medium", "low"];
  const changes = {};

  for (const level of levels) {
    const prev = before[level] ?? 0;
    const next = after[level] ?? 0;

    if (prev !== next) {
      changes[level] = { before: prev, after: next, delta: next - prev };
    }
  }

  return changes;
}


function diffWarningCounts(before = {}, after = {}) {
  const codes = new Set([
    ...Object.keys(before),
    ...Object.keys(after)
  ]);

  const changes = {};

  for (const code of codes) {
    const prev = before[code] ?? 0;
    const next = after[code] ?? 0;

    if (prev !== next) {
      changes[code] = { before: prev, after: next, delta: next - prev };
    }
  }

  return changes;
}


function diffScopeSummaries(before = {}, after = {}) {
  const keys = [
    "canonicalQuestions",
    "publicQuestions",
    "experimentalQuestions",
    "excludedQuestions",
    "knowledgeEligibleQuestions",
    "assessmentEligibleQuestions",
    "totalQuestions"
  ];

  const changes = {};

  for (const key of keys) {
    const prev = before[key] ?? 0;
    const next = after[key] ?? 0;

    if (prev !== next) {
      changes[key] = { before: prev, after: next, delta: next - prev };
    }
  }

  return changes;
}
