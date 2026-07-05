/**
 * Teacher hub — preview how students see your content (Phase 1, read-only).
 */

import { bootPage } from "../core/page-boot.js";
import {
  buildExamStudentPreviewHref,
  teacherStudentPreviewHubPath,
} from "../core/student-preview.js";
import { getClient } from "../core/get-client.js";
import { loadTopicNotesSection } from "../notes/note-home.js";
import {
  bindPreviewExamActions,
  renderPreviewExamCards,
  renderPreviewIntelligenceMock,
} from "./student-preview-renderer.js";
import { fetchTeacherLearnerContext, isLinkedLearnerEnabled } from "../core/learner-context.js";
import { resolveAppPath } from "../core/access.js";

const PREVIEW_NOTES_ROLE = "preview-student";

async function loadTeacherPreviewExams(userId) {
  const sb = await getClient();

  let query = sb
    .from("exam_sessions")
    .select("id, title, duration, created_at, schema_json")
    .order("created_at", { ascending: false })
    .limit(40);

  if (userId) {
    query = query.eq("created_by", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((exam) => {
    const questionCount = Array.isArray(exam.schema_json?.sections?.[0]?.questions)
      ? exam.schema_json.sections[0].questions.length
      : null;

    return {
      id: exam.id,
      title: exam.title,
      duration: exam.duration,
      questionCount,
    };
  });
}

function scrollToPreviewNotes() {
  document.getElementById("previewTopicNotesSection")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function initStudentPreviewHub() {
  const runtime = await bootPage({
    roles: ["teacher", "admin"],
    nav: {
      variant: "home",
      showHome: false,
      title: "Student Experience Preview",
      subtitle: "Read-only — progress is not saved",
      links: [
        { label: "Teacher Home", href: "index.html" },
        { label: "Published Exams", href: "published-exams.html" },
      ],
    },
  });

  if (!runtime) return;

  document.body.classList.remove("pro-surface");
  document.body.classList.add("student-surface");

  const examsEl = document.getElementById("previewAvailableExams");
  const intelligenceEl = document.getElementById("previewIntelligenceMock");
  const notesEl = document.getElementById("previewTopicNotes");

  document
    .getElementById("previewBrowseNotesBtn")
    ?.addEventListener("click", scrollToPreviewNotes);

  const linkedCtaEl = document.getElementById("previewLinkedLearnerCta");
  if (linkedCtaEl && isLinkedLearnerEnabled()) {
    const sb = await getClient();
    const ctx = await fetchTeacherLearnerContext(sb);

    if (ctx.hasLink) {
      linkedCtaEl.innerHTML = `
        <p class="mt-10">
          You have a linked learning account.
          <a class="primary-btn inline-link-btn" href="${resolveAppPath("index.html")}">
            Open teacher home to switch to my learning
          </a>
        </p>
      `;
      linkedCtaEl.classList.remove("hidden");
    } else {
      linkedCtaEl.innerHTML = `
        <p class="mt-10">
          Want real attempts on this login?
          <a href="${resolveAppPath("index.html")}">Set up my learning account</a> on teacher home.
        </p>
      `;
      linkedCtaEl.classList.remove("hidden");
    }
  }

  renderPreviewIntelligenceMock(intelligenceEl);

  try {
    const exams = await loadTeacherPreviewExams(runtime.user?.id);
    renderPreviewExamCards(examsEl, exams);
    bindPreviewExamActions(examsEl, (examId) => {
      window.location.href = buildExamStudentPreviewHref(examId);
    });
  } catch (error) {
    console.error("[Student Preview Hub] exams failed", error);
    if (examsEl) {
      examsEl.innerHTML =
        '<div class="empty-state">Unable to load your published exams for preview.</div>';
    }
  }

  if (notesEl) {
    await loadTopicNotesSection(notesEl, {
      role: PREVIEW_NOTES_ROLE,
      limit: 30,
    });
  }

  const { upgradeLegacyOnclickNav } = await import("../core/navigate.js");
  upgradeLegacyOnclickNav(document);
}

window.scrollToPreviewNotes = scrollToPreviewNotes;
window.teacherStudentPreviewHubPath = teacherStudentPreviewHubPath;

initStudentPreviewHub();
