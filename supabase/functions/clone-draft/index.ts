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
      return jsonResponse({ error: "Only teachers and admins can clone drafts" }, 403)
    }

    // 1️⃣ Fetch source draft
    const { data: draft, error } = await supabase
      .from("draft_exams")
      .select("*")
      .eq("id", draftId)
      .single()

    if (error || !draft) {
      return jsonResponse({ error: "Draft not found" }, 404)
    }

    if (profile.role !== "admin" && draft.created_by !== user.id && draft.status !== "question_set") {
      return jsonResponse({ error: "You can clone only your drafts or shared question sets" }, 403)
    }

    // 2️⃣ Create clone
    const { data: clone, error: cloneError } = await supabase
      .from("draft_exams")
      .insert({
        title: draft.title + " (Copy)",
        instructions: draft.instructions,
        duration: draft.duration,
        schema_json: draft.schema_json,
        status: "draft",
        published_exam_id: null,
        created_by: user.id
      })
      .select()
      .single()

    if (cloneError) {
      return jsonResponse({ error: cloneError.message }, 400)
    }

    const base = Deno.env.get("SITE_URL")!.replace(/\/$/,"")
    const draftLink = `${base}/draft.html?id=${clone.id}`

    return jsonResponse({
      success: true,
      draftId: clone.id,
      draftLink
    })

  } catch (e) {
    const message = e instanceof Error ? e.message : "Clone failed"
    return jsonResponse({ error: message }, 500)
  }
})
