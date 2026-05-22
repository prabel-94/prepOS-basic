/**
 * PrepOS Difficulty Engine
 * ---------------------------------------------------
 * PURPOSE:
 * Analytics-derived difficulty computation engine.
 *
 * TWO ANALYTICS CONTEXTS:
 * - Assessment difficulty (all published-eligible questions)
 * - Knowledge difficulty (canonical bank questions only)
 *
 * THIS FILE MUST NEVER:
 * - overwrite teacher-defined difficulty
 * - modify question metadata difficulty
 *
 * PrepOS Analytics Architecture v1
 */


import {
  clamp,
  average,
  difficultyLabel,
  invertNormalized,
  normalizeScore,
  confidenceFromAttempts,
  round,
  toNumber
} from "./analytics-core.js";

import {
  classifyAnalyticsScope,
  isKnowledgeEligible
} from "./analytics-scope.js";



/* =========================================================
   CONFIGURATION
========================================================= */

export const DEFAULT_DIFFICULTY_WEIGHTS = {

  accuracy: 0.65,

  skipRate: 0.20,

  averageTime: 0.15

};



export const DEFAULT_TIME_CONFIG = {

  easy: 20,

  medium: 45,

  hard: 90

};



/* =========================================================
   CORE DIFFICULTY COMPUTATION
========================================================= */

export function deriveDifficulty({
  accuracy = 0,
  skipRate = 0,
  averageTime = 0,
  attempts = 0,

  weights = DEFAULT_DIFFICULTY_WEIGHTS,

  timeConfig = DEFAULT_TIME_CONFIG

} = {}) {

  const normalizedAccuracy =
    invertNormalized(
      clamp(
        toNumber(accuracy) / 100
      )
    );

  const normalizedSkipRate =
    clamp(
      toNumber(skipRate) / 100
    );

  const normalizedTime =
    normalizeScore(
      toNumber(averageTime),
      timeConfig.easy,
      timeConfig.hard
    );

  const difficultyScore = clamp(

      (
        normalizedAccuracy * weights.accuracy
      ) +

      (
        normalizedSkipRate * weights.skipRate
      ) +

      (
        normalizedTime * weights.averageTime
      )

  );

  return {

    analyticsDifficulty:
      difficultyLabel(difficultyScore),

    difficultyScore:
      round(difficultyScore, 3),

    confidence:
      confidenceFromAttempts(attempts),

    signals: {

      normalizedAccuracy:
        round(normalizedAccuracy, 3),

      normalizedSkipRate:
        round(normalizedSkipRate, 3),

      normalizedTime:
        round(normalizedTime, 3)

    }

  };

}



/**
 * Attach scope labels to difficulty output.
 */
function attachScopeLabels(
  difficulty = {},
  question = {}
) {

  const scopeMeta =
    classifyAnalyticsScope(question);

  return {

    ...difficulty,

    scope: scopeMeta.scope,

    canonical: scopeMeta.canonical,

    experimental: scopeMeta.experimental,

    assessmentEligible:
      scopeMeta.assessmentEligible,

    knowledgeEligible:
      scopeMeta.knowledgeEligible

  };

}



/* =========================================================
   QUESTION DIFFICULTY (SCOPE-AWARE)
========================================================= */

/**
 * Assessment difficulty: hardest in THIS exam context.
 * Supports all published-eligible questions.
 */
export function buildAssessmentQuestionDifficulty(
  questionStats = {},
  question = {}
) {

  const difficulty =
    deriveDifficulty({

      accuracy:
        questionStats.accuracy,

      skipRate:
        questionStats.skipRate,

      averageTime:
        questionStats.averageTime,

      attempts:
        questionStats.attempts

    });

  return attachScopeLabels(
    difficulty,
    question
  );

}



/**
 * Knowledge difficulty: globally difficult concepts.
 * ONLY canonical knowledge-eligible questions.
 */
export function buildKnowledgeQuestionDifficulty(
  questionStats = {},
  question = {}
) {

  if (!isKnowledgeEligible(question)) {
    return null;
  }

  const difficulty =
    deriveDifficulty({

      accuracy:
        questionStats.accuracy,

      skipRate:
        questionStats.skipRate,

      averageTime:
        questionStats.averageTime,

      attempts:
        questionStats.attempts

    });

  return attachScopeLabels(
    difficulty,
    question
  );

}



/**
 * @deprecated Prefer buildAssessmentQuestionDifficulty or buildKnowledgeQuestionDifficulty.
 * Defaults to assessment difficulty.
 */
export function buildQuestionDifficulty(
  questionStats = {},
  question = {}
) {

  return buildAssessmentQuestionDifficulty(
    questionStats,
    question
  );

}



/* =========================================================
   DIFFICULTY DRIFT
========================================================= */

export function detectDifficultyDrift({

  teacherDifficulty = null,

  analyticsDifficulty = null

} = {}) {

  if (
    !teacherDifficulty ||
    !analyticsDifficulty
  ) {

    return {

      driftDetected: false,

      severity: "unknown"

    };

  }

  const driftDetected =
    teacherDifficulty !== analyticsDifficulty;

  return {

    teacherDifficulty,

    analyticsDifficulty,

    driftDetected,

    severity:
      driftDetected
        ? "medium"
        : "none"

  };

}



/* =========================================================
   EXAM DIFFICULTY
========================================================= */

export function calculateExamDifficulty(
  questionDifficulties = []
) {

  if (!questionDifficulties.length) {

    return {

      analyticsDifficulty: "unknown",

      difficultyScore: 0

    };

  }

  const scores =
    questionDifficulties
      .filter(Boolean)
      .map(q => {

        return toNumber(
          q.difficultyScore
        );

      });

  const avgScore =
    average(scores);

  return {

    analyticsDifficulty:
      difficultyLabel(avgScore),

    difficultyScore:
      round(avgScore, 3)

  };

}



/* =========================================================
   TOPIC DIFFICULTY (KNOWLEDGE ONLY)
========================================================= */

/**
 * Topic difficulty MUST only consume canonical knowledge stats.
 */
export function calculateTopicDifficulty(
  topicQuestionStats = [],
  { questions = [] } = {}
) {

  const questionLookup = new Map();

  questions.forEach(q => {
    const id = q.question_id ?? q.id;
    if (id != null) {
      questionLookup.set(String(id), q);
    }
  });

  const eligibleStats =
    topicQuestionStats.filter(stat => {

      if (stat.knowledgeEligible === false) {
        return false;
      }

      if (stat.knowledgeEligible === true) {
        return true;
      }

      const question =
        questionLookup.get(String(stat.questionId)) ??
        { question_id: stat.questionId };

      return isKnowledgeEligible(question);

    });

  if (!eligibleStats.length) {

    return {

      analyticsDifficulty: "unknown",

      difficultyScore: 0,

      knowledgeOnly: true

    };

  }

  const scores =
    eligibleStats.map(stat => {

      const question =
        questionLookup.get(String(stat.questionId)) ??
        { question_id: stat.questionId };

      const result =
        buildKnowledgeQuestionDifficulty(
          stat,
          question
        );

      return result?.difficultyScore ?? 0;

    });

  const avgScore =
    average(scores);

  return {

    analyticsDifficulty:
      difficultyLabel(avgScore),

    difficultyScore:
      round(avgScore, 3),

    knowledgeOnly: true

  };

}



/* =========================================================
   QUESTION SET DIFFICULTY
========================================================= */

export function calculateQuestionSetDifficulty(
  questionStats = []
) {

  if (!questionStats.length) {

    return {

      analyticsDifficulty: "unknown",

      difficultyScore: 0,

      experimental: true

    };

  }

  const difficulties =
    questionStats.map(stat => {

      return buildAssessmentQuestionDifficulty(stat);

    });

  return {

    ...calculateExamDifficulty(difficulties),

    experimental: true

  };

}



/* =========================================================
   PERFORMANCE INTERPRETATION
========================================================= */

export function interpretDifficulty(
  difficulty = "unknown"
) {

  switch (difficulty) {

    case "easy":
      return {
        label: "Easy",
        description:
          "Most students answer correctly with low friction."
      };

    case "medium":
      return {
        label: "Medium",
        description:
          "Students show moderate challenge and thinking time."
      };

    case "hard":
      return {
        label: "Hard",
        description:
          "Students struggle significantly or require extended reasoning."
      };

    default:
      return {
        label: "Unknown",
        description:
          "Insufficient analytics data."
      };

  }

}



/* =========================================================
   CONFIDENCE HELPERS
========================================================= */

export function isDifficultyReliable(
  attempts = 0,
  minimumAttempts = 30
) {

  return (
    toNumber(attempts) >= minimumAttempts
  );

}



export function futureDifficultyModel() {

  console.warn(
    "Advanced difficulty models not implemented yet."
  );

}



export const PREPOS_DIFFICULTY_POLICY = {

  teacherDifficultyImmutable: true,

  analyticsDifficultySeparate: true,

  canonicalRequiresStableIdentity: true,

  assessmentAnalyticsSupportsAllQuestions: true,

  knowledgeDifficultyRequiresCanonicalIdentity: true,

  topicDifficultyKnowledgeOnly: true

};
