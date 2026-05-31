/**
 * Teacher Home — Student Management section visibility (client UI only).
 * Not authorization; edge/RPC auth unchanged.
 */

const STORAGE_KEY = "prepos_student_management_visible";
const SECTION_ID = "studentManagementSection";
const KICKER_SELECTOR = ".prepos-app-nav-kicker";
const CLICKS_REQUIRED = 5;
const CLICK_WINDOW_MS = 2000;

let studentManagementInitialized = false;
let kickerClickTimes = [];

export function isStudentManagementVisible() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStudentManagementVisible(visible) {
  try {
    if (visible) {
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

function getSectionEl() {
  return document.getElementById(SECTION_ID);
}

export function applyStudentManagementVisibility() {
  const section = getSectionEl();
  if (!section) {
    return false;
  }

  section.classList.toggle("hidden", !isStudentManagementVisible());
  return isStudentManagementVisible();
}

export function toggleStudentManagementVisibility() {
  const next = !isStudentManagementVisible();
  setStudentManagementVisible(next);
  applyStudentManagementVisibility();
  return next;
}

/**
 * Init student management modules only when the section is visible.
 * @param {() => Promise<void>} initStudentManagement
 */
export async function ensureStudentManagementReady(initStudentManagement) {
  if (!isStudentManagementVisible()) {
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

  if (isStudentManagementVisible()) {
    window.dispatchEvent(new CustomEvent("prepos:student-management-unlocked"));
  }
}

/**
 * Wire secret toggle: 5 clicks on PrepOS nav kicker within 2 seconds.
 */
export function initStudentManagementSecretToggle() {
  document.getElementById("app-nav-root")?.addEventListener("click", (event) => {
    const kicker = event.target.closest(KICKER_SELECTOR);
    if (kicker) {
      onKickerClick();
    }
  });
}
