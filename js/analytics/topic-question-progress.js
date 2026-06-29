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
  const sorted = sortAttemptsChronologically(attempts);
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

function sortAttemptsChronologically(attempts = []) {
  return [...attempts].sort((a, b) => {
    const left = normalizeAttempt(a);
    const right = normalizeAttempt(b);
    const ta = new Date(left.submittedAt ?? 0).getTime();
    const tb = new Date(right.submittedAt ?? 0).getTime();
    return ta - tb;
  });
}

/**
 * Latest attempt timestamp per question from attempt rows.
 */
export function buildLastAnswerAtByQuestion(attempts = []) {
  const sorted = sortAttemptsChronologically(attempts);
  const lastAt = new Map();

  for (const attempt of sorted) {
    const normalized = normalizeAttempt(attempt);
    const submittedAt = normalized.submittedAt ?? null;

    for (const answer of normalized.answers) {
      if (answer.questionId && submittedAt) {
        lastAt.set(String(answer.questionId), submittedAt);
      }
    }
  }

  return lastAt;
}

function resolveLastCorrect({
  persistedCorrect = null,
  persistedAt = null,
  attemptCorrect = null,
  attemptAt = null,
} = {}) {
  if (persistedAt == null) {
    return attemptCorrect ?? null;
  }

  if (attemptAt == null) {
    return persistedCorrect ?? null;
  }

  const persistedTime = new Date(persistedAt).getTime();
  const attemptTime = new Date(attemptAt).getTime();

  if (Number.isNaN(persistedTime)) {
    return attemptCorrect ?? persistedCorrect ?? null;
  }

  if (Number.isNaN(attemptTime)) {
    return persistedCorrect ?? null;
  }

  return persistedTime >= attemptTime ? persistedCorrect : attemptCorrect;
}

function buildMergedQuestionMetrics(
  questionId,
  {
    persisted = null,
    examStat = null,
    fallbackStat = null,
    examLastCorrect = null,
    examLastAt = null,
    fallbackLastCorrect = null,
  } = {}
) {
  if (persisted) {
    const attempts = (persisted.seen_count ?? 0) + (examStat?.attempts ?? 0);
    const correct = (persisted.correct_count ?? 0) + (examStat?.correct ?? 0);
    const accuracy = attempts > 0 ? (correct / attempts) * 100 : 0;

    return {
      attempts,
      correct,
      accuracy,
      lastCorrect: resolveLastCorrect({
        persistedCorrect: persisted.last_correct,
        persistedAt: persisted.last_seen_at,
        attemptCorrect: examLastCorrect,
        attemptAt: examLastAt,
      }),
    };
  }

  if (!fallbackStat) {
    return {
      attempts: 0,
      correct: 0,
      accuracy: 0,
      lastCorrect: null,
    };
  }

  return {
    attempts: fallbackStat.attempts ?? 0,
    correct: fallbackStat.correct ?? 0,
    accuracy: fallbackStat.accuracy ?? 0,
    lastCorrect: fallbackLastCorrect ?? null,
  };
}

export function filterExamKnowledgeAttempts(attempts = []) {
  return attempts.filter(attempt => attempt?.submissionMode !== "practice");
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
  examAttempts = null,
  questions = [],
  persistedStatsById = new Map(),
} = {}) {
  const uniqueIds = [...new Set(questionIds.map(id => String(id)).filter(Boolean))];
  const examOnlyAttempts =
    examAttempts ?? filterExamKnowledgeAttempts(knowledgeAttempts);
  const examStats = buildKnowledgeQuestionStats(examOnlyAttempts, { questions });
  const fallbackStats = buildKnowledgeQuestionStats(knowledgeAttempts, { questions });
  const examStatsById = new Map(
    examStats.map(stat => [String(stat.questionId), stat])
  );
  const fallbackStatsById = new Map(
    fallbackStats.map(stat => [String(stat.questionId), stat])
  );
  const examLastByQuestion = buildLastAnswerByQuestion(examOnlyAttempts);
  const examLastAtByQuestion = buildLastAnswerAtByQuestion(examOnlyAttempts);
  const fallbackLastByQuestion = buildLastAnswerByQuestion(knowledgeAttempts);
  const result = new Map();

  for (const questionId of uniqueIds) {
    const metrics = buildMergedQuestionMetrics(questionId, {
      persisted: persistedStatsById.get(questionId) ?? null,
      examStat: examStatsById.get(questionId) ?? null,
      fallbackStat: fallbackStatsById.get(questionId) ?? null,
      examLastCorrect: examLastByQuestion.get(questionId),
      examLastAt: examLastAtByQuestion.get(questionId),
      fallbackLastCorrect: fallbackLastByQuestion.get(questionId),
    });

    result.set(
      questionId,
      classifyQuestionMasteryState({
        attempts: metrics.attempts,
        accuracy: metrics.accuracy,
        lastCorrect: metrics.lastCorrect,
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
  questionStateByIdAfter = null,
  sessionAnswers = [],
  knowledgeAttempts = [],
  questions = [],
  persistedStatsById = new Map(),
} = {}) {
  if (questionStateByIdAfter) {
    let count = 0;

    for (const [questionId, after] of questionStateByIdAfter.entries()) {
      if (
        after === "mastered" &&
        questionStateByIdBefore.get(questionId) !== "mastered"
      ) {
        count += 1;
      }
    }

    return count;
  }

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
    knowledgeAttempts,
    questions,
    persistedStatsById,
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
  examAttempts = null,
  questions = [],
  persistedStatsById = new Map(),
} = {}) {
  const uniqueIds = [...new Set(questionIds.map(id => String(id)).filter(Boolean))];
  const totalQuestions = uniqueIds.length;
  const counts = emptyCounts();
  const examOnlyAttempts =
    examAttempts ?? filterExamKnowledgeAttempts(knowledgeAttempts);

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
      persistedStatsById,
      knowledgeAttempts: [],
      examAttempts: [],
      questions: [],
    };
  }

  const examStats = buildKnowledgeQuestionStats(examOnlyAttempts, { questions });
  const fallbackStats = buildKnowledgeQuestionStats(knowledgeAttempts, { questions });
  const examStatsById = new Map(
    examStats.map(stat => [String(stat.questionId), stat])
  );
  const fallbackStatsById = new Map(
    fallbackStats.map(stat => [String(stat.questionId), stat])
  );
  const examLastByQuestion = buildLastAnswerByQuestion(examOnlyAttempts);
  const examLastAtByQuestion = buildLastAnswerAtByQuestion(examOnlyAttempts);
  const fallbackLastByQuestion = buildLastAnswerByQuestion(knowledgeAttempts);
  const questionStateById = buildQuestionStateById({
    questionIds: uniqueIds,
    knowledgeAttempts,
    examAttempts: examOnlyAttempts,
    questions,
    persistedStatsById,
  });

  let accuracySum = 0;
  let accuracyCount = 0;

  for (const questionId of uniqueIds) {
    const progressState = questionStateById.get(questionId) ?? "not_started";
    const metrics = buildMergedQuestionMetrics(questionId, {
      persisted: persistedStatsById.get(questionId) ?? null,
      examStat: examStatsById.get(questionId) ?? null,
      fallbackStat: fallbackStatsById.get(questionId) ?? null,
      examLastCorrect: examLastByQuestion.get(questionId),
      examLastAt: examLastAtByQuestion.get(questionId),
      fallbackLastCorrect: fallbackLastByQuestion.get(questionId),
    });

    if (!metrics.attempts) {
      counts.not_started += 1;
      continue;
    }

    accuracySum += metrics.accuracy ?? 0;
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
    persistedStatsById,
    knowledgeAttempts,
    examAttempts: examOnlyAttempts,
    questions,
  };
}
