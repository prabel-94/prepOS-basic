/**
 * Teacher Home — Student Management section visibility (tab session).
 *
 * Starts hidden on first visit. Unlock persists for the browser tab via
 * sessionStorage so Monitoring stays aligned across teacher pages.
 *
 * UI convenience only — authorization remains enforced by RLS/RPCs.
 */

const SECTION_ID = "studentManagementSection";
const MONITORING_HOME_LINK_ID = "teacherMonitoringHomeLink";
const MONITORING_HREF_FRAGMENT = "teacher-monitoring.html";
const KICKER_SELECTOR = ".prepos-app-nav-kicker";
const SESSION_KEY = "prepos:student-management-unlocked";

const CLICKS_REQUIRED = 5;
const CLICK_WINDOW_MS = 2000;

let studentManagementVisible = false;
let studentManagementInitialized = false;
let kickerClickTimes = [];
let kickerListenerAttached = false;

function getSectionEl() {
  return document.getElementById(SECTION_ID);
}

function readSessionUnlock() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionUnlock(visible) {
  try {
    if (visible) {
      sessionStorage.setItem(SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

export function isStudentManagementVisible() {
  return studentManagementVisible;
}

export function setStudentManagementVisible(visible) {
  studentManagementVisible = Boolean(visible);
  writeSessionUnlock(studentManagementVisible);
}

export function loadStudentManagementVisibilityFromSession() {
  studentManagementVisible = readSessionUnlock();
  return studentManagementVisible;
}

export function isMonitoringNavLink(link = {}) {
  return String(link.href ?? "").includes(MONITORING_HREF_FRAGMENT);
}

export function filterNavLinksForStudentManagement(links = []) {
  if (studentManagementVisible) {
    return links;
  }

  return links.filter((link) => !isMonitoringNavLink(link));
}

function applyMonitoringHomeLinkVisibility() {
  const link = document.getElementById(MONITORING_HOME_LINK_ID);
  if (!link) {
    return;
  }

  link.classList.toggle("hidden", !studentManagementVisible);
}

function applyMonitoringNavLinkVisibility() {
  document
    .querySelectorAll(`.prepos-app-nav-link[href*="${MONITORING_HREF_FRAGMENT}"]`)
    .forEach((el) => {
      el.classList.toggle("hidden", !studentManagementVisible);
    });
}

export function applyStudentManagementVisibility() {
  const section = getSectionEl();

  if (section) {
    section.classList.toggle("hidden", !studentManagementVisible);
  }

  applyMonitoringHomeLinkVisibility();
  applyMonitoringNavLinkVisibility();

  return studentManagementVisible;
}

export function toggleStudentManagementVisibility() {
  setStudentManagementVisible(!studentManagementVisible);
  applyStudentManagementVisibility();

  window.dispatchEvent(
    new CustomEvent("prepos:student-management-visibility-changed", {
      detail: { visible: studentManagementVisible },
    })
  );

  if (studentManagementVisible) {
    window.dispatchEvent(new CustomEvent("prepos:student-management-unlocked"));
  }

  return studentManagementVisible;
}

/**
 * Initializes student management only after the section has been unlocked.
 *
 * @param {() => Promise<void>} initStudentManagement
 */
export async function ensureStudentManagementReady(initStudentManagement) {
  if (!studentManagementVisible) {
    return false;
  }

  applyStudentManagementVisibility();

  if (studentManagementInitialized) {
    return true;
  }

  await initStudentManagement();

  studentManagementInitialized = true;

  return true;
}

export function requireStudentManagementVisible() {
  return studentManagementVisible;
}

function onKickerClick() {
  const now = Date.now();

  kickerClickTimes.push(now);

  kickerClickTimes = kickerClickTimes.filter(
    (time) => now - time <= CLICK_WINDOW_MS
  );

  if (kickerClickTimes.length < CLICKS_REQUIRED) {
    return;
  }

  kickerClickTimes = [];
  toggleStudentManagementVisibility();
}

/**
 * Secret gesture: 5 clicks on the PrepOS nav kicker within 2 seconds.
 */
export function initStudentManagementSecretToggle() {
  if (!kickerListenerAttached) {
    document.getElementById("app-nav-root")?.addEventListener("click", (event) => {
      const kicker = event.target.closest(KICKER_SELECTOR);
      if (kicker) {
        onKickerClick();
      }
    });
    kickerListenerAttached = true;
  }
}

/**
 * Teacher pages: restore tab session unlock and wire the kicker toggle.
 */
export function bootStudentManagementVisibility() {
  loadStudentManagementVisibilityFromSession();
  initStudentManagementSecretToggle();
  applyStudentManagementVisibility();
}
