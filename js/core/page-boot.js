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
  });

  if (!runtime) {
    return null;
  }

  initPrepOSLinkRouting();
  upgradeLegacyOnclickNav(document);

  const navOptions = resolveNavOptions(options.nav, runtime);
  if (navOptions) {
    mountAppNav(navOptions);
  }

  return runtime;
}

export { NAV_PRESETS };
