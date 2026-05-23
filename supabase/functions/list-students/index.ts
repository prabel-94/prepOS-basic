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

type StudentRow = {
  id: string
  email: string | null
  name: string | null
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
    const search = typeof body.search === "string" ? body.search.trim().toLowerCase() : ""

    const { data: profiles, error: profilesError } = await auth.adminClient
      .from("users")
      .select("id")
      .eq("role", "student")
      .limit(200)

    if (profilesError) {
      return jsonResponse({ error: profilesError.message }, 400)
    }

    const profileIds = new Set((profiles || []).map((row) => row.id))

    if (!profileIds.size) {
      return jsonResponse({ success: true, students: [] })
    }

    const emailById = new Map<string, string>()
    const nameById = new Map<string, string>()

    let page = 1
    const perPage = 200

    while (true) {
      const { data: authPage, error: authError } =
        await auth.adminClient.auth.admin.listUsers({ page, perPage })

      if (authError) {
        return jsonResponse({ error: authError.message }, 400)
      }

      const users = authPage?.users ?? []

      for (const user of users) {
        if (!profileIds.has(user.id)) {
          continue
        }

        if (user.email) {
          emailById.set(user.id, user.email)
        }

        const fullName =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name.trim()
            : ""

        if (fullName) {
          nameById.set(user.id, fullName)
        }
      }

      if (users.length < perPage) {
        break
      }

      page += 1
    }

    let students: StudentRow[] = [...profileIds].map((id) => ({
      id,
      email: emailById.get(id) ?? null,
      name: nameById.get(id) ?? null,
    }))

    if (search) {
      students = students.filter((student) => {
        const email = (student.email ?? "").toLowerCase()
        const name = (student.name ?? "").toLowerCase()
        return email.includes(search) || name.includes(search)
      })
    }

    students.sort((a, b) => {
      const labelA = (a.name || a.email || a.id).toLowerCase()
      const labelB = (b.name || b.email || b.id).toLowerCase()
      return labelA.localeCompare(labelB)
    })

    return jsonResponse({
      success: true,
      students: students.slice(0, 20),
    })
  } catch (error) {
    console.error("list-students error", error)
    const message = error instanceof Error ? error.message : "Student lookup failed"
    return jsonResponse({ error: message }, 500)
  }
})
