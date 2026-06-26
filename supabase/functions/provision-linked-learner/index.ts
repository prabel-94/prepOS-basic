import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const LINKED_EMAIL_DOMAIN = "prep-os-linked.local"

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function buildLinkedEmail(teacherUserId: string) {
  return `linked+${teacherUserId}@${LINKED_EMAIL_DOMAIN}`
}

async function waitForStudentUser(
  adminClient: SupabaseClient,
  userId: string,
  attempts = 10
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
      "Only teachers and admins can provision a linked learner"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, role, adminClient } = auth
    const body = await req.json().catch(() => ({}))

    const targetTeacherId =
      role === "admin" && typeof body.teacherUserId === "string"
        ? body.teacherUserId.trim()
        : user.id

    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : "My learning"

    const { data: existingLink, error: existingError } = await adminClient
      .from("teacher_learner_links")
      .select(
        "teacher_user_id, student_user_id, display_name, student_mode_active, is_active"
      )
      .eq("teacher_user_id", targetTeacherId)
      .eq("is_active", true)
      .maybeSingle()

    if (existingError) {
      return jsonResponse({ error: existingError.message }, 400)
    }

    if (existingLink?.student_user_id) {
      const { data: profile } = await adminClient
        .from("learner_profiles")
        .select("id, user_id, display_name")
        .eq("user_id", existingLink.student_user_id)
        .maybeSingle()

      return jsonResponse({
        teacherUserId: existingLink.teacher_user_id,
        studentUserId: existingLink.student_user_id,
        displayName: profile?.display_name ?? existingLink.display_name,
        studentModeActive: existingLink.student_mode_active,
        alreadyProvisioned: true,
      })
    }

    const linkedEmail = buildLinkedEmail(targetTeacherId)
    const randomPassword = crypto.randomUUID() + crypto.randomUUID()

    const { data: createdAuth, error: authError } =
      await adminClient.auth.admin.createUser({
        email: linkedEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          linked_teacher_id: targetTeacherId,
          is_linked_learner: true,
        },
      })

    if (authError || !createdAuth?.user?.id) {
      return jsonResponse(
        { error: authError?.message ?? "Shadow student auth creation failed" },
        400
      )
    }

    const studentUserId = createdAuth.user.id

    const publicUser = await waitForStudentUser(adminClient, studentUserId)

    if (!publicUser) {
      await adminClient.auth.admin.deleteUser(studentUserId)
      return jsonResponse(
        {
          error:
            "Linked learner auth was created but public.users provisioning failed. Rolled back.",
        },
        500
      )
    }

    const { data: profile, error: profileError } = await adminClient
      .from("learner_profiles")
      .insert({
        user_id: studentUserId,
        display_name: displayName,
        created_by: targetTeacherId,
      })
      .select("id, user_id, display_name")
      .single()

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(studentUserId)

      const message =
        profileError?.code === "23505"
          ? "A learner profile already exists for this linked user"
          : profileError?.message ?? "Learner profile creation failed"

      return jsonResponse({ error: message }, 400)
    }

    const { data: link, error: linkError } = await adminClient
      .from("teacher_learner_links")
      .insert({
        teacher_user_id: targetTeacherId,
        student_user_id: studentUserId,
        display_name: displayName,
        student_mode_active: false,
        is_active: true,
      })
      .select(
        "teacher_user_id, student_user_id, display_name, student_mode_active"
      )
      .single()

    if (linkError || !link) {
      await adminClient
        .from("learner_profiles")
        .delete()
        .eq("user_id", studentUserId)
      await adminClient.auth.admin.deleteUser(studentUserId)

      return jsonResponse(
        { error: linkError?.message ?? "teacher_learner_links insert failed" },
        400
      )
    }

    return jsonResponse({
      teacherUserId: link.teacher_user_id,
      studentUserId: link.student_user_id,
      displayName: profile.display_name,
      studentModeActive: link.student_mode_active,
      alreadyProvisioned: false,
    })
  } catch (error) {
    console.error("provision-linked-learner error", error)
    const message =
      error instanceof Error ? error.message : "Provision linked learner failed"
    return jsonResponse({ error: message }, 500)
  }
})
