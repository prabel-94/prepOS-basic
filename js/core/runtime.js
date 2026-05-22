// ========================================
// PrepOS Runtime Orchestration
// Lightweight boot layer — not a framework.
// ========================================

import { getClient } from "./get-client.js"

let runtimePromise = null
let listenersRegistered = false

async function executeBoot({
  requireAuth = false,
  role = null,
  analytics = false
} = {}) {

  const bootedAt = new Date().toISOString()

  const sb = await getClient()

  const {
    data: { session },
    error: sessionError
  } = await sb.auth.getSession()

  if (sessionError) {
    console.warn(
      "[PrepOS Runtime] Session hydration failed.",
      sessionError
    )
  }

  const user = session?.user ?? null

  if (requireAuth && !user) {
    window.location.href = "login.html"
    return null
  }

  let userRole = null

  if (role) {
    if (!user) {
      console.warn(
        "[PrepOS Runtime] Role required but no authenticated user.",
        { required: role }
      )
      window.location.href = "login.html"
      return null
    }

    const { data, error: roleError } = await sb
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (roleError) {
      console.warn(
        "[PrepOS Runtime] Role fetch failed.",
        roleError
      )
    } else {
      userRole = data?.role ?? null
    }

    if (userRole !== role) {
      console.warn(
        "[PrepOS Runtime] Access denied.",
        { required: role, actual: userRole }
      )
      window.location.href = "unauthorized.html"
      return null
    }
  }

  const analyticsEnabled = analytics === true

  if (analyticsEnabled && !listenersRegistered) {
    const { registerDefaultAnalyticsListeners } = await import(
      "../analytics/analytics-submission.js"
    )
    registerDefaultAnalyticsListeners()
    listenersRegistered = true
  }

  window.__PREPOS_RUNTIME__ = {
    hydrated: true,
    bootedAt,
    session,
    user,
    role: userRole,
    analyticsEnabled,
    listenersRegistered
  }

  return {
    sb,
    session,
    user,
    role: userRole,
    analyticsEnabled
  }
}

export async function bootRuntime({
  requireAuth = false,
  role = null,
  analytics = false
} = {}) {

  if (runtimePromise) {
    return runtimePromise
  }

  const options = { requireAuth, role, analytics }

  runtimePromise = (async () => {
    try {
      return await executeBoot(options)
    } catch (err) {
      runtimePromise = null
      throw err
    }
  })()

  return runtimePromise
}

export function getRuntimeState() {
  return window.__PREPOS_RUNTIME__ ?? null
}

export function resetRuntimeForDebug() {
  runtimePromise = null
  listenersRegistered = false
  delete window.__PREPOS_RUNTIME__
}
