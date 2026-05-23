import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2"

export type TeacherAuthSuccess = {
  ok: true
  user: User
  role: string
  adminClient: SupabaseClient
}

export type TeacherAuthFailure = {
  ok: false
  status: number
  error: string
}

export type TeacherAuthResult = TeacherAuthSuccess | TeacherAuthFailure

/**
 * Validate Authorization header via anon client, then return service-role client.
 * Matches publish-draft / delete-published-exam (reliable on hosted Supabase).
 */
export async function authenticateTeacherRequest(
  req: Request,
  forbiddenMessage = "Only teachers and admins can perform this action"
): Promise<TeacherAuthResult> {

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, status: 500, error: "Server misconfiguration" }
  }

  const authHeader = req.headers.get("Authorization") || ""

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing authorization token" }
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    console.error("edge-auth getUser failed:", userError?.message)
    return { ok: false, status: 401, error: "Invalid session" }
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    return { ok: false, status: 403, error: "User profile not found" }
  }

  if (profile.role !== "teacher" && profile.role !== "admin") {
    return { ok: false, status: 403, error: forbiddenMessage }
  }

  return {
    ok: true,
    user,
    role: profile.role,
    adminClient,
  }
}
