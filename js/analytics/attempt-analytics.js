/**
 * PrepOS Attempt Analytics Engine
 * ------------------------------------------------
 * PURPOSE:
 * Transform raw exam attempts into structured,
 * analytics-ready intelligence objects.
 *
 * RESPONSIBILITIES:
 * - Parse attempt answers
 * - Normalize attempt structure
 * - Aggregate question stats (scope-aware)
 * - Aggregate exam stats
 * - Aggregate option/distractor stats
 * - Compute attempt summaries
 *
 * ARCHITECTURE:
 * classify → filter by scope → aggregate
 *
 * IMPORTANT:
 * - NO DOM operations
 * - NO Supabase queries
 * - NO rendering logic
 *
 * PrepOS Analytics Architecture v1
 */


import {
  average,
  calculateAccuracy,
  calculateSkipRate,
  groupBy,
  sortDescBy,
  buildAnalyticsMeta,
  toNumber
} from "./analytics-core.js";

import {
  classifyAnalyticsScope,
  filterAssessmentEligible,
  filterKnowledgeEligible,
  isAssessmentEligible,
  isKnowledgeEligible
} from "./analytics-scope.js";



/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

export function normalizeAnswer(answer = {}) {

  const chosen =
    answer.chosen ??
    answer.selected ??
    "-";

  const correct =
    answer.correct ??
    null;

  const questionId =
    answer.question_id ??
    answer.questionId ??
    null;

  return {
    questionId,
    chosen,
    correct,

    isCorrect:
      typeof answer.is_correct === "boolean"
        ? answer.is_correct
        : chosen === correct,

    skipped:
      chosen === "-" ||
      chosen === null ||
      chosen === "",

    raw: answer
  };
}



export function normalizeAttempt(attempt = {}) {

  const answers =
    Array.isArray(attempt.answers)
      ? attempt.answers.map(normalizeAnswer)
      : [];

  return {
    id: attempt.id ?? null,

    examId:
      attempt.exam_id ??
      attempt.examId ??
      null,

    studentId:
      attempt.student_id ??
      null,

    studentName:
      attempt.student_name ??
      attempt.studentName ??
      "Unknown",

    score:
      toNumber(attempt.score),

    timeTaken:
      toNumber(
        attempt.time_taken ??
        attempt.timeTaken
      ),

    submittedAt:
      attempt.submitted_at ??
      attempt.submittedAt ??
      null,

    answers
  };
}



/* =========================================================
   SCOPE HELPERS
========================================================= */

/**
 * Build question lookup from catalog.
 */
export function buildQuestionLookup(questions = []) {

  const lookup = new Map();

  questions.forEach(question => {

    const id =
      question.question_id ??
      question.id;

    if (id != null) {
      lookup.set(String(id), question);
    }

  });

  return lookup;

}



/**
 * Resolve question entity for an answer.
 */
export function resolveQuestionForAnswer(
  answer = {},
  questionLookup = new Map()
) {

  const questionId = answer.questionId;

  if (questionId == null) {
    return {};
  }

  return (
    questionLookup.get(String(questionId)) ?? {
      question_id: questionId,
      id: questionId
    }
  );

}



/**
 * Attach analytics scope metadata to a stat row.
 */
export function attachScopeToStat(
  stat = {},
  question = {}
) {

  const scopeMeta =
    classifyAnalyticsScope(question);

  return {

    ...stat,

    scope: scopeMeta.scope,

    canonical: scopeMeta.canonical,

    experimental: scopeMeta.experimental,

    ephemeral: scopeMeta.ephemeral,

    assessmentEligible:
      scopeMeta.assessmentEligible,

    knowledgeEligible:
      scopeMeta.knowledgeEligible,

    adaptiveEligible:
      scopeMeta.adaptiveEligible

  };

}



/* =========================================================
   BASIC ATTEMPT HELPERS
========================================================= */

export function flattenAnswers(attempts = []) {

  return attempts.flatMap(attempt => {
    return normalizeAttempt(attempt).answers;
  });

}



export function countSkippedAnswers(answers = []) {

  return answers.filter(answer => {
    return answer.skipped;
  }).length;

}



export function countCorrectAnswers(answers = []) {

  return answers.filter(answer => {
    return answer.isCorrect;
  }).length;

}



/* =========================================================
   QUESTION ANALYTICS (SCOPE-AWARE)
========================================================= */

/**
 * Core aggregation: classify → filter → aggregate.
 */
function aggregateScopedQuestionStats(
  attempts = [],
  {
    questions = [],
    eligibilityCheck = null
  } = {}
) {

  const answers = flattenAnswers(attempts);

  const questionLookup =
    buildQuestionLookup(questions);

  const hasCatalog =
    questions.length > 0;

  const grouped = groupBy(
    answers,
    answer => answer.questionId ?? "snapshot_only"
  );

  const stats = [];

  for (const [questionId, questionAnswers] of Object.entries(grouped)) {

    const question =
      questionLookup.get(String(questionId)) ??
      { question_id: questionId, id: questionId };

    if (
      eligibilityCheck &&
      !eligibilityCheck(question)
    ) {
      continue;
    }

    if (
      !hasCatalog &&
      eligibilityCheck === isKnowledgeEligible &&
      !isKnowledgeEligible(question)
    ) {
      continue;
    }

    const attemptsCount =
      questionAnswers.length;

    const correct =
      countCorrectAnswers(questionAnswers);

    const skipped =
      countSkippedAnswers(questionAnswers);

    const incorrect =
      attemptsCount - correct - skipped;

    stats.push(
      attachScopeToStat({

        questionId,

        attempts: attemptsCount,

        correct,

        incorrect,

        skipped,

        accuracy:
          calculateAccuracy(
            correct,
            attemptsCount
          ),

        skipRate:
          calculateSkipRate(
            skipped,
            attemptsCount
          ),

        analyticsMeta:
          buildAnalyticsMeta({
            attempts: attemptsCount
          })

      }, question)
    );

  }

  return sortDescBy(stats, "attempts");

}



/**
 * Assessment intelligence: ALL published-eligible questions.
 */
export function buildAssessmentQuestionStats(
  attempts = [],
  { questions = [] } = {}
) {

  return aggregateScopedQuestionStats(attempts, {

    questions,

    eligibilityCheck:
      isAssessmentEligible

  });

}



/**
 * Knowledge intelligence: canonical bank questions only.
 */
export function buildKnowledgeQuestionStats(
  attempts = [],
  { questions = [] } = {}
) {

  return aggregateScopedQuestionStats(attempts, {

    questions,

    eligibilityCheck:
      isKnowledgeEligible

  });

}



/**
 * @deprecated Prefer buildAssessmentQuestionStats or buildKnowledgeQuestionStats.
 * Defaults to assessment pipeline for backward compatibility.
 */
export function buildQuestionStats(
  attempts = [],
  options = {}
) {

  return buildAssessmentQuestionStats(
    attempts,
    options
  );

}



/**
 * Filter stat rows to knowledge-eligible only.
 */
export function filterKnowledgeEligibleStats(
  questionStats = []
) {

  return questionStats.filter(stat => {
    return stat.knowledgeEligible === true;
  });

}



/**
 * Filter stat rows to assessment-eligible only.
 */
export function filterAssessmentEligibleStats(
  questionStats = []
) {

  return questionStats.filter(stat => {
    return stat.assessmentEligible !== false;
  });

}



/**
 * Find hardest questions (scope-aware modes).
 *
 * mode: "assessment" | "knowledge"
 */
export function hardestQuestions(
  questionStats = [],
  options = {}
) {

  let limit = 10;
  let mode = "assessment";

  if (typeof options === "number") {
    limit = options;
  } else if (options && typeof options === "object") {
    limit = options.limit ?? 10;
    mode = options.mode ?? "assessment";
  }

  let pool = [...questionStats];

  if (mode === "knowledge") {
    pool = filterKnowledgeEligibleStats(pool);
  } else {
    pool = filterAssessmentEligibleStats(pool);
  }

  return pool
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);

}



/**
 * Find easiest questions (scope-aware modes).
 */
export function easiestQuestions(
  questionStats = [],
  options = {}
) {

  let limit = 10;
  let mode = "assessment";

  if (typeof options === "number") {
    limit = options;
  } else if (options && typeof options === "object") {
    limit = options.limit ?? 10;
    mode = options.mode ?? "assessment";
  }

  let pool = [...questionStats];

  if (mode === "knowledge") {
    pool = filterKnowledgeEligibleStats(pool);
  } else {
    pool = filterAssessmentEligibleStats(pool);
  }

  return pool
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, limit);

}



/* =========================================================
   OPTION / DISTRACTOR ANALYTICS
========================================================= */

export function buildOptionStats(
  attempts = [],
  { questions = [] } = {}
) {

  const answers = flattenAnswers(attempts);

  const questionLookup =
    buildQuestionLookup(questions);

  const grouped = groupBy(
    answers,
    answer => answer.questionId ?? "snapshot_only"
  );

  const results = {};

  for (const [questionId, questionAnswers] of Object.entries(grouped)) {

    const question =
      resolveQuestionForAnswer(
        { questionId },
        questionLookup
      );

    if (!isAssessmentEligible(question)) {
      continue;
    }

    const optionCounts = {};

    questionAnswers.forEach(answer => {

      const option =
        answer.chosen ?? "-";

      if (!optionCounts[option]) {
        optionCounts[option] = 0;
      }

      optionCounts[option]++;

    });

    results[questionId] = {
      questionId,
      options: optionCounts
    };

  }

  return results;

}



export function mostChosenWrongOption(
  optionStats = {},
  correctOption
) {

  let highest = 0;

  let selectedOption = null;

  for (const [option, count] of Object.entries(optionStats)) {

    if (option === correctOption) {
      continue;
    }

    if (count > highest) {
      highest = count;
      selectedOption = option;
    }

  }

  return {
    option: selectedOption,
    count: highest
  };

}



/* =========================================================
   EXAM ANALYTICS
========================================================= */

export function buildExamStats(
  attempts = [],
  { questions = [] } = {}
) {

  const normalized =
    attempts.map(normalizeAttempt);

  const scores =
    normalized.map(a => a.score);

  const times =
    normalized.map(a => a.timeTaken);

  const assessmentStats =
    buildAssessmentQuestionStats(
      normalized,
      { questions }
    );

  const knowledgeStats =
    buildKnowledgeQuestionStats(
      normalized,
      { questions }
    );

  return {

    attempts:
      normalized.length,

    averageScore:
      average(scores),

    highestScore:
      Math.max(...scores, 0),

    lowestScore:
      Math.min(...scores, 0),

    averageTime:
      average(times),

    questionStats:
      assessmentStats,

    assessmentQuestionStats:
      assessmentStats,

    knowledgeQuestionStats:
      knowledgeStats,

    hardestQuestions:
      hardestQuestions(
        assessmentStats,
        { mode: "assessment", limit: 5 }
      ),

    easiestQuestions:
      easiestQuestions(
        assessmentStats,
        { mode: "assessment", limit: 5 }
      ),

    hardestKnowledgeQuestions:
      hardestQuestions(
        knowledgeStats,
        { mode: "knowledge", limit: 5 }
      ),

    analyticsMeta:
      buildAnalyticsMeta({
        attempts: normalized.length
      })

  };
}



/* =========================================================
   STUDENT ANALYTICS
========================================================= */

export function buildStudentStats(
  attempts = []
) {

  const grouped = groupBy(
    attempts,
    attempt =>
      attempt.student_id ??
      attempt.student_name ??
      "unknown"
  );

  return Object.entries(grouped).map(
    ([studentKey, studentAttempts]) => {

      const normalized =
        studentAttempts.map(normalizeAttempt);

      const scores =
        normalized.map(a => a.score);

      const times =
        normalized.map(a => a.timeTaken);

      return {

        studentKey,

        attempts:
          normalized.length,

        averageScore:
          average(scores),

        averageTime:
          average(times),

        bestScore:
          Math.max(...scores, 0),

        lowestScore:
          Math.min(...scores, 0)

      };

    }
  );

}



/* =========================================================
   QUESTION SET ANALYTICS
========================================================= */

export function buildQuestionSetStats({
  attempts = [],
  questionSetId = null,
  questions = []
} = {}) {

  const assessmentStats =
    buildAssessmentQuestionStats(
      attempts,
      { questions }
    );

  return {

    questionSetId,

    totalQuestions:
      assessmentStats.length,

    hardestQuestions:
      hardestQuestions(
        assessmentStats,
        { mode: "assessment" }
      ),

    easiestQuestions:
      easiestQuestions(
        assessmentStats,
        { mode: "assessment" }
      ),

    averageAccuracy:
      average(
        assessmentStats.map(q => q.accuracy)
      ),

    experimental: true

  };
}



/* =========================================================
   FILTER HELPERS
========================================================= */

export function filterAttemptsByExam(
  attempts = [],
  examId
) {

  return attempts.filter(attempt => {

    return (
      attempt.exam_id === examId ||
      attempt.examId === examId
    );

  });

}



export function filterAttemptsByStudent(
  attempts = [],
  studentId
) {

  return attempts.filter(attempt => {

    return (
      attempt.student_id === studentId
    );

  });

}



/* =========================================================
   ANALYTICS HEALTH HELPERS
========================================================= */

export function detectMissingQuestionIds(
  attempts = []
) {

  const answers = flattenAnswers(attempts);

  const missing = answers.filter(answer => {
    return !answer.questionId;
  });

  return {

    totalAnswers:
      answers.length,

    missingQuestionIds:
      missing.length,

    healthy:
      missing.length === 0

  };

}



/* =========================================================
   RE-EXPORTS (scope filters for callers)
========================================================= */

export {
  filterAssessmentEligible,
  filterKnowledgeEligible
};
