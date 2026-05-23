import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"

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

    const auth = await authenticateTeacherRequest(
      req,
      "Only teachers and admins can clone drafts"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, role, adminClient } = auth

    const { draftId } = await req.json()

    if (!draftId) {
      return jsonResponse({ error: "Missing draftId" }, 400)
    }

    const { data: draft, error } = await adminClient
      .from("draft_exams")
      .select("*")
      .eq("id", draftId)
      .single()

    if (error || !draft) {
      return jsonResponse({ error: "Draft not found" }, 404)
    }

    if (
      role !== "admin" &&
      draft.created_by !== user.id &&
      draft.status !== "question_set"
    ) {
      return jsonResponse(
        { error: "You can clone only your drafts or shared question sets" },
        403
      )
    }

    const { data: clone, error: cloneError } = await adminClient
      .from("draft_exams")
      .insert({
        title: draft.title + " (Copy)",
        instructions: draft.instructions,
        duration: draft.duration,
        schema_json: draft.schema_json,
        status: "draft",
        published_exam_id: null,
        created_by: user.id,
      })
      .select()
      .single()

    if (cloneError) {
      return jsonResponse({ error: cloneError.message }, 400)
    }

    const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "") ?? ""
    const draftLink = siteUrl
      ? `${siteUrl}/draft.html?id=${clone.id}`
      : `/draft.html?id=${clone.id}`

    return jsonResponse({
      success: true,
      draftId: clone.id,
      draftLink,
    })

  } catch (e) {
    const message = e instanceof Error ? e.message : "Clone failed"
    return jsonResponse({ error: message }, 500)
  }
})
