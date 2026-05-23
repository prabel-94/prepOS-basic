/**
 * PrepOS Replay Correctness Validator
 * -------------------------------------------------------
 * Deterministic hash validation for analytics snapshots.
 */


/**
 * Lightweight deterministic string hash (djb2).
 */
function hashString(input = "") {
  let hash = 5381;

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }

  return `h${(hash >>> 0).toString(16)}`;
}


/**
 * Extract hashable snapshot payload (no timestamps, IDs, traces).
 */
export function extractHashableSnapshotPayload(snapshot = {}) {
  return {
    assessmentSummary: snapshot.assessmentSummary ?? {},
    knowledgeSummary: snapshot.knowledgeSummary ?? {},
    scopeSummary: snapshot.scopeSummary ?? {},
    masterySummary: snapshot.masterySummary ?? {},
    warningCounts: snapshot.warningCounts ?? {},
    analyticsVersion: snapshot.analyticsVersion ?? null,
    masteryVersion: snapshot.masteryVersion ?? null,
    classificationVersion: snapshot.classificationVersion ?? null,
    difficultyVersion: snapshot.difficultyVersion ?? null
  };
}


/**
 * Create deterministic analytics hash from snapshot summaries.
 */
export function createAnalyticsHash(snapshot = {}) {
  const payload = extractHashableSnapshotPayload(snapshot);

  return hashString(JSON.stringify(payload));
}


/**
 * Build replay-equivalent snapshot from replay reconstruction.
 */
export function buildReplaySnapshotFromReplay(replay = {}) {
  const snapshot = replay.snapshot ?? {};

  return {
    ...extractHashableSnapshotPayload(snapshot),
    analyticsVersion: snapshot.analyticsVersion,
    masteryVersion: snapshot.masteryVersion,
    classificationVersion: snapshot.classificationVersion,
    difficultyVersion: snapshot.difficultyVersion
  };
}


function diffHashablePayload(before = {}, after = {}) {
  const differences = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const prev = JSON.stringify(before[key] ?? null);
    const next = JSON.stringify(after[key] ?? null);

    if (prev !== next) {
      differences.push({
        field: key,
        before: before[key],
        after: after[key]
      });
    }
  }

  return differences;
}


/**
 * Validate replay determinism between original and replay-derived snapshot.
 */
export function validateReplayDeterminism({
  originalSnapshot = {},
  replaySnapshot = null
} = {}) {
  const versionFields = [
    "analyticsVersion",
    "masteryVersion",
    "classificationVersion",
    "difficultyVersion"
  ];

  for (const field of versionFields) {
    if (
      replaySnapshot &&
      (originalSnapshot[field] ?? null) !== (replaySnapshot[field] ?? null)
    ) {
      return {
        deterministic: false,
        reason: "VERSION_MISMATCH",
        originalHash: createAnalyticsHash(originalSnapshot),
        replayHash: createAnalyticsHash(replaySnapshot),
        differences: [
          {
            field,
            before: originalSnapshot[field],
            after: replaySnapshot[field]
          }
        ]
      };
    }
  }

  const originalPayload = extractHashableSnapshotPayload(originalSnapshot);
  const replayPayload =
    replaySnapshot ?? extractHashableSnapshotPayload(originalSnapshot);

  const originalHash = createAnalyticsHash(originalSnapshot);
  const replayHash = hashString(JSON.stringify(replayPayload));
  const differences = diffHashablePayload(originalPayload, replayPayload);

  return {
    deterministic: originalHash === replayHash && differences.length === 0,
    reason:
      originalHash === replayHash ? null : "HASH_MISMATCH",
    originalHash,
    replayHash,
    differences
  };
}
