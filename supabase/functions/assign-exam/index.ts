import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    const projectUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!projectUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500)
    }

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "")

    if (!token) {
      return jsonResponse({ error: "Missing authorization token" }, 401)
    }

    const supabase = createClient(projectUrl, serviceRoleKey)
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    const user = userData?.user

    if (userError || !user) {
      return jsonResponse({ error: "Invalid session" }, 401)
    }

    const { examId, studentIds } = await req.json().catch(() => ({}))

    if (!examId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return jsonResponse({ error: "Missing examId or studentIds" }, 400)
    }

    const uniqueStudentIds = [...new Set(studentIds.filter((id) => typeof id === "string" && id.trim()))]

    if (!uniqueStudentIds.length) {
      return jsonResponse({ error: "No valid students selected" }, 400)
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: "User profile not found" }, 403)
    }

    if (profile.role !== "teacher" && profile.role !== "admin") {
      return jsonResponse({ error: "Only teachers and admins can assign exams" }, 403)
    }

    const { data: exam, error: examError } = await supabase
      .from("exam_sessions")
      .select("id, created_by")
      .eq("id", examId)
      .single()

    if (examError || !exam) {
      return jsonResponse({ error: "Exam not found" }, 404)
    }

    if (profile.role !== "admin" && exam.created_by !== user.id) {
      return jsonResponse({ error: "You can assign only exams you created" }, 403)
    }

    const { data: students, error: studentsError } = await supabase
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

    const { error: insertError } = await supabase
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
