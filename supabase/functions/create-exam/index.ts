import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {

  // ✅ Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const body = await req.json()

  const supabase = createClient(
    Deno.env.get("PROJECT_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY")!
  )

  const { title, questions } = body

  const { data, error } = await supabase
    .from("quizzes")
    .insert([{ title, questions }])
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }

  const base = Deno.env.get("SITE_URL")!.replace(/\/$/,"")
  const examLink = `${base}/exam.html?id=${data.id}`

  return new Response(
    JSON.stringify({ success: true, examLink }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})