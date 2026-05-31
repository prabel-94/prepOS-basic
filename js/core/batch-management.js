/**
 * PrepOS student batch management — RPC wrappers.
 * Teacher organization layer on top of learner_profiles.
 */

import { getClient } from "./get-client.js";

function normalizeBatch(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    memberCount: Number(row.memberCount ?? row.member_count ?? 0),
  };
}

function normalizeBatchDetails(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const members = Array.isArray(raw.members)
    ? raw.members.map((member) => ({
        membershipId: member.membershipId ?? member.membership_id ?? null,
        profileId: member.profileId ?? member.profile_id ?? null,
        userId: member.userId ?? member.user_id ?? null,
        displayName: member.displayName ?? member.display_name ?? "",
        email: member.email ?? null,
        addedAt: member.addedAt ?? member.added_at ?? null,
      }))
    : [];

  return {
    ...normalizeBatch(raw),
    createdByDisplay:
      raw.createdByDisplay ?? raw.created_by_display ?? null,
    members,
  };
}

function normalizeManagedProfile(raw) {
  return {
    profileId: raw.profileId ?? raw.profile_id ?? null,
    userId: raw.userId ?? raw.user_id ?? null,
    displayName: raw.displayName ?? raw.display_name ?? "",
    email: raw.email ?? null,
  };
}

export async function createBatch({ name, description = null }) {
  if (!name?.trim()) {
    throw new Error("Batch name is required");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("create_batch", {
    p_name: name.trim(),
    p_description: description?.trim() || null,
  });

  if (error) {
    console.error("[PrepOS Batch] createBatch failed", error);
    throw error;
  }

  const batch = normalizeBatch(data);
  if (!batch) {
    throw new Error("Batch was not returned after creation");
  }

  return batch;
}

export async function listBatches() {
  const sb = await getClient();
  const { data, error } = await sb.rpc("list_batches");

  if (error) {
    console.error("[PrepOS Batch] listBatches failed", error);
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => normalizeBatch(row));
}

export async function getBatchDetails(batchId) {
  if (!batchId) {
    throw new Error("batchId is required");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("get_batch_details", {
    p_batch_id: batchId,
  });

  if (error) {
    console.error("[PrepOS Batch] getBatchDetails failed", error);
    throw error;
  }

  const details = normalizeBatchDetails(data);
  if (!details) {
    throw new Error("Batch not found or access denied");
  }

  return details;
}

export async function updateBatch({ batchId, name, description = null }) {
  if (!batchId) {
    throw new Error("batchId is required");
  }

  if (!name?.trim()) {
    throw new Error("Batch name is required");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("update_batch", {
    p_batch_id: batchId,
    p_name: name.trim(),
    p_description: description?.trim() || null,
  });

  if (error) {
    console.error("[PrepOS Batch] updateBatch failed", error);
    throw error;
  }

  const batch = normalizeBatch(data);
  if (!batch) {
    throw new Error("Batch was not returned after update");
  }

  return batch;
}

export async function deleteBatch(batchId) {
  if (!batchId) {
    throw new Error("batchId is required");
  }

  const sb = await getClient();
  const { error } = await sb.rpc("delete_batch", {
    p_batch_id: batchId,
  });

  if (error) {
    console.error("[PrepOS Batch] deleteBatch failed", error);
    throw error;
  }

  return true;
}

export async function addBatchMembers(batchId, profileIds = []) {
  if (!batchId) {
    throw new Error("batchId is required");
  }

  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) {
    throw new Error("At least one student must be selected");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("add_batch_members", {
    p_batch_id: batchId,
    p_profile_ids: ids,
  });

  if (error) {
    console.error("[PrepOS Batch] addBatchMembers failed", error);
    throw error;
  }

  return {
    added: Number(data?.added ?? 0),
    skipped: Number(data?.skipped ?? 0),
  };
}

export async function removeBatchMember(batchId, profileId) {
  if (!batchId || !profileId) {
    throw new Error("batchId and profileId are required");
  }

  const sb = await getClient();
  const { error } = await sb.rpc("remove_batch_member", {
    p_batch_id: batchId,
    p_profile_id: profileId,
  });

  if (error) {
    console.error("[PrepOS Batch] removeBatchMember failed", error);
    throw error;
  }

  return true;
}

export async function listManagedLearnerProfiles() {
  const sb = await getClient();
  const { data, error } = await sb.rpc("list_managed_learner_profiles");

  if (error) {
    console.error("[PrepOS Batch] listManagedLearnerProfiles failed", error);
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeManagedProfile);
}
