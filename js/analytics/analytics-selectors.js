/**
 * PrepOS Analytics Selectors
 * --------------------------------------------------------
 * PURPOSE:
 * Build clean, UI-ready analytics models with scope visibility.
 *
 * PrepOS Analytics Architecture v1
 */


import {
  round,
  percentage,
  buildAnalyticsMeta
} from "./analytics-core.js";

import {
  classifyAnalyticsScope
} from "./analytics-scope.js";

import {
  filterKnowledgeEligibleStats
} from "./attempt-analytics.js";

import {
  buildAssessmentQuestionDifficulty,
  buildKnowledgeQuestionDifficulty,
  calculateTopicDifficulty,
  calculateExamDifficulty,
  detectDifficultyDrift,
  interpretDifficulty
} from "./difficulty-engine.js";



/* =========================================================
   SCOPE METADATA HELPERS
========================================================= */

/**
 * Extract scope fields for UI cards.
 */
export function extractScopeMetadata(question = {}) {

  const scope =
    classifyAnalyticsScope(question);

  return {

    scope: scope.scope,

    canonical: scope.canonical,

    experimental: scope.experimental,

    ephemeral: scope.ephemeral,

    assessmentEligible:
      scope.assessmentEligible,

    knowledgeEligible:
      scope.knowledgeEligible,

    adaptiveEligible:
      scope.adaptiveEligible,

    experimentalAnalytics:
      scope.experimental

  };

}



/**
 * Merge scope metadata into a card object.
 */
function withScopeMetadata(card = {}, question = {}) {

  return {

    ...card,

    ...extractScopeMetadata(question)

  };

}



/* =========================================================
   QUESTION SELECTORS
========================================================= */

export function buildQuestionAnalyticsCard({

  question = {},

  questionStats = {},

  metadata = {},

  topics = [],

  mode = "assessment"

} = {}) {

  const difficulty =
    mode === "knowledge"
      ? buildKnowledgeQuestionDifficulty(
          questionStats,
          question
        )
      : buildAssessmentQuestionDifficulty(
          questionStats,
          question
        );

  const drift =
    detectDifficultyDrift({

      teacherDifficulty:
        question.teacherDifficulty ??
        metadata.teacherDifficulty ??
        null,

      analyticsDifficulty:
        difficulty?.analyticsDifficulty ?? null

    });

  const card = {

    id:
      question.id ??
      question.question_id ??
      null,

    questionText:
      question.question_text ??
      question.text ??
      "",

    topics,

    analyticsMode: mode,

    teacherDifficulty:
      question.teacherDifficulty ??
      metadata.teacherDifficulty ??
      null,

    analyticsDifficulty:
      difficulty?.analyticsDifficulty ?? "unknown",

    difficultyScore:
      difficulty?.difficultyScore ?? 0,

    difficultyInterpretation:
      interpretDifficulty(
        difficulty?.analyticsDifficulty ?? "unknown"
      ),

    difficultyDrift:
      drift,

    attempts:
      questionStats.attempts ?? 0,

    accuracy:
      round(questionStats.accuracy ?? 0),

    skipRate:
      round(questionStats.skipRate ?? 0),

    averageTime:
      round(questionStats.averageTime ?? 0),

    correct:
      questionStats.correct ?? 0,

    incorrect:
      questionStats.incorrect ?? 0,

    skipped:
      questionStats.skipped ?? 0,

    analyticsMeta:
      buildAnalyticsMeta({
        attempts:
          questionStats.attempts ?? 0
      })

  };

  return withScopeMetadata(card, question);

}



export function buildQuestionSummary({

  question = {},

  questionStats = {},

  mode = "assessment"

} = {}) {

  const difficulty =
    mode === "knowledge"
      ? buildKnowledgeQuestionDifficulty(
          questionStats,
          question
        )
      : buildAssessmentQuestionDifficulty(
          questionStats,
          question
        );

  const card = {

    id:
      question.id ??
      null,

    text:
      question.question_text ??
      question.text ??
      "",

    analyticsMode: mode,

    attempts:
      questionStats.attempts ?? 0,

    accuracy:
      round(questionStats.accuracy ?? 0),

    analyticsDifficulty:
      difficulty?.analyticsDifficulty ?? "unknown"

  };

  return withScopeMetadata(card, question);

}



/* =========================================================
   TOPIC SELECTORS (KNOWLEDGE ONLY)
========================================================= */

export function buildTopicAnalyticsCard({

  topic = {},

  topicQuestionStats = [],

  studentCount = 0,

  questions = []

} = {}) {

  const knowledgeStats =
    filterKnowledgeEligibleStats(
      topicQuestionStats
    );

  const difficulty =
    calculateTopicDifficulty(
      knowledgeStats,
      { questions }
    );

  const attempts =
    knowledgeStats.reduce((sum, q) => {
      return sum + (q.attempts ?? 0);
    }, 0);

  const averageAccuracy =
    knowledgeStats.length

      ? round(

          knowledgeStats.reduce((sum, q) => {
            return sum + (q.accuracy ?? 0);
          }, 0)

          / knowledgeStats.length

        )

      : 0;

  return {

    topicId:
      topic.id ?? null,

    topicName:
      topic.name ?? "Unknown Topic",

    questionCount:
      knowledgeStats.length,

    studentCount,

    attempts,

    averageAccuracy,

    analyticsDifficulty:
      difficulty.analyticsDifficulty,

    difficultyScore:
      difficulty.difficultyScore,

    difficultyInterpretation:
      interpretDifficulty(
        difficulty.analyticsDifficulty
      ),

    knowledgeOnly: true,

    scope: "canonical",

    canonical: true,

    experimental: false,

    adaptiveEligible: true,

    analyticsMeta:
      buildAnalyticsMeta({
        attempts
      })

  };

}



/**
 * Weak-topic intelligence: knowledge-eligible stats ONLY.
 */
export function buildWeakTopicCard({

  topic = {},

  topicStats = {},

  topicQuestionStats = []

} = {}) {

  const knowledgeStats =
    filterKnowledgeEligibleStats(
      topicQuestionStats.length
        ? topicQuestionStats
        : (topicStats.questionStats ?? [])
    );

  const accuracy =
    knowledgeStats.length

      ? knowledgeStats.reduce((sum, q) => {
          return sum + (q.accuracy ?? 0);
        }, 0) / knowledgeStats.length

      : (topicStats.averageAccuracy ?? 0);

  return {

    topicId:
      topic.id,

    topicName:
      topic.name,

    accuracy:
      round(accuracy),

    weaknessScore:
      round(100 - accuracy),

    analyticsDifficulty:
      topicStats.analyticsDifficulty,

    recommendation:
      generateWeakTopicRecommendation(accuracy),

    knowledgeOnly: true,

    scope: "canonical",

    canonical: true,

    experimental: false,

    adaptiveEligible: true

  };

}



/* =========================================================
   EXAM SELECTORS
========================================================= */

export function buildExamAnalyticsCard({

  exam = {},

  examStats = {}

} = {}) {

  const difficulty =
    calculateExamDifficulty(
      examStats.questionDifficulties ?? []
    );

  return {

    examId:
      exam.id ?? null,

    title:
      exam.title ?? "Untitled Exam",

    attempts:
      examStats.attempts ?? 0,

    averageScore:
      round(examStats.averageScore ?? 0),

    highestScore:
      round(examStats.highestScore ?? 0),

    lowestScore:
      round(examStats.lowestScore ?? 0),

    averageTime:
      round(examStats.averageTime ?? 0),

    analyticsDifficulty:
      difficulty.analyticsDifficulty,

    difficultyScore:
      difficulty.difficultyScore,

    hardestQuestions:
      examStats.hardestQuestions ?? [],

    easiestQuestions:
      examStats.easiestQuestions ?? [],

    hardestKnowledgeQuestions:
      examStats.hardestKnowledgeQuestions ?? [],

    assessmentEligible: true,

    analyticsMode: "assessment",

    analyticsMeta:
      buildAnalyticsMeta({
        attempts:
          examStats.attempts ?? 0
      })

  };

}



/* =========================================================
   STUDENT SELECTORS
========================================================= */

export function buildStudentAnalyticsCard({

  student = {},

  studentStats = {},

  weakTopics = []

} = {}) {

  return {

    studentId:
      student.id ??
      student.student_id ??
      null,

    studentName:
      student.name ??
      student.student_name ??
      "Unknown Student",

    attempts:
      studentStats.attempts ?? 0,

    averageScore:
      round(studentStats.averageScore ?? 0),

    bestScore:
      round(studentStats.bestScore ?? 0),

    lowestScore:
      round(studentStats.lowestScore ?? 0),

    averageTime:
      round(studentStats.averageTime ?? 0),

    weakTopics,

    analyticsMeta:
      buildAnalyticsMeta({
        attempts:
          studentStats.attempts ?? 0
      })

  };

}



/* =========================================================
   QUESTION SET SELECTORS
========================================================= */

export function buildQuestionSetAnalyticsCard({

  questionSet = {},

  stats = {}

} = {}) {

  return {

    questionSetId:
      questionSet.id ?? null,

    title:
      questionSet.title ??
      "Untitled Question Set",

    totalQuestions:
      stats.totalQuestions ?? 0,

    averageAccuracy:
      round(stats.averageAccuracy ?? 0),

    hardestQuestions:
      stats.hardestQuestions ?? [],

    easiestQuestions:
      stats.easiestQuestions ?? [],

    scope: "experimental",

    canonical: false,

    experimental: true,

    experimentalAnalytics: true,

    assessmentEligible: true,

    knowledgeEligible: false,

    adaptiveEligible: false,

    analyticsMode: "assessment",

    analyticsMeta:
      buildAnalyticsMeta({
        attempts:
          stats.totalAttempts ?? 0
      })

  };

}



/* =========================================================
   DASHBOARD SELECTORS
========================================================= */

export function buildDashboardSummary({

  totalStudents = 0,

  totalAttempts = 0,

  totalQuestions = 0,

  totalTopics = 0

} = {}) {

  return {

    totalStudents,

    totalAttempts,

    totalQuestions,

    totalTopics

  };

}



export function buildAnalyticsHealth({

  healthy = true,

  missingQuestionIds = 0,

  totalAnswers = 0

} = {}) {

  return {

    healthy,

    missingQuestionIds,

    totalAnswers,

    identityCoverage:
      percentage(
        totalAnswers - missingQuestionIds,
        totalAnswers
      )

  };

}



/* =========================================================
   RECOMMENDATION HELPERS
========================================================= */

export function generateWeakTopicRecommendation(
  accuracy = 0
) {

  if (accuracy < 30) {

    return "Critical revision required.";

  }

  if (accuracy < 50) {

    return "Needs targeted practice.";

  }

  if (accuracy < 70) {

    return "Moderate reinforcement recommended.";

  }

  return "Performance stable.";

}



/* =========================================================
   UI STATUS HELPERS
========================================================= */

export function analyticsStatus(
  attempts = 0
) {

  if (attempts >= 500) {
    return "strong";
  }

  if (attempts >= 100) {
    return "stable";
  }

  if (attempts >= 20) {
    return "developing";
  }

  return "insufficient";
}



export function futureSelectorsPlaceholder() {

  console.warn(
    "Advanced analytics selectors not implemented yet."
  );

}
