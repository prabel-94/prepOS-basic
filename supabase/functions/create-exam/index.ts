import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const body = await req.json()

  const supabase = createClient(
    Deno.env.get("PROJECT_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY")!
  )

  const { title, questions, duration, instructions } = body

  // ⭐ Build schema_json (wrap questions into sections)
  const schema = {
    sections: [
      {
        title: "Section 1",
        questions
      }
    ]
  }

  // ⭐ Insert draft instead of quiz
  const { data, error } = await supabase
    .from("exam_drafts")
    .insert({
      title: title || "Untitled Exam",
      instructions: instructions || "",
      duration: duration || 30,
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

  // ⭐ Build draft link (editor)
  const base = Deno.env.get("SITE_URL")!.replace(/\/$/,"")
  const draftLink = `${base}/draft.html?id=${data.id}`

  return new Response(
    JSON.stringify({
      success: true,
      draftId: data.id,
      draftLink
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})