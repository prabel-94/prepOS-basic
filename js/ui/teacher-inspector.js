/**
 * PrepOS Teacher Inspector Hooks
 * Foundation for future classroom inspectors — placeholder UI only.
 */

import { openModal, closeModal } from "./modal-system.js";

const INSPECTOR_LABELS = {
  "mastery-inspector": "Mastery Inspector",
  "topic-inspector": "Topic Inspector",
  "question-inspector": "Question Inspector",
  "classroom-breakdown": "Classroom Breakdown",
  "confidence-inspector": "Confidence Inspector",
};

let inspectorOverlay = null;

function ensureInspectorOverlay() {
  if (inspectorOverlay) return inspectorOverlay;

  const overlay = document.createElement("div");
  overlay.id = "teacher-inspector-overlay";
  overlay.className = "prepos-modal-backdrop hidden";
  overlay.innerHTML = `
    <div class="prepos-modal teacher-intel-inspector-modal" role="dialog" aria-modal="true">
      <div class="teacher-intel-inspector-header">
        <h3 id="teacher-inspector-title">Inspector</h3>
        <button type="button" class="teacher-intel-inspector-close" data-close-inspector>Close</button>
      </div>
      <div id="teacher-inspector-body" class="teacher-intel-inspector-body">
        Inspector content will load here in a future phase.
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("[data-close-inspector]")?.addEventListener("click", () => {
    closeModal(overlay);
  });

  inspectorOverlay = overlay;
  return overlay;
}

function renderInspectorPlaceholder(inspectorId, data = {}) {
  const label = INSPECTOR_LABELS[inspectorId] ?? inspectorId;
  const body = document.getElementById("teacher-inspector-body");
  const title = document.getElementById("teacher-inspector-title");

  if (title) title.textContent = label;
  if (!body) return;

  body.innerHTML = `
    <p class="text-muted">This inspector is a foundation hook — full drill-down UI comes in a later phase.</p>
    <pre class="teacher-intel-inspector-pre mt-15">${escapeInspectorJson(data)}</pre>
  `;
}

function escapeInspectorJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function openTeacherInspector(inspectorId, data = {}) {
  const overlay = ensureInspectorOverlay();
  renderInspectorPlaceholder(inspectorId, data);

  window.__PREPOS_TEACHER_INSPECTOR__ = {
    id: inspectorId,
    data,
    openedAt: Date.now(),
  };

  openModal(overlay, { overlayType: "inspector" });
}

export function openInspector(inspectorId, data = {}) {
  return openTeacherInspector(inspectorId, data);
}

window.openTeacherInspector = openTeacherInspector;
window.openInspector = openInspector;
