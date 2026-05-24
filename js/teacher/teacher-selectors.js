/**
 * PrepOS Teacher Selectors
 * Translates classroom analytics into intervention-oriented teaching intelligence.
 */

import { normalizeTopicKey } from "./teacher-intelligence.js";

const TREND_LABELS = {
  improving: "Classroom performance is trending upward across recent exams.",
  declining: "Recent exams show declining classroom performance — review weak topics.",
  stable: "Classroom performance is stable across recent canonical exams.",
};

const WEAK_THRESHOLD = 70;

export function selectClassroomSnapshot(state = {}) {
  const snapshot = state.snapshot ?? {};
  const metadata = state.metadata ?? {};

  return {
    topicsMastered: snapshot.topicsMastered ?? 0,
    weakTopics: snapshot.weakTopicCount ?? 0,
    atRiskTopics: snapshot.atRiskTopicCount ?? 0,
    classroomConfidence: snapshot.classroomConfidence ?? "low",
    classroomConfidenceLabel: snapshot.classroomConfidenceLabel ?? "Low Confidence",
    recentTrend: snapshot.recentTrend ?? "stable",
    trendMessage: TREND_LABELS[snapshot.recentTrend] ?? TREND_LABELS.stable,
    studentCount: snapshot.studentCount ?? 0,
    atRiskStudentCount: snapshot.atRiskStudentCount ?? 0,
    totalTopics: snapshot.totalTopics ?? 0,
    hasData: snapshot.hasClassroomData === true,
    emptyReason: metadata.emptyReason ?? null,
  };
}

export function selectInterventionCards(state = {}, { limit = 6 } = {}) {
  const signals = state.interventionSignals ?? [];
  const weakTopics = state.weakTopics ?? [];

  const cards = signals.slice(0, limit).map((signal) => ({
    id: `intervention-${signal.normalizedKey || signal.topicName}`,
    type: signal.type,
    title: formatInterventionTitle(signal),
    body: formatInterventionBody(signal),
    topicName: signal.topicName,
    affectedStudents: signal.affectedStudents ?? 0,
    totalStudents: signal.totalStudents ?? 0,
    struggleRate: signal.struggleRate ?? 0,
    confidence: signal.confidence ?? "low",
    confidenceLabel: capitalizeConfidence(signal.confidence),
    recommendation: signal.recommendation ?? "",
    examCount: signal.examCount ?? 0,
    priority: interventionPriority(signal),
    inspectorId: "topic-inspector",
    inspectorData: { topicName: signal.topicName, signal },
  }));

  if (cards.length) return cards;

  return weakTopics.slice(0, limit).map((topic) => ({
    id: `weak-${topic.normalizedKey}`,
    type: "weak_topic",
    title: `${topic.topicName} needs classroom attention`,
    body: `${topic.affectedStudents ?? 0} of ${topic.totalStudents ?? 0} students show weak mastery.`,
    topicName: topic.topicName,
    affectedStudents: topic.affectedStudents ?? 0,
    totalStudents: topic.totalStudents ?? 0,
    struggleRate: topic.struggleRate ?? 0,
    confidence: "low",
    confidenceLabel: "Low Confidence",
    recommendation: `Review ${topic.topicName} with formative checks.`,
    examCount: state.metadata?.examCount ?? 0,
    priority: "medium",
    inspectorId: "topic-inspector",
    inspectorData: { topicName: topic.topicName, topic },
  }));
}

function formatInterventionTitle(signal = {}) {
  if (signal.type === "unstable_mastery") {
    return `${signal.topicName} mastery appears unstable`;
  }
  const rate = signal.struggleRate ?? 0;
  if (rate >= 40) {
    return `${rate}% of students struggle with ${signal.topicName}`;
  }
  return `Intervene on ${signal.topicName}`;
}

function formatInterventionBody(signal = {}) {
  if (signal.type === "unstable_mastery") {
    return `Classroom average ${signal.classroomAverage ?? 0}% — mastery is borderline and may need reinforcement.`;
  }
  const parts = [];
  if (signal.affectedStudents != null && signal.totalStudents != null) {
    parts.push(
      `${signal.affectedStudents} of ${signal.totalStudents} students affected.`
    );
  }
  if (signal.examCount) {
    parts.push(`Observed across ${signal.examCount} canonical exam${signal.examCount === 1 ? "" : "s"}.`);
  }
  return parts.join(" ");
}

function interventionPriority(signal = {}) {
  const rate = signal.struggleRate ?? 0;
  if (rate >= 50 || signal.type === "unstable_mastery") return "high";
  if (rate >= 25) return "medium";
  return "low";
}

function capitalizeConfidence(level = "low") {
  if (level === "high") return "High Confidence";
  if (level === "medium") return "Medium Confidence";
  return "Low Confidence";
}

export function selectWeakTopicDistribution(state = {}, { limit = 8 } = {}) {
  return (state.weakTopics ?? []).slice(0, limit).map((topic) => ({
    topicName: topic.topicName,
    normalizedKey: topic.normalizedKey ?? normalizeTopicKey(topic.topicName),
    affectedStudents: topic.affectedStudents ?? 0,
    totalStudents: topic.totalStudents ?? 0,
    masteryAverage: Math.round(topic.classroomAverage ?? topic.masteryScore ?? 0),
    confidence: topicConfidenceFromCoverage(topic, state),
    trend: inferTopicTrend(topic),
    struggleRate: topic.struggleRate ?? 0,
    inspectorId: "topic-inspector",
    inspectorData: { topicName: topic.topicName, topic },
  }));
}

function topicConfidenceFromCoverage(topic = {}, state = {}) {
  const attempts = topic.attemptCount ?? topic.canonicalAttempts ?? 0;
  const exams = state.metadata?.examCount ?? 0;
  if (attempts >= 10 && exams >= 2) return "high";
  if (attempts >= 4) return "medium";
  return "low";
}

function inferTopicTrend(topic = {}) {
  const score = topic.masteryScore ?? topic.classroomAverage ?? 0;
  if (score < 50) return "critical";
  if (score < WEAK_THRESHOLD) return "weak";
  return "watch";
}

export function selectHardestConcepts(state = {}, { limit = 6 } = {}) {
  const concepts = state.difficultConcepts ?? [];

  return concepts.slice(0, limit).map((concept) => ({
    topicName: concept.topicName,
    normalizedKey: concept.normalizedKey,
    masteryScore: Math.round(concept.masteryScore ?? 0),
    difficulty: concept.analyticsDifficulty ?? "unknown",
    questionCount: concept.questionCount ?? 0,
    hardestQuestionAccuracy: concept.hardestQuestionAccuracy,
    summary: buildConceptSummary(concept),
    inspectorId: "mastery-inspector",
    inspectorData: { topicName: concept.topicName, concept },
  }));
}

function buildConceptSummary(concept = {}) {
  const mastery = concept.masteryScore ?? 0;
  const hardest = concept.hardestQuestionAccuracy;
  if (hardest != null && hardest < 35) {
    return `Hardest linked questions average ${hardest}% accuracy.`;
  }
  if (mastery < 50) {
    return `Classroom mastery is critically low at ${Math.round(mastery)}%.`;
  }
  return `Classroom mastery ${Math.round(mastery)}% with elevated question difficulty.`;
}

export function selectAtRiskStudents(state = {}, { limit = 8 } = {}) {
  const distribution = state.studentDistribution ?? {};
  const atRisk = distribution.at_risk ?? [];
  const unstable = distribution.unstable_mastery ?? [];

  const profiles = [
    ...atRisk.map((p) => ({ ...p, category: "at_risk" })),
    ...unstable.map((p) => ({ ...p, category: "unstable_mastery" })),
  ].slice(0, limit);

  return profiles.map((profile) => ({
    category: profile.category,
    attemptCount: profile.attemptCount ?? 0,
    averageScore: profile.averageScore ?? 0,
    criticalTopicCount: profile.criticalTopicCount ?? 0,
    scoreVariance: profile.scoreVariance ?? 0,
    masterySpread: profile.masterySpread ?? 0,
    label: profile.category === "at_risk" ? "Needs remediation support" : "Unstable mastery pattern",
    recommendation:
      profile.category === "at_risk"
        ? "Prioritize foundational review and one-on-one check-ins."
        : "Use consistent formative checks to stabilize topic understanding.",
    inspectorId: "classroom-breakdown",
    inspectorData: { category: profile.category, profile },
  }));
}

export function selectQuestionQualitySignals(state = {}, { limit = 6 } = {}) {
  const questions = state.questionDifficulty ?? [];

  return questions.slice(0, limit).map((q) => ({
    questionId: q.questionId,
    questionText: truncateText(q.questionText, 120),
    topics: q.topics ?? [],
    accuracy: q.accuracy ?? 0,
    skipRate: q.skipRate ?? 0,
    difficultyLabel: q.difficultyLabel ?? "unknown",
    signals: q.signals ?? {},
    qualityFlags: buildQualityFlags(q),
    summary: buildQuestionSummary(q),
    inspectorId: "question-inspector",
    inspectorData: { questionId: q.questionId, question: q },
  }));
}

function buildQualityFlags(q = {}) {
  const flags = [];
  const s = q.signals ?? {};
  if (s.universallyMissed) flags.push("universally_missed");
  if (s.highSkipRate) flags.push("high_skip_rate");
  if (s.unstableDifficulty) flags.push("unstable_difficulty");
  if (s.potentiallyAmbiguous) flags.push("potentially_ambiguous");
  return flags;
}

function buildQuestionSummary(q = {}) {
  const flags = buildQualityFlags(q);
  if (flags.includes("potentially_ambiguous")) {
    return "Mid-range accuracy with elevated skips — review wording and distractors.";
  }
  if (flags.includes("universally_missed")) {
    return "Universally missed — verify concept alignment or difficulty calibration.";
  }
  if (flags.includes("high_skip_rate")) {
    return "High skip rate — students may find this question confusing or off-scope.";
  }
  return `Hardest canonical question at ${q.accuracy ?? 0}% accuracy.`;
}

function truncateText(text = "", max = 120) {
  const value = String(text).trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function selectDifficultyInsights(state = {}) {
  const questions = state.questionDifficulty ?? [];
  const concepts = state.difficultConcepts ?? [];

  return {
    hardestQuestions: questions.slice(0, 5),
    lowPerformingTopics: concepts.filter((c) => (c.masteryScore ?? 0) < 60).slice(0, 5),
    highSkipQuestions: questions.filter((q) => (q.skipRate ?? 0) >= 15).slice(0, 5),
    unstableQuestions: questions.filter((q) => q.signals?.unstableDifficulty).slice(0, 5),
  };
}

export function selectTopicCoverage(state = {}) {
  const mastery = state.classroomMastery ?? [];
  const metadata = state.metadata ?? {};

  const covered = mastery.filter((t) => (t.canonicalAttempts ?? t.attemptCount ?? 0) >= 3);
  const thin = mastery.filter((t) => (t.canonicalAttempts ?? t.attemptCount ?? 0) < 3);

  return {
    totalTopics: mastery.length,
    wellCoveredTopics: covered.length,
    thinCoverageTopics: thin.length,
    coverageRatio:
      mastery.length > 0 ? Math.round((covered.length / mastery.length) * 100) : 0,
    examCount: metadata.examCount ?? 0,
    canonicalAttemptCount: metadata.canonicalAttemptCount ?? 0,
    message:
      thin.length > covered.length
        ? "More verified topic-linked assessments are needed for reliable classroom intelligence."
        : "Topic coverage supports classroom-level inference.",
  };
}

export function selectConfidenceWarnings(state = {}) {
  const confidence = state.confidenceDistribution ?? {};
  const warnings = [];

  if (confidence.insufficientCoverage) {
    warnings.push({
      type: "insufficient_coverage",
      level: "low",
      title: "Insufficient canonical coverage",
      message:
        "More verified topic-linked assessments are needed for reliable classroom intelligence.",
      inspectorId: "confidence-inspector",
      inspectorData: { reason: "insufficient_coverage" },
    });
  }

  for (const topic of confidence.topicWarnings ?? []) {
    warnings.push({
      type: "topic_low_data",
      level: "low",
      title: `Low data: ${topic.topicName}`,
      message: topic.message,
      topicName: topic.topicName,
      inspectorId: "confidence-inspector",
      inspectorData: { topic },
    });
  }

  if ((confidence.unstableTopics ?? 0) > 0) {
    warnings.push({
      type: "unstable_topics",
      level: "medium",
      title: "Unstable topic inference",
      message: `${confidence.unstableTopics} topic(s) sit in a borderline mastery band — treat recommendations cautiously.`,
      inspectorId: "confidence-inspector",
      inspectorData: { count: confidence.unstableTopics },
    });
  }

  if ((confidence.publicAttemptsExcluded ?? 0) > 0 && !(state.metadata?.canonicalAttemptCount > 0)) {
    warnings.push({
      type: "public_only",
      level: "info",
      title: "Public practice only",
      message:
        "Public practice attempts do not contribute to classroom mastery intelligence.",
      inspectorId: "confidence-inspector",
      inspectorData: { publicAttemptCount: confidence.publicAttemptsExcluded },
    });
  }

  const overall = confidence.overall ?? {};
  if (overall.level === "low" && !warnings.length) {
    warnings.push({
      type: "low_overall",
      level: "low",
      title: "Low confidence classroom insights",
      message: overall.reason ?? "Limited canonical data — insights are directional only.",
      inspectorId: "confidence-inspector",
      inspectorData: { overall },
    });
  }

  return warnings;
}

export function selectClassroomTrend(state = {}) {
  const snapshot = state.snapshot ?? {};
  const examInsights = state.examInsights ?? [];

  return {
    direction: snapshot.recentTrend ?? "stable",
    message: TREND_LABELS[snapshot.recentTrend] ?? TREND_LABELS.stable,
    recentExams: examInsights.slice(0, 4).map((exam) => ({
      examId: exam.examId,
      title: exam.title,
      averageScore: exam.averageScore,
      scoreSpread: exam.scoreSpread,
      studentCount: exam.studentCount,
    })),
  };
}

export function selectExamQualityInsights(state = {}, { limit = 5 } = {}) {
  return (state.examInsights ?? []).slice(0, limit).map((exam) => ({
    examId: exam.examId,
    title: exam.title,
    averageScore: exam.averageScore,
    scoreSpread: exam.scoreSpread,
    studentCount: exam.studentCount,
    attemptCount: exam.attemptCount,
    spreadLabel: spreadLabel(exam.scoreSpread),
    summary: buildExamSummary(exam),
    inspectorId: "classroom-breakdown",
    inspectorData: { examId: exam.examId, exam },
  }));
}

function spreadLabel(spread = 0) {
  if (spread >= 40) return "Wide classroom spread";
  if (spread >= 20) return "Moderate spread";
  return "Tight classroom spread";
}

function buildExamSummary(exam = {}) {
  const parts = [
    `${exam.studentCount ?? 0} students`,
    `${exam.averageScore ?? 0}% average`,
  ];
  if (exam.scoreSpread >= 30) {
    parts.push("significant performance gap");
  }
  return parts.join(" · ");
}

export function selectStudentDistributionSummary(state = {}) {
  const distribution = state.studentDistribution ?? {};
  const summary = distribution.summary ?? {};

  return {
    highPerformers: summary.highPerformers ?? 0,
    averagePerformers: summary.averagePerformers ?? 0,
    atRisk: summary.atRisk ?? 0,
    unstableMastery: summary.unstableMastery ?? 0,
    totalStudents: distribution.totalStudents ?? 0,
    message: buildDistributionMessage(summary),
  };
}

function buildDistributionMessage(summary = {}) {
  const atRisk = summary.atRisk ?? 0;
  const unstable = summary.unstableMastery ?? 0;
  if (atRisk > 0) {
    return `${atRisk} student profile(s) need remediation support.`;
  }
  if (unstable > 0) {
    return `${unstable} student profile(s) show unstable mastery patterns.`;
  }
  return "Classroom distribution is balanced — monitor weak topics for early intervention.";
}
