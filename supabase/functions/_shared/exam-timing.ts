export const DEFAULT_SECONDS_PER_QUESTION = 45

export function normalizeSecondsPerQuestion(value: unknown) {
  const parsed = parseInt(String(value ?? ""), 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SECONDS_PER_QUESTION
  }

  return parsed
}

export function countQuestionsInSchema(schema: {
  sections?: Array<{ questions?: unknown[] }>
} | null | undefined) {
  if (!schema?.sections?.length) {
    return 0
  }

  let count = 0

  for (const section of schema.sections) {
    count += section.questions?.length ?? 0
  }

  return count
}

export function computeExamDurationSeconds(
  questionCount: number,
  secondsPerQuestion: unknown
) {
  const count = Math.max(0, Number(questionCount) || 0)
  const perQuestion = normalizeSecondsPerQuestion(secondsPerQuestion)
  return count * perQuestion
}
