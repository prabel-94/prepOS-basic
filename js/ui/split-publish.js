import { invokeEdgeFunction } from "../core/edge-invoke.js";
import { openModal, closeModal } from "./modal-system.js";
import { openAssignExamModal } from "./assign-exam-modal.js";
import {
  buildQuestionAssignments,
  describeSplitPart,
  getDraftQuestions,
  getPublishedQuestionIds,
  getUnpublishedQuestions,
  splitByQuestionsPerPart,
  splitIntoPartCount,
  summarizeSplitPlan,
  syncPartsFromQuestionAssignments,
  truncateQuestionText,
  validateSplitPlan,
} from "../core/split-publish-plan.js";

const PANEL_ID = "splitPublishPanel";

let splitParts = [];
let questionAssignments = new Map();
let splitPublishContext = null;
let isSplitPublishing = false;

function escapeHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getContextValue(name) {
  return typeof splitPublishContext?.[name] === "function"
    ? splitPublishContext[name]()
    : null;
}

function getBaseTitle() {
  const draft = getContextValue("getDraft");
  return document.getElementById("title")?.value || draft?.title || "Untitled Exam";
}

function getPublishedIds() {
  return getPublishedQuestionIds(getContextValue("getDraft"));
}

function getNextPartNumber() {
  return splitPublishContext?.getNextPartNumber?.() ?? 1;
}

function defaultPartCount(questionCount) {
  if (questionCount <= 1) return 1;
  return 2;
}

function defaultQuestionsPerPart(questionCount) {
  if (questionCount <= 1) return 1;
  return Math.ceil(questionCount / 2);
}

function syncPartsFromAssignments() {
  splitParts = syncPartsFromQuestionAssignments(splitParts, questionAssignments);
}

function resetSplitPartsFromDraft() {
  const draft = getContextValue("getDraft");
  const questions = getUnpublishedQuestions(draft);
  const baseTitle = getBaseTitle();
  const partCount = defaultPartCount(questions.length);
  const startPartNumber = getNextPartNumber();

  splitParts = splitIntoPartCount(
    questions,
    partCount,
    baseTitle,
    startPartNumber
  );

  questionAssignments = buildQuestionAssignments(
    splitParts,
    getDraftQuestions(draft),
    getPublishedIds()
  );

  const chunkInput = document.getElementById("splitChunkSize");
  if (chunkInput) {
    chunkInput.value = String(defaultQuestionsPerPart(questions.length));
  }
}

function renderSplitPublishPanel() {
  const draft = getContextValue("getDraft");
  const allQuestions = getDraftQuestions(draft);
  const publishedIds = getPublishedIds();
  const secondsPerQuestion = getContextValue("readSecondsPerQuestionInput") ?? 45;
  const listEl = document.getElementById("splitPartsList");
  const pickerEl = document.getElementById("splitQuestionPicker");
  const summaryEl = document.getElementById("splitPublishSummary");

  if (!listEl || !pickerEl) return;

  if (!allQuestions.length) {
    listEl.innerHTML = `<div class="empty-state">Add questions to the draft before splitting.</div>`;
    pickerEl.innerHTML = "";
    if (summaryEl) summaryEl.textContent = "";
    return;
  }

  syncPartsFromAssignments();

  listEl.innerHTML = splitParts
    .map((part, index) => {
      const meta = describeSplitPart(part, allQuestions, secondsPerQuestion, index);

      return `
        <div class="question-card mt-10" data-part-index="${index}">
          <div class="text-muted">Part ${index + 1}</div>
          <label class="mt-10" for="split-part-title-${index}">Title</label>
          <input
            id="split-part-title-${index}"
            class="w-full mt-5 split-part-title"
            data-part-index="${index}"
            type="text"
            value="${escapeHTML(part.title)}"
          />
          <div class="text-muted mt-10">
            ${meta.count} question${meta.count === 1 ? "" : "s"} · ${meta.rangeLabel} · ${meta.durationLabel}
          </div>
          ${
            splitParts.length > 1
              ? `<button type="button" class="secondary-btn mt-10 remove-split-part-btn" data-part-index="${index}">
                  Remove Part
                </button>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  pickerEl.innerHTML = `
    <div class="text-muted mb-10">
      Assign each unpublished question to one part. Published questions stay in the draft but cannot be selected again.
    </div>
    ${allQuestions
      .map((question, index) => {
        const isPublished = publishedIds.has(question.id);
        const assignedPart = questionAssignments.get(question.id);

        return `
          <div class="split-question-row question-card mt-10 ${isPublished ? "split-question-row--published" : ""}">
            <div class="split-question-row-head">
              <strong>Q${index + 1}</strong>
              ${
                isPublished
                  ? `<span class="text-muted">Published</span>`
                  : `<span class="text-muted">${splitParts.length} part${splitParts.length === 1 ? "" : "s"}</span>`
              }
            </div>
            <div class="text-muted mt-5">${escapeHTML(truncateQuestionText(question.text))}</div>
            ${
              isPublished
                ? ""
                : `<div class="split-question-part-options mt-10">
                    <label class="radio-row">
                      <input
                        type="radio"
                        name="split-q-${escapeHTML(question.id)}"
                        class="split-question-part-radio"
                        data-question-id="${escapeHTML(question.id)}"
                        value=""
                        ${assignedPart == null ? "checked" : ""}
                      />
                      Unassigned
                    </label>
                    ${splitParts
                      .map(
                        (_, partIndex) => `
                          <label class="radio-row">
                            <input
                              type="radio"
                              name="split-q-${escapeHTML(question.id)}"
                              class="split-question-part-radio"
                              data-question-id="${escapeHTML(question.id)}"
                              value="${partIndex}"
                              ${assignedPart === partIndex ? "checked" : ""}
                            />
                            Part ${partIndex + 1}
                          </label>
                        `
                      )
                      .join("")}
                  </div>`
            }
          </div>
        `;
      })
      .join("")}
  `;

  if (summaryEl) {
    summaryEl.textContent = summarizeSplitPlan(
      allQuestions,
      splitParts,
      secondsPerQuestion,
      publishedIds
    );
  }
}

function bindSplitPartTitleInputs() {
  document.querySelectorAll(".split-part-title").forEach((input) => {
    input.addEventListener("input", (event) => {
      const index = Number(event.target.dataset.partIndex);
      if (!Number.isFinite(index) || !splitParts[index]) return;
      splitParts[index].title = event.target.value;
    });
  });
}

function bindQuestionAssignmentInputs() {
  document.querySelectorAll(".split-question-part-radio").forEach((input) => {
    input.addEventListener("change", (event) => {
      const questionId = event.target.dataset.questionId;
      if (!questionId) return;

      const rawValue = event.target.value;
      questionAssignments.set(
        questionId,
        rawValue === "" ? null : Number(rawValue)
      );
      syncPartsFromAssignments();
      renderSplitPublishPanel();
      bindSplitPartTitleInputs();
      bindQuestionAssignmentInputs();
    });
  });
}

function openSplitPublishPanel() {
  const draft = getContextValue("getDraft");
  const questions = getDraftQuestions(draft);
  const unpublished = getUnpublishedQuestions(draft);

  if (!questions.length) {
    alert("Add at least one question before split publishing.");
    return;
  }

  if (!unpublished.length) {
    alert("All questions in this draft have already been published.");
    return;
  }

  resetSplitPartsFromDraft();
  renderSplitPublishPanel();
  bindSplitPartTitleInputs();
  bindQuestionAssignmentInputs();

  const resultEl = document.getElementById("splitPublishResult");
  resultEl?.classList.add("hidden");
  if (resultEl) resultEl.innerHTML = "";

  openModal(PANEL_ID, {
    overlayType: "side-panel",
    closeOnBackdrop: false,
  });
}

function closeSplitPublishPanel() {
  closeModal(PANEL_ID);
}

function applyQuestionsPerPartPreset() {
  const draft = getContextValue("getDraft");
  const questions = getUnpublishedQuestions(draft);
  const baseTitle = getBaseTitle();
  const chunkSize = parseInt(document.getElementById("splitChunkSize")?.value, 10);

  splitParts = splitByQuestionsPerPart(
    questions,
    chunkSize || defaultQuestionsPerPart(questions.length),
    baseTitle,
    getNextPartNumber()
  );

  questionAssignments = buildQuestionAssignments(
    splitParts,
    getDraftQuestions(draft),
    getPublishedIds()
  );

  renderSplitPublishPanel();
  bindSplitPartTitleInputs();
  bindQuestionAssignmentInputs();
}

function addSplitPart() {
  const draft = getContextValue("getDraft");
  const questions = getUnpublishedQuestions(draft);
  const baseTitle = getBaseTitle();

  splitParts = splitIntoPartCount(
    questions,
    splitParts.length + 1,
    baseTitle,
    getNextPartNumber()
  );

  questionAssignments = buildQuestionAssignments(
    splitParts,
    getDraftQuestions(draft),
    getPublishedIds()
  );

  renderSplitPublishPanel();
  bindSplitPartTitleInputs();
  bindQuestionAssignmentInputs();
}

function removeSplitPart(index) {
  if (splitParts.length <= 1) return;

  const draft = getContextValue("getDraft");
  const questions = getUnpublishedQuestions(draft);
  const baseTitle = getBaseTitle();

  splitParts = splitIntoPartCount(
    questions,
    splitParts.length - 1,
    baseTitle,
    getNextPartNumber()
  );

  questionAssignments = buildQuestionAssignments(
    splitParts,
    getDraftQuestions(draft),
    getPublishedIds()
  );

  renderSplitPublishPanel();
  bindSplitPartTitleInputs();
  bindQuestionAssignmentInputs();
}

function renderSplitPublishResult(result = {}) {
  const parts = Array.isArray(result.parts) ? result.parts : [];
  const resultEl = document.getElementById("splitPublishResult");
  if (!resultEl) return;

  const examIds = parts.map((part) => part.examId).filter(Boolean);
  const titles = parts.map((part) => part.title).filter(Boolean);
  const examTitle =
    titles.length === 1
      ? titles[0]
      : `${titles.length} exams (${titles.join(" · ")})`;

  const remaining = Number(result.remainingQuestionCount ?? 0);

  resultEl.classList.remove("hidden");
  resultEl.innerHTML = `
    <b>${parts.length} exam${parts.length === 1 ? "" : "s"} published</b>
    ${
      remaining > 0
        ? `<div class="text-muted mt-5">${remaining} question${remaining === 1 ? "" : "s"} remain in the draft for a later publish.</div>`
        : `<div class="text-muted mt-5">All draft questions are now published.</div>`
    }
    <div class="mt-10">
      ${parts
        .map(
          (part) => `
            <div class="mt-5">
              <a href="exam.html?id=${escapeHTML(part.examId)}" target="_blank">
                ${escapeHTML(part.title)}
              </a>
              <span class="text-muted"> · Part ${part.partIndex} · ${part.questionCount} question${
                part.questionCount === 1 ? "" : "s"
              }</span>
            </div>
          `
        )
        .join("")}
    </div>
    ${
      examIds.length
        ? `<button type="button" class="primary-btn mt-10" data-action="assign-all-parts">
            Assign All Parts
          </button>`
        : ""
    }
  `;

  resultEl
    .querySelector('[data-action="assign-all-parts"]')
    ?.addEventListener("click", () => {
      openAssignExamModal(examIds, { examTitle });
    });
}

async function publishSplitParts(requireFullCoverage = false) {
  if (isSplitPublishing) return;

  const draftId = getContextValue("getDraftId");
  const draft = getContextValue("getDraft");
  const questions = getDraftQuestions(draft);
  const publishedIds = getPublishedIds();

  syncPartsFromAssignments();

  const validationMessage = validateSplitPlan(questions, splitParts, {
    publishedQuestionIds: publishedIds,
    requireFullCoverage,
  });

  if (validationMessage) {
    alert(validationMessage);
    return;
  }

  if (!draftId) {
    alert("Save the draft before publishing.");
    return;
  }

  const publishBtn = document.getElementById("publishSplitPartsBtn");
  const publishAllBtn = document.getElementById("publishAllSplitPartsBtn");
  const originalText = publishBtn?.innerText;
  const originalAllText = publishAllBtn?.innerText;

  try {
    isSplitPublishing = true;

    if (publishBtn) {
      publishBtn.disabled = true;
      publishBtn.innerText = "Publishing...";
    }

    if (publishAllBtn) {
      publishAllBtn.disabled = true;
      publishAllBtn.innerText = "Publishing...";
    }

    await splitPublishContext.saveDraft(true, { throwOnError: true });
    splitPublishContext.validateDraftForPublish?.();
    splitPublishContext.setStatus?.("Publishing parts...");

    const payloadParts = splitParts
      .map((part) => ({
        title: String(part.title || "").trim(),
        questionIds: [...(part.questionIds || [])],
      }))
      .filter((part) => part.questionIds.length);

    const result = await invokeEdgeFunction("publish-draft-parts", {
      draftId,
      parts: payloadParts,
      allowPartial: !requireFullCoverage,
    });

    const parts = Array.isArray(result.parts) ? result.parts : [];

    if (draft) {
      draft.status = result.fullyPublished ? "published" : "partially_published";
      draft.published_exam_id =
        draft.published_exam_id ?? parts[0]?.examId ?? null;
      draft.publish_series_id = result.seriesId ?? draft.publish_series_id;
      draft.published_question_ids = Array.isArray(result.publishedQuestionIds)
        ? result.publishedQuestionIds
        : draft.published_question_ids;
    }

    splitPublishContext.setStatus?.(
      result.fullyPublished
        ? `Published ${parts.length} part${parts.length === 1 ? "" : "s"} ✅`
        : `Published ${parts.length} part${parts.length === 1 ? "" : "s"} · ${result.remainingQuestionCount ?? 0} question(s) left in draft`
    );
    splitPublishContext.onPublished?.(result);
    renderSplitPublishResult(result);

    if ((result.remainingQuestionCount ?? 0) > 0) {
      resetSplitPartsFromDraft();
      renderSplitPublishPanel();
      bindSplitPartTitleInputs();
      bindQuestionAssignmentInputs();
    }
  } catch (error) {
    console.error(error);
    alert(error.message || "Split publish failed");
    splitPublishContext.setStatus?.("Split publish failed", true);
  } finally {
    isSplitPublishing = false;

    if (publishBtn) {
      publishBtn.disabled = false;
      publishBtn.innerText = originalText || "Publish Selected Parts";
    }

    if (publishAllBtn) {
      publishAllBtn.disabled = false;
      publishAllBtn.innerText = originalAllText || "Publish All Unpublished";
    }
  }
}

export function initSplitPublishPanel(context = {}) {
  splitPublishContext = context;

  document
    .getElementById("openSplitPublishBtn")
    ?.addEventListener("click", openSplitPublishPanel);

  document
    .getElementById("closeSplitPublish")
    ?.addEventListener("click", closeSplitPublishPanel);

  document
    .getElementById("applySplitPreset")
    ?.addEventListener("click", applyQuestionsPerPartPreset);

  document
    .getElementById("addSplitPartBtn")
    ?.addEventListener("click", addSplitPart);

  document
    .getElementById("publishSplitPartsBtn")
    ?.addEventListener("click", () => publishSplitParts(false));

  document
    .getElementById("publishAllSplitPartsBtn")
    ?.addEventListener("click", () => publishSplitParts(true));

  document
    .getElementById("splitPartsList")
    ?.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-split-part-btn");
      if (!button) return;
      removeSplitPart(Number(button.dataset.partIndex));
    });
}

export function refreshSplitPublishPreview() {
  if (!splitParts.length) return;
  renderSplitPublishPanel();
  bindSplitPartTitleInputs();
  bindQuestionAssignmentInputs();
}
