/**
 * Prep Bar scroll-reveal — hide while reading down, show when scrolling up.
 * Intended for immersive readers (note.html).
 *
 * Uses a fixed overlay + transform only (no layout height changes) to avoid
 * scroll feedback loops that cause flutter at the top of the page.
 */

const SCROLL_DELTA_THRESHOLD = 10;
const TOP_ALWAYS_VISIBLE_OFFSET = 16;
const TOGGLE_COOLDOWN_MS = 220;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getNavRoot(target) {
  if (target instanceof HTMLElement) {
    return target;
  }

  return document.getElementById("app-nav-root");
}

function publishNoteReaderInset(navRoot) {
  document.documentElement.style.setProperty(
    "--note-prep-bar-inset",
    `${navRoot.offsetHeight}px`
  );
}

/**
 * @param {HTMLElement|string} [target]
 */
export function initPrepBarScrollReveal(target) {
  const navRoot = getNavRoot(target);
  if (!navRoot || navRoot.dataset.prepBarScrollReveal === "true") {
    return () => {};
  }

  if (prefersReducedMotion()) {
    publishNoteReaderInset(navRoot);
    return () => {};
  }

  document.getElementById("prep-bar-spacer")?.remove();

  navRoot.dataset.prepBarScrollReveal = "true";
  document.body.classList.add("prep-bar-scroll-reveal-active");

  let lastScrollY = window.scrollY;
  let visible = true;
  let ticking = false;
  let lastToggleAt = 0;
  let resizeObserver = null;

  const setVisible = (next) => {
    if (visible === next) {
      return;
    }

    const now = Date.now();
    if (now - lastToggleAt < TOGGLE_COOLDOWN_MS) {
      return;
    }

    lastToggleAt = now;
    visible = next;
    navRoot.classList.toggle("prep-bar-scroll--visible", visible);
    navRoot.classList.toggle("prep-bar-scroll--hidden", !visible);
    navRoot.setAttribute("aria-hidden", visible ? "false" : "true");
  };

  const evaluateScroll = () => {
    const scrollY = window.scrollY;

    if (scrollY <= TOP_ALWAYS_VISIBLE_OFFSET) {
      setVisible(true);
    } else if (scrollY > lastScrollY + SCROLL_DELTA_THRESHOLD) {
      setVisible(false);
    } else if (scrollY < lastScrollY - SCROLL_DELTA_THRESHOLD) {
      setVisible(true);
    }

    lastScrollY = scrollY;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    requestAnimationFrame(() => {
      evaluateScroll();
      ticking = false;
    });
  };

  const onResize = () => {
    publishNoteReaderInset(navRoot);
  };

  navRoot.classList.add("prep-bar-scroll-reveal");
  publishNoteReaderInset(navRoot);
  setVisible(window.scrollY <= TOP_ALWAYS_VISIBLE_OFFSET);

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(navRoot);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  return () => {
    resizeObserver?.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    navRoot.classList.remove(
      "prep-bar-scroll-reveal",
      "prep-bar-scroll--visible",
      "prep-bar-scroll--hidden"
    );
    navRoot.removeAttribute("aria-hidden");
    delete navRoot.dataset.prepBarScrollReveal;
    document.body.classList.remove("prep-bar-scroll-reveal-active");
    document.documentElement.style.removeProperty("--note-prep-bar-inset");
    document.getElementById("prep-bar-spacer")?.remove();
  };
}
