/**
 * Topic question bank progress — coverage and per-question mastery states.
 * Pure computation; no DOM or Supabase.
 */

import {
  buildKnowledgeQuestionStats,
  normalizeAttempt,
} from "./attempt-analytics.js";

export const QUESTION_PROGRESS_STATES = [
  "not_started",
  "learning",
  "needs_review",
  "mastered",
];

const QUESTION_STATE_PRIORITY = {
  not_started: 0,
  needs_review: 1,
  learning: 2,
  mastered: 3,
};

/**
 * Walk attempts chronologically and record the latest result per question.
 */
export function buildLastAnswerByQuestion(attempts = []) {
  const sorted = [...attempts].sort((a, b) => {
    const left = normalizeAttempt(a);
    const right = normalizeAttempt(b);
    const ta = new Date(left.submittedAt ?? 0).getTime();
    const tb = new Date(right.submittedAt ?? 0).getTime();
    return ta - tb;
  });

  const last = new Map();

  for (const attempt of sorted) {
    const normalized = normalizeAttempt(attempt);

    for (const answer of normalized.answers) {
      if (answer.questionId) {
        last.set(String(answer.questionId), answer.isCorrect === true);
      }
    }
  }

  return last;
}

/**
 * Classify a single bank question's progress from aggregated stats.
 */
export function classifyQuestionMasteryState({
  attempts = 0,
  accuracy = 0,
  lastCorrect = null,
} = {}) {
  if (attempts === 0) {
    return "not_started";
  }

  if (attempts >= 2 && accuracy >= 85) {
    return "mastered";
  }

  if (lastCorrect === false || (attempts >= 2 && accuracy < 50)) {
    return "needs_review";
  }

  return "learning";
}

function emptyCounts() {
  return {
    not_started: 0,
    learning: 0,
    needs_review: 0,
    mastered: 0,
  };
}

function deriveProgressConfidence(attemptedCount = 0, totalQuestions = 0) {
  if (!totalQuestions || attemptedCount === 0) {
    return "low";
  }

  const ratio = attemptedCount / totalQuestions;

  if (attemptedCount >= 10 && ratio >= 0.25) {
    return "high";
  }

  if (attemptedCount >= 3 || ratio >= 0.1) {
    return "medium";
  }

  return "low";
}

/**
 * Map each question id to its bank progress state.
 */
export function buildQuestionStateById({
  questionIds = [],
  knowledgeAttempts = [],
  questions = [],
} = {}) {
  const uniqueIds = [...new Set(questionIds.map(id => String(id)).filter(Boolean))];
  const statsById = new Map(
    buildKnowledgeQuestionStats(knowledgeAttempts, { questions }).map(stat => [
      String(stat.questionId),
      stat,
    ])
  );
  const lastByQuestion = buildLastAnswerByQuestion(knowledgeAttempts);
  const result = new Map();

  for (const questionId of uniqueIds) {
    const stat = statsById.get(questionId);

    if (!stat) {
      result.set(questionId, "not_started");
      continue;
    }

    result.set(
      questionId,
      classifyQuestionMasteryState({
        attempts: stat.attempts ?? 0,
        accuracy: stat.accuracy ?? 0,
        lastCorrect: lastByQuestion.has(questionId)
          ? lastByQuestion.get(questionId)
          : null,
      })
    );
  }

  return result;
}

function shuffleList(items = []) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Order bank questions: unseen → review → learning → mastered (light shuffle per tier).
 */
export function sortQuestionsByFocusGaps(
  questions = [],
  stateById = new Map()
) {
  const buckets = [[], [], [], []];

  for (const question of questions) {
    const questionId = String(question?.id ?? "");
    const progressState = stateById.get(questionId) ?? "not_started";
    const priority = QUESTION_STATE_PRIORITY[progressState] ?? 0;
    buckets[priority].push(question);
  }

  return [
    ...shuffleList(buckets[0]),
    ...shuffleList(buckets[1]),
    ...shuffleList(buckets[2]),
    ...shuffleList(buckets[3]),
  ];
}

/**
 * Count questions that reached mastered during a session.
 */
export function countNewlyMasteredQuestions({
  questionStateByIdBefore = new Map(),
  sessionAnswers = [],
  knowledgeAttempts = [],
  questions = [],
} = {}) {
  if (!sessionAnswers.length) {
    return 0;
  }

  const affectedIds = [
    ...new Set(
      sessionAnswers
        .map(answer => answer.question_id ?? answer.questionId)
        .filter(Boolean)
        .map(String)
    ),
  ];

  const stateAfter = buildQuestionStateById({
    questionIds: affectedIds,
    knowledgeAttempts: [
      ...knowledgeAttempts,
      {
        submitted_at: new Date().toISOString(),
        answers: sessionAnswers,
      },
    ],
    questions,
  });

  let count = 0;

  for (const questionId of affectedIds) {
    if (
      stateAfter.get(questionId) === "mastered" &&
      questionStateByIdBefore.get(questionId) !== "mastered"
    ) {
      count += 1;
    }
  }

  return count;
}

/**
 * Build topic-level question bank progress for a fixed question catalog.
 */
export function buildTopicQuestionProgress({
  topicId = null,
  topicName = "",
  questionIds = [],
  knowledgeAttempts = [],
  questions = [],
} = {}) {
  const uniqueIds = [...new Set(questionIds.map(id => String(id)).filter(Boolean))];
  const totalQuestions = uniqueIds.length;
  const counts = emptyCounts();

  if (!totalQuestions) {
    return {
      topicId,
      topicName,
      totalQuestions: 0,
      attemptedCount: 0,
      masteredCount: 0,
      learningCount: 0,
      needsReviewCount: 0,
      notStartedCount: 0,
      coveragePercent: 0,
      masteryPercent: 0,
      accuracyPercent: null,
      confidence: "low",
      hasData: false,
      counts,
      questionStateById: new Map(),
      knowledgeAttempts: [],
      questions: [],
    };
  }

  const statsById = new Map(
    buildKnowledgeQuestionStats(knowledgeAttempts, { questions }).map(stat => [
      String(stat.questionId),
      stat,
    ])
  );
  const lastByQuestion = buildLastAnswerByQuestion(knowledgeAttempts);
  const questionStateById = buildQuestionStateById({
    questionIds: uniqueIds,
    knowledgeAttempts,
    questions,
  });

  let accuracySum = 0;
  let accuracyCount = 0;

  for (const questionId of uniqueIds) {
    const stat = statsById.get(questionId);
    const progressState = questionStateById.get(questionId) ?? "not_started";

    if (!stat) {
      counts.not_started += 1;
      continue;
    }

    accuracySum += stat.accuracy ?? 0;
    accuracyCount += 1;
    counts[progressState] += 1;
  }

  const attemptedCount = totalQuestions - counts.not_started;

  return {
    topicId,
    topicName,
    totalQuestions,
    attemptedCount,
    masteredCount: counts.mastered,
    learningCount: counts.learning,
    needsReviewCount: counts.needs_review,
    notStartedCount: counts.not_started,
    coveragePercent: Math.round((attemptedCount / totalQuestions) * 100),
    masteryPercent: Math.round((counts.mastered / totalQuestions) * 100),
    accuracyPercent:
      accuracyCount > 0 ? Math.round(accuracySum / accuracyCount) : null,
    confidence: deriveProgressConfidence(attemptedCount, totalQuestions),
    hasData: true,
    counts,
    questionStateById,
    knowledgeAttempts,
    questions,
  };
}
