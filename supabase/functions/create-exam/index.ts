import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders })
    }

    const body = await req.json().catch(() => null)

    if (!body || !Array.isArray(body.questions)) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const projectUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!projectUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration: missing Supabase env vars" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const supabase = createClient(projectUrl, serviceRoleKey)
    const { title = "Untitled Exam", questions, duration = 30, instructions = "" } = body

    const schema = {
      sections: [
        {
          title: "Section 1",
          questions,
        }
      ]
    }

    const { data, error } = await supabase
      .from("draft_exams")
      .insert({
        title,
        instructions,
        duration,
        schema_json: schema,
        status: "draft"
      })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "")

    const responseBody: Record<string, unknown> = {
      success: true,
      draftId: data.id,
    }

    if (siteUrl) {
      responseBody.draftLink = `${siteUrl}/draft.html?id=${data.id}`
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Create exam function error", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})