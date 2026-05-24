// ========================================
// PrepOS Runtime Orchestration
// Lightweight boot layer — not a framework.
// ========================================

import { getClient } from "./get-client.js";
import {
  fetchUserRole,
  redirectToLogin,
  redirectToUnauthorized,
  roleAllowed,
} from "./access.js";

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

  if (user) {
    userRole = await fetchUserRole(sb, user.id);

    if (!userRole && options.requireAuth) {
      redirectToLogin();
      return null;
    }
  }

  if (requiredRoles?.length) {
    if (!user) {
      redirectToLogin();
      return null;
    }

    if (!roleAllowed(userRole, requiredRoles)) {
      console.warn("[PrepOS Runtime] Access denied.", {
        required: requiredRoles,
        actual: userRole,
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

  window.__PREPOS_RUNTIME__ = {
    hydrated: true,
    bootedAt,
    session,
    user,
    role: userRole,
    analyticsEnabled,
    listenersRegistered,
  };

  return {
    sb,
    session,
    user,
    role: userRole,
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
