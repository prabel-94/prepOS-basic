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

Deno.serve(async (req) => {

  // =========================
  // CORS
  // =========================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  // =========================
  // METHOD VALIDATION
  // =========================

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405
    )
  }

  try {

    // =========================
    // ENV
    // =========================

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

    // =========================
    // AUTH HEADER
    // =========================

    const authHeader =
      req.headers.get("Authorization") || ""

    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Missing authorization token" },
        401
      )
    }

    // =========================
    // USER CLIENT
    // Used ONLY for auth validation
    // =========================

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

    // =========================
    // VALIDATE USER
    // =========================

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

    // =========================
    // ADMIN CLIENT
    // Used for privileged DB ops
    // =========================

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    )

    // =========================
    // REQUEST BODY
    // =========================

    const body = await req
      .json()
      .catch(() => ({}))

    const examId = body?.examId

    if (!examId) {
      return jsonResponse(
        { error: "Missing examId" },
        400
      )
    }

    // =========================
    // GET USER ROLE
    // =========================

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

    // =========================
    // FETCH EXAM
    // =========================

    const {
      data: exam,
      error: examError,
    } = await adminClient
      .from("exam_sessions")
      .select("id, created_by, title")
      .eq("id", examId)
      .single()

    if (examError || !exam) {
      return jsonResponse(
        { error: "Exam not found" },
        404
      )
    }

    // =========================
    // OWNERSHIP CHECK
    // =========================

    if (
      role !== "admin" &&
      exam.created_by !== user.id
    ) {
      return jsonResponse(
        {
          error:
            "You can delete only exams you created",
        },
        403
      )
    }

    // =========================
    // DELETE ASSIGNMENTS
    // =========================

    const {
      error: assignmentError,
    } = await adminClient
      .from("exam_assignments")
      .delete()
      .eq("exam_id", examId)

    if (assignmentError) {
      console.error(
        "Assignment delete failed",
        assignmentError
      )

      return jsonResponse(
        {
          error:
            "Failed to delete exam assignments",
          details: assignmentError.message,
        },
        400
      )
    }

    // =========================
    // DELETE ATTEMPTS
    // =========================

    const {
      error: attemptsError,
    } = await adminClient
      .from("exam_attempts")
      .delete()
      .eq("exam_id", examId)

    if (attemptsError) {
      console.error(
        "Attempt delete failed",
        attemptsError
      )

      return jsonResponse(
        {
          error:
            "Failed to delete exam attempts",
          details: attemptsError.message,
        },
        400
      )
    }

    // =========================
    // UNLINK DRAFTS
    // =========================

    const {
      error: draftError,
    } = await adminClient
      .from("draft_exams")
      .update({
        status: "draft",
        published_exam_id: null,
      })
      .eq("published_exam_id", examId)

    if (draftError) {
      console.error(
        "Draft unlink failed",
        draftError
      )

      return jsonResponse(
        {
          error:
            "Failed to unlink related drafts",
          details: draftError.message,
        },
        400
      )
    }

    // =========================
    // DELETE EXAM
    // =========================

    const {
      error: deleteError,
    } = await adminClient
      .from("exam_sessions")
      .delete()
      .eq("id", examId)

    if (deleteError) {
      console.error(
        "Exam delete failed",
        deleteError
      )

      return jsonResponse(
        {
          error: "Failed to delete exam",
          details: deleteError.message,
        },
        400
      )
    }

    // =========================
    // SUCCESS
    // =========================

    return jsonResponse({
      success: true,
      deleted_exam_id: examId,
      deleted_exam_title: exam.title,
    })

  } catch (error) {

    console.error(
      "delete-published-exam error",
      error
    )

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      500
    )
  }
})