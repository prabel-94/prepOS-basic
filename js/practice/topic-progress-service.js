/**
 * Load topic question bank progress for practice UI.
 */

import { getClient } from "../core/get-client.js";
import { buildTopicQuestionProgress } from "../analytics/topic-question-progress.js";
import {
  buildAttemptRecord,
  buildPracticeAttemptRecord,
  fetchQuestionCatalogByIds,
} from "../analytics/analytics-submission.js";

async function fetchTopicQuestionIds(sb, topicId) {
  const { data, error } = await sb
    .from("question_topics")
    .select("question_id")
    .eq("topic_id", topicId);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map(row => row.question_id)
    .filter(Boolean);
}

async function fetchExamAttemptRows(sb, userId) {
  const { data, error } = await sb
    .from("exam_attempts")
    .select(`
      id,
      exam_id,
      score,
      answers,
      submitted_at,
      student_name,
      student_id,
      time_taken,
      question_count
    `)
    .eq("student_id", userId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchPracticeAttemptRows(sb, userId) {
  const { data, error } = await sb
    .from("practice_attempts")
    .select(`
      id,
      student_id,
      topic_id,
      topic_name,
      score,
      answers,
      submitted_at,
      time_taken,
      question_count,
      attempt_id
    `)
    .eq("student_id", userId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.warn("[Practice Topic Progress] practice attempts fetch failed", error);
    return [];
  }

  return data ?? [];
}

function toKnowledgeAttempts(examRows = [], practiceRows = []) {
  const examAttempts = examRows.map(row =>
    buildAttemptRecord({
      examId: row.exam_id,
      attemptId: row.id,
      studentName: row.student_name ?? "",
      studentId: row.student_id ?? null,
      answers: row.answers ?? [],
      score: row.score ?? 0,
      timeTaken: row.time_taken ?? 0,
      submittedAt: row.submitted_at,
      submissionMode: "canonical",
    })
  );

  const practiceAttempts = practiceRows.map(row => buildPracticeAttemptRecord(row));

  return [...examAttempts, ...practiceAttempts];
}

/**
 * Load read-only topic bank progress for the signed-in student.
 */
export async function loadTopicQuestionProgress({
  topicId = null,
  topicName = "",
  userId = null,
  sb: client = null,
} = {}) {
  if (!topicId || !userId) {
    return null;
  }

  const sb = client ?? (await getClient());
  const questionIds = await fetchTopicQuestionIds(sb, topicId);

  if (!questionIds.length) {
    return buildTopicQuestionProgress({
      topicId,
      topicName,
      questionIds: [],
      knowledgeAttempts: [],
      questions: [],
    });
  }

  const [examRows, practiceRows] = await Promise.all([
    fetchExamAttemptRows(sb, userId),
    fetchPracticeAttemptRows(sb, userId),
  ]);

  const knowledgeAttempts = toKnowledgeAttempts(examRows, practiceRows);
  const questions = await fetchQuestionCatalogByIds(questionIds, { sb });

  return buildTopicQuestionProgress({
    topicId,
    topicName,
    questionIds,
    knowledgeAttempts,
    questions,
  });
}
