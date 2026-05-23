/**
 * PrepOS Analytics Submission Integration
 * --------------------------------------------------------
 * PURPOSE:
 * Bridge exam runtime → analytics pipelines.
 *
 * Used by:
 * - exam.js (student submission)
 * - future: practice.js, teacher dashboards
 *
 * PrepOS Analytics Architecture v1
 */


import { PREPOS_ANALYTICS_ENABLED } from "./analytics-config.js";

import {
  onExamSubmitted,
  emit,
  on
} from "./analytics-events.js";

import {
  buildKnowledgeAnalytics
} from "./knowledge-analytics.js";

import { getClient } from "../core/get-client.js";

import {
  classifySubmissionAnalyticsScope
} from "./analytics-scope.js";

import {
  startAnalyticsTrace,
  recordAnalyticsStep,
  endAnalyticsTrace
} from "./analytics-trace.js";

import {
  initAnalyticsObservability,
  observeSubmissionAnalytics
} from "./analytics-observability.js";



const KNOWLEDGE_CACHE_KEY = "prepos_knowledge_analytics";

let observabilityBootstrapped = false;



function ensureObservability() {
  if (observabilityBootstrapped) {
    return;
  }

  try {
    initAnalyticsObservability();
    observabilityBootstrapped = true;
  } catch (error) {
    console.warn(
      "[PrepOS Observability] Init failed (non-fatal):",
      error
    );
  }
}



function analyticsDisabledResult(examId = null, attemptId = null) {

  return {
    examId,
    attemptId,
    disabled: true,
    assessment: null,
    knowledge: null,
    processedAt: new Date().toISOString()
  };

}



/* =========================================================
   QUESTION CATALOG PREP
========================================================= */

/**
 * Merge normalized exam questions with schema source
 * for accurate scope classification.
 */
export function prepareExamQuestionsForAnalytics(
  rawQuestions = [],
  sourceQuestions = []
) {

  return rawQuestions.map((raw, index) => {

    const source =
      sourceQuestions[index] ??
      sourceQuestions.find(s => {

        const sourceId =
          s.question_id ??
          s.id;

        return (
          sourceId &&
          sourceId === raw.question_id
        );

      }) ??
      {};

    const questionId =
      raw.question_id ??
      source.question_id ??
      source.id ??
      null;

    const topics =
      source.topics ??
      raw.topics ??
      [];

    const bankStatus =
      source.bank_status ??
      raw.bank_status ??
      (questionId ? "saved" : "draft");

    return {

      ...source,

      question_id: questionId,

      id:
        source.id ??
        questionId,

      question_text:
        raw.text ??
        source.text ??
        source.question_text ??
        "",

      text:
        raw.text ??
        source.text ??
        "",

      topics,

      topic_count: topics.length,

      bank_status: bankStatus,

      is_bank_question:
        source.is_bank_question === true ||
        bankStatus === "saved" ||
        bankStatus === "banked" ||
        bankStatus === "canonical" ||
        Boolean(questionId),

      is_published: true,

      published: true,

      exam_id:
        source.exam_id ??
        source.examId ??
        null,

      question_set_id:
        source.question_set_id ??
        source.questionSetId ??
        null

    };

  });

}



/* =========================================================
   ATTEMPT NORMALIZATION
========================================================= */

/**
 * Build attempt record for analytics engines.
 */
export function buildAttemptRecord({
  examId = null,
  attemptId = null,
  studentName = "",
  studentId = null,
  answers = [],
  score = 0,
  timeTaken = 0,
  submittedAt = null,
  submissionMode = "canonical"
} = {}) {

  const submissionScope =
    classifySubmissionAnalyticsScope({ submissionMode });

  return {

    id: attemptId,

    exam_id: examId,

    examId,

    student_name: studentName,

    student_id: studentId,

    answers,

    score,

    time_taken: timeTaken,

    timeTaken,

    submitted_at:
      submittedAt ??
      new Date().toISOString(),

    submissionMode,

    submissionScope

  };

}



/* =========================================================
   SUBMISSION PIPELINE
========================================================= */

/**
 * Run full analytics after a successful exam submission.
 * Non-blocking safe: errors are logged, never thrown to UI.
 */
export async function runExamSubmissionAnalytics({

  examId = null,

  examTitle = "",

  attempt = {},

  rawQuestions = [],

  sourceQuestions = [],

  priorAttempts = [],

  submissionMode = "canonical"

} = {}) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return analyticsDisabledResult(
      examId,
      attempt?.id ?? null
    );
  }

  ensureObservability();

  let trace = null;

  try {
    trace = startAnalyticsTrace("exam_submission_analytics");
    recordAnalyticsStep(trace, {
      step: "submission_pipeline_started",
      payloadSummary: { examId, submissionMode }
    });
  } catch {
    /* observability must not block analytics */
  }

  const submissionScope =
    attempt.submissionScope ??
    classifySubmissionAnalyticsScope({ submissionMode });

  const questions =
    prepareExamQuestionsForAnalytics(
      rawQuestions,
      sourceQuestions
    );

  const exam = {

    id: examId,

    title: examTitle,

    is_published: true

  };

  const allAttempts = [
    ...priorAttempts,
    attempt
  ];

  const assessmentResult =
    await onExamSubmitted({

      exam,

      attempt,

      allAttempts,

      questions,

      includeKnowledge: submissionScope.knowledgeEligible

    });

  let knowledgeResult = null;

  if (submissionScope.knowledgeEligible) {

    knowledgeResult =
      assessmentResult.knowledgeAnalytics ??
      buildKnowledgeAnalytics({

        exam,

        attempt,

        allAttempts,

        questions

      });

    await emit(
      "knowledge_analytics_snapshot",
      knowledgeResult
    );

    cacheKnowledgeAnalytics(
      examId,
      knowledgeResult
    );

  }

  const combined = {

    examId,

    attemptId: attempt.id ?? null,

    submissionMode:
      attempt.submissionMode ?? submissionMode,

    submissionScope,

    assessment: assessmentResult,

    knowledge: knowledgeResult,

    processedAt:
      new Date().toISOString()

  };

  try {
    recordAnalyticsStep(trace, {
      step: "submission_pipeline_complete",
      payloadSummary: {
        knowledgeEligible: submissionScope.knowledgeEligible,
        knowledgeRan: Boolean(knowledgeResult)
      }
    });
    endAnalyticsTrace(trace);
    observeSubmissionAnalytics(combined);
  } catch {
    /* observability must not block analytics */
  }

  if (typeof window !== "undefined") {
    window.__preposLastAnalytics = combined;
  }

  return combined;

}



/**
 * Fire-and-forget wrapper for exam.js.
 */
export function triggerExamSubmissionAnalytics(options = {}) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return;
  }

  ensureObservability();

  runExamSubmissionAnalytics(options)
    .then(result => {

      console.log(
        "[PrepOS Analytics] Submission analytics complete",
        {
          examId: result?.examId,
          knowledgeTopics:
            result?.knowledge?.topicMastery?.length ?? 0
        }
      );

    })
    .catch(error => {

      console.warn(
        "[PrepOS Analytics] Submission analytics failed (non-fatal):",
        error
      );

    });

}



/* =========================================================
   OPTIONAL: FETCH PRIOR ATTEMPTS
========================================================= */

/**
 * Fetch prior attempts for richer aggregates (best-effort).
 */
export async function fetchPriorExamAttempts({
  examId,
  limit = 100,
  sb: client = null,
  submissionMode = "canonical"
} = {}) {

  if (!examId) {
    return [];
  }

  const sb = client ?? await getClient();

  const table =
    submissionMode === "public"
      ? "public_exam_attempts"
      : "exam_attempts";

  const select =
    submissionMode === "public"
      ? "id, exam_id, guest_name, device_id, answers, score, time_taken, submitted_at, attempt_id"
      : "id, exam_id, student_name, student_id, answers, score, time_taken, submitted_at, attempt_id";

  const { data, error } = await sb
    .from(table)
    .select(select)
    .eq("exam_id", examId)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[PrepOS Analytics] Prior attempts fetch failed:", error);
    return [];
  }

  return (data ?? []).map(row => {

    if (submissionMode === "public") {
      return {
        ...row,
        student_name: row.guest_name ?? null,
        student_id: null,
        submissionMode: "public"
      };
    }

    return {
      ...row,
      submissionMode: "canonical"
    };

  });

}



/**
 * Submission analytics with optional historical attempts.
 */
export async function runExamSubmissionAnalyticsWithHistory({

  examId,

  examTitle,

  attempt,

  rawQuestions,

  sourceQuestions,

  sb: client = null,

  submissionMode = "canonical"

} = {}) {

  let priorAttempts = [];

  try {

    priorAttempts =
      await fetchPriorExamAttempts({
        examId,
        sb: client,
        submissionMode:
          attempt?.submissionMode ??
          submissionMode
      });

    priorAttempts =
      priorAttempts.filter(a => {
        return a.id !== attempt.id;
      });

  } catch {
    priorAttempts = [];
  }

  return runExamSubmissionAnalytics({

    examId,

    examTitle,

    attempt,

    rawQuestions,

    sourceQuestions,

    priorAttempts,

    submissionMode:
      attempt?.submissionMode ??
      submissionMode

  });

}



/* =========================================================
   LOCAL CACHE (STUDENT / DASHBOARD FOUNDATION)
========================================================= */

export function cacheKnowledgeAnalytics(
  examId,
  knowledgeResult = {}
) {

  if (typeof localStorage === "undefined" || !examId) {
    return;
  }

  try {

    const cache = JSON.parse(
      localStorage.getItem(KNOWLEDGE_CACHE_KEY) || "{}"
    );

    cache[examId] = {
      weakTopics: knowledgeResult.weakTopics ?? [],
      topicMastery: knowledgeResult.topicMastery ?? [],
      adaptiveSignals: knowledgeResult.adaptiveSignals ?? {},
      processedAt: knowledgeResult.processedAt
    };

    localStorage.setItem(
      KNOWLEDGE_CACHE_KEY,
      JSON.stringify(cache)
    );

  } catch {
    /* ignore quota / parse errors */
  }

}



export function readCachedKnowledgeAnalytics(examId) {

  if (typeof localStorage === "undefined" || !examId) {
    return null;
  }

  try {

    const cache = JSON.parse(
      localStorage.getItem(KNOWLEDGE_CACHE_KEY) || "{}"
    );

    return cache[examId] ?? null;

  } catch {
    return null;
  }

}



/* =========================================================
   LISTENER REGISTRATION (DEV / DASHBOARD HOOKS)
========================================================= */

/**
 * Register default analytics listeners.
 * Call once at app init if dashboards need hooks.
 */
export function registerDefaultAnalyticsListeners({
  onAssessment = null,
  onKnowledge = null,
  onKnowledgeSnapshot = null
} = {}) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return;
  }

  ensureObservability();

  if (onAssessment) {
    on("assessment_analytics_updated", onAssessment);
  }

  if (onKnowledge) {
    on("knowledge_analytics_updated", onKnowledge);
  }

  if (onKnowledgeSnapshot) {
    on(
      "knowledge_analytics_snapshot",
      onKnowledgeSnapshot
    );
  }

}
