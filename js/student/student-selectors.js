/**
 * PrepOS Student Selectors
 * Pedagogical interpretation of analytics — no DOM, no fetching.
 */

import { normalizeTopicKey } from "./student-intelligence.js";

const CONFIDENCE_MESSAGES = {
  high: "Your mastery estimates are based on enough verified practice to trust these insights.",
  medium: "These insights are becoming reliable. A few more verified attempts will sharpen them further.",
  low: "PrepOS needs more verified attempts before mastery can be estimated reliably.",
  topic_low:
    "This topic needs more verified practice before mastery can be estimated reliably.",
};

const TREND_MESSAGES = {
  improving: "Your recent verified attempts show improvement.",
  needs_attention: "Recent practice suggests revisiting a few topics.",
  stable: "Your recent progress is steady.",
};

export function selectLearningSnapshot(learningState = {}) {
  const snapshot = learningState.snapshot ?? {};

  return {
    topicsMastered: snapshot.topicsMastered ?? 0,
    weakTopicCount: snapshot.weakTopicCount ?? 0,
    totalTopics: snapshot.totalTopics ?? 0,
    knowledgeConfidence: snapshot.knowledgeConfidenceLabel ?? "Low Confidence",
    recentTrend: selectTopicTrend(learningState),
    recommendedFocus: snapshot.recommendedFocus
      ? formatTopicLabel(snapshot.recommendedFocus)
      : null,
    hasData: snapshot.hasKnowledgeData === true,
  };
}

export function selectWeakTopicCards(learningState = {}) {
  const confidence = learningState.confidence?.level ?? "low";

  return (learningState.weakTopics ?? []).map(topic => ({
    topic: formatTopicLabel(topic.topicName),
    topicKey: normalizeTopicKey(topic.topicName),
    mastery: Math.round(topic.accuracy ?? topic.masteryScore ?? 0),
    confidence: formatConfidenceLevel(confidence),
    confidenceMessage:
      confidence === "low"
        ? CONFIDENCE_MESSAGES.topic_low
        : CONFIDENCE_MESSAGES[confidence] ?? CONFIDENCE_MESSAGES.low,
    recommendation: humanizeRecommendation(topic.recommendation, topic),
    practiceAction: {
      type: "bank",
      topicKey: normalizeTopicKey(topic.topicName),
      label: `Practice ${formatTopicLabel(topic.topicName)}`,
    },
  }));
}

export function selectStrongTopicCards(learningState = {}) {
  return (learningState.strongTopics ?? []).map(topic => ({
    topic: formatTopicLabel(topic.topicName),
    topicKey: normalizeTopicKey(topic.topicName),
    mastery: Math.round(topic.masteryScore ?? topic.averageAccuracy ?? 0),
    message: `Strong progress in ${formatTopicLabel(topic.topicName)}. Keep revisiting occasionally to retain mastery.`,
  }));
}

export function selectRevisionRecommendations(learningState = {}) {
  return (learningState.recommendations ?? []).map(item => ({
    topic: formatTopicLabel(item.topicName),
    topicKey: item.topicKey,
    mastery: item.mastery,
    confidence: formatConfidenceLevel(item.confidence),
    message: buildRevisionMessage(item),
    practiceAction: {
      type: "bank",
      topicKey: item.topicKey,
      label: `Revise ${formatTopicLabel(item.topicName)}`,
    },
  }));
}

export function selectAdaptivePracticeTopics(learningState = {}) {
  const signals = learningState.adaptiveSignals ?? {};
  return (signals.practiceTopics ?? []).map(topicKey => ({
    topicKey: normalizeTopicKey(topicKey),
    topic: formatTopicLabel(topicKey),
  }));
}

export function selectConfidenceMessage(learningState = {}) {
  const level = learningState.confidence?.level ?? "low";
  const emptyReason = learningState.metadata?.emptyReason;

  if (emptyReason === "no_analytics") {
    return "Complete more verified practice to unlock learning intelligence insights.";
  }

  if (emptyReason === "public_only_history") {
    return "Knowledge insights appear after verified topic-linked practice.";
  }

  return CONFIDENCE_MESSAGES[level] ?? CONFIDENCE_MESSAGES.low;
}

export function selectTopicTrend(learningState = {}) {
  const trend = learningState.confidence?.trend ?? "stable";
  return TREND_MESSAGES[trend] ?? TREND_MESSAGES.stable;
}

export function selectKnowledgeConfidence(learningState = {}) {
  const level = learningState.confidence?.level ?? "low";
  return {
    level,
    label: formatConfidenceLevel(level),
    message: selectConfidenceMessage(learningState),
    trend: selectTopicTrend(learningState),
  };
}

export function selectRecentProgress(learningState = {}) {
  return (learningState.metadata?.recentAttempts ?? []).map(attempt => ({
    examId: attempt.exam_id,
    score: attempt.score,
    submittedAt: attempt.submitted_at,
  }));
}

export function selectMasteryLevel(topic = {}) {
  const score = topic.masteryScore ?? topic.accuracy ?? 0;

  if (score >= 85) return "strong";
  if (score >= 70) return "developing";
  if (score >= 50) return "needs_practice";
  return "critical";
}

function formatTopicLabel(value = "") {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown topic";
  return text.replace(/\b\w/g, char => char.toUpperCase());
}

function formatConfidenceLevel(level = "low") {
  if (level === "high") return "High Confidence";
  if (level === "medium") return "Medium Confidence";
  return "Low Confidence";
}

function humanizeRecommendation(recommendation = "", topic = {}) {
  const score = topic.accuracy ?? topic.masteryScore ?? 0;

  if (score < 30) {
    return `Start with focused revision in ${formatTopicLabel(topic.topicName)} before moving to timed practice.`;
  }

  if (score < 50) {
    return `Targeted question-bank practice will help strengthen ${formatTopicLabel(topic.topicName)}.`;
  }

  if (score < 70) {
    return `A short revision session in ${formatTopicLabel(topic.topicName)} should lift your mastery.`;
  }

  return `Keep light revision in ${formatTopicLabel(topic.topicName)} to maintain progress.`;
}

function buildRevisionMessage(item = {}) {
  return `Recommended revision focus: ${formatTopicLabel(item.topicName)}.`;
}
