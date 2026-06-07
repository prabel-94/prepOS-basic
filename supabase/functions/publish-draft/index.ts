import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"
import {
  computeExamDurationSeconds,
  normalizeSecondsPerQuestion,
} from "../_shared/exam-timing.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
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

    const { draftId } = await req.json()

    if (!draftId) {
      return jsonResponse({ error: "Missing draftId" }, 400)
    }

    const { data: draft, error: fetchError } = await adminClient
      .from("draft_exams")
      .select("title, duration, schema_json, logo_url, created_by")
      .eq("id", draftId)
      .single()

    if (fetchError || !draft) {
      return jsonResponse({ error: "Draft not found" }, 404)
    }

    if (role !== "admin" && draft.created_by !== user.id) {
      return jsonResponse({ error: "You can publish only drafts you created" }, 403)
    }

    const schema = draft.schema_json

    if (!schema?.sections?.length) {
      return jsonResponse({ error: "No sections" }, 400)
    }

    let questionCount = 0

    for (const section of schema.sections) {

      if (!section.questions?.length) continue

      for (const q of section.questions) {

        questionCount++

        if (!q.question && !q.text) {
          return jsonResponse({ error: "Question text missing" }, 400)
        }

        if (!q.options || q.options.length < 2) {
          return jsonResponse({ error: "Invalid options" }, 400)
        }

        if (q.correct === undefined || q.correct === null) {
          return jsonResponse({ error: "Correct answer missing" }, 400)
        }
      }
    }

    if (questionCount === 0) {
      return jsonResponse({ error: "No questions" }, 400)
    }

    const secondsPerQuestion = normalizeSecondsPerQuestion(draft.duration)
    const totalDurationSeconds = computeExamDurationSeconds(
      questionCount,
      secondsPerQuestion
    )

    const { data: exam, error: examError } = await adminClient
      .from("exam_sessions")
      .insert({
        title: draft.title,
        duration: totalDurationSeconds,
        schema_json: draft.schema_json,
        logo_url: draft.logo_url,
        created_by: draft.created_by || user.id,
      })
      .select()
      .single()

    if (examError || !exam) {
      return jsonResponse({ error: examError?.message || "Exam insert failed" }, 400)
    }

    const { error: lockError } = await adminClient
      .from("draft_exams")
      .update({
        status: "published",
        published_exam_id: exam.id,
      })
      .eq("id", draftId)

    if (lockError) {
      return jsonResponse({ error: lockError.message }, 400)
    }

    const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "") ?? ""
    const examLink = siteUrl
      ? `${siteUrl}/exam.html?id=${exam.id}`
      : `/exam.html?id=${exam.id}`

    return jsonResponse({
      success: true,
      examId: exam.id,
      examLink,
    })

  } catch (e) {

    console.error("publish-draft error →", e)

    const message = e instanceof Error ? e.message : "Publish failed"
    return jsonResponse({ error: message }, 500)
  }
})
