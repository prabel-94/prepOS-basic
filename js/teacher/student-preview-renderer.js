/**
 * Teacher student-experience preview — presentation only (no persistence).
 */

import { formatExamDuration } from "../student/student-exam-meta.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderPreviewExamCards(container, exams = []) {
  if (!container) return;

  container.innerHTML = "";

  if (!exams.length) {
    container.innerHTML =
      '<div class="empty-state">No published exams yet. Publish an exam to preview how students will see it.</div>';
    return;
  }

  exams.forEach((exam) => {
    const metaLines = [];

    if (exam.questionCount) {
      metaLines.push(
        `${exam.questionCount} Question${exam.questionCount === 1 ? "" : "s"}`
      );
    }

    const durationLabel = formatExamDuration(exam.duration);
    if (durationLabel) {
      metaLines.push(durationLabel);
    }

    metaLines.push("Assigned by Teacher");
    metaLines.push("Preview only — not a live attempt");

    const card = document.createElement("div");
    card.className = "student-exam-card recent-item mt-10";
    card.innerHTML = `
      <div class="student-exam-card-title">${escapeHTML(exam.title || "Untitled Exam")}</div>
      <ul class="student-exam-card-meta">
        ${metaLines.map((line) => `<li>${escapeHTML(line)}</li>`).join("")}
      </ul>
      <button
        type="button"
        class="primary-btn mt-10"
        data-preview-exam-id="${escapeHTML(exam.id)}"
      >
        Preview as student
      </button>
    `;
    container.appendChild(card);
  });
}

export function renderPreviewIntelligenceMock(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="student-preview-mock-panel">
      <div class="student-intel-confidence student-intel-confidence--low">
        <div class="student-intel-confidence-label">Learning Profile Building</div>
        <div class="text-muted mt-5">
          Sample layout only. Real mastery, weak topics, and revision guidance appear after students complete verified practice.
        </div>
      </div>
      <div class="student-intel-grid mt-20">
        <div class="student-intel-stat student-intel-stat--mock">
          <div class="student-intel-stat-value">—</div>
          <div class="student-intel-stat-label">Topics Mastered</div>
        </div>
        <div class="student-intel-stat student-intel-stat--mock">
          <div class="student-intel-stat-value">—</div>
          <div class="student-intel-stat-label">Weak Topics</div>
        </div>
        <div class="student-intel-stat student-intel-stat--mock">
          <div class="student-intel-stat-value">—</div>
          <div class="student-intel-stat-label">Knowledge Confidence</div>
        </div>
      </div>
    </div>
  `;
}

export function bindPreviewExamActions(container, onPreviewExam) {
  if (!container || typeof onPreviewExam !== "function") return;

  container.querySelectorAll("[data-preview-exam-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const examId = button.getAttribute("data-preview-exam-id");
      if (examId) {
        onPreviewExam(examId);
      }
    });
  });
}
