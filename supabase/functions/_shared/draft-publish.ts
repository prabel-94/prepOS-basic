import {
  computeExamDurationSeconds,
  normalizeSecondsPerQuestion,
} from "./exam-timing.ts"

export type DraftQuestion = {
  id?: string
  text?: string
  question?: string
  options?: unknown[]
  correct?: unknown
}

type DraftSchema = {
  sections?: Array<{ questions?: DraftQuestion[] }>
}

export function getPublishedQuestionIds(draft: {
  published_question_ids?: unknown
} | null | undefined) {
  const raw = draft?.published_question_ids

  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter((id): id is string => typeof id === "string" && id.trim())
}

export function flattenDraftQuestions(schema: DraftSchema | null | undefined) {
  const questions: DraftQuestion[] = []

  for (const section of schema?.sections ?? []) {
    for (const question of section?.questions ?? []) {
      questions.push(question)
    }
  }

  return questions
}

export function validateDraftQuestion(question: DraftQuestion) {
  if (!question.question && !question.text) {
    return "Question text missing"
  }

  if (!question.options || question.options.length < 2) {
    return "Invalid options"
  }

  if (question.correct === undefined || question.correct === null) {
    return "Correct answer missing"
  }

  return null
}

export function buildPublishedSchema(questions: DraftQuestion[]) {
  return {
    sections: [
      {
        title: "Section 1",
        questions,
      },
    ],
  }
}

export function buildExamLink(examId: string) {
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "") ?? ""
  return siteUrl
    ? `${siteUrl}/exam.html?id=${examId}`
    : `/exam.html?id=${examId}`
}

export function resolvePublishedDuration(
  questionCount: number,
  draftDuration: unknown
) {
  const secondsPerQuestion = normalizeSecondsPerQuestion(draftDuration)
  return {
    secondsPerQuestion,
    totalDurationSeconds: computeExamDurationSeconds(
      questionCount,
      secondsPerQuestion
    ),
  }
}
