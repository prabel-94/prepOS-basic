/**
 * PrepOS access routing — role homes and path resolution for nested pages.
 */

export const TEACHER_ROLES = Object.freeze(["teacher", "admin"]);
export const STUDENT_ROLES = Object.freeze(["student", "admin"]);
export const ALL_APP_ROLES = Object.freeze(["teacher", "admin", "student"]);

const CONFIG_SCRIPT_MARKER = "/js/config.js";

export function getHomePathForRole(role) {
  if (role === "student") {
    return "student-dashboard.html";
  }

  if (role === "teacher" || role === "admin") {
    return "index.html";
  }

  return "login.html";
}

/**
 * Deployment root (e.g. "/prepos-basic" on GitHub Pages project sites).
 * Set window.PREPOS_BASE_PATH in config.js to override auto-detection.
 */
export function getAppBasePath() {
  const configured = window.PREPOS_BASE_PATH;
  if (typeof configured === "string") {
    return configured.replace(/\/$/, "");
  }

  if (configured === "") {
    return "";
  }

  for (const script of document.querySelectorAll("script[src]")) {
    const src = script.getAttribute("src");
    if (!src?.includes("js/config")) {
      continue;
    }

    try {
      const url = new URL(src, window.location.href);
      const idx = url.pathname.indexOf(CONFIG_SCRIPT_MARKER);
      if (idx > 0) {
        return url.pathname.slice(0, idx);
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return "";
}

/**
 * Relative depth below the app root (e.g. admin/ → 1). Used when no base path.
 */
export function getAppPathDepth() {
  const base = getAppBasePath();
  let pathname = window.location.pathname.replace(/\\/g, "/");

  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length) || "/";
  }

  const segments = pathname.split("/").filter(Boolean);

  if (!segments.length) {
    return 0;
  }

  const last = segments[segments.length - 1];
  if (/\.html?$/i.test(last)) {
    return Math.max(0, segments.length - 1);
  }

  return segments.length;
}

export function resolveAppPath(relativePath) {
  const target = String(relativePath || "").replace(/^\//, "");
  const base = getAppBasePath();

  if (base) {
    return `${base}/${target}`;
  }

  const depth = getAppPathDepth();
  const prefix = depth > 0 ? "../".repeat(depth) : "";
  return `${prefix}${target}`;
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
