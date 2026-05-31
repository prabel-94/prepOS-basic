import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import type {
  CreateLearnerRequest,
  CreateLearnerResponse,
} from "./types.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function waitForStudentUser(
  adminClient: SupabaseClient,
  userId: string,
  attempts = 8
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await adminClient
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle()

    if (!error && data?.role === "student") {
      return data
    }

    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  return null
}

function mapAuthCreateError(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("duplicate")
  ) {
    return "A user with this email already exists"
  }

  return message
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
      "Only teachers and admins can create learners"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, adminClient } = auth
    const body = (await req.json().catch(() => ({}))) as Partial<
      CreateLearnerRequest
    >

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body.password === "string" ? body.password : ""
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : ""

    if (!email || !password || !displayName) {
      return jsonResponse(
        { error: "email, password, and displayName are required" },
        400
      )
    }

    if (!isValidEmail(email)) {
      return jsonResponse({ error: "Invalid email address" }, 400)
    }

    const { data: createdAuth, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (authError || !createdAuth?.user?.id) {
      const message = mapAuthCreateError(
        authError?.message ?? "Auth user creation failed"
      )
      return jsonResponse({ error: message }, 400)
    }

    const authUserId = createdAuth.user.id

    const publicUser = await waitForStudentUser(adminClient, authUserId)

    if (!publicUser) {
      await adminClient.auth.admin.deleteUser(authUserId)
      return jsonResponse(
        {
          error:
            "Learner account was created but authorization provisioning failed. The account was rolled back.",
        },
        500
      )
    }

    const { data: profile, error: profileError } = await adminClient
      .from("learner_profiles")
      .insert({
        user_id: authUserId,
        display_name: displayName,
        created_by: user.id,
      })
      .select("id, user_id, display_name")
      .single()

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(authUserId)

      const message =
        profileError?.code === "23505"
          ? "A learner profile already exists for this user"
          : profileError?.message ?? "Learner profile creation failed"

      return jsonResponse({ error: message }, 400)
    }

    const response: CreateLearnerResponse = {
      id: profile.id,
      userId: profile.user_id,
      email,
      displayName: profile.display_name,
    }

    return jsonResponse(response)
  } catch (error) {
    console.error("create-learner error", error)
    const message =
      error instanceof Error ? error.message : "Learner creation failed"
    return jsonResponse({ error: message }, 500)
  }
})
