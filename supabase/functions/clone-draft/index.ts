import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    const { draftId } = await req.json()

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    )

    // 1️⃣ Fetch source draft
    const { data: draft, error } = await supabase
      .from("exam_drafts")
      .select("*")
      .eq("id", draftId)
      .single()

    if (error || !draft) {
      return new Response(JSON.stringify({ error: "Draft not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 2️⃣ Create clone
    const { data: clone, error: cloneError } = await supabase
      .from("exam_drafts")
      .insert({
        title: draft.title + " (Copy)",
        instructions: draft.instructions,
        duration: draft.duration,
        schema_json: draft.schema_json,
        status: "draft",
        published_exam_id: null
      })
      .select()
      .single()

    if (cloneError) {
      return new Response(JSON.stringify({ error: cloneError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const base = Deno.env.get("SITE_URL")!.replace(/\/$/,"")
    const draftLink = `${base}/draft.html?id=${clone.id}`

    return new Response(
      JSON.stringify({
        success: true,
        draftId: clone.id,
        draftLink
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})