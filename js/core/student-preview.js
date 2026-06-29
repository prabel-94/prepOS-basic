/**
 * Teacher "preview as student" URL helpers (Phase 1 — read-only / inspect paths).
 */

import { resolveAppPath } from "./access.js";

export const STUDENT_PREVIEW_PARAM = "preview";
export const STUDENT_PREVIEW_VALUE = "student";

export function isStudentPreviewQuery(
  search = typeof window !== "undefined" ? window.location.search : ""
) {
  return (
    new URLSearchParams(search).get(STUDENT_PREVIEW_PARAM) ===
    STUDENT_PREVIEW_VALUE
  );
}

export function buildExamStudentPreviewHref(examId) {
  return resolveAppPath(
    `exam.html?id=${encodeURIComponent(examId)}&mode=inspect`
  );
}

export function buildNoteStudentPreviewHref({ topicId, lang, variantId } = {}) {
  const params = new URLSearchParams();
  params.set(STUDENT_PREVIEW_PARAM, STUDENT_PREVIEW_VALUE);

  if (topicId) {
    params.set("topic", topicId);
    if (lang) {
      params.set("lang", lang);
    }
  } else if (variantId) {
    params.set("variant", variantId);
  }

  return resolveAppPath(`note.html?${params.toString()}`);
}

export function teacherStudentPreviewHubPath() {
  return resolveAppPath("teacher-student-preview.html");
}
