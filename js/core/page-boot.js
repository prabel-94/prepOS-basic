import { bootRuntime } from "./runtime.js";
import { mountAppNav, NAV_PRESETS } from "../ui/app-nav.js";
import { initPrepOSLinkRouting, upgradeLegacyOnclickNav } from "./navigate.js";

function normalizeRoles(options = {}) {
  if (Array.isArray(options.roles) && options.roles.length) {
    return options.roles;
  }

  if (options.role) {
    return [options.role];
  }

  return null;
}

function markActiveLinks(links = []) {
  const currentPage = window.location.pathname.split("/").pop() || "";

  return links.map((link) => ({
    ...link,
    active: link.active ?? link.href.split("?")[0] === currentPage,
  }));
}

function resolveNavOptions(nav, runtime) {
  if (nav === false) {
    return null;
  }

  const navOptions = nav === true ? {} : { ...(nav || {}) };
  const preset = navOptions.preset ? NAV_PRESETS[navOptions.preset] : null;
  const links = navOptions.links ?? preset?.links ?? [];

  return {
    ...navOptions,
    role: navOptions.role ?? runtime?.role ?? null,
    links: markActiveLinks(links),
  };
}

/**
 * Standard authenticated page boot: runtime auth/roles + shared nav.
 */
export async function bootPage(options = {}) {
  const roles = normalizeRoles(options);
  const runtime = await bootRuntime({
    requireAuth: options.requireAuth !== false,
    roles,
    role: options.role ?? null,
    analytics: options.analytics === true,
    allowLinkedStudentMode: options.allowLinkedStudentMode === true,
  });

  if (!runtime) {
    return null;
  }

  if (runtime.appMode === "student") {
    document.body.classList.add("student-surface");
  } else if (runtime.appMode === "teacher" || runtime.role === "admin") {
    document.body.classList.add("pro-surface");
    const { bootStudentManagementVisibility } = await import(
      "../teacher/student-management-visibility.js"
    );
    bootStudentManagementVisibility();
  }

  initPrepOSLinkRouting();
  upgradeLegacyOnclickNav(document);

  const navOptions = resolveNavOptions(options.nav, runtime);
  if (navOptions) {
    mountAppNav(navOptions);
    if (runtime.appMode === "teacher" || runtime.role === "admin") {
      const { applyStudentManagementVisibility } = await import(
        "../teacher/student-management-visibility.js"
      );
      applyStudentManagementVisibility();
    }
  }

  if (runtime && (options.classOverlay !== false)) {
    const role = runtime.role;
    if (role === "teacher" || role === "admin") {
      import("../ui/class-overlay/boot.js")
        .then(({ bootClassOverlay }) => bootClassOverlay(runtime))
        .catch((err) => {
          console.warn("[Class overlay] Boot failed:", err);
        });
    }
  }

  if (runtime?.appMode === "student" && options.activityLog !== false) {
    import("./activity-log.js")
      .then(({ initStudentActivityLogging }) => initStudentActivityLogging(runtime))
      .catch((err) => {
        console.warn("[Activity Log] Init failed:", err);
      });
  }

  return runtime;
}

export { NAV_PRESETS };
