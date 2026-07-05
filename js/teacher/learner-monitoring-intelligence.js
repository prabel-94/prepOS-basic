/**
 * Teacher learner monitoring intelligence — load + render helpers.
 */

import { getClient } from "../core/get-client.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function normalizeIntelligence(raw) {
  if (!raw || typeof raw !== "object") return null;

  const examStats = raw.examStats ?? raw.exam_stats ?? {};
  const practiceStats = raw.practiceStats ?? raw.practice_stats ?? {};

  return {
    userId: raw.userId ?? raw.user_id ?? null,
    displayName: raw.displayName ?? raw.display_name ?? "",
    isLinkedLearner: Boolean(raw.isLinkedLearner ?? raw.is_linked_learner),
    eventsLast7Days: Number(raw.eventsLast7Days ?? raw.events_last_7_days ?? 0),
    examStats: {
      total: Number(examStats.total ?? 0),
      avgScore: examStats.avgScore ?? examStats.avg_score ?? null,
      recent: Array.isArray(examStats.recent) ? examStats.recent : [],
    },
    practiceStats: {
      total: Number(practiceStats.total ?? 0),
      avgScore: practiceStats.avgScore ?? practiceStats.avg_score ?? null,
      recent: Array.isArray(practiceStats.recent) ? practiceStats.recent : [],
    },
    topPracticeTopics: Array.isArray(raw.topPracticeTopics)
      ? raw.topPracticeTopics
      : Array.isArray(raw.top_practice_topics)
        ? raw.top_practice_topics
        : [],
  };
}

export async function loadLearnerMonitoringIntelligence(userId) {
  if (!userId) {
    throw new Error("Learner id is required");
  }

  const sb = await getClient();
  const { data, error } = await sb.rpc("get_learner_monitoring_intelligence", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Learner Monitoring Intelligence] load failed", error);
    throw error;
  }

  return normalizeIntelligence(data);
}

function renderRecentList(items = [], type) {
  if (!items.length) {
    return `<p class="text-muted">No recent ${type} sessions.</p>`;
  }

  const rows = items
    .map((item) => {
      const label =
        type === "exam"
          ? `Exam · ${item.score ?? 0}/${item.questionCount ?? item.question_count ?? "?"}`
          : escapeHTML(item.topicName ?? item.topic_name ?? "Practice");

      const detail =
        type === "exam"
          ? formatDateTime(item.submittedAt ?? item.submitted_at)
          : `${item.score ?? 0}/${item.questionCount ?? item.question_count ?? "?"} · ${formatDateTime(item.submittedAt ?? item.submitted_at)}`;

      return `
        <li class="learner-intel-recent-item">
          <span>${label}</span>
          <span class="text-muted">${detail}</span>
        </li>
      `;
    })
    .join("");

  return `<ul class="learner-intel-recent-list">${rows}</ul>`;
}

export function renderLearnerMonitoringIntelligence(intelligence) {
  if (!intelligence) {
    return `<p class="text-muted">No intelligence data available.</p>`;
  }

  const examAvg =
    intelligence.examStats.avgScore != null
      ? `${intelligence.examStats.avgScore}% avg`
      : "—";
  const practiceAvg =
    intelligence.practiceStats.avgScore != null
      ? `${intelligence.practiceStats.avgScore} avg score`
      : "—";

  const topicItems = intelligence.topPracticeTopics
    .map(
      (topic) => `
        <li class="learner-intel-topic-item">
          <span>${escapeHTML(topic.topicName ?? topic.topic_name ?? "Topic")}</span>
          <span class="text-muted">${escapeHTML(topic.sessionCount ?? topic.session_count ?? 0)} sessions · ${escapeHTML(topic.avgScore ?? topic.avg_score ?? "—")} avg</span>
        </li>
      `
    )
    .join("");

  return `
    <div class="learner-intel-section">
      <h4 class="learner-activity-title">Learning Intelligence</h4>
      ${
        intelligence.isLinkedLearner
          ? `<p class="learner-intel-linked-note text-muted">Linked learner account (My Learning shadow).</p>`
          : ""
      }
      <div class="learner-intel-grid">
        <div class="learner-intel-stat-card">
          <div class="learner-intel-stat-label">Exams</div>
          <div class="learner-intel-stat-value">${escapeHTML(intelligence.examStats.total)}</div>
          <div class="learner-intel-stat-sub">${escapeHTML(examAvg)}</div>
        </div>
        <div class="learner-intel-stat-card">
          <div class="learner-intel-stat-label">Practice</div>
          <div class="learner-intel-stat-value">${escapeHTML(intelligence.practiceStats.total)}</div>
          <div class="learner-intel-stat-sub">${escapeHTML(practiceAvg)}</div>
        </div>
        <div class="learner-intel-stat-card">
          <div class="learner-intel-stat-label">7-day events</div>
          <div class="learner-intel-stat-value">${escapeHTML(intelligence.eventsLast7Days)}</div>
          <div class="learner-intel-stat-sub">Activity signals</div>
        </div>
      </div>

      <div class="learner-intel-columns mt-15">
        <div>
          <h5 class="learner-intel-subtitle">Recent exams</h5>
          ${renderRecentList(intelligence.examStats.recent, "exam")}
        </div>
        <div>
          <h5 class="learner-intel-subtitle">Recent practice</h5>
          ${renderRecentList(intelligence.practiceStats.recent, "practice")}
        </div>
      </div>

      ${
        topicItems
          ? `
        <div class="mt-15">
          <h5 class="learner-intel-subtitle">Top practice topics</h5>
          <ul class="learner-intel-topic-list">${topicItems}</ul>
        </div>
      `
          : ""
      }
    </div>
  `;
}

export async function renderLearnerMonitoringIntelligenceSection(userId, targetEl) {
  if (!targetEl || !userId) return;

  targetEl.innerHTML = `<div class="text-muted">Loading intelligence...</div>`;

  try {
    const intelligence = await loadLearnerMonitoringIntelligence(userId);
    targetEl.innerHTML = renderLearnerMonitoringIntelligence(intelligence);
  } catch (error) {
    targetEl.innerHTML = `<p class="text-muted">${escapeHTML(
      error.message || "Unable to load learner intelligence."
    )}</p>`;
  }
}
