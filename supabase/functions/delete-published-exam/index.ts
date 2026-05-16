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

    const { examId } = await req.json().catch(() => ({}))

    if (!examId) {
      return jsonResponse({ error: "Missing examId" }, 400)
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
      return jsonResponse({ error: "Only teachers and admins can delete published exams" }, 403)
    }

    const { data: exam, error: examFetchError } = await supabase
      .from("exam_sessions")
      .select("id, created_by")
      .eq("id", examId)
      .single()

    if (examFetchError || !exam) {
      return jsonResponse({ error: "Exam not found" }, 404)
    }

    if (profile.role !== "admin" && exam.created_by !== user.id) {
      return jsonResponse({ error: "You can delete only exams you created" }, 403)
    }

    const { error: assignmentError } = await supabase
      .from("exam_assignments")
      .delete()
      .eq("exam_id", examId)

    if (assignmentError) {
      return jsonResponse({ error: assignmentError.message }, 400)
    }

    const { error: attemptsError } = await supabase
      .from("exam_attempts")
      .delete()
      .eq("exam_id", examId)

    if (attemptsError) {
      return jsonResponse({ error: attemptsError.message }, 400)
    }

    const { error: draftError } = await supabase
      .from("draft_exams")
      .update({
        status: "draft",
        published_exam_id: null,
      })
      .eq("published_exam_id", examId)

    if (draftError) {
      return jsonResponse({ error: draftError.message }, 400)
    }

    const { error: examDeleteError } = await supabase
      .from("exam_sessions")
      .delete()
      .eq("id", examId)

    if (examDeleteError) {
      return jsonResponse({ error: examDeleteError.message }, 400)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error("delete-published-exam error", error)
    const message = error instanceof Error ? error.message : "Delete failed"
    return jsonResponse({ error: message }, 500)
  }
})
