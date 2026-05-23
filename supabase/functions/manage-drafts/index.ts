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
      "Only teachers and admins can manage drafts"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, role, adminClient } = auth

    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === "delete") {
      const draftId = body.draftId

      if (!draftId) {
        return jsonResponse({ error: "Missing draftId" }, 400)
      }

      const { data: draft, error: fetchError } = await adminClient
        .from("draft_exams")
        .select("id, created_by")
        .eq("id", draftId)
        .single()

      if (fetchError || !draft) {
        return jsonResponse({ error: "Draft not found" }, 404)
      }

      if (role !== "admin" && draft.created_by !== user.id) {
        return jsonResponse({ error: "You can delete only drafts you created" }, 403)
      }

      const { error: deleteError } = await adminClient
        .from("draft_exams")
        .delete()
        .eq("id", draftId)

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400)
      }

      return jsonResponse({ success: true })
    }

    if (action === "clear-non-question-sets") {
      const { error: deleteError } = await adminClient
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
