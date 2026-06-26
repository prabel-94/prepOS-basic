// ========================================
// PrepOS Runtime Orchestration
// Lightweight boot layer — not a framework.
// ========================================

import { getClient } from "./get-client.js";
import {
  TEACHER_ROLES,
  fetchUserRole,
  redirectToLogin,
  redirectToUnauthorized,
  roleAllowedWithLinkedStudent,
} from "./access.js";
import {
  fetchTeacherLearnerContext,
  isLinkedStudentMode,
  resolveActingStudentId,
} from "./learner-context.js";

let runtimePromise = null;
let listenersRegistered = false;

function normalizeRoles(options = {}) {
  if (Array.isArray(options.roles) && options.roles.length) {
    return options.roles;
  }

  if (options.role) {
    return [options.role];
  }

  return null;
}

function resolveAppMode(role, learnerContext) {
  if (isLinkedStudentMode({ role, learnerContext })) {
    return "student";
  }

  if (role === "student") {
    return "student";
  }

  if (TEACHER_ROLES.includes(role)) {
    return "teacher";
  }

  return role ?? null;
}

async function executeBoot(options = {}) {
  const bootedAt = new Date().toISOString();
  const requiredRoles = normalizeRoles(options);
  const sb = await getClient();

  const {
    data: { session },
    error: sessionError,
  } = await sb.auth.getSession();

  if (sessionError) {
    console.warn("[PrepOS Runtime] Session hydration failed.", sessionError);
  }

  const user = session?.user ?? null;

  if (options.requireAuth && !user) {
    redirectToLogin();
    return null;
  }

  let userRole = null;
  let learnerContext = null;

  if (user) {
    userRole = await fetchUserRole(sb, user.id);

    if (!userRole && options.requireAuth) {
      redirectToLogin();
      return null;
    }

    if (userRole && TEACHER_ROLES.includes(userRole)) {
      learnerContext = await fetchTeacherLearnerContext(sb);
    }
  }

  if (requiredRoles?.length) {
    if (!user) {
      redirectToLogin();
      return null;
    }

    const allowed = roleAllowedWithLinkedStudent({
      role: userRole,
      allowedRoles: requiredRoles,
      allowLinkedStudentMode: options.allowLinkedStudentMode === true,
      learnerContext,
    });

    if (!allowed) {
      console.warn("[PrepOS Runtime] Access denied.", {
        required: requiredRoles,
        actual: userRole,
        linkedStudentMode: learnerContext?.studentModeActive,
      });
      redirectToUnauthorized();
      return null;
    }
  }

  const analyticsEnabled = options.analytics === true;

  if (analyticsEnabled && !listenersRegistered) {
    const { registerDefaultAnalyticsListeners } = await import(
      "../analytics/analytics-submission.js"
    );
    registerDefaultAnalyticsListeners();
    listenersRegistered = true;
  }

  const runtimeState = {
    hydrated: true,
    bootedAt,
    session,
    user,
    role: userRole,
    authUserId: user?.id ?? null,
    learnerContext,
    hasLinkedLearner: Boolean(learnerContext?.hasLink),
    appMode: resolveAppMode(userRole, learnerContext),
    effectiveStudentId: resolveActingStudentId({
      user,
      role: userRole,
      learnerContext,
    }),
    analyticsEnabled,
    listenersRegistered,
  };

  window.__PREPOS_RUNTIME__ = runtimeState;

  return {
    sb,
    session,
    user,
    role: userRole,
    authUserId: runtimeState.authUserId,
    learnerContext,
    hasLinkedLearner: runtimeState.hasLinkedLearner,
    appMode: runtimeState.appMode,
    effectiveStudentId: runtimeState.effectiveStudentId,
    analyticsEnabled,
  };
}

export async function bootRuntime(options = {}) {
  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    try {
      return await executeBoot(options);
    } catch (err) {
      runtimePromise = null;
      throw err;
    }
  })();

  return runtimePromise;
}

export function getRuntimeState() {
  return window.__PREPOS_RUNTIME__ ?? null;
}

export function resetRuntimeForDebug() {
  runtimePromise = null;
  listenersRegistered = false;
  delete window.__PREPOS_RUNTIME__;
}
