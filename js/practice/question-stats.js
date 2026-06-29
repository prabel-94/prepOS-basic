/**
 * Persisted per-question bank practice stats.
 */

import { getClient } from "../core/get-client.js";

export function normalizePersistedQuestionStatsRows(rows = []) {
  const map = new Map();

  for (const row of rows) {
    if (!row?.question_id) {
      continue;
    }

    map.set(String(row.question_id), {
      question_id: row.question_id,
      seen_count: row.seen_count ?? 0,
      correct_count: row.correct_count ?? 0,
      last_correct:
        typeof row.last_correct === "boolean" ? row.last_correct : null,
      last_seen_at: row.last_seen_at ?? null,
      updated_at: row.updated_at ?? null,
    });
  }

  return map;
}

/**
 * Fetch persisted stats for a set of question ids.
 */
export async function fetchUserQuestionStats({
  userId = null,
  questionIds = [],
  sb: client = null,
} = {}) {
  if (!userId || !questionIds.length) {
    return new Map();
  }

  const sb = client ?? (await getClient());
  const uniqueIds = [...new Set(questionIds.filter(Boolean))];

  const { data, error } = await sb
    .from("user_question_stats")
    .select(`
      question_id,
      seen_count,
      correct_count,
      last_correct,
      last_seen_at,
      updated_at
    `)
    .eq("user_id", userId)
    .in("question_id", uniqueIds);

  if (error) {
    throw error;
  }

  return normalizePersistedQuestionStatsRows(data ?? []);
}

/**
 * Upsert a single bank answer into user_question_stats.
 */
export async function upsertBankQuestionStat({
  userId = null,
  questionId = null,
  isCorrect = false,
  sb: client = null,
} = {}) {
  if (!userId || !questionId) {
    return null;
  }

  const sb = client ?? (await getClient());
  const now = new Date().toISOString();

  const { data: existingRows, error: selectError } = await sb
    .from("user_question_stats")
    .select("question_id, seen_count, correct_count")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .limit(1);

  if (selectError) {
    throw selectError;
  }

  const existing = existingRows?.[0];
  const seenCount = (existing?.seen_count ?? 0) + 1;
  const correctCount = (existing?.correct_count ?? 0) + (isCorrect ? 1 : 0);

  const row = {
    user_id: userId,
    question_id: questionId,
    seen_count: seenCount,
    correct_count: correctCount,
    last_correct: isCorrect,
    last_seen_at: now,
    updated_at: now,
  };

  const { error: upsertError } = await sb
    .from("user_question_stats")
    .upsert(row, {
      onConflict: "user_id,question_id",
    });

  if (upsertError) {
    throw upsertError;
  }

  return {
    question_id: questionId,
    seen_count: seenCount,
    correct_count: correctCount,
    last_correct: isCorrect,
    last_seen_at: now,
    updated_at: now,
  };
}

/**
 * Apply an in-memory persisted stat update (after successful upsert).
 */
export function applyPersistedStatLocally(persistedStatsById = new Map(), row = {}) {
  if (!row?.question_id) {
    return persistedStatsById;
  }

  const next = new Map(persistedStatsById);
  next.set(String(row.question_id), row);
  return next;
}
