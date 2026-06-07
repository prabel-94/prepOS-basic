import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  )
}

type ExamRow = {
  id: string
  created_by: string
  title: string
  source_draft_id: string | null
  series_id: string | null
}

async function deleteExamsByIds(
  adminClient: ReturnType<typeof createClient>,
  exams: ExamRow[],
  options: { seriesId?: string } = {}
) {
  const examIds = exams.map((exam) => exam.id)

  if (!examIds.length) {
    return
  }

  const { error: assignmentError } = await adminClient
    .from("exam_assignments")
    .delete()
    .in("exam_id", examIds)

  if (assignmentError) {
    throw new Error(
      `Failed to delete exam assignments: ${assignmentError.message}`
    )
  }

  const { error: attemptsError } = await adminClient
    .from("exam_attempts")
    .delete()
    .in("exam_id", examIds)

  if (attemptsError) {
    throw new Error(
      `Failed to delete exam attempts: ${attemptsError.message}`
    )
  }

  const sourceDraftIds = [
    ...new Set(
      exams
        .map((exam) => exam.source_draft_id)
        .filter((id): id is string => typeof id === "string" && !!id)
    ),
  ]

  if (options.seriesId) {
    const { error: seriesDraftError } = await adminClient
      .from("draft_exams")
      .update({
        status: "draft",
        published_exam_id: null,
        publish_series_id: null,
        published_question_ids: [],
      })
      .eq("publish_series_id", options.seriesId)

    if (seriesDraftError) {
      throw new Error(
        `Failed to reset series draft: ${seriesDraftError.message}`
      )
    }
  }

  const { error: linkedDraftError } = await adminClient
    .from("draft_exams")
    .update({
      status: "draft",
      published_exam_id: null,
      ...(options.seriesId
        ? {
            publish_series_id: null,
            published_question_ids: [],
          }
        : {}),
    })
    .in("published_exam_id", examIds)

  if (linkedDraftError) {
    throw new Error(
      `Failed to unlink related drafts: ${linkedDraftError.message}`
    )
  }

  if (options.seriesId && sourceDraftIds.length) {
    const { error: sourceDraftError } = await adminClient
      .from("draft_exams")
      .update({
        status: "draft",
        published_exam_id: null,
        publish_series_id: null,
        published_question_ids: [],
      })
      .in("id", sourceDraftIds)

    if (sourceDraftError) {
      throw new Error(
        `Failed to reset source draft: ${sourceDraftError.message}`
      )
    }
  }

  const { error: deleteError } = await adminClient
    .from("exam_sessions")
    .delete()
    .in("id", examIds)

  if (deleteError) {
    throw new Error(`Failed to delete exam: ${deleteError.message}`)
  }
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405
    )
  }

  try {

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL")

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY")

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      return jsonResponse(
        {
          error:
            "Missing Supabase environment variables",
        },
        500
      )
    }

    const authHeader =
      req.headers.get("Authorization") || ""

    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Missing authorization token" },
        401
      )
    }

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse(
        { error: "Invalid session" },
        401
      )
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    )

    const body = await req
      .json()
      .catch(() => ({}))

    const examId = body?.examId
    const seriesId = body?.seriesId

    if (!examId && !seriesId) {
      return jsonResponse(
        { error: "Missing examId or seriesId" },
        400
      )
    }

    if (examId && seriesId) {
      return jsonResponse(
        { error: "Provide examId or seriesId, not both" },
        400
      )
    }

    const {
      data: profile,
      error: profileError,
    } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse(
        { error: "User profile not found" },
        403
      )
    }

    const role = profile.role

    if (
      role !== "teacher" &&
      role !== "admin"
    ) {
      return jsonResponse(
        {
          error:
            "Only teachers and admins can delete exams",
        },
        403
      )
    }

    let exams: ExamRow[] = []

    if (seriesId) {
      const {
        data: seriesExams,
        error: seriesError,
      } = await adminClient
        .from("exam_sessions")
        .select("id, created_by, title, source_draft_id, series_id")
        .eq("series_id", seriesId)
        .order("part_index", { ascending: true })

      if (seriesError) {
        return jsonResponse(
          { error: "Failed to load exam series" },
          400
        )
      }

      exams = seriesExams ?? []

      if (!exams.length) {
        return jsonResponse(
          { error: "Exam series not found" },
          404
        )
      }
    } else {
      const {
        data: exam,
        error: examError,
      } = await adminClient
        .from("exam_sessions")
        .select("id, created_by, title, source_draft_id, series_id")
        .eq("id", examId)
        .single()

      if (examError || !exam) {
        return jsonResponse(
          { error: "Exam not found" },
          404
        )
      }

      exams = [exam]
    }

    if (
      role !== "admin" &&
      exams.some((exam) => exam.created_by !== user.id)
    ) {
      return jsonResponse(
        {
          error:
            "You can delete only exams you created",
        },
        403
      )
    }

    await deleteExamsByIds(
      adminClient,
      exams,
      seriesId ? { seriesId } : {}
    )

    if (seriesId) {
      return jsonResponse({
        success: true,
        deleted_series_id: seriesId,
        deleted_exam_ids: exams.map((exam) => exam.id),
        deleted_count: exams.length,
      })
    }

    const exam = exams[0]

    return jsonResponse({
      success: true,
      deleted_exam_id: exam.id,
      deleted_exam_title: exam.title,
    })

  } catch (error) {

    console.error(
      "delete-published-exam error",
      error
    )

    const message =
      error instanceof Error
        ? error.message
        : "Unexpected server error"

    return jsonResponse(
      {
        error: message,
      },
      500
    )
  }
})
