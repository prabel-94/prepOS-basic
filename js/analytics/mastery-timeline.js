/**
 * PrepOS Mastery Timeline
 * -------------------------------------------------------
 * Passive timeline of topic mastery evolution.
 */


import {
  recordMasteryTimelineEvent as storeTimelineEvent,
  getAnalyticsRuntimeStore
} from "./analytics-runtime-store.js";

import { getVersionMetadata } from "./analytics-version.js";


let timelineEventCounter = 0;


function nextTimelineEventId() {
  timelineEventCounter += 1;
  return `mtl_${Date.now()}_${timelineEventCounter}`;
}


/**
 * Record a mastery timeline event (passive).
 */
export function recordMasteryTimelineEvent({
  topicId = null,
  topicName = "Unknown",
  mastery = 0,
  confidence = "low",
  canonicalAttempts = 0,
  excludedAttempts = 0,
  timestamp = null,
  metadata = {},
  snapshotId = null,
  traceId = null
} = {}) {
  try {
    const versions = getVersionMetadata();
    const resolvedTopicId = topicId ?? topicName;

    const event = {
      id: nextTimelineEventId(),
      timestamp: timestamp ?? new Date().toISOString(),
      topicId: resolvedTopicId,
      topicName,
      mastery,
      confidence,
      canonicalAttempts,
      excludedAttempts,
      snapshotId,
      traceId,
      ...versions,
      metadata: {
        ...metadata,
        snapshotId,
        traceId
      }
    };

    storeTimelineEvent(event);
    return event;
  } catch (error) {
    console.warn(
      "[PrepOS Mastery Timeline] Event recording failed (non-fatal):",
      error
    );
    return null;
  }
}


/**
 * Record timeline events for all topics (canonical submissions only).
 */
export function recordMasteryTimelineFromTopics(
  topics = [],
  context = {}
) {
  if (context.submissionMode === "public") {
    return [];
  }

  const events = [];

  for (const topic of topics) {
    const event = recordMasteryTimelineEvent({
      topicId: topic.topicId ?? topic.topicName,
      topicName: topic.topicName ?? "Unknown",
      mastery: topic.mastery ?? topic.masteryScore ?? 0,
      confidence: topic.confidence ?? "low",
      canonicalAttempts: topic.canonicalAttempts ?? 0,
      excludedAttempts: topic.excludedAttempts ?? 0,
      snapshotId: context.snapshotId ?? null,
      traceId: context.traceId ?? null,
      metadata: {
        source: context.source ?? "buildKnowledgeAnalytics",
        submissionMode: context.submissionMode ?? "canonical",
        examId: context.examId ?? null,
        attemptId: context.attemptId ?? null
      }
    });

    if (event) {
      events.push(event);
    }
  }

  return events;
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


export function renderMasteryTimeline(containerId = "mastery-timeline-panel") {
  const el = document.getElementById(containerId);
  if (!el) return;

  const timeline = getAnalyticsRuntimeStore().masteryTimeline ?? {};
  const topicMap = timeline.topics ?? {};
  const topicIds = Object.keys(topicMap);

  if (!topicIds.length) {
    el.innerHTML = '<p class="muted">No mastery timeline events recorded.</p>';
    return;
  }

  const sections = topicIds.map(topicId => {
    const events = (topicMap[topicId] ?? []).slice().reverse();
    const topicName = events[0]?.topicName ?? topicId;

    const rows = events
      .map(
        event => `
        <tr>
          <td>${escapeHtml(event.timestamp)}</td>
          <td>${escapeHtml(event.mastery)}</td>
          <td>${escapeHtml(event.confidence)}</td>
          <td>${escapeHtml(event.canonicalAttempts)}</td>
        </tr>`
      )
      .join("");

    return `
      <h4 class="mt-10">${escapeHtml(topicName)}</h4>
      <table class="debug-table debug-table-wide">
        <thead>
          <tr>
            <th>Time</th>
            <th>Mastery</th>
            <th>Confidence</th>
            <th>Canonical Attempts</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  });

  el.innerHTML = sections.join("");
}


export function registerMasteryTimelineDebugGlobals() {
  if (typeof window === "undefined") {
    return;
  }

  window.debugMasteryTimeline = function debugMasteryTimeline() {
    const timeline = getAnalyticsRuntimeStore().masteryTimeline ?? {};

    console.group("[PrepOS Mastery Timeline]");

    console.log("Topics:", timeline.topics);
    console.log("Recent events:", timeline.events?.slice(-30));

    console.groupEnd();

    return timeline;
  };
}
