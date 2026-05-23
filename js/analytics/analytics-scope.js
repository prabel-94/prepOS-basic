/**
 * PrepOS Analytics Scope Engine
 * --------------------------------------------------------
 * PURPOSE:
 * Centralized analytics eligibility + scope classification.
 *
 * THIS FILE DEFINES:
 * - which questions participate in assessment analytics
 * - which questions participate in knowledge analytics
 * - canonical vs experimental classification
 *
 * THIS IS ONE OF THE MOST IMPORTANT FILES
 * IN THE PREPOS ANALYTICS ARCHITECTURE.
 *
 * WHY?
 * Because PrepOS intentionally separates:
 *
 * 1. Assessment Intelligence
 * 2. Knowledge Intelligence
 *
 * Without this separation:
 * - adaptive systems become polluted
 * - topic mastery becomes unreliable
 * - experimental questions distort learning intelligence
 *
 * PrepOS Analytics Architecture v1
 */


import {
  observeQuestionScopeClassification,
  observeSubmissionScopeClassification
} from "./scope-viewer.js";



/* =========================================================
   ANALYTICS SCOPE CONSTANTS
========================================================= */

/**
 * Canonical knowledge entities.
 *
 * Participates in:
 * - topic mastery
 * - adaptive learning
 * - long-term difficulty
 * - spaced repetition
 */
export const ANALYTICS_SCOPE_CANONICAL =
  "canonical";


/**
 * Experimental / teacher-scoped.
 *
 * Participates in:
 * - assessment analytics
 * - local performance analytics
 *
 * Does NOT fully participate in:
 * - adaptive intelligence
 * - global topic mastery
 */
export const ANALYTICS_SCOPE_EXPERIMENTAL =
  "experimental";


/**
 * Ephemeral / temporary.
 *
 * Minimal analytics participation.
 */
export const ANALYTICS_SCOPE_EPHEMERAL =
  "ephemeral";


/**
 * Historical only.
 *
 * Analytics preserved but inactive.
 */
export const ANALYTICS_SCOPE_ARCHIVED =
  "archived";


/**
 * Public/open practice attempts (public_exam_attempts).
 *
 * Participates in:
 * - assessment analytics
 *
 * Does NOT participate in:
 * - topic mastery
 * - adaptive learning
 * - canonical difficulty calibration
 */
export const ANALYTICS_SCOPE_PUBLIC =
  "public";



/* =========================================================
   SUBMISSION SCOPE (ATTEMPT-LEVEL)
========================================================= */

/**
 * Classify submission channel for analytics policy.
 *
 * Canonical learning intelligence uses exam_attempts only.
 * Public attempts use public_exam_attempts only.
 */
export function classifySubmissionAnalyticsScope(
  { submissionMode = "canonical" } = {},
  observationContext = {}
) {

  const isPublic =
    submissionMode === "public";

  let result;

  if (isPublic) {

    result = {

      scope: ANALYTICS_SCOPE_PUBLIC,

      public: true,

      canonical: false,

      knowledgeEligible: false,

      assessmentEligible: true,

      adaptiveEligible: false,

      experimental: false,

      ephemeral: false,

      archived: false

    };

  } else {

    result = {

      scope: ANALYTICS_SCOPE_CANONICAL,

      public: false,

      canonical: true,

      knowledgeEligible: true,

      assessmentEligible: true,

      adaptiveEligible: true,

      experimental: false,

      ephemeral: false,

      archived: false

    };

  }

  try {
    observeSubmissionScopeClassification(
      submissionMode,
      result,
      observationContext
    );
  } catch {
    /* observability must not block classification */
  }

  return result;

}



/* =========================================================
   CORE HELPERS
========================================================= */

/**
 * Determine whether question
 * has stable global identity.
 *
 * IMPORTANT:
 * Stable identity is required for:
 * - longitudinal analytics
 * - topic intelligence
 * - adaptive systems
 */
export function hasStableQuestionIdentity(
  question = {}
) {

  return Boolean(

    question.question_id ??
    question.id

  );

}



/**
 * Determine whether question
 * belongs to Question Bank.
 */
export function isBankQuestion(
  question = {}
) {

  return Boolean(

    question.is_bank_question === true ||

    question.bank_status === "saved" ||

    question.bank_status === "banked" ||

    question.bank_status === "canonical"

  );

}



/**
 * Determine whether question
 * has topic linkage.
 *
 * IMPORTANT:
 * Topic linkage is required for:
 * - topic mastery
 * - adaptive learning
 * - knowledge graph intelligence
 */
export function hasTopicLinkage(
  question = {}
) {

  /**
   * topics array
   */
  if (
    Array.isArray(question.topics) &&
    question.topics.length > 0
  ) {

    return true;

  }

  /**
   * topic_count cache
   */
  if (
    Number(question.topic_count) > 0
  ) {

    return true;

  }

  return false;

}



/**
 * Determine whether question
 * belongs to published assessment.
 */
export function isPublishedQuestion(
  question = {}
) {

  return Boolean(

    question.is_published === true ||

    question.published === true ||

    question.exam_id ||

    question.examId ||

    question.published_exam_id

  );

}



/**
 * Determine whether question
 * belongs to Question Set.
 */
export function isQuestionSetQuestion(
  question = {}
) {

  return Boolean(

    question.question_set_id ||

    question.questionSetId ||

    question.parent_type === "question_set" ||

    question.source === "question_set"

  );

}



/**
 * Determine whether question
 * is archived.
 */
export function isArchivedQuestion(
  question = {}
) {

  return Boolean(

    question.is_archived === true ||

    question.is_active === false

  );

}



/* =========================================================
   ANALYTICS ELIGIBILITY
========================================================= */

/**
 * Assessment Analytics Eligibility
 *
 * Applies to:
 * ALL published questions.
 *
 * Supports:
 * - hardest questions
 * - exam difficulty
 * - skip rates
 * - timing friction
 * - distractor analysis
 */
export function isAssessmentEligible(
  question = {}
) {

  /**
   * Archived questions excluded
   * from active assessment analytics.
   */
  if (isArchivedQuestion(question)) {
    return false;
  }

  return isPublishedQuestion(question);

}



/**
 * Knowledge Analytics Eligibility
 *
 * STRICT RULES:
 *
 * Requires:
 * - stable identity
 * - bank participation
 * - topic linkage
 *
 * Supports:
 * - topic mastery
 * - adaptive learning
 * - long-term difficulty
 * - spaced repetition
 */
export function isKnowledgeEligible(
  question = {}
) {

  if (isArchivedQuestion(question)) {
    return false;
  }

  return (

    hasStableQuestionIdentity(question) &&
    isBankQuestion(question) &&
    hasTopicLinkage(question)

  );

}



/**
 * Adaptive Intelligence Eligibility
 *
 * STRICTER than knowledge eligibility.
 *
 * Future-proofing:
 * adaptive systems require
 * very high quality entities.
 */
export function isAdaptiveEligible(
  question = {}
) {

  return isKnowledgeEligible(question);

}



/* =========================================================
   SCOPE CLASSIFICATION
========================================================= */

/**
 * Main analytics classifier.
 *
 * This becomes the canonical
 * scope authority for PrepOS.
 */
function computeAnalyticsScope(question = {}) {

  const archived =
    isArchivedQuestion(question);

  if (archived) {

    return {

      scope:
        ANALYTICS_SCOPE_ARCHIVED,

      archived: true,

      assessmentEligible: false,

      knowledgeEligible: false,

      adaptiveEligible: false,

      canonical: false,

      experimental: false,

      ephemeral: false

    };

  }

  const assessmentEligible =
    isAssessmentEligible(question);

  const knowledgeEligible =
    isKnowledgeEligible(question);

  const adaptiveEligible =
    isAdaptiveEligible(question);

  /**
   * Canonical knowledge entity
   */
  if (knowledgeEligible) {

    return {

      scope:
        ANALYTICS_SCOPE_CANONICAL,

      archived: false,

      assessmentEligible,

      knowledgeEligible,

      adaptiveEligible,

      canonical: true,

      experimental: false,

      ephemeral: false

    };

  }

  /**
   * Experimental Question Set entity
   */
  if (
    assessmentEligible &&
    isQuestionSetQuestion(question)
  ) {

    return {

      scope:
        ANALYTICS_SCOPE_EXPERIMENTAL,

      archived: false,

      assessmentEligible: true,

      knowledgeEligible: false,

      adaptiveEligible: false,

      canonical: false,

      experimental: true,

      ephemeral: false

    };

  }

  /**
   * Ephemeral published question
   */
  if (assessmentEligible) {

    return {

      scope:
        ANALYTICS_SCOPE_EPHEMERAL,

      archived: false,

      assessmentEligible: true,

      knowledgeEligible: false,

      adaptiveEligible: false,

      canonical: false,

      experimental: false,

      ephemeral: true

    };

  }

  /**
   * Default fallback
   */
  return {

    scope:
      ANALYTICS_SCOPE_EPHEMERAL,

    archived: false,

    assessmentEligible: false,

    knowledgeEligible: false,

    adaptiveEligible: false,

    canonical: false,

    experimental: false,

    ephemeral: true

  };

}



/**
 * Main analytics classifier (with passive scope observability).
 */
export function classifyAnalyticsScope(
  question = {},
  observationContext = {}
) {

  const result = computeAnalyticsScope(question);

  try {
    observeQuestionScopeClassification(
      question,
      result,
      observationContext
    );
  } catch {
    /* observability must not block classification */
  }

  return result;

}



/* =========================================================
   FILTER HELPERS
========================================================= */

/**
 * Filter assessment-eligible questions.
 */
export function filterAssessmentEligible(
  questions = []
) {

  return questions.filter(
    isAssessmentEligible
  );

}



/**
 * Filter canonical knowledge questions.
 */
export function filterKnowledgeEligible(
  questions = []
) {

  return questions.filter(
    isKnowledgeEligible
  );

}



/**
 * Filter adaptive-learning eligible questions.
 */
export function filterAdaptiveEligible(
  questions = []
) {

  return questions.filter(
    isAdaptiveEligible
  );

}



/**
 * Filter experimental questions.
 */
export function filterExperimentalQuestions(
  questions = []
) {

  return questions.filter(question => {

    const scope =
      classifyAnalyticsScope(question);

    return scope.experimental;

  });

}



/* =========================================================
   ANALYTICS POLICY HELPERS
========================================================= */

/**
 * Determine whether question
 * may influence topic mastery.
 */
export function canInfluenceTopicMastery(
  question = {}
) {

  return isKnowledgeEligible(question);

}



/**
 * Determine whether question
 * may influence adaptive learning.
 */
export function canInfluenceAdaptiveLearning(
  question = {}
) {

  return isAdaptiveEligible(question);

}



/**
 * Determine whether question
 * may participate in
 * long-term difficulty analytics.
 */
export function canInfluenceLongTermDifficulty(
  question = {}
) {

  return isKnowledgeEligible(question);

}



/**
 * Determine whether question
 * supports exam-local analytics.
 */
export function canInfluenceAssessmentAnalytics(
  question = {}
) {

  return isAssessmentEligible(question);

}



/* =========================================================
   ANALYTICS HEALTH HELPERS
========================================================= */

/**
 * Build analytics scope report.
 *
 * Useful for:
 * - admin diagnostics
 * - analytics audits
 * - system health checks
 */
export function buildAnalyticsScopeReport(
  questions = []
) {

  const report = {

    total: questions.length,

    canonical: 0,

    experimental: 0,

    ephemeral: 0,

    archived: 0

  };

  questions.forEach(question => {

    const scope =
      classifyAnalyticsScope(question);

    switch (scope.scope) {

      case ANALYTICS_SCOPE_CANONICAL:
        report.canonical++;
        break;

      case ANALYTICS_SCOPE_EXPERIMENTAL:
        report.experimental++;
        break;

      case ANALYTICS_SCOPE_EPHEMERAL:
        report.ephemeral++;
        break;

      case ANALYTICS_SCOPE_ARCHIVED:
        report.archived++;
        break;

    }

  });

  return report;

}



/* =========================================================
   FUTURE ROADMAP PLACEHOLDERS
========================================================= */

/**
 * Future:
 * - cohort-specific scope
 * - teacher-controlled scope
 * - AI confidence eligibility
 * - mastery weighting systems
 * - adaptive confidence scoring
 */
export function futureScopeSystems() {

  console.warn(
    "Advanced analytics scope systems not implemented yet."
  );

}



/* =========================================================
   PREPOS ANALYTICS SCOPE POLICY
========================================================= */

/**
 * CENTRAL ARCHITECTURAL RULES
 *
 * 1. ALL published questions:
 *    may participate in assessment analytics.
 *
 * 2. ONLY canonical questions:
 *    may participate in knowledge intelligence.
 *
 * 3. Adaptive systems must remain protected
 *    from experimental analytics pollution.
 *
 * 4. Question Sets are first-class
 *    experimental intelligence spaces.
 *
 * 5. Topic mastery requires:
 *    stable question identity + topic linkage.
 */

export const PREPOS_ANALYTICS_SCOPE_POLICY = {

  assessmentAnalyticsSupportsAllPublishedQuestions: true,

  knowledgeAnalyticsRequiresCanonicalIdentity: true,

  adaptiveSystemsProtectedFromExperimentalPollution: true,

  topicMasteryRequiresTopicLinkage: true,

  experimentalQuestionSetsSupported: true,

  publicAttemptsTable: "public_exam_attempts",

  canonicalAttemptsTable: "exam_attempts",

  publicAttemptsExcludedFromKnowledgeAnalytics: true

};