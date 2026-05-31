/**
 * Pure helpers for exam metadata display (no Supabase).
 */

export function extractRawQuestions(schemaJson = {}) {
  if (schemaJson?.sections?.length) {
    return schemaJson.sections.flatMap((section) => section.questions || []);
  }

  return schemaJson?.questions || [];
}

export function getExamQuestionCount(schemaJson = {}) {
  const count = extractRawQuestions(schemaJson).length;
  return count > 0 ? count : null;
}

export function formatExamDuration(seconds) {
  if (!seconds || seconds <= 0) {
    return null;
  }

  const mins = Math.round(seconds / 60);
  return `${mins} Minute${mins === 1 ? "" : "s"}`;
}

export function collectTopicsFromRawQuestions(rawQuestions = []) {
  const topics = new Set();

  for (const question of rawQuestions) {
    const list = Array.isArray(question?.topics) ? question.topics : [];
    for (const topic of list) {
      const label = String(topic ?? "").trim();
      if (label) {
        topics.add(label);
      }
    }
  }

  return [...topics].sort((a, b) => a.localeCompare(b));
}

export function enrichAssignedExam(examSession = {}) {
  const questionCount = getExamQuestionCount(examSession.schema_json);
  const durationLabel = formatExamDuration(examSession.duration);

  return {
    ...examSession,
    questionCount,
    durationLabel,
  };
}

export const LOCAL_ATTEMPT_KEY_PREFIX = "prepos-attempt-";

export function readLocalExamAttempt(examId) {
  if (!examId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(`${LOCAL_ATTEMPT_KEY_PREFIX}${examId}`);
    if (!raw) {
      return null;
    }

    const state = JSON.parse(raw);
    if (state?.examId && state.examId !== examId) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

export function groupLatestAttemptsByExamId(attemptRows = []) {
  const latestByExam = new Map();

  for (const row of attemptRows) {
    const examId = row.exam_id;
    if (!examId || latestByExam.has(examId)) {
      continue;
    }
    latestByExam.set(examId, row);
  }

  return latestByExam;
}

export function resolveExamAttemptPresentation(exam = {}, latestServerAttempt = null, localAttempt = null) {
  const total =
    exam.questionCount ??
    latestServerAttempt?.question_count ??
    localAttempt?.total ??
    null;

  if (latestServerAttempt || localAttempt?.status === "submitted") {
    const score = Number(latestServerAttempt?.score ?? localAttempt?.score ?? 0);
    const scoreTotal = total ?? latestServerAttempt?.question_count ?? localAttempt?.total ?? "?";

    return {
      attemptStatus: "completed",
      score,
      total: scoreTotal,
      buttonLabel: "View Results",
    };
  }

  if (localAttempt?.status === "in_progress" && localAttempt?.startedAt) {
    return {
      attemptStatus: "in_progress",
      buttonLabel: "Continue Exam",
    };
  }

  return {
    attemptStatus: "not_attempted",
    buttonLabel: "Start Exam",
  };
}

export function enrichAssignedExamsWithAttemptStatus(exams = [], attemptRows = []) {
  const latestByExam = groupLatestAttemptsByExamId(attemptRows);

  return exams.map((exam) => {
    const presentation = resolveExamAttemptPresentation(
      exam,
      latestByExam.get(exam.id) ?? null,
      readLocalExamAttempt(exam.id)
    );

    return {
      ...exam,
      ...presentation,
    };
  });
}

export function mapRecentAttemptRows(attemptRows = [], limit = 5) {
  return attemptRows.slice(0, limit).map((row) => ({
    examId: row.exam_id,
    examTitle: row.exam_sessions?.title ?? "Exam",
    score: row.score,
    total: row.question_count,
    submittedAt: row.submitted_at,
  }));
}
