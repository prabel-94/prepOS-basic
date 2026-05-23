/**
 * PrepOS Scope Classification Viewer
 * -------------------------------------------------------
 * Passive diagnostics for analytics scope classification.
 *
 * PrepOS Analytics Observability — Phase 2
 */


import {
  recordScopeClassification,
  recordScopeExclusion,
  updateScopeSummary,
  getAnalyticsRuntimeStore,
  recordAnalyticsWarning
} from "./analytics-runtime-store.js";

import { getVersionMetadata } from "./analytics-version.js";


export const CLASSIFICATION_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});


export const CLASSIFICATION_SOURCES = Object.freeze({
  QUESTION_BANK: "question_bank",
  QUESTION_TOPICS: "question_topics",
  SUBMISSION_MODE: "submission_mode",
  PUBLIC_ATTEMPT: "public_attempt",
  EXPERIMENTAL_SET: "experimental_set",
  DRAFT_METADATA: "draft_metadata",
  EXAM_ASSIGNMENT: "exam_assignment",
  FALLBACK_INFERENCE: "fallback_inference"
});


export const SCOPE_EXCLUSION_REASONS = Object.freeze({
  PUBLIC_SUBMISSION: "PUBLIC_SUBMISSION",
  NO_QUESTION_ID: "NO_QUESTION_ID",
  NO_TOPICS: "NO_TOPICS",
  EXPERIMENTAL_QUESTION: "EXPERIMENTAL_QUESTION",
  TEACHER_PREVIEW: "TEACHER_PREVIEW",
  DRAFT_ONLY: "DRAFT_ONLY",
  INSUFFICIENT_METADATA: "INSUFFICIENT_METADATA",
  UNKNOWN_SCOPE: "UNKNOWN_SCOPE",
  ARCHIVED_QUESTION: "ARCHIVED_QUESTION",
  NOT_PUBLISHED: "NOT_PUBLISHED",
  EPHEMERAL_QUESTION: "EPHEMERAL_QUESTION"
});


let classificationCounter = 0;


function nextClassificationId() {
  classificationCounter += 1;
  return `scope_${Date.now()}_${classificationCounter}`;
}


function getTopicCount(question = {}) {
  if (Array.isArray(question.topics)) {
    return question.topics.length;
  }

  return Number(question.topic_count) || 0;
}


function hasQuestionId(question = {}) {
  return Boolean(question.question_id ?? question.id);
}


function isTeacherPreview(question = {}, context = {}) {
  return (
    context.submissionMode === "preview" ||
    context.submissionMode === "teacher_preview" ||
    question.teacher_preview === true ||
    question.is_preview === true ||
    question.is_teacher_preview === true
  );
}


function isBankQuestionLite(question = {}) {
  return Boolean(
    question.is_bank_question === true ||
    question.bank_status === "saved" ||
    question.bank_status === "banked" ||
    question.bank_status === "canonical"
  );
}


function isPublishedLite(question = {}) {
  return Boolean(
    question.is_published === true ||
    question.published === true ||
    question.exam_id ||
    question.examId
  );
}


function isQuestionSetLite(question = {}) {
  return Boolean(
    question.question_set_id ||
    question.questionSetId ||
    question.parent_type === "question_set"
  );
}


/**
 * Derive classification confidence (passive diagnostics).
 */
export function deriveClassificationConfidence({
  canonical = false,
  public: isPublic = false,
  experimental = false,
  questionId = null,
  hasTopics = false,
  submissionMode = "canonical",
  metadata = {},
  scope = {}
} = {}) {
  const hasId = Boolean(questionId);
  const published = metadata.published ?? isPublishedLite(metadata.question ?? {});

  if (
    !hasId ||
    isPublic ||
    submissionMode === "public" ||
    experimental ||
    isDraftOnly(metadata.question ?? {})
  ) {
    return {
      classificationConfidence: CLASSIFICATION_CONFIDENCE.LOW,
      classificationConfidenceReason:
        "Experimental/public question with incomplete canonical metadata"
    };
  }

  if (
    canonical &&
    hasTopics &&
    !isPublic &&
    !experimental &&
    scope.knowledgeEligible !== false
  ) {
    return {
      classificationConfidence: CLASSIFICATION_CONFIDENCE.HIGH,
      classificationConfidenceReason:
        "Stable canonical published question with topic linkage"
    };
  }

  if (hasId && (hasTopics || scope.assessmentEligible)) {
    return {
      classificationConfidence: CLASSIFICATION_CONFIDENCE.MEDIUM,
      classificationConfidenceReason:
        "Classification inferred from partial metadata"
    };
  }

  return {
    classificationConfidence: CLASSIFICATION_CONFIDENCE.LOW,
    classificationConfidenceReason:
      "Limited metadata available for scope classification"
  };
}


/**
 * Derive ordered classification source hierarchy.
 */
export function deriveClassificationSources(
  question = {},
  context = {},
  scope = {}
) {
  const sources = [];
  const submissionMode = context.submissionMode ?? "canonical";

  if (submissionMode === "public" || scope.public === true) {
    sources.push(CLASSIFICATION_SOURCES.SUBMISSION_MODE);
    sources.push(CLASSIFICATION_SOURCES.PUBLIC_ATTEMPT);
    return sources;
  }

  sources.push(CLASSIFICATION_SOURCES.SUBMISSION_MODE);

  if (isBankQuestionLite(question)) {
    sources.push(CLASSIFICATION_SOURCES.QUESTION_BANK);
  }

  if (getTopicCount(question) > 0) {
    sources.push(CLASSIFICATION_SOURCES.QUESTION_TOPICS);
  }

  if (question.exam_id || question.examId || context.examId) {
    sources.push(CLASSIFICATION_SOURCES.EXAM_ASSIGNMENT);
  }

  if (isDraftOnly(question)) {
    sources.push(CLASSIFICATION_SOURCES.DRAFT_METADATA);
  }

  if (scope.experimental === true || isQuestionSetLite(question)) {
    sources.push(CLASSIFICATION_SOURCES.EXPERIMENTAL_SET);
    sources.push(CLASSIFICATION_SOURCES.FALLBACK_INFERENCE);
    return sources;
  }

  if (!sources.includes(CLASSIFICATION_SOURCES.QUESTION_BANK)) {
    sources.push(CLASSIFICATION_SOURCES.FALLBACK_INFERENCE);
  }

  return sources;
}


function isDraftOnly(question = {}) {
  const bankStatus = question.bank_status ?? question.bankStatus ?? "";

  if (
    bankStatus === "draft" ||
    question.is_published === false ||
    question.published === false
  ) {
    return !question.exam_id && !question.examId;
  }

  return false;
}


/**
 * Derive explicit knowledge exclusion reason (never silent).
 */
export function deriveKnowledgeExclusionReason(
  question = {},
  scope = {},
  context = {}
) {
  if (context.submissionMode === "public" || scope.public === true) {
    return SCOPE_EXCLUSION_REASONS.PUBLIC_SUBMISSION;
  }

  if (isTeacherPreview(question, context)) {
    return SCOPE_EXCLUSION_REASONS.TEACHER_PREVIEW;
  }

  if (scope.archived === true) {
    return SCOPE_EXCLUSION_REASONS.ARCHIVED_QUESTION;
  }

  if (!hasQuestionId(question)) {
    return SCOPE_EXCLUSION_REASONS.NO_QUESTION_ID;
  }

  if (getTopicCount(question) === 0) {
    return SCOPE_EXCLUSION_REASONS.NO_TOPICS;
  }

  if (scope.experimental === true) {
    return SCOPE_EXCLUSION_REASONS.EXPERIMENTAL_QUESTION;
  }

  if (isDraftOnly(question)) {
    return SCOPE_EXCLUSION_REASONS.DRAFT_ONLY;
  }

  if (scope.ephemeral === true) {
    return SCOPE_EXCLUSION_REASONS.EPHEMERAL_QUESTION;
  }

  if (!scope.assessmentEligible && !scope.knowledgeEligible) {
    return SCOPE_EXCLUSION_REASONS.NOT_PUBLISHED;
  }

  if (!scope.knowledgeEligible) {
    return SCOPE_EXCLUSION_REASONS.INSUFFICIENT_METADATA;
  }

  return SCOPE_EXCLUSION_REASONS.UNKNOWN_SCOPE;
}


function buildScopeRecord({
  question = {},
  scope = {},
  context = {},
  source = "classifyAnalyticsScope"
} = {}) {
  const submissionMode =
    context.submissionMode ?? "canonical";

  const topicCount = getTopicCount(question);
  const knowledgeEligible = scope.knowledgeEligible === true;
  const excluded = !knowledgeEligible;

  const exclusionReason = excluded
    ? deriveKnowledgeExclusionReason(question, scope, context)
    : null;

  const questionId =
    question.question_id ??
    question.id ??
    context.questionId ??
    null;

  const isPublic =
    scope.public === true ||
    scope.scope === "public" ||
    submissionMode === "public";

  const confidence = deriveClassificationConfidence({
    canonical: scope.canonical === true,
    public: isPublic,
    experimental: scope.experimental === true,
    questionId,
    hasTopics: topicCount > 0,
    submissionMode,
    metadata: {
      question,
      published: isPublishedLite(question)
    },
    scope
  });

  const classificationSources = deriveClassificationSources(
    question,
    context,
    scope
  );

  const versions = getVersionMetadata();

  return {
    id: nextClassificationId(),
    timestamp: new Date().toISOString(),
    questionId,
    submissionMode,
    scope: scope.scope ?? null,
    canonical: scope.canonical === true,
    experimental: scope.experimental === true,
    public: isPublic,
    assessmentEligible: scope.assessmentEligible === true,
    knowledgeEligible,
    excluded,
    exclusionReason,
    topicCount,
    hasTopics: topicCount > 0,
    classificationConfidence: confidence.classificationConfidence,
    classificationConfidenceReason: confidence.classificationConfidenceReason,
    classificationSources,
    classificationMetadata: {
      source,
      scope: scope.scope ?? null,
      adaptiveEligible: scope.adaptiveEligible === true
    },
    ...versions,
    metadata: {
      source,
      examId: context.examId ?? question.exam_id ?? question.examId ?? null,
      attemptId: context.attemptId ?? null
    }
  };
}


function checkScopeContamination(record = {}) {
  if (record.public === true && record.knowledgeEligible === true) {
    recordAnalyticsWarning({
      code: "PUBLIC_KNOWLEDGE_CONTAMINATION",
      severity: "critical",
      message:
        "Public scope with knowledge eligibility — critical contamination.",
      metadata: {
        questionId: record.questionId,
        submissionMode: record.submissionMode
      }
    });
  }

  if (record.experimental === true && record.knowledgeEligible === true) {
    recordAnalyticsWarning({
      code: "EXPERIMENTAL_KNOWLEDGE_CONTAMINATION",
      severity: "critical",
      message:
        "Experimental question marked knowledge-eligible — contamination risk.",
      metadata: {
        questionId: record.questionId,
        scope: record.scope
      }
    });
  }

  if (
    record.classificationConfidence === CLASSIFICATION_CONFIDENCE.LOW &&
    record.knowledgeEligible === true
  ) {
    recordAnalyticsWarning({
      code: "LOW_CONFIDENCE_KNOWLEDGE_CLASSIFICATION",
      severity: "high",
      message:
        "Knowledge-eligible classification with low confidence — review scope metadata.",
      metadata: {
        questionId: record.questionId,
        reason: record.classificationConfidenceReason,
        sources: record.classificationSources
      }
    });
  }
}


function rebuildScopeSummaryFromStore() {
  const classifications =
    getAnalyticsRuntimeStore().scopeViewer?.classifications ?? [];

  const summary = {
    totalQuestions: classifications.length,
    canonicalQuestions: 0,
    publicQuestions: 0,
    experimentalQuestions: 0,
    excludedQuestions: 0,
    knowledgeEligibleQuestions: 0,
    assessmentEligibleQuestions: 0,
    exclusionsByReason: {}
  };

  for (const record of classifications) {
    if (record.canonical) {
      summary.canonicalQuestions += 1;
    }

    if (record.public) {
      summary.publicQuestions += 1;
    }

    if (record.experimental) {
      summary.experimentalQuestions += 1;
    }

    if (record.excluded) {
      summary.excludedQuestions += 1;
    }

    if (record.knowledgeEligible) {
      summary.knowledgeEligibleQuestions += 1;
    }

    if (record.assessmentEligible) {
      summary.assessmentEligibleQuestions += 1;
    }

    if (record.exclusionReason) {
      summary.exclusionsByReason[record.exclusionReason] =
        (summary.exclusionsByReason[record.exclusionReason] ?? 0) + 1;
    }
  }

  updateScopeSummary(summary);
}


/**
 * Observe question-level scope classification (passive).
 */
export function observeQuestionScopeClassification(
  question = {},
  scope = {},
  context = {}
) {
  try {
    const record = buildScopeRecord({
      question,
      scope,
      context,
      source: context.source ?? "classifyAnalyticsScope"
    });

    recordScopeClassification(record);
    checkScopeContamination(record);

    if (record.excluded && record.exclusionReason) {
      recordScopeExclusion({
        id: record.id,
        timestamp: record.timestamp,
        questionId: record.questionId,
        exclusionReason: record.exclusionReason,
        submissionMode: record.submissionMode,
        scope: record.scope,
        metadata: record.metadata
      });
    }

    rebuildScopeSummaryFromStore();
  } catch (error) {
    console.warn(
      "[PrepOS Scope Viewer] Question observation failed (non-fatal):",
      error
    );
  }
}


/**
 * Observe submission-level scope classification (passive).
 */
export function observeSubmissionScopeClassification(
  submissionMode = "canonical",
  scope = {},
  context = {}
) {
  try {
    const excluded = scope.knowledgeEligible !== true;
    const exclusionReason = excluded
      ? SCOPE_EXCLUSION_REASONS.PUBLIC_SUBMISSION
      : null;

    const isPublic =
      scope.public === true || submissionMode === "public";

    const confidence = deriveClassificationConfidence({
      canonical: scope.canonical === true,
      public: isPublic,
      experimental: false,
      questionId: "__submission__",
      hasTopics: false,
      submissionMode,
      scope
    });

    const classificationSources =
      submissionMode === "public"
        ? [
            CLASSIFICATION_SOURCES.SUBMISSION_MODE,
            CLASSIFICATION_SOURCES.PUBLIC_ATTEMPT
          ]
        : [CLASSIFICATION_SOURCES.SUBMISSION_MODE];

    const versions = getVersionMetadata();

    const record = {
      id: nextClassificationId(),
      timestamp: new Date().toISOString(),
      questionId: "__submission__",
      submissionMode,
      scope: scope.scope ?? null,
      canonical: scope.canonical === true,
      experimental: scope.experimental === true,
      public: isPublic,
      assessmentEligible: scope.assessmentEligible === true,
      knowledgeEligible: scope.knowledgeEligible === true,
      excluded,
      exclusionReason:
        submissionMode === "public"
          ? SCOPE_EXCLUSION_REASONS.PUBLIC_SUBMISSION
          : exclusionReason,
      topicCount: 0,
      hasTopics: false,
      classificationConfidence: confidence.classificationConfidence,
      classificationConfidenceReason: confidence.classificationConfidenceReason,
      classificationSources,
      classificationMetadata: {
        source: "classifySubmissionAnalyticsScope"
      },
      ...versions,
      metadata: {
        source: "classifySubmissionAnalyticsScope",
        examId: context.examId ?? null,
        attemptId: context.attemptId ?? null
      }
    };

    recordScopeClassification(record);
    checkScopeContamination(record);

    if (record.excluded && record.exclusionReason) {
      recordScopeExclusion({
        id: record.id,
        timestamp: record.timestamp,
        questionId: record.questionId,
        exclusionReason: record.exclusionReason,
        submissionMode: record.submissionMode,
        scope: record.scope,
        metadata: record.metadata
      });
    }

    rebuildScopeSummaryFromStore();
  } catch (error) {
    console.warn(
      "[PrepOS Scope Viewer] Submission observation failed (non-fatal):",
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


function formatBool(value) {
  return value === true
    ? '<span class="tag tag-ok">true</span>'
    : '<span class="tag tag-warn">false</span>';
}


function getRowClass(record = {}) {
  if (
    (record.public === true && record.knowledgeEligible === true) ||
    (record.experimental === true && record.knowledgeEligible === true)
  ) {
    return "scope-row-critical";
  }

  if (record.questionId === "__submission__") {
    return "";
  }

  if (!record.questionId || record.hasTopics === false) {
    return "scope-row-warn";
  }

  return "";
}


export function renderScopeSummary(containerId = "scope-summary-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const summary =
    getAnalyticsRuntimeStore().scopeViewer?.summaries ?? {};

  const rows = [
    ["canonical (trusted learning)", summary.canonicalQuestions ?? 0],
    ["public (public-only)", summary.publicQuestions ?? 0],
    ["experimental", summary.experimentalQuestions ?? 0],
    ["excluded from knowledge", summary.excludedQuestions ?? 0],
    ["assessment eligible", summary.assessmentEligibleQuestions ?? 0],
    ["knowledge eligible", summary.knowledgeEligibleQuestions ?? 0],
    ["total classified", summary.totalQuestions ?? 0]
  ];

  const body = rows
    .map(
      ([label, value]) => `
      <tr>
        <th>${escapeHtml(label)}</th>
        <td>${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  el.innerHTML = `
    <table class="debug-table">
      <tbody>${body}</tbody>
    </table>`;
}


export function renderScopeViewer(containerId = "scope-classifications-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const classifications =
    getAnalyticsRuntimeStore().scopeViewer?.classifications?.slice().reverse() ??
    [];

  if (!classifications.length) {
    el.innerHTML = '<p class="muted">No scope classifications recorded yet.</p>';
    return;
  }

  const head = [
    "questionId",
    "scope",
    "canonical",
    "assessmentEligible",
    "knowledgeEligible",
    "excluded",
    "exclusionReason",
    "topics",
    "submissionMode"
  ]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = classifications
    .map(record => {
      const rowClass = getRowClass(record);

      return `
      <tr class="${rowClass}">
        <td>${escapeHtml(record.questionId ?? "—")}</td>
        <td>${escapeHtml(record.scope)}</td>
        <td>${formatBool(record.canonical)}</td>
        <td>${formatBool(record.assessmentEligible)}</td>
        <td>${formatBool(record.knowledgeEligible)}</td>
        <td>${formatBool(record.excluded)}</td>
        <td>${escapeHtml(record.exclusionReason ?? "—")}</td>
        <td>${escapeHtml(record.topicCount ?? 0)}</td>
        <td>${escapeHtml(record.submissionMode)}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderScopeExclusions(containerId = "scope-exclusions-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const summary =
    getAnalyticsRuntimeStore().scopeViewer?.summaries ?? {};
  const byReason = summary.exclusionsByReason ?? {};

  const entries = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    el.innerHTML = '<p class="muted">No exclusions recorded.</p>';
    return;
  }

  el.innerHTML = `
    <ul class="scope-exclusion-list">
      ${entries
        .map(
          ([reason, count]) =>
            `<li><code>${escapeHtml(reason)}</code> (${escapeHtml(count)})</li>`
        )
        .join("")}
    </ul>`;
}


export function renderClassificationConfidence(
  containerId = "classification-confidence-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const classifications =
    getAnalyticsRuntimeStore().scopeViewer?.classifications?.slice().reverse() ??
    [];

  if (!classifications.length) {
    el.innerHTML = '<p class="muted">No classification confidence data.</p>';
    return;
  }

  const head = [
    "questionId",
    "confidence",
    "reason",
    "knowledgeEligible",
    "scope"
  ]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = classifications
    .map(record => {
      const rowClass =
        record.classificationConfidence === CLASSIFICATION_CONFIDENCE.LOW &&
        record.knowledgeEligible
          ? "scope-row-warn"
          : "";

      return `
      <tr class="${rowClass}">
        <td>${escapeHtml(record.questionId ?? "—")}</td>
        <td>${escapeHtml(record.classificationConfidence ?? "—")}</td>
        <td>${escapeHtml(record.classificationConfidenceReason ?? "—")}</td>
        <td>${formatBool(record.knowledgeEligible)}</td>
        <td>${escapeHtml(record.scope ?? "—")}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderClassificationSources(
  containerId = "classification-sources-panel"
) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const classifications =
    getAnalyticsRuntimeStore().scopeViewer?.classifications?.slice().reverse() ??
    [];

  if (!classifications.length) {
    el.innerHTML = '<p class="muted">No classification sources recorded.</p>';
    return;
  }

  const head = ["questionId", "sources", "scope", "submissionMode"]
    .map(h => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = classifications
    .map(record => `
      <tr>
        <td>${escapeHtml(record.questionId ?? "—")}</td>
        <td>${escapeHtml((record.classificationSources ?? []).join(" → "))}</td>
        <td>${escapeHtml(record.scope ?? "—")}</td>
        <td>${escapeHtml(record.submissionMode ?? "—")}</td>
      </tr>`)
    .join("");

  el.innerHTML = `
    <table class="debug-table debug-table-wide">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}


export function renderAllScopePanels() {
  renderScopeSummary();
  renderScopeViewer();
  renderScopeExclusions();
  renderClassificationConfidence();
  renderClassificationSources();
}


export function registerScopeViewerDebugGlobals() {
  if (typeof window === "undefined") {
    return;
  }

  window.debugScopeViewer = function debugScopeViewer() {
    const store = getAnalyticsRuntimeStore();
    const scopeViewer = store.scopeViewer ?? {};

    const contamination = (store.warnings ?? []).filter(w => {
      return (
        w.code === "PUBLIC_KNOWLEDGE_CONTAMINATION" ||
        w.code === "EXPERIMENTAL_KNOWLEDGE_CONTAMINATION"
      );
    });

    console.group("[PrepOS Scope Viewer]");

    console.log("Summary:", scopeViewer.summaries);
    console.log("Latest exclusions:", scopeViewer.exclusions?.slice(-20));
    console.log("Contamination warnings:", contamination);
    console.log(
      "Recent classifications:",
      scopeViewer.classifications?.slice(-20)
    );

    console.groupEnd();

    return {
      summary: scopeViewer.summaries,
      exclusions: scopeViewer.exclusions,
      classifications: scopeViewer.classifications,
      contaminationWarnings: contamination
    };
  };
}
