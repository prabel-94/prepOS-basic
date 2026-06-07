import { computeExamDurationSeconds } from "./exam-timing.js";
import { formatExamDuration } from "../student/student-exam-meta.js";

export function getDraftQuestions(draft) {
  return draft?.schema_json?.sections?.[0]?.questions || [];
}

export function getPublishedQuestionIds(draft) {
  const raw = draft?.published_question_ids;

  if (!Array.isArray(raw)) {
    return new Set();
  }

  return new Set(
    raw.filter((id) => typeof id === "string" && id.trim())
  );
}

export function getUnpublishedQuestions(draft) {
  const published = getPublishedQuestionIds(draft);
  return getDraftQuestions(draft).filter((question) => !published.has(question.id));
}

export function formatPartTitle(baseTitle, partNumber) {
  const base = String(baseTitle || "Untitled Exam").trim() || "Untitled Exam";
  return `${base} — Part ${partNumber}`;
}

export function truncateQuestionText(text = "", maxLength = 72) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

export function splitIntoPartCount(questions, partCount, baseTitle, startPartNumber = 1) {
  const list = Array.isArray(questions) ? questions : [];
  const count = Math.max(1, Math.min(partCount, list.length || 1));

  if (!list.length) {
    return [];
  }

  const baseSize = Math.floor(list.length / count);
  const remainder = list.length % count;
  const parts = [];
  let offset = 0;

  for (let index = 0; index < count; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    const slice = list.slice(offset, offset + size);
    offset += size;

    parts.push({
      title: formatPartTitle(baseTitle, startPartNumber + index),
      questionIds: slice.map((question) => question.id),
    });
  }

  return parts;
}

export function splitByQuestionsPerPart(
  questions,
  questionsPerPart,
  baseTitle,
  startPartNumber = 1
) {
  const list = Array.isArray(questions) ? questions : [];
  const chunkSize = Math.max(1, questionsPerPart);

  if (!list.length) {
    return [];
  }

  const parts = [];

  for (let offset = 0; offset < list.length; offset += chunkSize) {
    const slice = list.slice(offset, offset + chunkSize);
    parts.push({
      title: formatPartTitle(baseTitle, startPartNumber + parts.length),
      questionIds: slice.map((question) => question.id),
    });
  }

  return parts;
}

export function syncPartsFromQuestionAssignments(parts, questionAssignments) {
  return parts.map((part, index) => ({
    ...part,
    questionIds: [...questionAssignments.entries()]
      .filter(([, partIndex]) => partIndex === index)
      .map(([questionId]) => questionId),
  }));
}

export function buildQuestionAssignments(parts, questions, publishedQuestionIds = new Set()) {
  const assignments = new Map();

  parts.forEach((part, partIndex) => {
    for (const questionId of part.questionIds || []) {
      if (!publishedQuestionIds.has(questionId)) {
        assignments.set(questionId, partIndex);
      }
    }
  });

  for (const question of questions) {
    if (!assignments.has(question.id) && !publishedQuestionIds.has(question.id)) {
      assignments.set(question.id, null);
    }
  }

  return assignments;
}

export function validateSplitPlan(
  questions,
  parts,
  {
    publishedQuestionIds = new Set(),
    requireFullCoverage = false,
  } = {}
) {
  const available = (questions || []).filter(
    (question) => question?.id && !publishedQuestionIds.has(question.id)
  );
  const availableIds = new Set(available.map((question) => question.id));

  if (!available.length) {
    return "All draft questions have already been published.";
  }

  if (!Array.isArray(parts) || !parts.length) {
    return "Add at least one exam part.";
  }

  const seen = new Set();

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const title = String(part?.title || "").trim();

    if (!title) {
      return `Part ${index + 1} needs a title.`;
    }

    const ids = Array.isArray(part?.questionIds) ? part.questionIds : [];

    if (!ids.length) {
      return `Part ${index + 1} has no questions selected.`;
    }

    for (const id of ids) {
      if (!availableIds.has(id)) {
        return `Part ${index + 1} includes an unavailable or already published question.`;
      }

      if (seen.has(id)) {
        return "Each question can belong to only one part.";
      }

      seen.add(id);
    }
  }

  if (requireFullCoverage && seen.size !== availableIds.size) {
    return "Assign every unpublished question to a part, or publish as a partial split.";
  }

  if (!seen.size) {
    return "Select at least one question to publish.";
  }

  return null;
}

export function describeSplitPart(
  part,
  questions,
  secondsPerQuestion,
  partIndex
) {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const partQuestions = (part.questionIds || [])
    .map((id) => questionMap.get(id))
    .filter(Boolean);
  const count = partQuestions.length;
  const totalSeconds = computeExamDurationSeconds(count, secondsPerQuestion);
  const durationLabel = formatExamDuration(totalSeconds) || "—";

  const positions = (part.questionIds || [])
    .map((id) => questions.findIndex((question) => question.id === id) + 1)
    .filter((value) => value > 0);

  const rangeLabel =
    positions.length > 0
      ? `Q${positions[0]}–Q${positions[positions.length - 1]}`
      : "—";

  return {
    partIndex,
    count,
    durationLabel,
    rangeLabel,
  };
}

export function summarizeSplitPlan(
  questions,
  parts,
  secondsPerQuestion,
  publishedQuestionIds = new Set()
) {
  const totalQuestions = questions.length;
  const unpublishedCount = questions.filter(
    (question) => !publishedQuestionIds.has(question.id)
  ).length;
  const covered = parts.reduce(
    (sum, part) => sum + (part.questionIds?.length || 0),
    0
  );

  return `${parts.length} part${parts.length === 1 ? "" : "s"} · ${covered}/${unpublishedCount} unpublished selected · ${totalQuestions} total in draft · ${secondsPerQuestion} sec per question`;
}
