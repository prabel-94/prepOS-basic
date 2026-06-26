import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { DeleteLearnerRequest } from "./types.ts"

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

function normalizeConfirmation(value: string) {
  return value.trim()
}

async function countRows(
  adminClient: SupabaseClient,
  table: string,
  column: string,
  userId: string
) {
  const { count, error } = await adminClient
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, userId)

  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`)
  }

  return count ?? 0
}

async function deleteRows(
  adminClient: SupabaseClient,
  table: string,
  column: string,
  userId: string
) {
  const { error } = await adminClient.from(table).delete().eq(column, userId)

  if (error) {
    throw new Error(`Failed to delete from ${table}: ${error.message}`)
  }
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
      "Only teachers and admins can delete learners"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, adminClient } = auth
    const body = (await req.json().catch(() => ({}))) as Partial<
      DeleteLearnerRequest
    >

    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    const confirmation = normalizeConfirmation(
      typeof body.confirmation === "string" ? body.confirmation : ""
    )

    if (!userId || !confirmation) {
      return jsonResponse(
        { error: "userId and confirmation are required" },
        400
      )
    }

    if (userId === user.id) {
      return jsonResponse(
        { error: "Cannot delete your own account here" },
        400
      )
    }

    const { data: profile, error: profileError } = await adminClient
      .from("learner_profiles")
      .select("id, user_id, display_name, created_by")
      .eq("user_id", userId)
      .maybeSingle()

    if (profileError || !profile) {
      return jsonResponse(
        { error: "Learner not found or access denied" },
        403
      )
    }

    if (auth.role !== "admin" && profile.created_by !== user.id) {
      return jsonResponse(
        { error: "Learner not found or access denied" },
        403
      )
    }

    const displayName = String(profile.display_name ?? "").trim()
    const validConfirmation =
      confirmation === "DELETE" ||
      (displayName.length > 0 && confirmation === displayName)

    if (!validConfirmation) {
      return jsonResponse(
        {
          error:
            "Confirmation must match the learner display name exactly, or type DELETE",
        },
        400
      )
    }

    const { data: roleRow, error: roleError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle()

    if (roleError || !roleRow) {
      return jsonResponse({ error: "User not found" }, 404)
    }

    if (roleRow.role !== "student") {
      return jsonResponse(
        { error: "Only student accounts can be deleted" },
        400
      )
    }

    const { data: linkRow } = await adminClient
      .from("teacher_learner_links")
      .select("teacher_user_id, student_mode_active")
      .eq("student_user_id", userId)
      .eq("is_active", true)
      .maybeSingle()

    if (linkRow) {
      if (auth.role !== "admin" && linkRow.teacher_user_id !== user.id) {
        return jsonResponse(
          { error: "Cannot delete another teacher's linked learner" },
          403
        )
      }

      if (linkRow.student_mode_active) {
        const { error: modeError } = await adminClient
          .from("teacher_learner_links")
          .update({ student_mode_active: false })
          .eq("student_user_id", userId)

        if (modeError) {
          return jsonResponse(
            { error: `Failed to exit student mode: ${modeError.message}` },
            400
          )
        }
      }
    }

    const { count: batchMemberships } = await adminClient
      .from("student_batch_members")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profile.id)

    const [
      examAttempts,
      examAssignments,
      practiceAttempts,
      questionStats,
    ] = await Promise.all([
      countRows(adminClient, "exam_attempts", "student_id", userId),
      countRows(adminClient, "exam_assignments", "student_id", userId),
      countRows(adminClient, "practice_attempts", "student_id", userId),
      countRows(adminClient, "user_question_stats", "user_id", userId),
    ])

    await deleteRows(adminClient, "exam_attempts", "student_id", userId)
    await deleteRows(adminClient, "exam_assignments", "student_id", userId)
    await deleteRows(adminClient, "practice_attempts", "student_id", userId)
    await deleteRows(adminClient, "user_question_stats", "user_id", userId)

    const { error: lexiconError } = await adminClient
      .from("user_lexicon_word_stats")
      .delete()
      .eq("user_id", userId)

    if (lexiconError && lexiconError.code !== "42P01") {
      return jsonResponse(
        {
          error: `Failed to delete lexicon stats: ${lexiconError.message}`,
        },
        400
      )
    }

    await adminClient
      .from("teacher_learner_links")
      .delete()
      .eq("student_user_id", userId)

    const { error: profileDeleteError } = await adminClient
      .from("learner_profiles")
      .delete()
      .eq("user_id", userId)

    if (profileDeleteError) {
      return jsonResponse(
        { error: `Failed to delete learner profile: ${profileDeleteError.message}` },
        400
      )
    }

    const { error: authDeleteError } =
      await adminClient.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      return jsonResponse(
        {
          error:
            "Learning data was removed but auth user deletion failed. Contact support or retry.",
          details: authDeleteError.message,
        },
        500
      )
    }

    return jsonResponse({
      success: true,
      deletedUserId: userId,
      displayName: displayName || profile.display_name,
      removed: {
        examAttempts,
        examAssignments,
        practiceAttempts,
        questionStats,
        batchMemberships: batchMemberships ?? 0,
      },
    })
  } catch (error) {
    console.error("delete-learner error", error)
    const message =
      error instanceof Error ? error.message : "Delete learner failed"
    return jsonResponse({ error: message }, 500)
  }
})
