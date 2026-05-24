// ===============================
// PrepOS Auth Guard
// Hydration-safe auth utilities
// v20260520
// ===============================

import { getClient } from "./core/get-client.js"



/* ====================================
   REQUIRE AUTH
==================================== */

async function requireAuth() {

  const sb = await getClient()

  const {
    data: { user },
    error
  } = await sb.auth.getUser()

  if (error || !user) {

    console.warn(
      "[PrepOS Auth] Unauthorized access attempt."
    )

    window.location.href = "login.html"

    return false

  }

  return true

}



/* ====================================
   GET CURRENT USER
==================================== */

async function getCurrentUser() {

  const sb = await getClient()

  const {
    data,
    error
  } = await sb.auth.getUser()

  if (error) {

    console.error(
      "[PrepOS Auth] Failed to fetch current user.",
      error
    )

    return null

  }

  return data.user

}



/* ====================================
   GET USER SESSION
==================================== */

async function getCurrentSession() {

  const sb = await getClient()

  const {
    data,
    error
  } = await sb.auth.getSession()

  if (error) {

    console.error(
      "[PrepOS Auth] Failed to fetch session.",
      error
    )

    return null

  }

  return data.session

}



/* ====================================
   GET ACCESS TOKEN
==================================== */

async function getAccessToken() {

  const session =
    await getCurrentSession()

  return session?.access_token ?? null

}



/* ====================================
   GET USER ROLE
==================================== */

async function getUserRole() {

  const sb = await getClient()

  const user =
    await getCurrentUser()

  if (!user) {
    return null
  }

  const {
    data,
    error
  } = await sb
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (error) {

    console.error(
      "[PrepOS Auth] Failed to fetch user role.",
      error
    )

    return null

  }

  return data.role

}



/* ====================================
   ROLE CHECK HELPERS
==================================== */

async function isTeacher() {

  const role =
    await getUserRole()

  return role === "teacher"

}


async function isStudent() {

  const role =
    await getUserRole()

  return role === "student"

}


async function isAdmin() {

  const role =
    await getUserRole()

  return role === "admin"

}



/* ====================================
   REQUIRE ROLE
==================================== */

async function requireRole(allowedRoles = []) {

  const role =
    await getUserRole()

  if (!role) {

    window.location.href = "login.html"

    return false

  }

  if (!allowedRoles.includes(role)) {

    console.warn(
      "[PrepOS Auth] Access denied.",
      {
        required: allowedRoles,
        actual: role
      }
    )

    window.location.href = "unauthorized.html"

    return false

  }

  return true

}



/* ====================================
   LOGOUT
==================================== */

async function logout() {

  const sb = await getClient()

  await sb.auth.signOut()

  window.location.href = "login.html"

}



/* ====================================
   AUTH DEBUG HELPERS
==================================== */

async function debugAuthState() {

  const session =
    await getCurrentSession()

  const user =
    await getCurrentUser()

  console.group("[PrepOS Auth Debug]")

  console.log("Session:", session)

  console.log("User:", user)

  console.groupEnd()

}



/* ====================================
   GLOBAL EXPORTS
==================================== */

window.requireAuth = requireAuth

window.getCurrentUser = getCurrentUser

window.getCurrentSession = getCurrentSession

window.getAccessToken = getAccessToken

window.getUserRole = getUserRole

window.isTeacher = isTeacher

window.isStudent = isStudent

window.isAdmin = isAdmin

window.requireRole = requireRole

window.logout = logout

window.debugAuthState = debugAuthState