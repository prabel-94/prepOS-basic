/**
 * PrepOS Student Intelligence Layer
 * Aggregates canonical knowledge analytics across exams.
 * No DOM, no pedagogical wording, no rendering.
 */

import { getClient } from "../core/get-client.js";
import {
  enrichAssignedExam,
  enrichAssignedExamsWithAttemptStatus,
  mapRecentAttemptRows,
} from "./student-exam-meta.js";
import {
  buildKnowledgeAnalytics,
  buildTopicMastery,
  buildWeakTopics,
  buildAdaptiveSignals,
} from "../analytics/knowledge-analytics.js";
import {
  buildAttemptRecord,
  readCachedKnowledgeAnalytics,
} from "../analytics/analytics-submission.js";
import { deriveMasteryConfidence } from "../analytics/mastery-inspector.js";
import { isKnowledgeEligible } from "../analytics/analytics-scope.js";

const KNOWLEDGE_CACHE_KEY = "prepos_knowledge_analytics";

export function normalizeTopicKey(topic) {
  const name =
    typeof topic === "string"
      ? topic
      : topic?.name ?? topic?.topicName ?? topic?.label ?? "";

  return String(name).trim().toLowerCase().replace(/\s+/g, " ");
}

export { normalizeTopicKey as normalizedTopicKey };

export function hydrateKnowledgeAnalytics(examIds = []) {
  const hydrated = [];

  for (const examId of examIds) {
    const cached = readCachedKnowledgeAnalytics(examId);
    if (cached) {
      hydrated.push({ examId, ...cached });
    }
  }

  try {
    const raw = localStorage.getItem(KNOWLEDGE_CACHE_KEY);
    if (raw && !examIds.length) {
      const cache = JSON.parse(raw);
      for (const [examId, payload] of Object.entries(cache)) {
        hydrated.push({ examId, ...payload });
      }
    }
  } catch {
    /* ignore cache parse errors */
  }

  return hydrated;
}

function mapQuestionRow(row = {}) {
  const topics = (row.question_topics || [])
    .map(link => link.topics?.name)
    .filter(Boolean);

  return {
    id: row.id,
    question_id: row.id,
    question_text: row.question_text ?? "",
    text: row.question_text ?? "",
    topics,
    topic_count: topics.length,
    bank_status: "saved",
    is_bank_question: true,
    is_published: true,
    published: true,
  };
}

async function fetchQuestionsForAttempts(sb, attempts = []) {
  const questionIds = new Set();

  for (const attempt of attempts) {
    for (const answer of attempt.answers || []) {
      const id = answer.question_id ?? answer.questionId;
      if (id) {
        questionIds.add(id);
      }
    }
  }

  if (!questionIds.size) {
    return [];
  }

  const { data, error } = await sb
    .from("questions")
    .select(`
      id,
      question_text,
      question_topics (
        topic_id,
        topics ( id, name )
      )
    `)
    .in("id", [...questionIds]);

  if (error) {
    console.warn("[Student Intelligence] question fetch failed", error);
    return [];
  }

  return (data || []).map(mapQuestionRow);
}

async function fetchStudentExamAssignments(sb, userId) {
  const { data, error } = await sb
    .from("exam_assignments")
    .select(`exam_sessions ( id, title, created_at, duration, schema_json )`)
    .eq("student_id", userId);

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => enrichAssignedExam(row.exam_sessions))
    .filter(Boolean);
}

async function fetchCanonicalAttempts(sb, userId) {
  const { data, error } = await sb
    .from("exam_attempts")
    .select(`
      id,
      exam_id,
      score,
      answers,
      submitted_at,
      student_name,
      time_taken,
      question_count,
      exam_sessions ( title )
    `)
    .eq("student_id", userId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

function toAttemptRecords(rows = []) {
  return rows.map(row =>
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
}

function mergeCachedTopicMastery(liveMastery = [], cacheEntries = []) {
  const byKey = new Map();

  for (const topic of liveMastery) {
    const key = normalizeTopicKey(topic.topicName ?? topic.name);
    if (key) {
      byKey.set(key, { ...topic, normalizedKey: key });
    }
  }

  for (const entry of cacheEntries) {
    for (const topic of entry.topicMastery || []) {
      const key = normalizeTopicKey(topic.topicName ?? topic.name);
      if (!key || byKey.has(key)) {
        continue;
      }
      byKey.set(key, {
        ...topic,
        normalizedKey: key,
        fromCache: true,
      });
    }
  }

  return [...byKey.values()].sort(
    (a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0)
  );
}

export function aggregateTopicMastery({ attempts = [], questions = [], cacheEntries = [] } = {}) {
  const live = buildTopicMastery({ attempts, questions }).map(topic => ({
    ...topic,
    normalizedKey: normalizeTopicKey(topic.topicName),
    knowledgeEligible: true,
  }));

  return mergeCachedTopicMastery(live, cacheEntries);
}

export function aggregateWeakTopics(options = {}) {
  const weak = buildWeakTopics({ ...options, limit: options.limit ?? 5 });
  return weak.map(topic => ({
    ...topic,
    normalizedKey: normalizeTopicKey(topic.topicName),
    knowledgeEligible: true,
  }));
}

export function aggregateAdaptiveSignals(options = {}) {
  const signals = buildAdaptiveSignals(options);
  return {
    ...signals,
    practiceTopics: (signals.practiceTopics || []).map(normalizeTopicKey),
  };
}

export function buildLearningSnapshot({
  topicMastery = [],
  weakTopics = [],
  adaptiveSignals = {},
  canonicalAttemptCount = 0,
  confidence = {},
} = {}) {
  const mastered = topicMastery.filter(
    t => (t.masteryScore ?? 0) >= 85 || t.masteryLevel === "strong"
  );

  const recommendedFocus =
    weakTopics[0]?.topicName ??
    adaptiveSignals.practiceTopics?.[0] ??
    null;

  return {
    topicsMastered: mastered.length,
    weakTopicCount: weakTopics.length,
    totalTopics: topicMastery.length,
    knowledgeConfidence: confidence.level ?? "low",
    knowledgeConfidenceLabel: confidence.label ?? "Learning Profile Building",
    recentTrend: confidence.trend ?? "stable",
    recommendedFocus,
    canonicalAttemptCount,
    hasKnowledgeData: topicMastery.length > 0,
  };
}

export function buildStudentLearningState(intelligence = {}) {
  const {
    canonicalAttempts = [],
    questions = [],
    cacheEntries = [],
    recentAttempts = [],
  } = intelligence;

  const examIds = [...new Set(canonicalAttempts.map(a => a.exam_id ?? a.examId).filter(Boolean))];
  const topicMastery = aggregateTopicMastery({
    attempts: canonicalAttempts,
    questions,
    cacheEntries,
  });

  const weakTopics = aggregateWeakTopics({
    attempts: canonicalAttempts,
    questions,
    limit: 5,
  });

  const strongTopics = topicMastery
    .filter(t => (t.masteryScore ?? 0) >= 85 || t.masteryLevel === "strong")
    .slice(0, 5);

  const adaptiveSignals = aggregateAdaptiveSignals({
    attempts: canonicalAttempts,
    questions,
  });

  const confidence = deriveOverallConfidence({
    canonicalAttempts,
    topicMastery,
    questions,
  });

  const snapshot = buildLearningSnapshot({
    topicMastery,
    weakTopics,
    adaptiveSignals,
    canonicalAttemptCount: canonicalAttempts.length,
    confidence,
  });

  const recommendations = buildRecommendations({
    adaptiveSignals,
    weakTopics,
    confidence,
  });

  return {
    snapshot,
    topicMastery,
    weakTopics,
    strongTopics,
    adaptiveSignals,
    recommendations,
    confidence,
    metadata: {
      canonicalAttemptCount: canonicalAttempts.length,
      examCount: examIds.length,
      questionCount: questions.filter(q => isKnowledgeEligible(q)).length,
      hasKnowledgeData: topicMastery.length > 0,
      hasCanonicalAttempts: canonicalAttempts.length > 0,
      recentAttempts,
      emptyReason: resolveEmptyReason({
        canonicalAttempts,
        topicMastery,
        confidence,
      }),
    },
  };
}

function deriveOverallConfidence({ canonicalAttempts = [], topicMastery = [], questions = [] }) {
  const { confidence, confidenceReason } = deriveMasteryConfidence({
    canonicalAttempts: canonicalAttempts.length,
    contributingQuestions: questions.filter(q => isKnowledgeEligible(q)).length,
    excludedAttempts: 0,
  });

  const trend = deriveRecentTrend(canonicalAttempts, topicMastery);

  return {
    level: confidence,
    label: confidenceLabelFromLevel(confidence),
    reason: confidenceReason,
    trend,
  };
}

function confidenceLabelFromLevel(level) {
  if (level === "high") return "High Confidence";
  if (level === "medium") return "Growing Confidence";
  return "Learning Profile Building";
}

function deriveRecentTrend(attempts = [], topicMastery = []) {
  if (attempts.length < 2 || !topicMastery.length) {
    return "stable";
  }

  const recent = attempts.slice(0, Math.ceil(attempts.length / 2));
  const older = attempts.slice(Math.ceil(attempts.length / 2));

  const recentScore = averageScore(recent);
  const olderScore = averageScore(older);

  if (recentScore > olderScore + 5) return "improving";
  if (recentScore < olderScore - 5) return "needs_attention";
  return "stable";
}

function averageScore(attempts = []) {
  if (!attempts.length) return 0;
  const total = attempts.reduce((sum, row) => sum + Number(row.score ?? 0), 0);
  return total / attempts.length;
}

function buildRecommendations({ adaptiveSignals = {}, weakTopics = [], confidence = {} }) {
  if (confidence.level === "low" && !weakTopics.length) {
    return [];
  }

  return (adaptiveSignals.practiceTopics || [])
    .slice(0, 5)
    .map((topicKey, index) => {
      const weak = weakTopics.find(
        w => normalizeTopicKey(w.topicName) === normalizeTopicKey(topicKey)
      );

      return {
        topicKey: normalizeTopicKey(topicKey),
        topicName: weak?.topicName ?? topicKey,
        mastery: weak?.accuracy ?? weak?.masteryScore ?? null,
        confidence: confidence.level ?? "low",
        priority: index + 1,
        knowledgeEligible: true,
      };
    });
}

function resolveEmptyReason({ canonicalAttempts = [], topicMastery = [], confidence = {} }) {
  if (!canonicalAttempts.length) {
    return "no_analytics";
  }

  if (!topicMastery.length) {
    return "public_only_history";
  }

  if (confidence.level === "low") {
    return "low_confidence";
  }

  return null;
}

export async function loadStudentExamDashboardData() {
  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser();
  const user = userData?.user;

  if (!user) {
    throw new Error("User not authenticated");
  }

  const [exams, attemptRows] = await Promise.all([
    fetchStudentExamAssignments(sb, user.id),
    fetchCanonicalAttempts(sb, user.id),
  ]);

  return {
    exams: enrichAssignedExamsWithAttemptStatus(exams, attemptRows),
    attemptRows,
    recentAttempts: mapRecentAttemptRows(attemptRows),
  };
}

export async function loadStudentIntelligence({ attemptRows: prefetchedAttemptRows } = {}) {
  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser();
  const user = userData?.user;

  if (!user) {
    throw new Error("User not authenticated");
  }

  const attemptRows =
    prefetchedAttemptRows ?? (await fetchCanonicalAttempts(sb, user.id));

  const canonicalAttempts = toAttemptRecords(attemptRows);
  const examIds = [...new Set(canonicalAttempts.map(a => a.exam_id ?? a.examId).filter(Boolean))];
  const cacheEntries = hydrateKnowledgeAnalytics(examIds);
  const questions = await fetchQuestionsForAttempts(sb, attemptRows);

  const knowledge = buildKnowledgeAnalytics({
    exam: { id: null, title: "Student Portfolio" },
    attempt: canonicalAttempts[0] ?? {},
    allAttempts: canonicalAttempts,
    questions,
  });

  return {
    userId: user.id,
    canonicalAttempts,
    questions,
    cacheEntries,
    knowledge,
    recentAttempts: mapRecentAttemptRows(attemptRows),
  };
}

export function debugStudentIntelligence(state = null) {
  return {
    learningState: state,
    snapshot: state?.snapshot ?? null,
    weakTopics: state?.weakTopics ?? [],
    strongTopics: state?.strongTopics ?? [],
    recommendations: state?.recommendations ?? [],
    confidence: state?.confidence ?? null,
    metadata: state?.metadata ?? null,
  };
}

window.debugStudentIntelligence = () =>
  debugStudentIntelligence(window.__PREPOS_STUDENT_LEARNING_STATE__ ?? null);
