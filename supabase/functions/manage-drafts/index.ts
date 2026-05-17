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

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: "User profile not found" }, 403)
    }

    if (profile.role !== "teacher" && profile.role !== "admin") {
      return jsonResponse({ error: "Only teachers and admins can manage drafts" }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === "delete") {
      const draftId = body.draftId

      if (!draftId) {
        return jsonResponse({ error: "Missing draftId" }, 400)
      }

      const { data: draft, error: fetchError } = await supabase
        .from("draft_exams")
        .select("id, created_by")
        .eq("id", draftId)
        .single()

      if (fetchError || !draft) {
        return jsonResponse({ error: "Draft not found" }, 404)
      }

      if (profile.role !== "admin" && draft.created_by !== user.id) {
        return jsonResponse({ error: "You can delete only drafts you created" }, 403)
      }

      const { error: deleteError } = await supabase
        .from("draft_exams")
        .delete()
        .eq("id", draftId)

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400)
      }

      return jsonResponse({ success: true })
    }

    if (action === "clear-non-question-sets") {
      const { error: deleteError } = await supabase
        .from("draft_exams")
        .delete()
        .eq("created_by", user.id)
        .neq("status", "question_set")

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400)
      }

      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: "Unsupported action" }, 400)
  } catch (error) {
    console.error("manage-drafts error", error)
    const message = error instanceof Error ? error.message : "Draft management failed"
    return jsonResponse({ error: message }, 500)
  }
})
