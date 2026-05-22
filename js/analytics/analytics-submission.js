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



const KNOWLEDGE_CACHE_KEY = "prepos_knowledge_analytics";



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
  submittedAt = null
} = {}) {

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
      new Date().toISOString()

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

  priorAttempts = []

} = {}) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return analyticsDisabledResult(
      examId,
      attempt?.id ?? null
    );
  }

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

      questions

    });

  const knowledgeResult =
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

  const combined = {

    examId,

    attemptId: attempt.id ?? null,

    assessment: assessmentResult,

    knowledge: knowledgeResult,

    processedAt:
      new Date().toISOString()

  };

  cacheKnowledgeAnalytics(
    examId,
    knowledgeResult
  );

  return combined;

}



/**
 * Fire-and-forget wrapper for exam.js.
 */
export function triggerExamSubmissionAnalytics(options = {}) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return;
  }

  runExamSubmissionAnalytics(options)
    .then(result => {

      if (typeof window !== "undefined") {
        window.__preposLastAnalytics = result;
      }

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
  sb: client = null
} = {}) {

  if (!examId) {
    return [];
  }

  const sb = client ?? await getClient();

  const { data, error } = await sb
    .from("exam_attempts")
    .select(
      "id, exam_id, student_name, student_id, answers, score, time_taken, submitted_at"
    )
    .eq("exam_id", examId)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[PrepOS Analytics] Prior attempts fetch failed:", error);
    return [];
  }

  return data ?? [];

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

  sb: client = null

} = {}) {

  let priorAttempts = [];

  try {

    priorAttempts =
      await fetchPriorExamAttempts({
        examId,
        sb: client
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

    priorAttempts

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
