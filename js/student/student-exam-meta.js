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
