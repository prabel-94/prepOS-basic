import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {

  // ✅ Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    const body = await req.json()
    const { draftId } = body

    if (!draftId) {
      return new Response(JSON.stringify({ error: "Missing draftId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    )

    // ===============================
    // 1️⃣ Fetch draft
    // ===============================
    const { data: draft, error: fetchError } = await supabase
      .from("exam_drafts")
      .select("*")
      .eq("id", draftId)
      .single()

    if (fetchError || !draft) {
      return new Response(JSON.stringify({ error: "Draft not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const schema = draft.schema_json

    // ===============================
    // 2️⃣ Validation
    // ===============================
    if (!draft.duration) {
      return new Response(JSON.stringify({ error: "Duration missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!schema?.sections?.length) {
      return new Response(JSON.stringify({ error: "No sections" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    let questionCount = 0

    for (const section of schema.sections) {

      if (!section.questions?.length) continue

      for (const q of section.questions) {

        questionCount++

        if (!q.question) {
          return new Response(JSON.stringify({ error: "Question text missing" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }

        if (!q.options || q.options.length < 2) {
          return new Response(JSON.stringify({ error: "Invalid options" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }

        if (q.correct === undefined || q.correct === null) {
          return new Response(JSON.stringify({ error: "Correct answer missing" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      }
    }

    if (questionCount === 0) {
      return new Response(JSON.stringify({ error: "No questions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ===============================
    // 3️⃣ Insert exam (immutable)
    // ===============================
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .insert({
        title: draft.title,
        duration: draft.duration,
        schema_json: draft.schema_json
      })
      .select()
      .single()

    if (examError) {
      return new Response(JSON.stringify({ error: examError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ===============================
    // 4️⃣ Lock draft
    // ===============================
    await supabase
      .from("exam_drafts")
      .update({
        status: "published",
        published_exam_id: exam.id
      })
      .eq("id", draftId)

    // ===============================
    // 5️⃣ Return exam link
    // ===============================
    const base = Deno.env.get("SITE_URL")!.replace(/\/$/,"")
    const examLink = `${base}/exam.html?id=${exam.id}`

    return new Response(
      JSON.stringify({
        success: true,
        examId: exam.id,
        examLink
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