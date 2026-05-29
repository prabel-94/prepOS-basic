/**
 * PrepOS Teacher Inspector Hooks
 * Foundation for future classroom inspectors — readable placeholder UI.
 */

import {
  isCognitionInspectorKind,
  restoreReadingContextIfNeeded,
} from "../notes/reading-ergonomics.js";
import { openModal, closeModal } from "./modal-system.js";
import { replaceOverlay } from "./overlay-transitions.js";
import { resolveAppPath } from "../core/access.js";
import { getClient } from "../core/get-client.js";
import { GOVERNANCE_ACTIONS } from "../anchors/anchor-governance.js";
import { openAnchorNoteEditor } from "../anchors/anchor-note-editor.js";
import { renderAnchorNote } from "../anchors/anchor-note-renderer.js";
import {
  loadAnchorInspectorPayload,
  searchTopicsForCanonical,
} from "../anchors/anchor-selectors.js";
import { ANCHOR_TYPES } from "../anchors/anchor-types.js";
import { filterNoteLinkMapForStudent } from "../anchors/anchor-renderer.js";
import { getLanguageLabel } from "../notes/note-variants.js";

const INSPECTOR_LABELS = {
  "mastery-inspector": "Mastery Inspector",
  "topic-inspector": "Topic Inspector",
  "question-inspector": "Question Inspector",
  "classroom-breakdown": "Classroom Breakdown",
  "confidence-inspector": "Confidence Inspector",
};

let inspectorOverlay = null;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureInspectorOverlay() {
  if (inspectorOverlay) return inspectorOverlay;

  const overlay = document.createElement("div");
  overlay.id = "teacher-inspector-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content teacher-intel-inspector-content">
      <div class="prepos-modal-header">
        <div id="teacher-inspector-title" class="h2">Inspector</div>
        <p class="text-muted mt-5 teacher-intel-inspector-subtitle">
          Classroom intelligence drill-down (preview)
        </p>
      </div>
      <div id="teacher-inspector-body" class="prepos-modal-body teacher-intel-inspector-body"></div>
      <div class="prepos-modal-footer">
        <button type="button" class="secondary-btn" data-close-inspector>Close</button>
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

function renderDetailRows(rows = []) {
  const items = rows.filter((row) => row.value != null && row.value !== "");
  if (!items.length) return "";

  return `
    <dl class="teacher-intel-inspector-dl">
      ${items
        .map(
          (row) => `
        <dt>${escapeHTML(row.label)}</dt>
        <dd>${escapeHTML(row.value)}</dd>
      `
        )
        .join("")}
    </dl>
  `;
}

function renderTagList(tags = []) {
  if (!tags.length) return "";
  return `
    <div class="teacher-intel-inspector-tags mt-10">
      ${tags.map((tag) => `<span class="teacher-intel-flag">${escapeHTML(tag)}</span>`).join("")}
    </div>
  `;
}

function renderQuestionInspector(data = {}) {
  const question = data.question ?? data;
  const flags = (question.qualityFlags ?? []).map((f) => f.replace(/_/g, " "));

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(question.summary ?? "Question quality signal")}</p>
    ${renderTagList(flags)}
    ${renderDetailRows([
      { label: "Question", value: question.questionText },
      { label: "Accuracy", value: question.accuracy != null ? `${question.accuracy}%` : null },
      { label: "Skip rate", value: question.skipRate != null ? `${question.skipRate}%` : null },
      { label: "Difficulty", value: question.difficultyLabel },
      {
        label: "Topics",
        value: (question.topics ?? []).length ? (question.topics ?? []).join(", ") : "None linked",
      },
      { label: "Question ID", value: question.questionId ?? data.questionId },
    ])}
  `;
}

function renderTopicInspector(data = {}) {
  const topic = data.topic ?? data.signal ?? data;
  const signal = data.signal ?? {};

  return `
    <p class="teacher-intel-inspector-lead">
      ${escapeHTML(signal.recommendation ?? `Review ${topic.topicName ?? data.topicName ?? "this topic"} with targeted formative checks.`)}
    </p>
    ${renderDetailRows([
      { label: "Topic", value: topic.topicName ?? data.topicName ?? signal.topicName },
      {
        label: "Classroom average",
        value:
          topic.classroomAverage != null
            ? `${Math.round(topic.classroomAverage)}%`
            : topic.masteryAverage != null
              ? `${topic.masteryAverage}%`
              : signal.classroomAverage != null
                ? `${signal.classroomAverage}%`
                : null,
      },
      {
        label: "Students affected",
        value:
          topic.affectedStudents != null && topic.totalStudents != null
            ? `${topic.affectedStudents} of ${topic.totalStudents}`
            : signal.affectedStudents != null
              ? `${signal.affectedStudents} of ${signal.totalStudents ?? "—"}`
              : null,
      },
      {
        label: "Struggle rate",
        value:
          topic.struggleRate != null
            ? `${topic.struggleRate}%`
            : signal.struggleRate != null
              ? `${signal.struggleRate}%`
              : null,
      },
      { label: "Confidence", value: signal.confidence ?? topic.confidence },
      { label: "Trend", value: topic.trend },
    ])}
  `;
}

function renderMasteryInspector(data = {}) {
  const concept = data.concept ?? data;

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(concept.summary ?? "Classroom mastery drill-down")}</p>
    ${renderDetailRows([
      { label: "Topic", value: concept.topicName ?? data.topicName },
      { label: "Mastery", value: concept.masteryScore != null ? `${concept.masteryScore}%` : null },
      { label: "Difficulty", value: concept.difficulty ?? concept.analyticsDifficulty },
      { label: "Linked questions", value: concept.questionCount },
      {
        label: "Hardest question accuracy",
        value:
          concept.hardestQuestionAccuracy != null
            ? `${concept.hardestQuestionAccuracy}%`
            : null,
      },
    ])}
  `;
}

function renderClassroomBreakdown(data = {}) {
  const exam = data.exam;
  const profile = data.profile;

  if (exam) {
    return `
      <p class="teacher-intel-inspector-lead">${escapeHTML(exam.summary ?? "Exam classroom breakdown")}</p>
      ${renderDetailRows([
        { label: "Exam", value: exam.title },
        { label: "Average score", value: exam.averageScore != null ? `${exam.averageScore}%` : null },
        { label: "Score spread", value: exam.scoreSpread != null ? `${exam.scoreSpread}%` : null },
        { label: "Students", value: exam.studentCount },
        { label: "Attempts", value: exam.attemptCount },
        { label: "Spread label", value: exam.spreadLabel },
      ])}
    `;
  }

  if (profile) {
    return `
      <p class="teacher-intel-inspector-lead">${escapeHTML(profile.recommendation ?? profile.label ?? "Student support profile")}</p>
      ${renderDetailRows([
        { label: "Category", value: data.category?.replace(/_/g, " ") },
        { label: "Average score", value: profile.averageScore != null ? `${profile.averageScore}%` : null },
        { label: "Attempts", value: profile.attemptCount },
        { label: "Critical topics", value: profile.criticalTopicCount },
        { label: "Score variance", value: profile.scoreVariance },
        { label: "Mastery spread", value: profile.masterySpread },
      ])}
    `;
  }

  return `<p class="text-muted">No breakdown details available.</p>`;
}

function renderConfidenceInspector(data = {}) {
  const topic = data.topic;
  const overall = data.overall;

  if (topic) {
    return `
      <p class="teacher-intel-inspector-lead">${escapeHTML(topic.message ?? "Low confidence for this topic")}</p>
      ${renderDetailRows([{ label: "Topic", value: topic.topicName }])}
    `;
  }

  if (data.reason === "insufficient_coverage") {
    return `
      <p class="teacher-intel-inspector-lead">
        More verified topic-linked assessments are needed for reliable classroom intelligence.
      </p>
    `;
  }

  if (data.publicAttemptCount != null) {
    return `
      <p class="teacher-intel-inspector-lead">
        Public practice attempts do not contribute to classroom mastery intelligence.
      </p>
      ${renderDetailRows([
        { label: "Public attempts observed", value: data.publicAttemptCount },
      ])}
    `;
  }

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(overall?.reason ?? "Treat insights as directional until more canonical data is collected.")}</p>
    ${renderDetailRows([
      { label: "Confidence level", value: overall?.level },
      { label: "Unstable topics", value: data.count },
    ])}
  `;
}

function renderInspectorContent(inspectorId, data = {}) {
  switch (inspectorId) {
    case "question-inspector":
      return renderQuestionInspector(data);
    case "topic-inspector":
      return renderTopicInspector(data);
    case "mastery-inspector":
      return renderMasteryInspector(data);
    case "classroom-breakdown":
      return renderClassroomBreakdown(data);
    case "confidence-inspector":
      return renderConfidenceInspector(data);
    default:
      return `<p class="text-muted">Inspector type not recognized.</p>`;
  }
}

function renderInspectorPlaceholder(inspectorId, data = {}) {
  const label = INSPECTOR_LABELS[inspectorId] ?? inspectorId;
  const body = document.getElementById("teacher-inspector-body");
  const title = document.getElementById("teacher-inspector-title");

  if (title) title.textContent = label;
  if (!body) return;

  body.innerHTML = `
    <p class="text-muted teacher-intel-inspector-note">
      Full interactive inspectors arrive in a later phase. Below is a readable summary of this signal.
    </p>
    ${renderInspectorContent(inspectorId, data)}
  `;
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

function formatAnchorStateLabel(state = "") {
  return String(state ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

let topicPickerOverlay = null;

function ensureTopicPickerOverlay() {
  if (topicPickerOverlay) {
    return topicPickerOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "canonical-topic-picker-overlay";
  overlay.className = "prepos-modal hidden";
  overlay.innerHTML = `
    <div class="prepos-modal-backdrop"></div>
    <div class="prepos-modal-content teacher-intel-inspector-content">
      <div class="prepos-modal-header">
        <div class="h2">Select Canonical Topic</div>
        <p class="text-muted mt-5">Link this anchor to an existing topic note.</p>
      </div>
      <div class="prepos-modal-body">
        <input type="search" id="canonical-topic-search" class="w-full" placeholder="Search topics…" autocomplete="off">
        <ul id="canonical-topic-results" class="canonical-topic-results mt-10"></ul>
      </div>
      <div class="prepos-modal-footer semantic-governance-actions">
        <button type="button" class="secondary-btn" data-topic-picker-cancel>Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  topicPickerOverlay = overlay;
  return overlay;
}

/**
 * Lightweight topic picker for canonical promotion (existing topics only).
 */
export function openCanonicalTopicPicker({ onConfirm, onCancel } = {}) {
  const overlay = ensureTopicPickerOverlay();
  const searchEl = overlay.querySelector("#canonical-topic-search");
  const resultsEl = overlay.querySelector("#canonical-topic-results");

  let selectedTopicId = null;

  async function renderResults(query = "") {
    if (!resultsEl) {
      return;
    }

    resultsEl.innerHTML = `<li class="text-muted">Searching…</li>`;

    try {
      const sb = await getClient();
      const topics = await searchTopicsForCanonical(sb, query, 25);

      if (!topics.length) {
        resultsEl.innerHTML = `<li class="text-muted">No topics found.</li>`;
        return;
      }

      resultsEl.innerHTML = topics
        .map(
          (topic) => `
        <li>
          <button type="button" class="canonical-topic-option" data-topic-id="${escapeHTML(topic.id)}">
            ${escapeHTML(topic.name)}
          </button>
        </li>
      `
        )
        .join("");

      resultsEl.querySelectorAll(".canonical-topic-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedTopicId = btn.dataset.topicId;
          resultsEl.querySelectorAll(".canonical-topic-option").forEach((option) => {
            option.classList.toggle("is-selected", option === btn);
          });
          onConfirm?.(selectedTopicId);
          closeModal(overlay);
        });
      });
    } catch (err) {
      resultsEl.innerHTML = `<li class="text-muted">${escapeHTML(err.message || "Search failed.")}</li>`;
    }
  }

  if (searchEl) {
    searchEl.value = "";
    searchEl.oninput = () => {
      renderResults(searchEl.value);
    };
  }

  overlay.querySelector("[data-topic-picker-cancel]")?.addEventListener(
    "click",
    () => {
      onCancel?.();
      closeModal(overlay);
    },
    { once: true }
  );

  openModal(overlay, { overlayType: "critical-dialog" });
  renderResults("");
  searchEl?.focus();
}

function renderGovernanceActions(buttons = []) {
  if (!buttons.length) {
    return "";
  }

  return `
    <div class="semantic-governance-actions">
      ${buttons.join("")}
    </div>
  `;
}

function resolveCanEditAnchorNote(options = {}) {
  if (typeof options.canEditAnchorNote === "boolean") {
    return options.canEditAnchorNote;
  }

  return Boolean(options.governanceContext);
}

function renderAnchorNoteSection(
  note,
  noteLinkMap = {},
  { canEditAnchorNote = false } = {}
) {
  const content = String(note?.note_content ?? "").trim();

  if (content) {
    return `
      <section class="anchor-inspector-section">
        <h3 class="anchor-inspector-section-title">Anchor note</h3>
        <div class="anchor-note-body">${renderAnchorNote(content, noteLinkMap)}</div>
      </section>
    `;
  }

  if (!canEditAnchorNote) {
    return "";
  }

  return `
    <section class="anchor-inspector-section anchor-inspector-section--empty-note">
      <h3 class="anchor-inspector-section-title">Anchor note</h3>
      <p class="anchor-note-empty">No anchor note has been created yet.</p>
      <button type="button" class="primary-btn mt-10" data-anchor-note-edit>Create Anchor Note</button>
    </section>
  `;
}

function renderCanonicalTopicSection(topicId, preferLanguage) {
  if (!topicId) {
    return "";
  }

  const href = resolveAppPath(
    `note.html?topic=${encodeURIComponent(topicId)}&lang=${encodeURIComponent(preferLanguage)}`
  );

  return `
    <section class="anchor-inspector-section">
      <h3 class="anchor-inspector-section-title">Canonical topic</h3>
      <p class="text-muted anchor-inspector-canonical-hint">
        Open the deep structured topic note after reviewing this anchor cognition layer.
      </p>
      <a class="primary-btn mt-10" href="${escapeHTML(href)}">Open canonical note</a>
    </section>
  `;
}

/**
 * Student read-only anchor cognition inspector (no governance metadata).
 */
export function renderStudentAnchorInspector(
  payload = {},
  { preferLanguage = "english", studentSemanticMap = null } = {}
) {
  const semanticEntry = payload.semanticEntry ?? payload;
  const note = payload.note ?? null;
  let noteLinkMap = payload.noteLinkMap ?? {};

  if (studentSemanticMap) {
    noteLinkMap = filterNoteLinkMapForStudent(noteLinkMap, studentSemanticMap);
  }

  const displayName =
    semanticEntry.display_name ?? semanticEntry.source_text ?? "Anchor";
  const topicId = semanticEntry.canonical_topic_id;
  const noteContent = String(note?.note_content ?? "").trim();

  return `
    <section class="anchor-inspector-section anchor-inspector-header student-anchor-inspector">
      <p class="teacher-intel-inspector-lead student-anchor-inspector-title">${escapeHTML(displayName)}</p>
    </section>
    ${
      noteContent
        ? `
      <section class="anchor-inspector-section">
        <div class="anchor-note-body">${renderAnchorNote(noteContent, noteLinkMap)}</div>
      </section>
    `
        : ""
    }
    ${renderCanonicalTopicSection(topicId, preferLanguage)}
  `;
}

/**
 * Active / canonical anchor inspector body (anchor note reading + governance).
 */
export function renderAnchorInspector(
  payload = {},
  {
    preferLanguage = "english",
    canEditAnchorNote = false,
    studentMode = false,
    studentSemanticMap = null,
    canGovernAnchor = false,
  } = {}
) {
  if (studentMode) {
    return renderStudentAnchorInspector(payload, { preferLanguage, studentSemanticMap });
  }
  const semanticEntry = payload.semanticEntry ?? payload;
  const note = payload.note ?? null;
  const noteLinkMap = payload.noteLinkMap ?? {};

  const displayName =
    semanticEntry.display_name ?? semanticEntry.source_text ?? "Anchor";
  const anchorType = semanticEntry.anchor_type ?? "—";
  const topicId = semanticEntry.canonical_topic_id;
  const isMicro = anchorType !== ANCHOR_TYPES.CANONICAL;
  const hasNote = Boolean(String(note?.note_content ?? "").trim());

  const governanceButtons = [];

  if (hasNote && canEditAnchorNote) {
    governanceButtons.push(
      `<button type="button" class="secondary-btn" data-anchor-note-edit>Edit Anchor Note</button>`
    );
  }

  if (canGovernAnchor) {
    if (isMicro) {
      governanceButtons.push(
        `<button type="button" class="primary-btn" data-governance-action="${GOVERNANCE_ACTIONS.PROMOTE}">Promote to Canonical</button>`
      );
    }

    governanceButtons.push(
      `<button type="button" class="secondary-btn" data-governance-action="${GOVERNANCE_ACTIONS.DEACTIVATE}">De-anchor</button>`
    );
  }

  return `
    <section class="anchor-inspector-section anchor-inspector-header">
      <h3 class="anchor-inspector-section-title">Anchor</h3>
      <p class="teacher-intel-inspector-lead">${escapeHTML(displayName)}</p>
      ${renderDetailRows([
        { label: "Anchor type", value: formatAnchorStateLabel(anchorType) },
        { label: "Language", value: getLanguageLabel(preferLanguage) },
      ])}
    </section>
    ${renderAnchorNoteSection(note, noteLinkMap, { canEditAnchorNote })}
    ${renderCanonicalTopicSection(topicId, preferLanguage)}
    <section class="anchor-inspector-section">
      <h3 class="anchor-inspector-section-title">Editorial actions</h3>
      ${renderGovernanceActions(governanceButtons)}
    </section>
  `;
}

export function renderDormantAnchorInspector(semanticEntry = {}) {
  const displayName =
    semanticEntry.display_name ?? semanticEntry.source_text ?? "Anchor";

  return `
    <p class="teacher-intel-inspector-lead">${escapeHTML(displayName)}</p>
    <p class="text-muted">This semantic entity is dormant in this note.</p>
    ${renderDetailRows([
      { label: "Source text", value: semanticEntry.source_text },
      { label: "Normalized", value: semanticEntry.normalized_name },
      { label: "Anchor ID", value: semanticEntry.anchor_id },
    ])}
    ${renderGovernanceActions([
      `<button type="button" class="primary-btn" data-governance-action="${GOVERNANCE_ACTIONS.REACTIVATE}">Re-anchor</button>`,
    ])}
  `;
}

/**
 * Candidate anchor inspector with governance actions.
 */
export function renderCandidateAnchorInspector(semanticEntry = {}) {
  const displayName =
    semanticEntry.display_name ?? semanticEntry.source_text ?? "Candidate";

  return `
    <p class="teacher-intel-inspector-lead">Candidate Anchor</p>
    <p class="text-muted">
      This semantic entity is not yet fully activated in this note.
    </p>
    ${renderDetailRows([
      { label: "Source text", value: semanticEntry.source_text ?? displayName },
      { label: "Normalized", value: semanticEntry.normalized_name },
      { label: "Resolution", value: semanticEntry.resolution },
      { label: "Canonical topic", value: semanticEntry.canonical_topic_id },
    ])}
    ${renderGovernanceActions([
      `<button type="button" class="primary-btn" data-governance-action="${GOVERNANCE_ACTIONS.APPROVE}">Approve Anchor</button>`,
      `<button type="button" class="secondary-btn" data-governance-action="${GOVERNANCE_ACTIONS.DISMISS}">Dismiss</button>`,
    ])}
  `;
}

/**
 * Wire governance buttons (decoupled from DOM structure elsewhere).
 */
export function bindSemanticGovernanceActions(bodyEl, semanticEntry, governanceContext) {
  if (!bodyEl || !governanceContext?.apply) {
    return;
  }

  bodyEl.querySelectorAll("[data-governance-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.governanceAction;
      if (!action) {
        return;
      }

      btn.disabled = true;

      try {
        if (action === GOVERNANCE_ACTIONS.DEACTIVATE) {
          const confirmed = window.confirm(
            "De-anchor this semantic link in this note? The global anchor identity is preserved."
          );
          if (!confirmed) {
            return;
          }
        }

        if (action === GOVERNANCE_ACTIONS.PROMOTE) {
          openCanonicalTopicPicker({
            onConfirm: async (topicId) => {
              await governanceContext.apply(action, semanticEntry, {
                canonicalTopicId: topicId,
              });
            },
          });
          return;
        }

        await governanceContext.apply(action, semanticEntry);
      } catch (err) {
        console.error("[Semantic governance]", err);
        window.alert(err.message || "Governance action failed.");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function openSemanticInspector({
  title,
  subtitle,
  bodyHtml,
  debugPayload,
  semanticEntry,
  governanceContext,
  onBodyReady,
  cognitionInspector = false,
}) {
  const overlay = ensureInspectorOverlay();
  const contentEl = overlay.querySelector(".prepos-modal-content");
  const titleEl = document.getElementById("teacher-inspector-title");
  const subtitleEl = overlay.querySelector(".teacher-intel-inspector-subtitle");
  const bodyEl = document.getElementById("teacher-inspector-body");

  if (contentEl) {
    contentEl.classList.toggle("semantic-cognition-inspector", cognitionInspector);
  }

  if (titleEl) {
    titleEl.textContent = title;
  }

  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
  }

  if (bodyEl) {
    bodyEl.innerHTML = bodyHtml;
    bindSemanticGovernanceActions(bodyEl, semanticEntry, governanceContext);
    onBodyReady?.(bodyEl);
  }

  window.__PREPOS_TEACHER_INSPECTOR__ = {
    ...debugPayload,
    openedAt: Date.now(),
  };

  openModal(overlay, {
    overlayType: "inspector",
    onClose: () => {
      contentEl?.classList.remove("semantic-cognition-inspector");
      if (cognitionInspector || isCognitionInspectorKind(debugPayload?.kind)) {
        restoreReadingContextIfNeeded();
      }
    },
  });
}

/**
 * [[...]] inside anchor notes reopen the anchor inspector (semantic gateway).
 */
export function bindAnchorNoteSemanticLinks(bodyEl, inspectorOptions = {}) {
  if (!bodyEl) {
    return;
  }

  bodyEl.querySelectorAll(".anchor-note-semantic-link").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();

      const entry = {
        anchor_id: btn.dataset.anchorId ?? null,
        source_text: btn.dataset.sourceText ?? btn.textContent?.trim(),
        display_name: btn.textContent?.trim(),
        normalized_name: btn.dataset.normalizedName ?? null,
        state: "existing",
      };

      openAnchorInspector(entry, inspectorOptions);
    });
  });
}

function bindAnchorNoteEditorActions(
  bodyEl,
  { semanticEntry, variant, note, preferLanguage, inspectorOptions } = {}
) {
  if (!bodyEl || !semanticEntry?.anchor_id) {
    return;
  }

  const canEdit = resolveCanEditAnchorNote(inspectorOptions);
  if (!canEdit) {
    return;
  }

  bodyEl.querySelectorAll("[data-anchor-note-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inspectorOverlay = document.getElementById("teacher-inspector-overlay");

      replaceOverlay({
        fromOverlay: inspectorOverlay,
        suppressReadingRestore: true,
        openNext: () =>
          openAnchorNoteEditor({
            anchorId: semanticEntry.anchor_id,
            anchorVariantId: variant?.id ?? semanticEntry.anchor_variant_id,
            displayName: semanticEntry.display_name ?? semanticEntry.source_text,
            language: preferLanguage,
            initialContent: note?.note_content ?? "",
            onSave: async () => {
              await openAnchorInspector(semanticEntry, inspectorOptions);
            },
            onCancel: async () => {
              await openAnchorInspector(semanticEntry, inspectorOptions);
            },
          }),
      });
    });
  });
}

export async function openAnchorInspector(semanticEntry = {}, options = {}) {
  const preferLanguage = options.preferLanguage ?? "english";
  const studentMode = options.studentMode === true;
  const canEditAnchorNote = studentMode ? false : resolveCanEditAnchorNote(options);
  const canGovernAnchor = Boolean(options.governanceContext?.apply);

  let payload = {
    semanticEntry,
    anchor: null,
    variant: null,
    note: null,
    noteLinkMap: {},
  };

  if (semanticEntry.anchor_id) {
    try {
      const sb = await getClient();
      payload = await loadAnchorInspectorPayload(sb, semanticEntry, { preferLanguage });
    } catch (err) {
      console.error("[Anchor inspector]", err);
    }
  }

  const entry = payload.semanticEntry ?? semanticEntry;
  const displayName = entry.display_name ?? entry.source_text ?? "Anchor";

  const inspectorOptions = {
    ...options,
    preferLanguage,
    canEditAnchorNote,
    studentMode,
  };

  openSemanticInspector({
    title: displayName,
    subtitle: studentMode
      ? "Concept · reading support"
      : "Semantic anchor · cognition layer",
    cognitionInspector: true,
    bodyHtml: renderAnchorInspector(payload, {
      preferLanguage,
      canEditAnchorNote,
      studentMode,
      studentSemanticMap: options.studentSemanticMap,
      canGovernAnchor,
    }),
    semanticEntry: entry,
    governanceContext: studentMode ? null : options.governanceContext,
    onBodyReady: (bodyEl) => {
      bindAnchorNoteSemanticLinks(bodyEl, inspectorOptions);

      if (!studentMode) {
        bindAnchorNoteEditorActions(bodyEl, {
          semanticEntry: entry,
          variant: payload.variant,
          note: payload.note,
          preferLanguage,
          inspectorOptions,
        });
      }
    },
    debugPayload: {
      id: studentMode ? "student-anchor-inspector" : "anchor-inspector",
      kind: studentMode ? "student-anchor" : "anchor",
      data: entry,
      note: payload.note,
    },
  });
}

export function openCandidateAnchorInspector(semanticEntry = {}, options = {}) {
  openSemanticInspector({
    title: "Candidate Anchor",
    subtitle: "Semantic governance · draft preview",
    cognitionInspector: true,
    bodyHtml: renderCandidateAnchorInspector(semanticEntry, options),
    semanticEntry,
    governanceContext: options.governanceContext,
    debugPayload: {
      id: "candidate-anchor-inspector",
      kind: "candidate-anchor",
      data: semanticEntry,
    },
  });
}

export function openDormantAnchorInspector(semanticEntry = {}, options = {}) {
  const displayName =
    semanticEntry.display_name ?? semanticEntry.source_text ?? "Anchor";

  openSemanticInspector({
    title: displayName,
    subtitle: "Dormant semantic anchor · draft preview",
    cognitionInspector: true,
    bodyHtml: renderDormantAnchorInspector(semanticEntry, options),
    semanticEntry,
    governanceContext: options.governanceContext,
    debugPayload: {
      id: "dormant-anchor-inspector",
      kind: "dormant-anchor",
      data: semanticEntry,
    },
  });
}

window.openTeacherInspector = openTeacherInspector;
window.openInspector = openInspector;
window.openAnchorInspector = openAnchorInspector;
window.openCandidateAnchorInspector = openCandidateAnchorInspector;
window.openDormantAnchorInspector = openDormantAnchorInspector;
