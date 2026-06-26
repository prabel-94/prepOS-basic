/**
 * Linked learner context — teacher JWT acting as shadow student (Phase 2).
 */

import { TEACHER_ROLES } from "./access.js";

export function isLinkedLearnerEnabled() {
  if (window.PREPOS_LINKED_LEARNER_ENABLED === false) {
    return false;
  }

  return true;
}

function normalizeContext(raw) {
  if (!raw || raw.hasLink !== true) {
    return {
      hasLink: false,
      studentModeActive: false,
      teacherUserId: null,
      studentUserId: null,
      displayName: null,
      excludeFromClassAnalytics: true,
    };
  }

  return {
    hasLink: true,
    studentModeActive: Boolean(raw.studentModeActive),
    teacherUserId: raw.teacherUserId ?? null,
    studentUserId: raw.studentUserId ?? null,
    displayName: raw.displayName ?? "My learning",
    excludeFromClassAnalytics: raw.excludeFromClassAnalytics !== false,
  };
}

export async function fetchTeacherLearnerContext(sb) {
  if (!isLinkedLearnerEnabled()) {
    return normalizeContext(null);
  }

  const { data, error } = await sb.rpc("get_teacher_learner_context");

  if (error) {
    console.warn("[PrepOS Learner Context] fetch failed", error);
    return normalizeContext(null);
  }

  return normalizeContext(data);
}

export async function setTeacherStudentMode(sb, active) {
  const { data, error } = await sb.rpc("set_teacher_student_mode", {
    p_active: Boolean(active),
  });

  if (error) {
    throw error;
  }

  return data;
}

export function resolveActingStudentId(runtime) {
  if (!runtime?.user?.id) {
    return null;
  }

  if (runtime.role === "student") {
    return runtime.user.id;
  }

  if (
    runtime.learnerContext?.hasLink &&
    runtime.learnerContext?.studentModeActive &&
    runtime.learnerContext?.studentUserId
  ) {
    return runtime.learnerContext.studentUserId;
  }

  return null;
}

export function isLinkedStudentMode(runtime) {
  return Boolean(
    runtime?.learnerContext?.hasLink &&
      runtime.learnerContext?.studentModeActive &&
      TEACHER_ROLES.includes(runtime?.role)
  );
}

export function canAccessStudentSurfaces(runtime) {
  if (!runtime?.user) {
    return false;
  }

  if (runtime.role === "student" || runtime.role === "admin") {
    return true;
  }

  return isLinkedStudentMode(runtime);
}

export async function provisionLinkedLearner(sb, { displayName } = {}) {
  const { invokeEdgeFunction } = await import("./edge-invoke.js");

  return invokeEdgeFunction("provision-linked-learner", {
    displayName: displayName?.trim() || "My learning",
  });
}

export async function enterLinkedStudentMode(sb) {
  await setTeacherStudentMode(sb, true);
}

export async function exitLinkedStudentMode(sb) {
  await setTeacherStudentMode(sb, false);
}

export async function resolveActingStudentIdAsync(sb) {
  const cached = resolveActingStudentId(getRuntimeState());
  if (cached) {
    return cached;
  }

  const { data: userData } = await sb.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return null;
  }

  const { fetchUserRole } = await import("./access.js");
  const role = await fetchUserRole(sb, user.id);

  if (role === "student") {
    return user.id;
  }

  if (!TEACHER_ROLES.includes(role)) {
    return null;
  }

  const ctx = await fetchTeacherLearnerContext(sb);
  if (ctx.hasLink && ctx.studentModeActive && ctx.studentUserId) {
    return ctx.studentUserId;
  }

  return null;
}

export function isActingAsLinkedStudent(runtime = getRuntimeState()) {
  return isLinkedStudentMode(runtime);
}
