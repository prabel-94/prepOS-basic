import {
  getHomePathForRole,
  resolveAppPath,
} from "../core/access.js";

export const NAV_PRESETS = Object.freeze({
  teacherExam: {
    links: [
      { label: "Drafts", href: "draft.html" },
      { label: "Published", href: "published-exams.html" },
      { label: "Results", href: "teacher-results.html" },
      { label: "Intelligence", href: "teacher-intelligence.html" },
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

function buildLinksMarkup(links = []) {
  if (!links.length) {
    return "";
  }

  return links
    .map((link) => {
      const href = resolveNavHref(link.href);
      const active = link.active ? " is-active" : "";
      return `<a class="prepos-app-nav-link${active}" href="${escapeHTML(href)}">${escapeHTML(link.label)}</a>`;
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

  root.innerHTML = `
    <header class="prepos-app-nav">
      <div class="prepos-app-nav-inner">
        <div class="prepos-app-nav-start">
          ${buildBackMarkup(backHref)}
          <div class="prepos-app-nav-brand">
            <div class="prepos-app-nav-kicker">PrepOS</div>
            ${title ? `<div class="prepos-app-nav-title">${escapeHTML(title)}</div>` : ""}
            ${subtitle ? `<div class="prepos-app-nav-subtitle">${escapeHTML(subtitle)}</div>` : ""}
          </div>
        </div>

        ${links.length ? `<nav class="prepos-app-nav-links" aria-label="Section">${buildLinksMarkup(links)}</nav>` : ""}

        <div class="prepos-app-nav-actions">
          ${showHome ? `<a class="secondary-btn" href="${escapeHTML(homeHref)}">${homeLabel}</a>` : ""}
          ${showLogout ? `<button type="button" class="secondary-btn" data-prepos-logout>Logout</button>` : ""}
        </div>
      </div>
    </header>
  `;

  root.querySelector("[data-prepos-logout]")
    ?.addEventListener("click", () => window.logout?.());

  return root;
}
