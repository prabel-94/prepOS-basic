/**
 * PrepOS Analytics Events
 * -------------------------------------------------------
 * PURPOSE:
 * Scope-aware event-driven analytics orchestration.
 *
 * PIPELINE:
 * attempt → scope classification → assessment analytics → knowledge analytics
 *
 * PrepOS Analytics Architecture v1
 */


import {
  buildAssessmentQuestionStats,
  buildExamStats,
  buildQuestionSetStats,
  detectMissingQuestionIds,
  buildQuestionLookup
} from "./attempt-analytics.js";

import {
  classifyAnalyticsScope
} from "./analytics-scope.js";

import {
  buildAssessmentQuestionDifficulty,
  calculateExamDifficulty
} from "./difficulty-engine.js";

import { PREPOS_ANALYTICS_ENABLED } from "./analytics-config.js";

import {
  buildKnowledgeAnalytics
} from "./knowledge-analytics.js";

import {
  startAnalyticsTrace,
  recordAnalyticsStep,
  endAnalyticsTrace
} from "./analytics-trace.js";



/* =========================================================
   EVENT REGISTRY
========================================================= */

const listeners = {};



/* =========================================================
   EVENT BUS
========================================================= */

export function on(eventName, callback) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return;
  }

  if (!listeners[eventName]) {
    listeners[eventName] = [];
  }

  listeners[eventName].push(callback);

}



export async function emit(
  eventName,
  payload = {}
) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return;
  }

  const eventListeners =
    listeners[eventName] ?? [];

  for (const callback of eventListeners) {

    try {

      await callback(payload);

    } catch (error) {

      console.error(
        `[Analytics Event Error] ${eventName}`,
        error
      );

    }

  }

}



/* =========================================================
   SCOPE CLASSIFICATION PIPELINE
========================================================= */

/**
 * Classify attempt answers by analytics scope.
 */
export function classifyAttemptScopes(
  attempts = [],
  { questions = [], observationContext = {} } = {}
) {

  const questionLookup =
    buildQuestionLookup(questions);

  const scopes = [];

  for (const attempt of attempts) {

    const answers =
      Array.isArray(attempt.answers)
        ? attempt.answers
        : [];

    const attemptContext = {
      ...observationContext,
      submissionMode:
        attempt.submissionMode ??
        observationContext.submissionMode ??
        "canonical",
      attemptId:
        attempt.id ??
        observationContext.attemptId ??
        null
    };

    for (const answer of answers) {

      const questionId =
        answer.question_id ??
        answer.questionId;

      const question =
        questionLookup.get(String(questionId)) ??
        { question_id: questionId, id: questionId };

      const scope =
        classifyAnalyticsScope(question, attemptContext);

      scopes.push({

        attemptId:
          attempt.id ?? null,

        questionId,

        scope

      });

    }

  }

  return scopes;

}



/* =========================================================
   ASSESSMENT ANALYTICS PIPELINE
========================================================= */

/**
 * Assessment intelligence: all published-eligible questions.
 */
export async function runAssessmentAnalytics({

  exam = {},

  attempt = {},

  allAttempts = [],

  questions = []

} = {}) {

  let trace = null;

  try {
    trace = startAnalyticsTrace("assessment_analytics");
    recordAnalyticsStep(trace, {
      step: "assessment_pipeline_started",
      payloadSummary: {
        examId: exam.id ?? null,
        attemptCount: allAttempts.length,
        questionCount: questions.length
      }
    });
  } catch {
    /* observability must not block analytics */
  }

  const identityHealth =
    detectMissingQuestionIds(allAttempts);

  const questionStats =
    buildAssessmentQuestionStats(
      allAttempts,
      { questions }
    );

  const questionLookup =
    buildQuestionLookup(questions);

  const questionDifficulties =
    questionStats.map(stat => {

      const question =
        questionLookup.get(String(stat.questionId)) ??
        { question_id: stat.questionId };

      return {

        questionId:
          stat.questionId,

        ...buildAssessmentQuestionDifficulty(
          stat,
          question
        )

      };

    });

  const examStats =
    buildExamStats(
      allAttempts,
      { questions }
    );

  const examDifficulty =
    calculateExamDifficulty(
      questionDifficulties
    );

  try {
    recordAnalyticsStep(trace, {
      step: "assessment_analytics_built",
      payloadSummary: {
        questionStatsCount: questionStats.length,
        identityHealthy: identityHealth.healthy
      }
    });
    endAnalyticsTrace(trace);
  } catch {
    /* observability must not block analytics */
  }

  return {

    examId:
      exam.id ?? null,

    attemptId:
      attempt.id ?? null,

    analyticsMode: "assessment",

    identityHealth,

    questionStats,

    questionDifficulties,

    examStats,

    examDifficulty,

    processedAt:
      new Date().toISOString()

  };

}



/* =========================================================
   KNOWLEDGE ANALYTICS PIPELINE
========================================================= */

/**
 * Knowledge intelligence: canonical questions only.
 * Skips experimental / ephemeral entities.
 */
export async function runKnowledgeAnalytics({

  exam = {},

  attempt = {},

  allAttempts = [],

  questions = []

} = {}) {

  let trace = null;

  try {
    trace = startAnalyticsTrace("knowledge_analytics");
    recordAnalyticsStep(trace, {
      step: "knowledge_pipeline_started",
      payloadSummary: {
        examId: exam.id ?? null,
        attemptCount: allAttempts.length
      }
    });
  } catch {
    /* observability must not block analytics */
  }

  const result = buildKnowledgeAnalytics({

    exam,

    attempt,

    allAttempts,

    questions

  });

  try {
    recordAnalyticsStep(trace, {
      step: "knowledge_analytics_built",
      payloadSummary: {
        topicMasteryCount: result.topicMastery?.length ?? 0,
        questionStatsCount: result.questionStats?.length ?? 0
      }
    });
    endAnalyticsTrace(trace);
  } catch {
    /* observability must not block analytics */
  }

  return result;

}



/* =========================================================
   EXAM SUBMISSION EVENT
========================================================= */

/**
 * Main analytics entry point.
 *
 * Routes:
 * - assessment_analytics_updated
 * - knowledge_analytics_updated
 * - analytics_updated (legacy combined)
 */
export async function onExamSubmitted({

  exam = {},

  attempt = {},

  allAttempts = [],

  questions = [],

  includeKnowledge = true

} = {}) {

  if (!PREPOS_ANALYTICS_ENABLED) {
    return {
      examId: exam.id ?? null,
      attemptId: attempt.id ?? null,
      disabled: true,
      knowledgeAnalytics: null
    };
  }

  let trace = null;

  try {
    trace = startAnalyticsTrace("exam_submitted");
    recordAnalyticsStep(trace, {
      step: "submission_received",
      payloadSummary: {
        examId: exam.id ?? null,
        attemptId: attempt.id ?? null,
        includeKnowledge
      }
    });
  } catch {
    /* observability must not block analytics */
  }

  const scopeClassifications = classifyAttemptScopes(
    allAttempts,
    {
      questions,
      observationContext: {
        submissionMode:
          attempt.submissionMode ?? "canonical",
        examId: exam.id ?? null,
        attemptId: attempt.id ?? null,
        source: "onExamSubmitted"
      }
    }
  );

  try {
    recordAnalyticsStep(trace, {
      step: "scope_classified",
      payloadSummary: {
        classifiedAnswers: scopeClassifications.length
      }
    });
  } catch {
    /* observability must not block analytics */
  }

  const assessmentResult =
    await runAssessmentAnalytics({

      exam,

      attempt,

      allAttempts,

      questions

    });

  try {
    recordAnalyticsStep(trace, {
      step: "assessment_analytics_built",
      payloadSummary: {
        questionStatsCount: assessmentResult.questionStats?.length ?? 0
      }
    });
  } catch {
    /* observability must not block analytics */
  }

  await emit(
    "assessment_analytics_updated",
    assessmentResult
  );

  let knowledgeResult = null;

  if (includeKnowledge) {

    try {
      recordAnalyticsStep(trace, {
        step: "knowledge_eligibility_checked",
        payloadSummary: { knowledgeEligible: true }
      });
    } catch {
      /* observability must not block analytics */
    }

    knowledgeResult =
      await runKnowledgeAnalytics({

        exam,

        attempt,

        allAttempts,

        questions

      });

    await emit(
      "knowledge_analytics_updated",
      knowledgeResult
    );

  } else {

    try {
      recordAnalyticsStep(trace, {
        step: "knowledge_analytics_skipped",
        payloadSummary: {
          reason: "knowledge_not_eligible",
          submissionMode: attempt.submissionMode ?? "canonical"
        }
      });
    } catch {
      /* observability must not block analytics */
    }

  }

  const analyticsResult = {

    ...assessmentResult,

    knowledgeAnalytics:
      knowledgeResult,

    submissionMode:
      attempt.submissionMode ?? "canonical"

  };

  await emit(
    "analytics_updated",
    analyticsResult
  );

  try {
    recordAnalyticsStep(trace, {
      step: "events_emitted",
      payloadSummary: {
        assessment: true,
        knowledge: Boolean(knowledgeResult)
      }
    });
    endAnalyticsTrace(trace);
  } catch {
    /* observability must not block analytics */
  }

  return analyticsResult;

}



/* =========================================================
   QUESTION SET EVENTS
========================================================= */

export async function onQuestionSetUsed({

  questionSet = {},

  attempts = [],

  questions = []

} = {}) {

  const stats =
    buildQuestionSetStats({

      attempts,

      questionSetId:
        questionSet.id,

      questions

    });

  const payload = {

    questionSetId:
      questionSet.id,

    stats,

    analyticsMode: "assessment",

    experimental: true,

    processedAt:
      new Date().toISOString()

  };

  await emit(
    "question_set_analytics_updated",
    payload
  );

  await emit(
    "assessment_analytics_updated",
    {
      questionSetId: questionSet.id,
      stats,
      analyticsMode: "assessment"
    }
  );

  return payload;

}



/* =========================================================
   QUESTION PROMOTION EVENTS
========================================================= */

export async function onQuestionPromoted({

  question = {},

  promotedQuestionId = null

} = {}) {

  const scope =
    classifyAnalyticsScope(question);

  const payload = {

    originalQuestion:
      question,

    promotedQuestionId,

    previousScope:
      scope.scope,

    promotedAt:
      new Date().toISOString()

  };

  await emit(
    "question_promoted",
    payload
  );

  return payload;

}



/* =========================================================
   QUESTION ARCHIVE EVENTS
========================================================= */

export async function onQuestionArchived({

  questionId,

  archivedBy = null

} = {}) {

  const payload = {

    questionId,

    archivedBy,

    archivedAt:
      new Date().toISOString()

  };

  await emit(
    "question_archived",
    payload
  );

  return payload;

}



/* =========================================================
   EXAM PUBLISH EVENTS
========================================================= */

export async function onExamPublished({

  exam = {},

  attempts = [],

  questions = []

} = {}) {

  const identityHealth =
    detectMissingQuestionIds(attempts);

  const scopeReport =
    questions.map(q => ({
      questionId: q.id ?? q.question_id,
      ...classifyAnalyticsScope(q)
    }));

  const payload = {

    examId:
      exam.id ?? null,

    identityHealth,

    scopeReport,

    publishedAt:
      new Date().toISOString()

  };

  if (!identityHealth.healthy) {

    console.warn(

      "[PrepOS Analytics]",

      "Published exam contains questions missing stable question_id.",

      identityHealth

    );

  }

  await emit(
    "exam_published",
    payload
  );

  return payload;

}



/* =========================================================
   ANALYTICS CACHE EVENTS
========================================================= */

export async function updateQuestionAnalyticsCache({

  questionId,

  stats = {},

  mode = "assessment"

} = {}) {

  return {

    questionId,

    mode,

    updated: true,

    stats,

    updatedAt:
      new Date().toISOString()

  };

}



export async function updateTopicAnalyticsCache({

  topicId,

  stats = {}

} = {}) {

  return {

    topicId,

    updated: true,

    stats,

    knowledgeOnly: true,

    updatedAt:
      new Date().toISOString()

  };

}



/* =========================================================
   ANALYTICS PIPELINE HELPERS
========================================================= */

export async function runAnalyticsPipeline({

  exam = {},

  attempt = {},

  allAttempts = [],

  questions = []

} = {}) {

  const result =
    await onExamSubmitted({

      exam,

      attempt,

      allAttempts,

      questions

    });

  for (const questionStat of result.questionStats) {

    await updateQuestionAnalyticsCache({

      questionId:
        questionStat.questionId,

      stats:
        questionStat,

      mode: "assessment"

    });

  }

  const knowledgeStats =
    result.knowledgeAnalytics?.questionStats ?? [];

  for (const questionStat of knowledgeStats) {

    await updateQuestionAnalyticsCache({

      questionId:
        questionStat.questionId,

      stats:
        questionStat,

      mode: "knowledge"

    });

  }

  return result;

}



/* =========================================================
   DEBUG / DEV HELPERS
========================================================= */

export function getAnalyticsListeners() {

  return listeners;

}



export function clearAnalyticsListeners() {

  Object.keys(listeners).forEach(key => {
    delete listeners[key];
  });

}



export function futureAnalyticsPipeline() {

  console.warn(
    "Advanced analytics pipeline not implemented yet."
  );

}



export const PREPOS_ANALYTICS_EVENT_POLICY = {

  assessmentAnalyticsSupportsAllQuestions: true,

  knowledgeAnalyticsRequiresCanonicalIdentity: true,

  canonicalAnalyticsRequiresQuestionId: true,

  questionSetsAreExperimental: true,

  teacherDifficultyProtected: true,

  eventDrivenArchitecturePreferred: true,

  separateAssessmentAndKnowledgeEvents: true,

  topicAnalyticsKnowledgeOnly: true

};
