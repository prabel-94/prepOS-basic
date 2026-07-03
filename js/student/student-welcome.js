/**
 * Student dashboard welcome copy helpers.
 */

/**
 * @param {Date} [date]
 */
export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

/**
 * @param {string} displayName
 */
export function getFirstName(displayName = "") {
  const trimmed = String(displayName ?? "").trim();
  if (!trimmed) {
    return "there";
  }

  return trimmed.split(/\s+/)[0];
}

/**
 * @param {Array<{ attemptStatus?: string }>} exams
 */
export function countPendingExams(exams = []) {
  return exams.filter((exam) => {
    const status = exam.attemptStatus ?? "not_attempted";
    return status !== "completed" && status !== "locked";
  }).length;
}

/**
 * @param {object} options
 * @param {string} [options.displayName]
 * @param {Array<{ attemptStatus?: string }>} [options.exams]
 */
export function buildWelcomeMessage({ displayName = "", exams = [] } = {}) {
  const greeting = getTimeGreeting();
  const firstName = getFirstName(displayName);
  const pendingCount = countPendingExams(exams);

  let headline = `${greeting}, ${firstName}.`;
  let detail = "Practice, read notes, and check your learning progress below.";

  if (pendingCount === 1) {
    detail = "You have 1 exam waiting — start when you are ready.";
  } else if (pendingCount > 1) {
    detail = `You have ${pendingCount} exams waiting — start when you are ready.`;
  }

  return { headline, detail };
}

/**
 * @param {object} learningState
 */
export function buildAchievementHint(learningState = {}) {
  const mastered = Number(learningState.snapshot?.topicsMastered ?? 0);
  const strongCount = Array.isArray(learningState.strongTopics)
    ? learningState.strongTopics.length
    : 0;
  const weakCount = Array.isArray(learningState.weakTopics)
    ? learningState.weakTopics.length
    : 0;

  if (strongCount >= 3) {
    return `${strongCount} strong topics on your profile — great momentum.`;
  }

  if (mastered >= 5) {
    return `${mastered} topics mastered — you're building a solid foundation.`;
  }

  if (weakCount > 0 && mastered > 0) {
    return "Focus on weak topics next — small sessions add up quickly.";
  }

  return null;
}

/**
 * @param {object} runtime
 */
export async function resolveStudentDisplayName(runtime = {}) {
  if (runtime.learnerContext?.studentModeActive && runtime.learnerContext?.displayName) {
    return runtime.learnerContext.displayName;
  }

  const studentId = runtime.effectiveStudentId ?? runtime.user?.id;
  if (studentId) {
    try {
      const { getLearnerProfile } = await import("../core/learner-profile.js");
      const profile = await getLearnerProfile(studentId);
      if (profile?.displayName) {
        return profile.displayName;
      }
    } catch {
      /* optional profile lookup */
    }
  }

  const user = runtime.user;
  const fromMeta = user?.user_metadata?.full_name;
  if (fromMeta?.trim()) {
    return fromMeta.trim();
  }

  const emailPrefix = user?.email?.split("@")?.[0];
  if (emailPrefix) {
    return emailPrefix;
  }

  return "Student";
}
