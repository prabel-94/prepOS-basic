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
      "Only teachers and admins can list students"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const body = await req.json().catch(() => ({}))
    const search = typeof body.search === "string" ? body.search.trim() : ""

    let query = auth.adminClient
      .from("users")
      .select("id, name")
      .eq("role", "student")
      .order("name", { ascending: true })
      .limit(20)

    if (search) {
      query = query.ilike("name", `%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ error: error.message }, 400)
    }

    return jsonResponse({ success: true, students: data || [] })
  } catch (error) {
    console.error("list-students error", error)
    const message = error instanceof Error ? error.message : "Student lookup failed"
    return jsonResponse({ error: message }, 500)
  }
})
