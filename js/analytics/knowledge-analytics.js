/**
 * PrepOS Knowledge Analytics Engine
 * --------------------------------------------------------
 * PURPOSE:
 * Canonical knowledge intelligence — separate from assessment analytics.
 *
 * SUPPORTS:
 * - topic mastery
 * - weak-topic detection
 * - adaptive practice signals
 * - long-term difficulty calibration (foundation)
 *
 * RULE:
 * Topic analytics MUST ONLY consume canonical, knowledge-eligible entities.
 *
 * PrepOS Analytics Architecture v1
 */


import {
  average,
  round,
  groupBy,
  buildAnalyticsMeta
} from "./analytics-core.js";

import {
  classifyAnalyticsScope,
  isKnowledgeEligible,
  canInfluenceTopicMastery
} from "./analytics-scope.js";

import {
  buildKnowledgeQuestionStats,
  filterKnowledgeEligibleStats,
  buildQuestionLookup
} from "./attempt-analytics.js";

import {
  buildKnowledgeQuestionDifficulty,
  calculateTopicDifficulty
} from "./difficulty-engine.js";

import {
  buildTopicAnalyticsCard,
  buildWeakTopicCard
} from "./analytics-selectors.js";



/* =========================================================
   TOPIC EXTRACTION
========================================================= */

/**
 * Normalize topic labels from a question entity.
 */
export function extractQuestionTopics(question = {}) {

  if (!Array.isArray(question.topics)) {
    return [];
  }

  return question.topics
    .map(topic => {

      if (typeof topic === "string") {
        return topic.trim();
      }

      return (
        topic?.name ??
        topic?.label ??
        ""
      ).trim();

    })
    .filter(Boolean);

}



/**
 * Build map: topicName → question stats[].
 * Only knowledge-eligible stats are included.
 */
export function groupKnowledgeStatsByTopic(
  questionStats = [],
  questions = []
) {

  const knowledgeStats =
    filterKnowledgeEligibleStats(questionStats);

  const questionLookup =
    buildQuestionLookup(questions);

  const byTopic = {};

  knowledgeStats.forEach(stat => {

    const question =
      questionLookup.get(String(stat.questionId)) ??
      { question_id: stat.questionId };

    if (!canInfluenceTopicMastery(question)) {
      return;
    }

    const topics =
      extractQuestionTopics(question);

    if (!topics.length) {
      return;
    }

    topics.forEach(topicName => {

      if (!byTopic[topicName]) {
        byTopic[topicName] = [];
      }

      byTopic[topicName].push(stat);

    });

  });

  return byTopic;

}



/* =========================================================
   TOPIC MASTERY
========================================================= */

/**
 * Build mastery record for a single topic.
 */
export function buildTopicMasteryRecord(
  topicName = "Unknown",
  topicQuestionStats = [],
  { questions = [] } = {}
) {

  const topic = {
    id: topicName,
    name: topicName
  };

  const card =
    buildTopicAnalyticsCard({

      topic,

      topicQuestionStats,

      questions

    });

  const masteryScore =
    round(card.averageAccuracy ?? 0);

  return {

    ...card,

    topicName,

    masteryScore,

    masteryLevel:
      masteryLevelFromAccuracy(masteryScore),

    knowledgeOnly: true,

    scope: "canonical",

    canonical: true

  };

}



/**
 * Map accuracy → mastery tier.
 */
export function masteryLevelFromAccuracy(accuracy = 0) {

  if (accuracy >= 85) {
    return "strong";
  }

  if (accuracy >= 70) {
    return "developing";
  }

  if (accuracy >= 50) {
    return "needs_practice";
  }

  return "critical";

}



/**
 * Build topic mastery map for all canonical topics in scope.
 */
export function buildTopicMastery({
  attempts = [],
  questions = []
} = {}) {

  const questionStats =
    buildKnowledgeQuestionStats(
      attempts,
      { questions }
    );

  const byTopic =
    groupKnowledgeStatsByTopic(
      questionStats,
      questions
    );

  const topics =
    Object.entries(byTopic).map(
      ([topicName, stats]) => {

        return buildTopicMasteryRecord(
          topicName,
          stats,
          { questions }
        );

      }
    );

  return sortTopicsByWeakness(topics);

}



/* =========================================================
   WEAK TOPICS
========================================================= */

/**
 * Identify weak topics (lowest mastery first).
 */
export function buildWeakTopics({
  attempts = [],
  questions = [],
  limit = 5,
  maxAccuracy = 70
} = {}) {

  const mastery =
    buildTopicMastery({ attempts, questions });

  return mastery
    .filter(topic => {
      return (topic.masteryScore ?? 100) < maxAccuracy;
    })
    .slice(0, limit)
    .map(topic => {

      return buildWeakTopicCard({

        topic: {
          id: topic.topicName,
          name: topic.topicName
        },

        topicStats: {
          averageAccuracy: topic.masteryScore,
          analyticsDifficulty: topic.analyticsDifficulty
        },

        topicQuestionStats:
          groupKnowledgeStatsByTopic(
            buildKnowledgeQuestionStats(
              attempts,
              { questions }
            ),
            questions
          )[topic.topicName] ?? []

      });

    });

}



/* =========================================================
   ADAPTIVE SIGNALS
========================================================= */

/**
 * Lightweight adaptive signals from knowledge analytics.
 * Foundation for adaptive practice / recommendations.
 */
export function buildAdaptiveSignals({
  attempts = [],
  questions = []
} = {}) {

  const weakTopics =
    buildWeakTopics({
      attempts,
      questions,
      limit: 10
    });

  const questionStats =
    buildKnowledgeQuestionStats(
      attempts,
      { questions }
    );

  const hardConcepts =
    [...questionStats]
      .filter(stat => stat.knowledgeEligible)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5)
      .map(stat => ({

        questionId: stat.questionId,

        accuracy: stat.accuracy,

        scope: stat.scope,

        canonical: stat.canonical

      }));

  return {

    practiceTopics:
      weakTopics.map(t => t.topicName),

    weakTopics,

    hardConcepts,

    adaptiveEligible:
      questionStats.filter(s => s.adaptiveEligible).length,

    totalKnowledgeQuestions:
      questionStats.length,

    readyForAdaptive:
      questionStats.length > 0 &&
      weakTopics.length > 0

  };

}



/* =========================================================
   KNOWLEDGE SNAPSHOT (MAIN ENTRY)
========================================================= */

/**
 * Full knowledge analytics payload for a submission context.
 */
export function buildKnowledgeAnalytics({
  exam = {},
  attempt = {},
  allAttempts = [],
  questions = []
} = {}) {

  const questionLookup =
    buildQuestionLookup(questions);

  const questionStats =
    buildKnowledgeQuestionStats(
      allAttempts,
      { questions }
    );

  const questionDifficulties = [];

  for (const stat of questionStats) {

    const question =
      questionLookup.get(String(stat.questionId)) ??
      { question_id: stat.questionId };

    const scope =
      classifyAnalyticsScope(question);

    if (!scope.knowledgeEligible) {
      continue;
    }

    const difficulty =
      buildKnowledgeQuestionDifficulty(
        stat,
        question
      );

    if (!difficulty) {
      continue;
    }

    questionDifficulties.push({

      questionId: stat.questionId,

      ...difficulty

    });

  }

  const topicMastery =
    buildTopicMastery({
      attempts: allAttempts,
      questions
    });

  const weakTopics =
    buildWeakTopics({
      attempts: allAttempts,
      questions,
      limit: 5
    });

  const adaptiveSignals =
    buildAdaptiveSignals({
      attempts: allAttempts,
      questions
    });

  const scopeReport = {

    total: questions.length,

    knowledgeEligible:
      questionStats.length,

    canonical:
      questionStats.filter(s => s.canonical).length,

    experimental:
      questions.filter(q => {
        return classifyAnalyticsScope(q).experimental;
      }).length

  };

  return {

    examId:
      exam.id ?? null,

    attemptId:
      attempt.id ?? null,

    analyticsMode: "knowledge",

    knowledgeOnly: true,

    questionStats,

    questionDifficulties,

    topicMastery,

    weakTopics,

    adaptiveSignals,

    scopeReport,

    analyticsMeta:
      buildAnalyticsMeta({
        attempts: allAttempts.length
      }),

    processedAt:
      new Date().toISOString()

  };

}



/* =========================================================
   HELPERS
========================================================= */

function sortTopicsByWeakness(topics = []) {

  return [...topics].sort((a, b) => {
    return (a.masteryScore ?? 0) - (b.masteryScore ?? 0);
  });

}



/**
 * Filter questions to knowledge-eligible catalog entries.
 */
export function filterKnowledgeQuestions(questions = []) {

  return questions.filter(isKnowledgeEligible);

}



export const PREPOS_KNOWLEDGE_ANALYTICS_POLICY = {

  topicMasteryCanonicalOnly: true,

  weakTopicsKnowledgeOnly: true,

  adaptiveSignalsProtectedFromExperimental: true,

  assessmentAnalyticsSeparate: true

};
