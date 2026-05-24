// ===============================
// PrepOS Auth Guard
// Hydration-safe auth utilities
// v20260524
// ===============================

import { getClient } from "./core/get-client.js";
import {
  TEACHER_ROLES,
  STUDENT_ROLES,
  fetchUserRole,
  redirectToLogin,
  redirectToUnauthorized,
  roleAllowed,
} from "./core/access.js";

async function requireAuth() {
  const sb = await getClient();

  const {
    data: { user },
    error,
  } = await sb.auth.getUser();

  if (error || !user) {
    console.warn("[PrepOS Auth] Unauthorized access attempt.");
    redirectToLogin();
    return false;
  }

  return true;
}

async function getCurrentUser() {
  const sb = await getClient();

  const { data, error } = await sb.auth.getUser();

  if (error) {
    console.error("[PrepOS Auth] Failed to fetch current user.", error);
    return null;
  }

  return data.user;
}

async function getCurrentSession() {
  const sb = await getClient();

  const { data, error } = await sb.auth.getSession();

  if (error) {
    console.error("[PrepOS Auth] Failed to fetch session.", error);
    return null;
  }

  return data.session;
}

async function getAccessToken() {
  const session = await getCurrentSession();
  return session?.access_token ?? null;
}

async function getUserRole() {
  const sb = await getClient();
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return fetchUserRole(sb, user.id);
}

async function isTeacher() {
  const role = await getUserRole();
  return role === "teacher" || role === "admin";
}

async function isStudent() {
  const role = await getUserRole();
  return role === "student";
}

async function isAdmin() {
  const role = await getUserRole();
  return role === "admin";
}

async function requireRole(allowedRoles = []) {
  const sb = await getClient();
  const user = await getCurrentUser();

  if (!user) {
    redirectToLogin();
    return false;
  }

  const role = await fetchUserRole(sb, user.id);

  if (!role) {
    redirectToLogin();
    return false;
  }

  if (!roleAllowed(role, allowedRoles)) {
    console.warn("[PrepOS Auth] Access denied.", {
      required: allowedRoles,
      actual: role,
    });
    redirectToUnauthorized();
    return false;
  }

  return true;
}

async function requireTeacherAccess() {
  return requireRole([...TEACHER_ROLES]);
}

async function requireStudentAccess() {
  return requireRole([...STUDENT_ROLES]);
}

async function logout() {
  const sb = await getClient();
  await sb.auth.signOut();
  redirectToLogin();
}

async function debugAuthState() {
  const session = await getCurrentSession();
  const user = await getCurrentUser();

  console.group("[PrepOS Auth Debug]");
  console.log("Session:", session);
  console.log("User:", user);
  console.groupEnd();
}

window.requireAuth = requireAuth;
window.getCurrentUser = getCurrentUser;
window.getCurrentSession = getCurrentSession;
window.getAccessToken = getAccessToken;
window.getUserRole = getUserRole;
window.isTeacher = isTeacher;
window.isStudent = isStudent;
window.isAdmin = isAdmin;
window.requireRole = requireRole;
window.requireTeacherAccess = requireTeacherAccess;
window.requireStudentAccess = requireStudentAccess;
window.logout = logout;
window.debugAuthState = debugAuthState;
