import {
  getHomePathForRole,
  resolveAppPath,
} from "../core/access.js";
import {
  isMonitoringNavLink,
  isStudentManagementVisible,
} from "../teacher/student-management-visibility.js";

export const NAV_PRESETS = Object.freeze({
  teacherExam: {
    links: [
      { label: "Drafts", href: "draft.html" },
      { label: "Published", href: "published-exams.html" },
      { label: "Results", href: "teacher-results.html" },
      { label: "Intelligence", href: "teacher-intelligence.html" },
      { label: "Monitoring", href: "teacher-monitoring.html" },
    ],
  },
  studentHome: {
    links: [
      { label: "Practice", href: "practice.html" },
      { label: "Notes", href: "student-dashboard.html#topicNotesSection" },
    ],
  },
  teacherKnowledge: {
    links: [
      { label: "Question Bank", href: "qb-manager.html" },
      { label: "Lexicon", href: "lexicon-manager.html" },
    ],
  },
  teacherCreate: {
    links: [
      { label: "Create Exam", href: "creator-mode.html" },
      { label: "Draft Editor", href: "draft.html" },
    ],
  },
});

const COMPACT_LINK_THRESHOLD = 4;

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolveNavHref(href) {
  if (!href || href.startsWith("http") || href.startsWith("#")) {
    return href;
  }

  return resolveAppPath(href);
}

function getNavRoot(target) {
  if (typeof target === "string") {
    return document.querySelector(target);
  }

  if (target instanceof HTMLElement) {
    return target;
  }

  return document.getElementById("app-nav-root");
}

function resolveNavDensity(links = [], options = {}) {
  if (options.density === "compact" || options.density === "default") {
    return options.density;
  }

  return links.length >= COMPACT_LINK_THRESHOLD ? "compact" : "default";
}

function buildLinksMarkup(links = []) {
  if (!links.length) {
    return "";
  }

  return links
    .map((link) => {
      const href = resolveNavHref(link.href);
      const active = link.active ? " is-active" : "";
      const ariaCurrent = link.active ? ' aria-current="page"' : "";
      const hidden =
        isMonitoringNavLink(link) && !isStudentManagementVisible()
          ? " hidden"
          : "";
      return `<a class="prepos-app-nav-link${active}${hidden}" href="${escapeHTML(href)}"${ariaCurrent}>${escapeHTML(link.label)}</a>`;
    })
    .join("");
}

function buildBackMarkup(backHref) {
  if (!backHref) {
    return "";
  }

  return `<a class="secondary-btn prepos-app-nav-back" href="${escapeHTML(resolveNavHref(backHref))}">← Back</a>`;
}

/**
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {"home"|"page"} [options.variant]
 * @param {"default"|"compact"} [options.density]
 * @param {string} [options.role]
 * @param {string} [options.back]
 * @param {Array<{label:string,href:string,active?:boolean}>} [options.links]
 * @param {keyof typeof NAV_PRESETS} [options.preset]
 * @param {boolean} [options.showHome]
 * @param {boolean} [options.showLogout]
 * @param {string|HTMLElement} [options.target]
 */
export function mountAppNav(options = {}) {
  const preset = options.preset ? NAV_PRESETS[options.preset] : null;
  const links = options.links ?? preset?.links ?? [];
  const role = options.role ?? window.__PREPOS_RUNTIME__?.role ?? null;
  const variant = options.variant ?? "page";
  const density = resolveNavDensity(links, options);
  const showLogout = options.showLogout !== false;
  const showHome = options.showHome !== false;
  const title = options.title ?? "";
  const subtitle = options.subtitle ?? "";
  const backHref = options.back ?? null;

  const root = getNavRoot(options.target);
  if (!root) {
    console.warn("[PrepOS Nav] Missing #app-nav-root");
    return null;
  }

  const homeHref = resolveNavHref(getHomePathForRole(role));
  const homeLabel = role === "student" ? "Dashboard" : "Home";
  const navVariantClass = variant === "home" ? " prepos-app-nav--home" : "";
  const innerDensityClass =
    density === "compact" ? " prepos-app-nav-inner--compact" : "";
  const linksScrollClass =
    density === "compact" ? " prepos-app-nav-links--scroll" : "";

  root.innerHTML = `
    <header class="prepos-app-nav${navVariantClass}">
      <div class="prepos-app-nav-inner${innerDensityClass}">
        <div class="prepos-app-nav-start">
          ${buildBackMarkup(backHref)}
          <div class="prepos-app-nav-brand">
            <div class="prepos-app-nav-kicker">PrepOS</div>
            ${title ? `<div class="prepos-app-nav-title">${escapeHTML(title)}</div>` : ""}
            ${subtitle ? `<div class="prepos-app-nav-subtitle">${escapeHTML(subtitle)}</div>` : ""}
          </div>
        </div>

        ${
          links.length
            ? `<nav class="prepos-app-nav-links${linksScrollClass}" aria-label="Section">${buildLinksMarkup(links)}</nav>`
            : ""
        }

        <div class="prepos-app-nav-actions">
          ${showHome ? `<a class="secondary-btn" href="${escapeHTML(homeHref)}">${homeLabel}</a>` : ""}
          <a class="prepos-app-nav-settings-link" href="${escapeHTML(resolveAppPath("settings.html"))}" title="Settings" aria-label="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </a>
          ${showLogout ? `<button type="button" class="secondary-btn" data-prepos-logout>Logout</button>` : ""}
        </div>
      </div>
    </header>
  `;

  root.querySelector("[data-prepos-logout]")
    ?.addEventListener("click", () => window.logout?.());

  return root;
}
