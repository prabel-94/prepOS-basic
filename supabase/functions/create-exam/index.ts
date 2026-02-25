import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

Deno.serve(async (req) => {
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
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }

  const examLink = `${Deno.env.get("SITE_URL")}/exam.html?id=${data.id}`

  return new Response(
    JSON.stringify({ success: true, examLink }),
    { headers: { "Content-Type": "application/json" } }
  )
})