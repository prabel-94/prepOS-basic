/**
 * PrepOS canonical learner identity layer.
 * Additive only — does not replace auth.users, public.users roles, or exam tables.
 *
 * Integration points (optional, not wired yet):
 * - list-students edge fn / assign-exam-modal: enrich labels via getLearnerProfile
 * - exam.js resolveStudentName: prefer profile display_name over localStorage/metadata
 * - future create-student edge fn: call createLearnerProfile after auth user exists
 * - student-dashboard header: show getLearnerProfile(auth.uid()).display_name
 */

import { getClient } from "./get-client.js";

function normalizeProfile(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Fetch the canonical learner profile for a user id.
 * Access: own profile, profiles created by the caller (teacher), or admin.
 *
 * @param {string} userId - public.users / auth.users uuid
 * @returns {Promise<{ id, userId, displayName, createdBy, createdAt, updatedAt } | null>}
 */
export async function getLearnerProfile(userId) {
  if (!userId) {
    return null;
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("get_learner_profile", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[PrepOS Learner Profile] getLearnerProfile failed", error);
    throw error;
  }

  return normalizeProfile(data);
}

/**
 * Create a canonical learner profile for an existing student user.
 * Caller must be teacher or admin. Sets created_by to the current session user.
 *
 * @param {{ userId: string, displayName: string }} params
 * @returns {Promise<{ id, userId, displayName, createdBy, createdAt, updatedAt }>}
 */
export async function createLearnerProfile({ userId, displayName }) {
  if (!userId?.trim()) {
    throw new Error("userId is required");
  }

  if (!displayName?.trim()) {
    throw new Error("displayName is required");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("create_learner_profile", {
    p_user_id: userId.trim(),
    p_display_name: displayName.trim(),
  });

  if (error) {
    console.error("[PrepOS Learner Profile] createLearnerProfile failed", error);
    throw error;
  }

  const profile = normalizeProfile(data);

  if (!profile) {
    throw new Error("Learner profile was not returned after creation");
  }

  return profile;
}
