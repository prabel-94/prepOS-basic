/**
 * PrepOS Teacher Intelligence Layer
 * Classroom-level aggregation across canonical student analytics.
 * No DOM, no pedagogical wording, no rendering.
 */

import { getClient } from "../core/get-client.js";
import { fetchTeacherLearnerContext } from "../core/learner-context.js";
import { getBatchDetails } from "../core/batch-management.js";
import {
  buildTopicMastery,
  buildWeakTopics,
  extractQuestionTopics,
} from "../analytics/knowledge-analytics.js";
import {
  buildKnowledgeQuestionStats,
  buildQuestionLookup,
  hardestQuestions,
} from "../analytics/attempt-analytics.js";
import { buildKnowledgeQuestionDifficulty } from "../analytics/difficulty-engine.js";
import { buildAttemptRecord } from "../analytics/analytics-submission.js";
import { deriveMasteryConfidence } from "../analytics/mastery-inspector.js";
import { isKnowledgeEligible } from "../analytics/analytics-scope.js";

const WEAK_TOPIC_THRESHOLD = 70;
const AT_RISK_SCORE_THRESHOLD = 50;
const HIGH_PERFORMER_THRESHOLD = 80;

export function normalizeTopicKey(topic) {
  const name =
    typeof topic === "string"
      ? topic
      : topic?.name ?? topic?.topicName ?? topic?.label ?? "";

  return String(name).trim().toLowerCase().replace(/\s+/g, " ");
}

function mapQuestionRow(row = {}) {
  const topics = (row.question_topics || [])
    .map((link) => link.topics?.name)
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

async function fetchTeacherExams(sb, userId, role) {
  let query = sb
    .from("exam_sessions")
    .select("id, title, created_at, duration, created_by")
    .order("created_at", { ascending: false });

  if (role !== "admin") {
    query = query.eq("created_by", userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchClassroomAttempts(sb, examIds = []) {
  if (!examIds.length) return [];

  const { data, error } = await sb
    .from("exam_attempts")
    .select("id, exam_id, student_id, student_name, score, answers, submitted_at, time_taken")
    .in("exam_id", examIds)
    .order("submitted_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchPublicAttemptCount(sb, examIds = []) {
  if (!examIds.length) return 0;

  const { count, error } = await sb
    .from("public_exam_attempts")
    .select("id", { count: "exact", head: true })
    .in("exam_id", examIds);

  if (error) {
    console.warn("[Teacher Intelligence] public attempt count failed", error);
    return 0;
  }

  return count ?? 0;
}

async function fetchQuestionsForAttempts(sb, attemptRows = []) {
  const questionIds = new Set();

  for (const attempt of attemptRows) {
    for (const answer of attempt.answers || []) {
      const id = answer.question_id ?? answer.questionId;
      if (id) questionIds.add(id);
    }
  }

  if (!questionIds.size) return [];

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
    console.warn("[Teacher Intelligence] question fetch failed", error);
    return [];
  }

  return (data || []).map(mapQuestionRow);
}

function toAttemptRecords(rows = []) {
  return rows.map((row) =>
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

function uniqueStudents(attemptRows = []) {
  const keys = new Set();
  for (const row of attemptRows) {
    const key = row.student_id || row.student_name || row.id;
    if (key) keys.add(String(key));
  }
  return keys.size;
}

function groupAttemptsByStudent(attemptRows = []) {
  const groups = new Map();

  for (const row of attemptRows) {
    const key = row.student_id || row.student_name || row.id;
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  return groups;
}

function averageScoreFromRows(rows = []) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + Number(row.score ?? 0), 0);
  return total / rows.length;
}

function scoreSpread(rows = []) {
  if (!rows.length) return 0;
  const scores = rows.map((row) => Number(row.score ?? 0));
  return Math.max(...scores) - Math.min(...scores);
}

function buildPerStudentTopicMastery(attemptRows = [], questions = []) {
  const byStudent = groupAttemptsByStudent(attemptRows);
  const studentTopicMaps = new Map();

  for (const [studentKey, rows] of byStudent.entries()) {
    const records = toAttemptRecords(rows);
    const mastery = buildTopicMastery({ attempts: records, questions });
    studentTopicMaps.set(studentKey, mastery);
  }

  return studentTopicMaps;
}

export function aggregateClassroomMastery({
  attempts = [],
  questions = [],
} = {}) {
  const mastery = buildTopicMastery({ attempts, questions });

  return mastery.map((topic) => ({
    ...topic,
    normalizedKey: normalizeTopicKey(topic.topicName),
    knowledgeEligible: true,
    classroomScope: true,
  }));
}

export function aggregateClassroomWeakTopics({
  attempts = [],
  attemptRows = [],
  questions = [],
  limit = 8,
} = {}) {
  const weak = buildWeakTopics({ attempts, questions, limit, maxAccuracy: WEAK_TOPIC_THRESHOLD });

  const studentTopicMaps = buildPerStudentTopicMastery(attemptRows, questions);
  const totalStudents = studentTopicMaps.size || uniqueStudents(attemptRows);

  return weak.map((topic) => {
    const key = normalizeTopicKey(topic.topicName);
    let affectedStudents = 0;

    for (const mastery of studentTopicMaps.values()) {
      const studentTopic = mastery.find((t) => normalizeTopicKey(t.topicName) === key);
      if (studentTopic && (studentTopic.masteryScore ?? 100) < WEAK_TOPIC_THRESHOLD) {
        affectedStudents += 1;
      }
    }

    const struggleRate =
      totalStudents > 0 ? Math.round((affectedStudents / totalStudents) * 100) : 0;

    return {
      ...topic,
      normalizedKey: key,
      affectedStudents,
      totalStudents,
      struggleRate,
      classroomAverage: topic.accuracy ?? topic.masteryScore ?? 0,
    };
  });
}

export function aggregateStudentDistribution({
  attemptRows = [],
  attempts = [],
  questions = [],
} = {}) {
  const byStudent = groupAttemptsByStudent(attemptRows);
  const studentTopicMaps = buildPerStudentTopicMastery(attemptRows, questions);

  const buckets = {
    high_performers: [],
    average_performers: [],
    at_risk: [],
    unstable_mastery: [],
  };

  for (const [studentKey, rows] of byStudent.entries()) {
    const avgScore = averageScoreFromRows(rows);
    const mastery = studentTopicMaps.get(studentKey) || [];
    const criticalTopics = mastery.filter((t) => (t.masteryScore ?? 100) < 50).length;
    const scores = rows.map((r) => Number(r.score ?? 0));
    const scoreVariance =
      scores.length >= 3
        ? Math.max(...scores) - Math.min(...scores)
        : 0;

    const masterySpread =
      mastery.length >= 2
        ? Math.max(...mastery.map((t) => t.masteryScore ?? 0)) -
          Math.min(...mastery.map((t) => t.masteryScore ?? 0))
        : 0;

    const profile = {
      studentKey,
      attemptCount: rows.length,
      averageScore: Math.round(avgScore),
      criticalTopicCount: criticalTopics,
      scoreVariance,
      masterySpread: Math.round(masterySpread),
    };

    if (avgScore < AT_RISK_SCORE_THRESHOLD || criticalTopics >= 2) {
      buckets.at_risk.push(profile);
    } else if (scoreVariance >= 25 || masterySpread >= 40) {
      buckets.unstable_mastery.push(profile);
    } else if (avgScore >= HIGH_PERFORMER_THRESHOLD && criticalTopics === 0) {
      buckets.high_performers.push(profile);
    } else {
      buckets.average_performers.push(profile);
    }
  }

  return {
    ...buckets,
    totalStudents: byStudent.size,
    summary: {
      highPerformers: buckets.high_performers.length,
      averagePerformers: buckets.average_performers.length,
      atRisk: buckets.at_risk.length,
      unstableMastery: buckets.unstable_mastery.length,
    },
  };
}

export function aggregateQuestionDifficulty({
  attempts = [],
  questions = [],
  limit = 8,
} = {}) {
  const stats = buildKnowledgeQuestionStats(attempts, { questions });
  const lookup = buildQuestionLookup(questions);
  const hardest = hardestQuestions(stats, { limit, mode: "knowledge" });

  return hardest
    .map((stat) => {
    const question =
      lookup.get(String(stat.questionId)) ?? {
        question_id: stat.questionId,
        id: stat.questionId,
      };
    const difficulty = buildKnowledgeQuestionDifficulty(stat, question);
    if (!difficulty) return null;

    const topics = extractQuestionTopics(question);

    const ambiguousSignal =
      stat.attempts >= 5 &&
      stat.accuracy >= 35 &&
      stat.accuracy <= 65 &&
      stat.skipRate >= 15;

    const unstableSignal =
      stat.attempts >= 4 && stat.accuracy >= 25 && stat.accuracy <= 55;

    return {
      questionId: stat.questionId,
      questionText: question.question_text ?? question.text ?? "Question",
      topics,
      attempts: stat.attempts,
      accuracy: Math.round(stat.accuracy ?? 0),
      skipRate: Math.round(stat.skipRate ?? 0),
      difficultyLabel: difficulty.analyticsDifficulty ?? "unknown",
      difficultyScore: difficulty.difficultyScore ?? 0,
      signals: {
        universallyMissed: (stat.accuracy ?? 100) < 30,
        highSkipRate: (stat.skipRate ?? 0) >= 20,
        unstableDifficulty: unstableSignal,
        potentiallyAmbiguous: ambiguousSignal,
      },
      knowledgeEligible: stat.knowledgeEligible === true,
    };
  })
    .filter(Boolean);
}

export function aggregateTopicDifficulty({
  classroomMastery = [],
  questionDifficulty = [],
} = {}) {
  const byTopic = new Map();

  for (const topic of classroomMastery) {
    const key = normalizeTopicKey(topic.topicName);
    byTopic.set(key, {
      topicName: topic.topicName,
      normalizedKey: key,
      masteryScore: topic.masteryScore ?? 0,
      analyticsDifficulty: topic.analyticsDifficulty ?? "unknown",
      questionCount: 0,
      hardestQuestionAccuracy: null,
    });
  }

  for (const question of questionDifficulty) {
    for (const topicName of question.topics || []) {
      const key = normalizeTopicKey(topicName);
      if (!byTopic.has(key)) {
        byTopic.set(key, {
          topicName,
          normalizedKey: key,
          masteryScore: 0,
          analyticsDifficulty: "unknown",
          questionCount: 0,
          hardestQuestionAccuracy: null,
        });
      }
      const entry = byTopic.get(key);
      entry.questionCount += 1;
      if (
        entry.hardestQuestionAccuracy == null ||
        question.accuracy < entry.hardestQuestionAccuracy
      ) {
        entry.hardestQuestionAccuracy = question.accuracy;
      }
    }
  }

  return [...byTopic.values()].sort(
    (a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0)
  );
}

export function aggregateInterventionSignals({
  weakTopics = [],
  classroomMastery = [],
  examIds = [],
  canonicalAttemptCount = 0,
} = {}) {
  const signals = [];

  for (const topic of weakTopics) {
    const struggleRate = topic.struggleRate ?? 0;
    if (struggleRate < 20 && (topic.affectedStudents ?? 0) < 2) continue;

    signals.push({
      type: "weak_topic_cluster",
      topicName: topic.topicName,
      normalizedKey: topic.normalizedKey,
      affectedStudents: topic.affectedStudents ?? 0,
      totalStudents: topic.totalStudents ?? 0,
      struggleRate,
      classroomAverage: Math.round(topic.classroomAverage ?? 0),
      confidence: deriveTopicConfidence({
        affectedStudents: topic.affectedStudents,
        examCount: examIds.length,
        attemptCount: canonicalAttemptCount,
      }),
      examCount: examIds.length,
      recommendation: buildInterventionRecommendation(topic),
    });
  }

  for (const topic of classroomMastery.filter((t) => {
    const score = t.masteryScore ?? 0;
    return score >= 50 && score < 65;
  })) {
    signals.push({
      type: "unstable_mastery",
      topicName: topic.topicName,
      normalizedKey: normalizeTopicKey(topic.topicName),
      classroomAverage: Math.round(topic.masteryScore ?? 0),
      confidence: "medium",
      recommendation: `Reinforce ${topic.topicName} with targeted canonical assessments before expanding coverage.`,
    });
  }

  return signals.sort((a, b) => (b.struggleRate ?? 0) - (a.struggleRate ?? 0));
}

function deriveTopicConfidence({ affectedStudents = 0, examCount = 0, attemptCount = 0 }) {
  if (affectedStudents >= 5 && examCount >= 3 && attemptCount >= 15) return "high";
  if (affectedStudents >= 2 && examCount >= 1 && attemptCount >= 5) return "medium";
  return "low";
}

function buildInterventionRecommendation(topic = {}) {
  const name = topic.topicName || "this topic";
  const rate = topic.struggleRate ?? 0;
  if (rate >= 50) {
    return `Schedule a focused revision block for ${name} — a majority of students show weak mastery.`;
  }
  return `Review ${name} with exemplar questions and short formative checks.`;
}

export function aggregateExamPerformance({ exams = [], attemptRows = [] } = {}) {
  const byExam = new Map();

  for (const exam of exams) {
    byExam.set(exam.id, {
      examId: exam.id,
      title: exam.title || "Untitled Exam",
      createdAt: exam.created_at,
      studentCount: 0,
      attemptCount: 0,
      averageScore: 0,
      scoreSpread: 0,
      rows: [],
    });
  }

  for (const row of attemptRows) {
    const bucket = byExam.get(row.exam_id);
    if (!bucket) continue;
    bucket.rows.push(row);
  }

  return [...byExam.values()]
    .map((exam) => {
      const studentKeys = new Set(
        exam.rows.map((r) => r.student_id || r.student_name).filter(Boolean)
      );

      return {
        examId: exam.examId,
        title: exam.title,
        createdAt: exam.createdAt,
        studentCount: studentKeys.size,
        attemptCount: exam.rows.length,
        averageScore: Math.round(averageScoreFromRows(exam.rows)),
        scoreSpread: Math.round(scoreSpread(exam.rows)),
      };
    })
    .filter((exam) => exam.attemptCount > 0)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function aggregateConfidenceDistribution({
  classroomMastery = [],
  canonicalAttemptCount = 0,
  questionCount = 0,
  examCount = 0,
  publicAttemptCount = 0,
} = {}) {
  const topicWarnings = classroomMastery
    .filter((topic) => (topic.attemptCount ?? topic.canonicalAttempts ?? 0) < 3)
    .map((topic) => ({
      topicName: topic.topicName,
      normalizedKey: normalizeTopicKey(topic.topicName),
      reason: "insufficient_topic_attempts",
      message: `Only ${topic.attemptCount ?? 0} canonical assessments available for this topic.`,
    }));

  const overall = deriveMasteryConfidence({
    canonicalAttempts: canonicalAttemptCount,
    contributingQuestions: questionCount,
    excludedAttempts: publicAttemptCount,
  });

  const lowCoverageTopics = classroomMastery.filter(
    (t) => (t.masteryScore ?? 0) > 0 && (t.canonicalAttempts ?? 0) < 2
  ).length;

  return {
    overall: {
      level: overall.confidence,
      reason: overall.confidenceReason,
    },
    topicWarnings,
    lowCoverageTopics,
    publicAttemptsExcluded: publicAttemptCount,
    examCount,
    canonicalAttemptCount,
    insufficientCoverage: canonicalAttemptCount < 5 || questionCount < 3,
    unstableTopics: classroomMastery.filter((t) => {
      const score = t.masteryScore ?? 0;
      return score >= 45 && score <= 60;
    }).length,
  };
}

function buildClassroomSnapshot({
  classroomMastery = [],
  weakTopics = [],
  studentDistribution = {},
  confidenceDistribution = {},
  examInsights = [],
} = {}) {
  const mastered = classroomMastery.filter((t) => (t.masteryScore ?? 0) >= 85);
  const atRiskTopics = classroomMastery.filter(
    (t) => (t.masteryScore ?? 0) < 50
  ).length;

  const trend = deriveClassroomTrend(examInsights);

  return {
    topicsMastered: mastered.length,
    weakTopicCount: weakTopics.length,
    atRiskTopicCount: atRiskTopics,
    totalTopics: classroomMastery.length,
    classroomConfidence: confidenceDistribution.overall?.level ?? "low",
    classroomConfidenceLabel: confidenceLabel(
      confidenceDistribution.overall?.level
    ),
    recentTrend: trend,
    studentCount: studentDistribution.totalStudents ?? 0,
    atRiskStudentCount: studentDistribution.summary?.atRisk ?? 0,
    hasClassroomData: classroomMastery.length > 0,
    canonicalExamCount: examInsights.length,
  };
}

function confidenceLabel(level = "low") {
  if (level === "high") return "High Confidence";
  if (level === "medium") return "Medium Confidence";
  return "Low Confidence";
}

function deriveClassroomTrend(examInsights = []) {
  if (examInsights.length < 2) return "stable";
  const recent = examInsights.slice(0, Math.ceil(examInsights.length / 2));
  const older = examInsights.slice(Math.ceil(examInsights.length / 2));
  const recentAvg =
    recent.reduce((s, e) => s + e.averageScore, 0) / recent.length;
  const olderAvg =
    older.reduce((s, e) => s + e.averageScore, 0) / older.length;
  if (recentAvg > olderAvg + 5) return "improving";
  if (recentAvg < olderAvg - 5) return "declining";
  return "stable";
}

function resolveEmptyReason({
  canonicalAttemptCount = 0,
  classroomMastery = [],
  publicAttemptCount = 0,
} = {}) {
  if (!canonicalAttemptCount) {
    return publicAttemptCount > 0 ? "public_only_history" : "no_analytics";
  }
  if (!classroomMastery.length) return "no_topic_linked_data";
  return null;
}

export function buildClassroomLearningState(intelligence = {}) {
  const {
    exams = [],
    attemptRows = [],
    canonicalAttempts = [],
    questions = [],
    publicAttemptCount = 0,
    userId = null,
    role = null,
  } = intelligence;

  const examIds = exams.map((e) => e.id);

  const classroomMastery = aggregateClassroomMastery({
    attempts: canonicalAttempts,
    questions,
  });

  const weakTopics = aggregateClassroomWeakTopics({
    attempts: canonicalAttempts,
    attemptRows,
    questions,
  });

  const studentDistribution = aggregateStudentDistribution({
    attemptRows,
    attempts: canonicalAttempts,
    questions,
  });

  const questionDifficulty = aggregateQuestionDifficulty({
    attempts: canonicalAttempts,
    questions,
  });

  const difficultConcepts = aggregateTopicDifficulty({
    classroomMastery,
    questionDifficulty,
  });

  const interventionSignals = aggregateInterventionSignals({
    weakTopics,
    classroomMastery,
    examIds,
    canonicalAttemptCount: attemptRows.length,
  });

  const examInsights = aggregateExamPerformance({ exams, attemptRows });

  const confidenceDistribution = aggregateConfidenceDistribution({
    classroomMastery,
    canonicalAttemptCount: attemptRows.length,
    questionCount: questions.filter((q) => isKnowledgeEligible(q)).length,
    examCount: exams.length,
    publicAttemptCount,
  });

  const snapshot = buildClassroomSnapshot({
    classroomMastery,
    weakTopics,
    studentDistribution,
    confidenceDistribution,
    examInsights,
  });

  return {
    snapshot,
    classroomMastery,
    weakTopics,
    difficultConcepts,
    interventionSignals,
    studentDistribution,
    questionDifficulty,
    examInsights,
    confidenceDistribution,
    metadata: {
      teacherId: userId,
      role,
      examCount: exams.length,
      canonicalAttemptCount: attemptRows.length,
      publicAttemptCount,
      studentCount: studentDistribution.totalStudents ?? 0,
      questionCount: questions.length,
      hasClassroomData: classroomMastery.length > 0,
      emptyReason: resolveEmptyReason({
        canonicalAttemptCount: attemptRows.length,
        classroomMastery,
        publicAttemptCount,
      }),
      exams,
    },
  };
}

export async function loadTeacherIntelligence(options = {}) {
  const {
    batchId = null,
    excludeLinkedLearners = true,
  } = options;

  const sb = await getClient();
  const { data: userData } = await sb.auth.getUser();
  const user = userData?.user;

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data: profile } = await sb
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "teacher";
  const exams = await fetchTeacherExams(sb, user.id, role);
  const examIds = exams.map((e) => e.id);

  let [attemptRows, publicAttemptCount] = await Promise.all([
    fetchClassroomAttempts(sb, examIds),
    fetchPublicAttemptCount(sb, examIds),
  ]);

  if (excludeLinkedLearners) {
    const learnerContext = await fetchTeacherLearnerContext(sb);
    const linkedStudentId = learnerContext?.studentUserId ?? null;
    const excludeLinked =
      learnerContext?.excludeFromClassAnalytics !== false;

    if (linkedStudentId && excludeLinked) {
      attemptRows = attemptRows.filter(
        (row) => row.student_id !== linkedStudentId
      );
    }
  }

  if (batchId) {
    const batch = await getBatchDetails(batchId);
    const memberIds = new Set(
      (batch?.members ?? []).map((member) => member.userId).filter(Boolean)
    );

    if (memberIds.size) {
      attemptRows = attemptRows.filter((row) =>
        memberIds.has(row.student_id)
      );
    } else {
      attemptRows = [];
    }
  }

  const canonicalAttempts = toAttemptRecords(attemptRows);
  const questions = await fetchQuestionsForAttempts(sb, attemptRows);

  return {
    userId: user.id,
    role,
    exams,
    attemptRows,
    canonicalAttempts,
    questions,
    publicAttemptCount,
    batchId,
    excludeLinkedLearners,
  };
}

export function debugTeacherIntelligence(state = null) {
  return {
    classroomState: state,
    snapshot: state?.snapshot ?? null,
    interventionSignals: state?.interventionSignals ?? [],
    weakTopics: state?.weakTopics ?? [],
    difficultConcepts: state?.difficultConcepts ?? [],
    questionDifficulty: state?.questionDifficulty ?? [],
    confidenceDistribution: state?.confidenceDistribution ?? null,
    studentDistribution: state?.studentDistribution ?? null,
    metadata: state?.metadata ?? null,
  };
}

window.debugTeacherIntelligence = () =>
  debugTeacherIntelligence(window.__PREPOS_TEACHER_LEARNING_STATE__ ?? null);
