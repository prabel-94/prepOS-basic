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

  // ===============================
  // Preflight
  // ===============================
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {

    const { draftId } = await req.json()

    if (!draftId) {
      return jsonResponse({ error: "Missing draftId" }, 400)
    }

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "")

    if (!token) {
      return jsonResponse({ error: "Missing authorization token" }, 401)
    }

    const projectUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!projectUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500)
    }

    const supabase = createClient(projectUrl, serviceRoleKey)

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    const user = userData?.user

    if (userError || !user) {
      return jsonResponse({ error: "Invalid session" }, 401)
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
      return jsonResponse({ error: "Only teachers and admins can publish drafts" }, 403)
    }

    // ===============================
    // 1️⃣ Fetch draft
    // ===============================
    const { data: draft, error: fetchError } = await supabase
      .from("draft_exams")
      .select("title, duration, schema_json, logo_url, created_by")
      .eq("id", draftId)
      .single()

    if (fetchError || !draft) {
      return jsonResponse({ error: "Draft not found" }, 404)
    }

    if (profile.role !== "admin" && draft.created_by !== user.id) {
      return jsonResponse({ error: "You can publish only drafts you created" }, 403)
    }

    const schema = draft.schema_json

    // ===============================
    // 2️⃣ Validation
    // ===============================
    if (!draft.duration) {
      return jsonResponse({ error: "Duration missing" }, 400)
    }

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

    // ===============================
    // 3️⃣ Insert exam (immutable snapshot)
    // ===============================
    const { data: exam, error: examError } = await supabase
      .from("exam_sessions")
      .insert({
        title: draft.title,
        duration: draft.duration,
        schema_json: draft.schema_json,
        logo_url: draft.logo_url,
        created_by: draft.created_by || user.id
      })
      .select()
      .single()

    if (examError || !exam) {
      return jsonResponse({ error: examError?.message || "Exam insert failed" }, 400)
    }

    // ===============================
    // 4️⃣ Lock draft
    // ===============================
    const { error: lockError } = await supabase
      .from("draft_exams")
      .update({
        status: "published",
        published_exam_id: exam.id
      })
      .eq("id", draftId)

    if (lockError) {
      return jsonResponse({ error: lockError.message }, 400)
    }

    // ===============================
    // 5️⃣ Return exam link
    // ===============================
    const base = Deno.env.get("SITE_URL")!.replace(/\/$/,"")
    const examLink = `${base}/exam.html?id=${exam.id}`

    return jsonResponse({
      success: true,
      examId: exam.id,
      examLink
    })

  } catch (e) {

    console.error("publish-draft error →", e)

    const message = e instanceof Error ? e.message : "Publish failed"
    return jsonResponse({ error: message }, 500)
  }
})
