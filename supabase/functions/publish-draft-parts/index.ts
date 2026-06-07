import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"
import {
  buildExamLink,
  buildPublishedSchema,
  flattenDraftQuestions,
  getPublishedQuestionIds,
  resolvePublishedDuration,
  validateDraftQuestion,
  type DraftQuestion,
} from "../_shared/draft-publish.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

type PartInput = {
  title?: string
  questionIds?: string[]
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const auth = await authenticateTeacherRequest(
      req,
      "Only teachers and admins can publish drafts"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, role, adminClient } = auth
    const body = await req.json().catch(() => ({}))
    const draftId =
      typeof body.draftId === "string" ? body.draftId.trim() : ""
    const parts = Array.isArray(body.parts) ? body.parts as PartInput[] : []
    const allowPartial = body.allowPartial !== false

    if (!draftId) {
      return jsonResponse({ error: "Missing draftId" }, 400)
    }

    if (!parts.length) {
      return jsonResponse({ error: "Add at least one part" }, 400)
    }

    const { data: draft, error: fetchError } = await adminClient
      .from("draft_exams")
      .select(
        "title, duration, schema_json, logo_url, created_by, status, publish_series_id, published_question_ids, published_exam_id"
      )
      .eq("id", draftId)
      .single()

    if (fetchError || !draft) {
      return jsonResponse({ error: "Draft not found" }, 404)
    }

    if (role !== "admin" && draft.created_by !== user.id) {
      return jsonResponse({ error: "You can publish only drafts you created" }, 403)
    }

    const draftQuestions = flattenDraftQuestions(draft.schema_json)

    if (!draftQuestions.length) {
      return jsonResponse({ error: "No questions" }, 400)
    }

    for (const question of draftQuestions) {
      const validationError = validateDraftQuestion(question)
      if (validationError) {
        return jsonResponse({ error: validationError }, 400)
      }
    }

    const questionById = new Map<string, DraftQuestion>()
    const alreadyPublished = new Set(getPublishedQuestionIds(draft))

    for (const question of draftQuestions) {
      if (!question.id || typeof question.id !== "string") {
        return jsonResponse({ error: "Draft question is missing a stable id" }, 400)
      }

      questionById.set(question.id, question)
    }

    const seenQuestionIds = new Set<string>()
    const normalizedParts: Array<{ title: string; questionIds: string[] }> = []

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const title = String(part?.title || "").trim()
      const questionIds = Array.isArray(part?.questionIds)
        ? part.questionIds.filter(
            (id): id is string => typeof id === "string" && id.trim()
          )
        : []

      if (!title) {
        return jsonResponse({ error: `Part ${index + 1} needs a title` }, 400)
      }

      if (!questionIds.length) {
        return jsonResponse(
          { error: `Part ${index + 1} must include at least one question` },
          400
        )
      }

      for (const questionId of questionIds) {
        if (!questionById.has(questionId)) {
          return jsonResponse({ error: "Unknown question in split plan" }, 400)
        }

        if (alreadyPublished.has(questionId)) {
          return jsonResponse(
            { error: "One or more selected questions were already published" },
            400
          )
        }

        if (seenQuestionIds.has(questionId)) {
          return jsonResponse(
            { error: "Each question can belong to only one part" },
            400
          )
        }

        seenQuestionIds.add(questionId)
      }

      normalizedParts.push({ title, questionIds })
    }

    const unpublishedCount = [...questionById.keys()].filter(
      (id) => !alreadyPublished.has(id)
    ).length

    if (!allowPartial && seenQuestionIds.size !== unpublishedCount) {
      return jsonResponse(
        {
          error:
            "Every unpublished question in the draft must be assigned to a part",
        },
        400
      )
    }

    let seriesId =
      typeof draft.publish_series_id === "string" && draft.publish_series_id
        ? draft.publish_series_id
        : crypto.randomUUID()

    const { data: existingParts } = await adminClient
      .from("exam_sessions")
      .select("part_index")
      .eq("source_draft_id", draftId)
      .order("part_index", { ascending: false })
      .limit(1)

    let nextPartIndex = Number(existingParts?.[0]?.part_index ?? 0) + 1

    const publishedParts: Array<{
      examId: string
      title: string
      examLink: string
      questionCount: number
      durationSeconds: number
      partIndex: number
    }> = []

    for (const part of normalizedParts) {
      const questions = part.questionIds
        .map((questionId) => {
          const question = questionById.get(questionId)
          return question ? { ...question } : null
        })
        .filter(Boolean) as DraftQuestion[]

      const { totalDurationSeconds } = resolvePublishedDuration(
        questions.length,
        draft.duration
      )

      const partIndex = nextPartIndex
      nextPartIndex += 1

      const { data: exam, error: examError } = await adminClient
        .from("exam_sessions")
        .insert({
          title: part.title,
          duration: totalDurationSeconds,
          schema_json: buildPublishedSchema(questions),
          logo_url: draft.logo_url,
          created_by: draft.created_by || user.id,
          source_draft_id: draftId,
          series_id: seriesId,
          part_index: partIndex,
          require_sequential_parts: partIndex > 1,
        })
        .select("id")
        .single()

      if (examError || !exam) {
        return jsonResponse(
          { error: examError?.message || "Exam insert failed" },
          400
        )
      }

      publishedParts.push({
        examId: exam.id,
        title: part.title,
        examLink: buildExamLink(exam.id),
        questionCount: questions.length,
        durationSeconds: totalDurationSeconds,
        partIndex,
      })
    }

    const maxPartIndex = Math.max(
      Number(existingParts?.[0]?.part_index ?? 0),
      ...publishedParts.map((part) => part.partIndex)
    )

    await adminClient
      .from("exam_sessions")
      .update({
        part_count: maxPartIndex,
        require_sequential_parts: maxPartIndex > 1,
      })
      .eq("series_id", seriesId)

    const mergedPublishedIds = [
      ...new Set([...alreadyPublished, ...seenQuestionIds]),
    ]
    const allQuestionIds = [...questionById.keys()]
    const fullyPublished = allQuestionIds.every((id) =>
      mergedPublishedIds.includes(id)
    )

    const { error: lockError } = await adminClient
      .from("draft_exams")
      .update({
        status: fullyPublished ? "published" : "partially_published",
        published_exam_id:
          draft.published_exam_id ?? publishedParts[0]?.examId ?? null,
        publish_series_id: seriesId,
        published_question_ids: mergedPublishedIds,
      })
      .eq("id", draftId)

    if (lockError) {
      return jsonResponse({ error: lockError.message }, 400)
    }

    return jsonResponse({
      success: true,
      draftId,
      seriesId,
      fullyPublished,
      remainingQuestionCount: allQuestionIds.length - mergedPublishedIds.length,
      publishedQuestionIds: mergedPublishedIds,
      parts: publishedParts,
      examIds: publishedParts.map((part) => part.examId),
    })
  } catch (error) {
    console.error("publish-draft-parts error →", error)
    const message = error instanceof Error ? error.message : "Publish failed"
    return jsonResponse({ error: message }, 500)
  }
})
