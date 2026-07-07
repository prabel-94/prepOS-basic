/**
 * Keeps sticky dashboard UI aligned below the Prep Bar (#app-nav-root).
 */

const DEFAULT_PREP_BAR_OFFSET = "72px";
const DEFAULT_JUMP_OFFSET = "128px";
const DEFAULT_STACK_OFFSET = "120px";

function getNavRoot() {
  return document.getElementById("app-nav-root");
}

/**
 * Measure Prep Bar + optional section nav and publish layout CSS variables.
 */
export function syncPrepBarStickyOffset() {
  const navRoot = getNavRoot();
  const sectionNav = document.getElementById("studentSectionNavRoot");
  const root = document.documentElement;

  if (!navRoot) {
    root.style.setProperty("--prep-bar-sticky-offset", DEFAULT_PREP_BAR_OFFSET);
    root.style.setProperty("--student-dashboard-sticky-stack-offset", DEFAULT_STACK_OFFSET);
    root.style.setProperty("--student-dashboard-jump-offset", DEFAULT_JUMP_OFFSET);
    return;
  }

  const prepBarHeight = navRoot.offsetHeight;
  const sectionNavHeight = sectionNav?.offsetHeight ?? 0;
  const stackOffset = prepBarHeight + sectionNavHeight;
  const jumpOffset = stackOffset + 8;

  root.style.setProperty("--prep-bar-sticky-offset", `${prepBarHeight}px`);
  root.style.setProperty("--student-dashboard-sticky-stack-offset", `${stackOffset}px`);
  root.style.setProperty("--student-dashboard-jump-offset", `${jumpOffset}px`);
}

/**
 * Observe Prep Bar resize (wrap, banner, viewport) and keep offsets in sync.
 * @returns {() => void}
 */
export function initPrepBarStickyOffsetSync() {
  syncPrepBarStickyOffset();

  const navRoot = getNavRoot();
  if (!navRoot) {
    return () => {};
  }

  const onResize = () => syncPrepBarStickyOffset();

  let resizeObserver = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(navRoot);

    const sectionNav = document.getElementById("studentSectionNavRoot");
    if (sectionNav) {
      resizeObserver.observe(sectionNav);
    }
  }

  window.addEventListener("resize", onResize);

  return () => {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", onResize);
  };
}
