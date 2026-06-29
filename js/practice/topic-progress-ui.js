/**
 * Topic question bank progress panel — presentation only.
 */

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function confidenceMessage(level = "low") {
  if (level === "high") {
    return "Your bank progress estimate is based on enough practice to trust these numbers.";
  }

  if (level === "medium") {
    return "Keep practicing — estimates become more reliable as you cover more questions.";
  }

  return "Start practicing to build your question bank profile for this topic.";
}

function segmentStyle(count, total) {
  if (!total || !count) {
    return 'style="width:0%"';
  }

  const pct = Math.max(0, Math.min(100, Math.round((count / total) * 100)));

  return `style="width:${pct}%"`;
}

export function hideTopicProgressPanel(container) {
  if (!container) {
    return;
  }

  container.classList.add("hidden");
  container.innerHTML = "";
}

export function renderTopicProgressLoading(container, topicName = "") {
  if (!container) {
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <div class="practice-topic-progress-card">
      <div class="practice-topic-progress-kicker">Question bank progress</div>
      <div class="practice-topic-progress-title">${escapeHTML(topicName || "Topic")}</div>
      <div class="text-muted mt-10">Loading your progress…</div>
    </div>
  `;
}

export function renderTopicProgressPanel(container, progress = null) {
  if (!container) {
    return;
  }

  if (!progress?.hasData || !progress.totalQuestions) {
    container.classList.remove("hidden");
    container.innerHTML = `
      <div class="practice-topic-progress-card practice-topic-progress-card--empty">
        <div class="practice-topic-progress-kicker">Question bank progress</div>
        <div class="practice-topic-progress-title">${escapeHTML(progress?.topicName || "Topic")}</div>
        <div class="text-muted mt-10">No saved bank questions are linked to this topic yet.</div>
      </div>
    `;
    return;
  }

  const total = progress.totalQuestions;
  const counts = progress.counts ?? {};

  container.classList.remove("hidden");
  container.innerHTML = `
    <div class="practice-topic-progress-card">
      <div class="practice-topic-progress-header">
        <div>
          <div class="practice-topic-progress-kicker">Question bank progress</div>
          <div class="practice-topic-progress-title">${escapeHTML(progress.topicName)}</div>
        </div>
        <div class="practice-topic-progress-ring" aria-hidden="true">
          <span class="practice-topic-progress-ring-value">${escapeHTML(progress.masteryPercent)}%</span>
          <span class="practice-topic-progress-ring-label">mastered</span>
        </div>
      </div>

      <div class="practice-topic-progress-summary mt-10">
        <strong>${escapeHTML(progress.masteredCount)} / ${escapeHTML(total)}</strong>
        questions mastered
        <span class="text-muted">· ${escapeHTML(progress.coveragePercent)}% attempted</span>
      </div>

      <div
        class="practice-topic-progress-bar mt-10"
        role="img"
        aria-label="Mastered ${progress.masteredCount}, learning ${progress.learningCount}, needs review ${progress.needsReviewCount}, not started ${progress.notStartedCount} out of ${total} questions"
      >
        <span class="practice-topic-progress-segment practice-topic-progress-segment--mastered" ${segmentStyle(counts.mastered, total)} title="Mastered"></span>
        <span class="practice-topic-progress-segment practice-topic-progress-segment--learning" ${segmentStyle(counts.learning, total)} title="Learning"></span>
        <span class="practice-topic-progress-segment practice-topic-progress-segment--review" ${segmentStyle(counts.needs_review, total)} title="Needs review"></span>
        <span class="practice-topic-progress-segment practice-topic-progress-segment--new" ${segmentStyle(counts.not_started, total)} title="Not started"></span>
      </div>

      <div class="practice-topic-progress-legend mt-10">
        <span><i class="practice-topic-progress-dot practice-topic-progress-dot--mastered"></i> Mastered ${escapeHTML(counts.mastered ?? 0)}</span>
        <span><i class="practice-topic-progress-dot practice-topic-progress-dot--learning"></i> Learning ${escapeHTML(counts.learning ?? 0)}</span>
        <span><i class="practice-topic-progress-dot practice-topic-progress-dot--review"></i> Review ${escapeHTML(counts.needs_review ?? 0)}</span>
        <span><i class="practice-topic-progress-dot practice-topic-progress-dot--new"></i> New ${escapeHTML(counts.not_started ?? 0)}</span>
      </div>

      <div class="practice-topic-progress-meta mt-10 text-muted">
        ${
          progress.accuracyPercent != null
            ? `Topic accuracy on attempted questions: <strong>${escapeHTML(progress.accuracyPercent)}%</strong> · `
            : ""
        }
        ${escapeHTML(confidenceMessage(progress.confidence))}
      </div>
    </div>
  `;
}
