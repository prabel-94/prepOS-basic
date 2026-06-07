import {
  formatExamDuration,
  getExamQuestionCount,
} from "../student/student-exam-meta.js";

export const DEFAULT_SECONDS_PER_QUESTION = 45;

export function normalizeSecondsPerQuestion(value) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SECONDS_PER_QUESTION;
  }

  return parsed;
}

export function computeExamDurationSeconds(questionCount, secondsPerQuestion) {
  const count = Math.max(0, Number(questionCount) || 0);
  const perQuestion = normalizeSecondsPerQuestion(secondsPerQuestion);
  return count * perQuestion;
}

export function describeComputedExamDuration(schemaJson, secondsPerQuestion) {
  const questionCount = getExamQuestionCount(schemaJson) ?? 0;
  const perQuestion = normalizeSecondsPerQuestion(secondsPerQuestion);
  const totalSeconds = computeExamDurationSeconds(questionCount, perQuestion);
  const totalLabel = formatExamDuration(totalSeconds);

  if (questionCount === 0) {
    return `Total exam time: — (${perQuestion} sec per question; add questions to calculate)`;
  }

  return `Total exam time: ${totalLabel} (${questionCount} question${
    questionCount === 1 ? "" : "s"
  } × ${perQuestion} sec)`;
}
