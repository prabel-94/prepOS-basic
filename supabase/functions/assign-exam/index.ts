import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"

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
      "Only teachers and admins can assign exams"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, role, adminClient } = auth

    const { examId, studentIds } = await req.json().catch(() => ({}))

    if (!examId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return jsonResponse({ error: "Missing examId or studentIds" }, 400)
    }

    const uniqueStudentIds = [
      ...new Set(studentIds.filter((id) => typeof id === "string" && id.trim())),
    ]

    if (!uniqueStudentIds.length) {
      return jsonResponse({ error: "No valid students selected" }, 400)
    }

    const { data: exam, error: examError } = await adminClient
      .from("exam_sessions")
      .select("id, created_by")
      .eq("id", examId)
      .single()

    if (examError || !exam) {
      return jsonResponse({ error: "Exam not found" }, 404)
    }

    if (role !== "admin" && exam.created_by !== user.id) {
      return jsonResponse({ error: "You can assign only exams you created" }, 403)
    }

    const { data: students, error: studentsError } = await adminClient
      .from("users")
      .select("id")
      .eq("role", "student")
      .in("id", uniqueStudentIds)

    if (studentsError) {
      return jsonResponse({ error: studentsError.message }, 400)
    }

    if ((students || []).length !== uniqueStudentIds.length) {
      return jsonResponse({ error: "One or more selected users are not students" }, 400)
    }

    const rows = uniqueStudentIds.map((studentId) => ({
      exam_id: examId,
      student_id: studentId,
      assigned_by: user.id,
    }))

    const { error: insertError } = await adminClient
      .from("exam_assignments")
      .insert(rows)

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 400)
    }

    return jsonResponse({ success: true, assigned: rows.length })
  } catch (error) {
    console.error("assign-exam error", error)
    const message = error instanceof Error ? error.message : "Assignment failed"
    return jsonResponse({ error: message }, 500)
  }
})
