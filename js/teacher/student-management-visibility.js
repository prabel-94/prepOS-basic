/**

* Teacher Home — Student Management section visibility (session-only).
* 
* Visibility is NOT persisted.
* The section always starts hidden on page load/refresh.
* 
* This is a UI convenience feature only.
* Authorization remains enforced by RLS, RPCs, and Edge Functions.
  */

const SECTION_ID = "studentManagementSection";
const KICKER_SELECTOR = ".prepos-app-nav-kicker";

const CLICKS_REQUIRED = 5;
const CLICK_WINDOW_MS = 2000;

let studentManagementVisible = false;
let studentManagementInitialized = false;
let kickerClickTimes = [];

function getSectionEl() {
return document.getElementById(SECTION_ID);
}

export function isStudentManagementVisible() {
return studentManagementVisible;
}

export function setStudentManagementVisible(visible) {
studentManagementVisible = Boolean(visible);
}

export function applyStudentManagementVisibility() {
const section = getSectionEl();

if (!section) {
return false;
}

section.classList.toggle(
"hidden",
!studentManagementVisible
);

return studentManagementVisible;
}

export function toggleStudentManagementVisibility() {
studentManagementVisible = !studentManagementVisible;
applyStudentManagementVisibility();
return studentManagementVisible;
}

/**

* Initializes student management only after the
* hidden section has been unlocked.
* 
* @param {() => Promise<void>} initStudentManagement
  */
  export async function ensureStudentManagementReady(
  initStudentManagement
  ) {
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

const visible = toggleStudentManagementVisibility();

if (visible) {
window.dispatchEvent(
new CustomEvent(
"prepos:student-management-unlocked"
)
);
}
}

/**

* Secret gesture:
* 5 clicks on the PrepOS nav kicker within 2 seconds.
* 
* Visibility is reset to hidden every time
* the page loads or refreshes.
  */
  export function initStudentManagementSecretToggle() {
  studentManagementVisible = false;
  applyStudentManagementVisibility();

document
.getElementById("app-nav-root")
?.addEventListener("click", (event) => {
const kicker = event.target.closest(
KICKER_SELECTOR
);

  if (kicker) {
    onKickerClick();
  }
});

}