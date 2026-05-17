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
      return jsonResponse({ error: "Only teachers and admins can save questions" }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const question = body.question

    if (!question || typeof question !== "object" || Array.isArray(question)) {
      return jsonResponse({ error: "Question payload is required" }, 400)
    }

    const { data, error } = await supabase.rpc("save_question_to_bank", {
      p_actor_id: user.id,
      p_payload: question,
    })

    if (error) {
      return jsonResponse({ error: error.message }, 400)
    }

    return jsonResponse(data as Record<string, unknown>)
  } catch (error) {
    console.error("save-question-to-bank error", error)
    const message = error instanceof Error ? error.message : "Question save failed"
    return jsonResponse({ error: message }, 500)
  }
})
