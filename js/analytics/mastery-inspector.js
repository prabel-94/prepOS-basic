/**
 * PrepOS Mastery Inspector
 * -------------------------------------------------------
 * Passive diagnostics for topic mastery provenance and confidence.
 *
 * PrepOS Analytics Observability
 */


import {
  recordTopicMastery,
  recordMasteryInspectorWarning,
  updateMasterySummary,
  recordAnalyticsWarning,
  getAnalyticsRuntimeStore
} from "./analytics-runtime-store.js";

import { isKnowledgeEligible } from "./analytics-scope.js";

import { SCOPE_EXCLUSION_REASONS } from "./scope-viewer.js";

import { getVersionMetadata } from "./analytics-version.js";

import { recordMasteryTimelineFromTopics } from "./mastery-timeline.js";


export const MASTERY_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});


function isPublicAttempt(attempt = {}) {
  return (
    attempt.submissionMode === "public" ||
    attempt.submissionScope?.public === true ||
    attempt.submissionScope?.scope === "public"
  );
}


function isCanonicalAttempt(attempt = {}) {
  return !isPublicAttempt(attempt);
}


function extractQuestionTopicsLocal(question = {}) {
  if (!Array.isArray(question.topics)) {
    return [];
  }

  return question.topics
    .map(topic => {
      if (typeof topic === "string") {
        return topic.trim();
      }

      return (topic?.name ?? topic?.label ?? "").trim();
    })
    .filter(Boolean);
}


/**
 * Derive mastery confidence from provenance signals.
 */
export function deriveMasteryConfidence({
  canonicalAttempts = 0,
  contributingQuestions = 0,
  excludedAttempts = 0
} = {}) {
  if (canonicalAttempts >= 10 && contributingQuestions >= 5) {
    return {
      confidence: MASTERY_CONFIDENCE.HIGH,
      confidenceReason:
        "Sufficient canonical attempts and contributing questions"
    };
  }

  if (canonicalAttempts >= 5) {
    return {
      confidence: MASTERY_CONFIDENCE.MEDIUM,
      confidenceReason: "Moderate canonical attempt sample"
    };
  }

  if (excludedAttempts > canonicalAttempts) {
    return {
      confidence: MASTERY_CONFIDENCE.LOW,
      confidenceReason:
        "Mostly public or excluded attempts — limited canonical data"
    };
  }

  return {
    confidence: MASTERY_CONFIDENCE.LOW,
    confidenceReason: "Low canonical attempt sample for mastery"
  };
}


function countAttemptsByMode(allAttempts = []) {
  let canonicalAttempts = 0;
  let publicAttempts = 0;

  for (const attempt of allAttempts) {
    if (isPublicAttempt(attempt)) {
      publicAttempts += 1;
    } else if (isCanonicalAttempt(attempt)) {
      canonicalAttempts += 1;
    }
  }

  return { canonicalAttempts, publicAttempts };
}


function deriveTopicExcludedReasons(questions = [], context = {}) {
  const reasons = new Set();

  if (context.submissionMode === "public") {
    reasons.add(SCOPE_EXCLUSION_REASONS.PUBLIC_SUBMISSION);
  }

  for (const question of questions) {
    if (context.submissionMode === "public") {
      continue;
    }

    if (!isKnowledgeEligible(question)) {
      if (!question.question_id && !question.id) {
        reasons.add(SCOPE_EXCLUSION_REASONS.NO_QUESTION_ID);
      }

      if (extractQuestionTopicsLocal(question).length === 0) {
        reasons.add(SCOPE_EXCLUSION_REASONS.NO_TOPICS);
      }

      if (
        question.question_set_id ||
        question.questionSetId
      ) {
        reasons.add(SCOPE_EXCLUSION_REASONS.EXPERIMENTAL_QUESTION);
      }
    }
  }

  return [...reasons];
}


function checkMasteryWarnings(record = {}) {
  if (record.canonicalAttempts < 5) {
    recordMasteryInspectorWarning({
      code: "LOW_CONFIDENCE_MASTERY",
      severity: "warning",
      message: `Low canonical attempt sample for topic "${record.topicName}".`,
      metadata: {
        topicId: record.topicId,
        canonicalAttempts: record.canonicalAttempts
      }
    });
  }

  const suspiciousContamination =
    record.publicAttempts > 0 &&
    record.canonicalAttempts === 0 &&
    (record.mastery ?? 0) > 0;

  const metadataContamination =
    record.metadata?.publicContributed === true;

  if (suspiciousContamination || metadataContamination) {
    recordMasteryInspectorWarning({
      code: "PUBLIC_MASTERY_CONTAMINATION",
      severity: "critical",
      message:
        "Mastery may have been influenced by public attempts — contamination risk.",
      metadata: {
        topicId: record.topicId,
        publicAttempts: record.publicAttempts,
        canonicalAttempts: record.canonicalAttempts
      }
    });

    recordAnalyticsWarning({
      code: "PUBLIC_MASTERY_CONTAMINATION",
      severity: "critical",
      message:
        "Public attempts may have incorrectly contributed to topic mastery.",
      metadata: {
        topicName: record.topicName,
        topicId: record.topicId
      }
    });
  }
}


function rebuildMasterySummary(
  topics = [],
  { weakTopicCount = 0, examId = null } = {}
) {
  const summary = {
    totalTopics: topics.length,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    totalCanonicalAttempts: 0,
    totalPublicAttempts: 0,
    totalExcludedAttempts: 0,
    weakTopicCount,
    examId,
    processedAt: new Date().toISOString()
  };

  for (const topic of topics) {
    if (topic.confidence === MASTERY_CONFIDENCE.HIGH) {
      summary.highConfidence += 1;
    } else if (topic.confidence === MASTERY_CONFIDENCE.MEDIUM) {
      summary.mediumConfidence += 1;
    } else {
      summary.lowConfidence += 1;
    }

    summary.totalCanonicalAttempts += topic.canonicalAttempts ?? 0;
    summary.totalPublicAttempts += topic.publicAttempts ?? 0;
    summary.totalExcludedAttempts += topic.excludedAttempts ?? 0;
  }

  updateMasterySummary(summary);
}


/**
 * Observe topic mastery provenance after knowledge analytics (passive).
 */
export function observeKnowledgeMasteryProvenance({
  exam = {},
  attempt = {},
  allAttempts = [],
  questions = [],
  topicMastery = [],
  weakTopics = [],
  adaptiveSignals = {}
} = {}) {
  try {
    const traces = getAnalyticsRuntimeStore().traces ?? [];
    const latestTrace = traces[traces.length - 1] ?? null;

    const context = {
      submissionMode: attempt.submissionMode ?? "canonical",
      examId: exam.id ?? null,
      attemptId: attempt.id ?? null,
      source: "buildKnowledgeAnalytics",
      traceId: latestTrace?.id ?? null
    };

    const { canonicalAttempts, publicAttempts } =
      countAttemptsByMode(allAttempts);

    const excludedAttempts = Math.max(
      0,
      allAttempts.length - canonicalAttempts
    );

    const excludedReasons = deriveTopicExcludedReasons(questions, context);

    const records = [];

    for (const topic of topicMastery) {
      const contributingQuestions = topic.questionCount ?? 0;
      const contributingAttempts = topic.attempts ?? 0;

      const topicCanonicalAttempts = Math.min(
        contributingAttempts || canonicalAttempts,
        canonicalAttempts
      );

      const confidenceResult = deriveMasteryConfidence({
        canonicalAttempts: topicCanonicalAttempts,
        contributingQuestions,
        excludedAttempts
      });

      const versions = getVersionMetadata();

      const record = {
        topicId: topic.topicId ?? topic.topicName ?? null,
        topicName: topic.topicName ?? "Unknown",
        mastery: topic.masteryScore ?? topic.averageAccuracy ?? 0,
        confidence: confidenceResult.confidence,
        confidenceReason: confidenceResult.confidenceReason,
        canonicalAttempts: topicCanonicalAttempts,
        publicAttempts,
        excludedAttempts,
        contributingQuestions,
        contributingAttempts,
        excludedReasons,
        lastUpdated: new Date().toISOString(),
        ...versions,
        metadata: {
          source: "buildKnowledgeAnalytics",
          examId: exam.id ?? null,
          attemptId: attempt.id ?? null,
          weakTopic: weakTopics.some(
            w => (w.topicName ?? w.name) === topic.topicName
          ),
          adaptiveReady: adaptiveSignals?.readyForAdaptive === true,
          publicContributed: false,
          snapshotId: context.snapshotId ?? null,
          traceId: context.traceId ?? null
        }
      };

      recordTopicMastery(record);
      checkMasteryWarnings(record);
      records.push(record);
    }

    rebuildMasterySummary(records, {
      weakTopicCount: weakTopics.length,
      examId: exam.id ?? null
    });

    if (context.submissionMode !== "public") {
      recordMasteryTimelineFromTopics(records, context);
    }

    import("./analytics-snapshots.js")
      .then(({ triggerKnowledgeSnapshot }) => {
        const snap = triggerKnowledgeSnapshot({
          knowledge: {
            topicMastery,
            weakTopics,
            adaptiveSignals
          },
          metadata: context,
          traceId: context.traceId ?? null
        });

        if (snap?.id) {
          for (const record of records) {
            record.metadata.snapshotId = snap.id;
          }
        }
      })
      .catch(() => {});
  } catch (error) {
    console.warn(
      "[PrepOS Mastery Inspector] Provenance observation failed (non-fatal):",
      error
    );
  }
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function getMasteryRowClass(record = {}) {
  if (
    record.canonicalAttempts < 3 &&
    (record.mastery ?? 0) > 0
  ) {
    return "scope-row-critical";
  }

  if (
    record.confidence === MASTERY_CONFIDENCE.LOW ||
    (record.excludedAttempts > 0 &&
      record.excludedAttempts >= record.canonicalAttempts)
  ) {
    return "scope-row-warn";
  }

  return "";
}


export function renderMasterySummary(containerId = "mastery-summary-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const summary =
    getAnalyticsRuntimeStore().masteryInspector?.summaries ?? {};

  const rows = [
    ["total topics", summary.totalTopics ?? 0],
    ["high confidence", summary.highConfidence ?? 0],
    ["medium confidence", summary.mediumConfidence ?? 0],
    ["low confidence", summary.lowConfidence ?? 0],
    ["canonical attempts (exam)", summary.totalCanonicalAttempts ?? 0],
    ["public attempts (exam)", summary.totalPublicAttempts ?? 0],
    ["excluded attempts (exam)", summary.totalExcludedAttempts ?? 0],
    ["weak topics", summary.weakTopicCount ?? 0]
  ];

  el.innerHTML = `
    <table class="debug-table">
      <tbody>
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <th>${escapeHtml(label)}</th>
            <td>${escapeHtml(value)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}


export function renderMasteryInspector(
  containerId = "mastery-inspector-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const topics =
    getAnalyticsRuntimeStore().masteryInspector?.topics?.slice().reverse() ??
    [];

  if (!topics.length) {
    el.innerHTML =
      '<p class="muted">No topic mastery diagnostics recorded yet.</p>';
    return;
  }

  const head = [
    "Topic",
    "Mastery",
    "Confidence",
    "Canonical Attempts",
    "Public Attempts",
    "Excluded Attempts",
    "Questions",
    "Last Updated"
  ]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = topics
    .map(record => {
      const rowClass = getMasteryRowClass(record);

      return `
      <tr class="${rowClass}">
        <td>${escapeHtml(record.topicName)}</td>
        <td>${escapeHtml(record.mastery)}</td>
        <td>${escapeHtml(record.confidence)}</td>
        <td>${escapeHtml(record.canonicalAttempts)}</td>
        <td>${escapeHtml(record.publicAttempts)}</td>
        <td>${escapeHtml(record.excludedAttempts)}</td>
        <td>${escapeHtml(record.contributingQuestions)}</td>
        <td>${escapeHtml(record.lastUpdated)}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderMasteryWarnings(containerId = "mastery-warnings-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const warnings =
    getAnalyticsRuntimeStore().masteryInspector?.warnings?.slice().reverse() ??
    [];

  if (!warnings.length) {
    el.innerHTML = '<p class="muted">No mastery warnings.</p>';
    return;
  }

  const head = ["code", "severity", "timestamp", "message"]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = warnings
    .map(w => {
      const rowClass =
        w.severity === "critical" ? "scope-row-critical" : "scope-row-warn";

      return `
      <tr class="${rowClass}">
        <td>${escapeHtml(w.code)}</td>
        <td>${escapeHtml(w.severity)}</td>
        <td>${escapeHtml(w.timestamp)}</td>
        <td>${escapeHtml(w.message)}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderAllMasteryPanels() {
  renderMasterySummary();
  renderMasteryInspector();
  renderMasteryWarnings();
}


export function registerMasteryInspectorDebugGlobals() {
  if (typeof window === "undefined") {
    return;
  }

  window.debugMasteryInspector = function debugMasteryInspector() {
    const store = getAnalyticsRuntimeStore();
    const inspector = store.masteryInspector ?? {};

    const lowConfidence = (inspector.topics ?? []).filter(
      t => t.confidence === MASTERY_CONFIDENCE.LOW
    );

    const contamination = [
      ...(inspector.warnings ?? []),
      ...(store.warnings ?? [])
    ].filter(w => w.code === "PUBLIC_MASTERY_CONTAMINATION");

    console.group("[PrepOS Mastery Inspector]");

    console.log("Summary:", inspector.summaries);
    console.log("Low confidence topics:", lowConfidence);
    console.log("Contamination warnings:", contamination);
    console.log("Topic provenance:", inspector.topics?.slice(-20));

    console.groupEnd();

    return {
      summary: inspector.summaries,
      topics: inspector.topics,
      lowConfidenceTopics: lowConfidence,
      contaminationWarnings: contamination,
      warnings: inspector.warnings
    };
  };
}
