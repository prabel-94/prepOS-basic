/**
 * PrepOS access routing — role homes and path resolution for nested pages.
 */

export const TEACHER_ROLES = Object.freeze(["teacher", "admin"]);
export const STUDENT_ROLES = Object.freeze(["student", "admin"]);
export const ALL_APP_ROLES = Object.freeze(["teacher", "admin", "student"]);

export function getHomePathForRole(role) {
  if (role === "student") {
    return "student-dashboard.html";
  }

  if (role === "teacher" || role === "admin") {
    return "index.html";
  }

  return "login.html";
}

export function getAppPathDepth() {
  const segments = window.location.pathname
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  if (!segments.length) {
    return 0;
  }

  const last = segments[segments.length - 1];
  if (/\.html?$/i.test(last)) {
    return segments.length - 1;
  }

  return segments.length;
}

export function resolveAppPath(relativePath) {
  const depth = getAppPathDepth();
  const prefix = depth > 0 ? "../".repeat(depth) : "";
  return `${prefix}${relativePath}`;
}

export function redirectToLogin() {
  window.location.href = resolveAppPath("login.html");
}

export function redirectToUnauthorized() {
  window.location.href = resolveAppPath("unauthorized.html");
}

export function redirectToRoleHome(role) {
  window.location.href = resolveAppPath(getHomePathForRole(role));
}

export function roleAllowed(role, allowedRoles = []) {
  if (!role || !allowedRoles.length) {
    return false;
  }

  return allowedRoles.includes(role);
}

export async function fetchUserRole(sb, userId) {
  const { data, error } = await sb
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !data?.role) {
    return null;
  }

  return data.role;
}
