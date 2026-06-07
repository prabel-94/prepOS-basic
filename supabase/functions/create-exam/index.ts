import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { normalizeSecondsPerQuestion } from "../_shared/exam-timing.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
}

serve(async (req) => {

  // -----------------------------------
  // CORS
  // -----------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed"
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    )
  }

  try {

    // -----------------------------------
    // AUTH HEADER
    // -----------------------------------

    const authHeader =
      req.headers.get("Authorization") || ""

    // -----------------------------------
    // SUPABASE CLIENT
    // -----------------------------------

    const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    )

    // -----------------------------------
    // VERIFY USER
    // -----------------------------------

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {

      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized"
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      )

    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "User profile not found"
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      )
    }

    if (profile.role !== "teacher" && profile.role !== "admin") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Only teachers and admins can create drafts"
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      )
    }

    // -----------------------------------
    // PARSE BODY
    // -----------------------------------

    const body = await req.json()

    const {
      title,
      instructions,
      duration,
      questions
    } = body

    // -----------------------------------
    // VALIDATION
    // -----------------------------------

    if (!Array.isArray(questions) || !questions.length) {

      return new Response(
        JSON.stringify({
          success: false,
          error: "Questions array required"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      )

    }

    // -----------------------------------
    // NORMALIZE QUESTIONS
    // -----------------------------------

    const normalizedQuestions = questions.map((q, index) => {

      const options = Array.isArray(q.options)
        ? q.options.map((opt: any, oi: number) => {

            if (typeof opt === "string") {

              return {
                id: ["A", "B", "C", "D"][oi],
                text: opt
              }

            }

            return {
              id: opt.id || ["A", "B", "C", "D"][oi],
              text: opt.text || ""
            }

          })
        : []

      let correct = q.correct || "A"

      // convert numeric index → letter
      if (typeof correct === "number") {
        correct = ["A", "B", "C", "D"][correct] || "A"
      }

      return {
        id: q.id || crypto.randomUUID(),
        text: q.text || "",
        options,
        correct,
        explanation: q.explanation || "",
        topics: Array.isArray(q.topics)
          ? q.topics
          : []
      }

    })

    // -----------------------------------
    // BUILD SCHEMA
    // -----------------------------------

    const schema = {
      sections: [
        {
          title: "Section 1",
          questions: normalizedQuestions
        }
      ]
    }

    // -----------------------------------
    // INSERT DRAFT
    // -----------------------------------

    const { data, error } = await supabase
      .from("draft_exams")
      .insert({
        title: title || "Untitled Exam",
        instructions: instructions || "",
        duration: normalizeSecondsPerQuestion(duration),
        schema_json: schema,
        status: "draft",
        created_by: user.id
      })
      .select()
      .single()

    // -----------------------------------
    // ERROR HANDLING
    // -----------------------------------

    if (error) {

      console.error("CREATE DRAFT ERROR:", error)

      return new Response(
        JSON.stringify({
          success: false,
          error
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      )

    }

    // -----------------------------------
    // SUCCESS
    // -----------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        draft_id: data.id,
        draft: data
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    )

  } catch (err) {

    console.error("EDGE FUNCTION ERROR:", err)
    const message = err instanceof Error ? err.message : "Unknown error"

    return new Response(
      JSON.stringify({
        success: false,
        error: message
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    )

  }

})
