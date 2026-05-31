import { authenticateTeacherRequest } from "../_shared/edge-auth.ts"

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

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(
      value.filter((id): id is string => typeof id === "string" && id.trim())
    ),
  ]
}

type ResolvedStudent = {
  userId: string
  sourceBatchId: string | null
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
      "Only teachers and admins can assign exams"
    )

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const { user, role, adminClient } = auth

    const body = await req.json().catch(() => ({}))
    const examId = typeof body.examId === "string" ? body.examId.trim() : ""
    const studentIds = normalizeIdList(body.studentIds)
    const batchIds = normalizeIdList(body.batchIds)

    if (!examId) {
      return jsonResponse({ error: "Missing examId" }, 400)
    }

    if (!studentIds.length && !batchIds.length) {
      return jsonResponse(
        { error: "Select at least one student or batch" },
        400
      )
    }

    const { data: exam, error: examError } = await adminClient
      .from("exam_sessions")
      .select("id, created_by")
      .eq("id", examId)
      .single()

    if (examError || !exam) {
      return jsonResponse({ error: "Exam not found" }, 404)
    }

    if (role !== "admin" && exam.created_by !== user.id) {
      return jsonResponse(
        { error: "You can assign only exams you created" },
        403
      )
    }

    const resolvedStudents = new Map<string, ResolvedStudent>()
    const individualIds = new Set(studentIds)

    for (const batchId of batchIds) {
      const { data: batch, error: batchError } = await adminClient
        .from("student_batches")
        .select("id, created_by, name")
        .eq("id", batchId)
        .maybeSingle()

      if (batchError) {
        return jsonResponse({ error: batchError.message }, 400)
      }

      if (!batch) {
        return jsonResponse({ error: "Batch not found" }, 404)
      }

      if (role !== "admin" && batch.created_by !== user.id) {
        return jsonResponse(
          { error: "You can assign only your own batches" },
          403
        )
      }

      const { data: members, error: membersError } = await adminClient
        .from("student_batch_members")
        .select("profile_id, learner_profiles!inner(user_id, created_by)")
        .eq("batch_id", batchId)

      if (membersError) {
        return jsonResponse({ error: membersError.message }, 400)
      }

      for (const member of members || []) {
        const profile = member.learner_profiles as
          | { user_id?: string; created_by?: string }
          | { user_id?: string; created_by?: string }[]
          | null

        const profileRow = Array.isArray(profile) ? profile[0] : profile
        const userId = profileRow?.user_id

        if (!userId) {
          continue
        }

        if (role !== "admin" && profileRow?.created_by !== user.id) {
          return jsonResponse(
            { error: "Batch contains a learner you do not manage" },
            403
          )
        }

        if (!resolvedStudents.has(userId)) {
          resolvedStudents.set(userId, {
            userId,
            sourceBatchId: individualIds.has(userId) ? null : batchId,
          })
        } else if (!individualIds.has(userId)) {
          const existing = resolvedStudents.get(userId)
          if (existing && !existing.sourceBatchId) {
            existing.sourceBatchId = batchId
          }
        }
      }
    }

    for (const studentId of studentIds) {
      if (!resolvedStudents.has(studentId)) {
        resolvedStudents.set(studentId, {
          userId: studentId,
          sourceBatchId: null,
        })
      } else {
        resolvedStudents.set(studentId, {
          userId: studentId,
          sourceBatchId: null,
        })
      }
    }

    const uniqueStudentIds = [...resolvedStudents.keys()]

    if (!uniqueStudentIds.length) {
      return jsonResponse(
        { error: "No students to assign from the selected batches or roster" },
        400
      )
    }

    const { data: studentRows, error: studentsError } = await adminClient
      .from("users")
      .select("id")
      .eq("role", "student")
      .in("id", uniqueStudentIds)

    if (studentsError) {
      return jsonResponse({ error: studentsError.message }, 400)
    }

    if ((studentRows || []).length !== uniqueStudentIds.length) {
      return jsonResponse(
        { error: "One or more selected users are not students" },
        400
      )
    }

    if (role !== "admin") {
      const { data: ownedProfiles, error: profilesError } = await adminClient
        .from("learner_profiles")
        .select("user_id")
        .in("user_id", uniqueStudentIds)
        .eq("created_by", user.id)

      if (profilesError) {
        return jsonResponse({ error: profilesError.message }, 400)
      }

      const ownedIds = new Set((ownedProfiles || []).map((row) => row.user_id))

      if (ownedIds.size !== uniqueStudentIds.length) {
        return jsonResponse(
          { error: "One or more selected students are not in your roster" },
          403
        )
      }
    }

    const { data: existingAssignments, error: existingError } =
      await adminClient
        .from("exam_assignments")
        .select("student_id")
        .eq("exam_id", examId)
        .in("student_id", uniqueStudentIds)

    if (existingError) {
      return jsonResponse({ error: existingError.message }, 400)
    }

    const alreadyAssigned = new Set(
      (existingAssignments || []).map((row) => row.student_id)
    )

    const rowsToInsert = uniqueStudentIds
      .filter((studentId) => !alreadyAssigned.has(studentId))
      .map((studentId) => {
        const resolved = resolvedStudents.get(studentId)
        return {
          exam_id: examId,
          student_id: studentId,
          assigned_by: user.id,
          source_batch_id: resolved?.sourceBatchId ?? null,
        }
      })

    if (rowsToInsert.length) {
      const { error: insertError } = await adminClient
        .from("exam_assignments")
        .insert(rowsToInsert)

      if (insertError) {
        return jsonResponse({ error: insertError.message }, 400)
      }
    }

    let batchesRecorded = 0

    for (const batchId of batchIds) {
      const { error: batchInsertError } = await adminClient
        .from("exam_batch_assignments")
        .insert({
          exam_id: examId,
          batch_id: batchId,
          assigned_by: user.id,
        })

      if (batchInsertError) {
        if (batchInsertError.code === "23505") {
          continue
        }

        return jsonResponse({ error: batchInsertError.message }, 400)
      }

      batchesRecorded += 1
    }

    const skipped = uniqueStudentIds.length - rowsToInsert.length

    return jsonResponse({
      success: true,
      assigned: rowsToInsert.length,
      skipped,
      resolved: uniqueStudentIds.length,
      batchesRecorded,
      batchIds,
      studentIds: studentIds.length ? studentIds : undefined,
    })
  } catch (error) {
    console.error("assign-exam error", error)
    const message =
      error instanceof Error ? error.message : "Assignment failed"
    return jsonResponse({ error: message }, 500)
  }
})
