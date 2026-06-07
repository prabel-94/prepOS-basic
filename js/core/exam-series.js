export function getCompletedExamIds(attemptRows = []) {
  return new Set(
    attemptRows
      .filter((row) => row?.submitted_at && row?.exam_id)
      .map((row) => row.exam_id)
  );
}

export function resolveExamSeriesLock(exam, assignedExams = [], completedExamIds = new Set()) {
  const partIndex = Number(exam?.part_index);
  const seriesId = exam?.series_id;

  if (!seriesId || !Number.isFinite(partIndex) || partIndex <= 1) {
    return {
      seriesLocked: false,
      seriesLockReason: null,
    };
  }

  const siblings = assignedExams.filter(
    (candidate) =>
      candidate?.series_id === seriesId &&
      Number.isFinite(Number(candidate?.part_index))
  );

  const priorPart = siblings.find(
    (candidate) => Number(candidate.part_index) === partIndex - 1
  );

  if (!priorPart) {
    return {
      seriesLocked: true,
      seriesLockReason: `Part ${partIndex - 1} must be assigned and completed first`,
    };
  }

  if (completedExamIds.has(priorPart.id)) {
    return {
      seriesLocked: false,
      seriesLockReason: null,
    };
  }

  const priorLabel = priorPart.title || `Part ${partIndex - 1}`;

  return {
    seriesLocked: true,
    seriesLockReason: `Complete ${priorLabel} first`,
  };
}

export function enrichExamsWithSeriesLocks(exams = [], attemptRows = []) {
  const completedExamIds = getCompletedExamIds(attemptRows);

  return exams.map((exam) => ({
    ...exam,
    ...resolveExamSeriesLock(exam, exams, completedExamIds),
  }));
}

export async function assertExamSeriesUnlocked(sb, exam, userId) {
  const partIndex = Number(exam?.part_index);
  const seriesId = exam?.series_id;

  if (!userId || !seriesId || !Number.isFinite(partIndex) || partIndex <= 1) {
    return;
  }

  const { data: priorExam, error: priorError } = await sb
    .from("exam_sessions")
    .select("id, title, part_index")
    .eq("series_id", seriesId)
    .eq("part_index", partIndex - 1)
    .maybeSingle();

  if (priorError || !priorExam) {
    return;
  }

  const { data: priorAttempt, error: attemptError } = await sb
    .from("exam_attempts")
    .select("id")
    .eq("exam_id", priorExam.id)
    .eq("student_id", userId)
    .maybeSingle();

  if (attemptError) {
    throw attemptError;
  }

  if (!priorAttempt) {
    const priorLabel = priorExam.title || `Part ${partIndex - 1}`;
    throw new Error(`Complete ${priorLabel} before starting this exam.`);
  }
}
