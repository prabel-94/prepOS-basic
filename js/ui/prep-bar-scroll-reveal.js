/**
 * Prep Bar scroll-reveal — hide while reading down, show when scrolling up.
 * Intended for immersive readers (note.html).
 */

const SCROLL_DELTA_THRESHOLD = 8;
const TOP_ALWAYS_VISIBLE_OFFSET = 12;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getNavRoot(target) {
  if (target instanceof HTMLElement) {
    return target;
  }

  return document.getElementById("app-nav-root");
}

function ensureSpacer(navRoot) {
  let spacer = document.getElementById("prep-bar-spacer");
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.id = "prep-bar-spacer";
    spacer.setAttribute("aria-hidden", "true");
    navRoot.insertAdjacentElement("afterend", spacer);
  }

  return spacer;
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
    return () => {};
  }

  navRoot.dataset.prepBarScrollReveal = "true";
  document.body.classList.add("prep-bar-scroll-reveal-active");

  const spacer = ensureSpacer(navRoot);
  let lastScrollY = window.scrollY;
  let visible = true;
  let ticking = false;
  let cachedNavHeight = 0;

  const updateCachedHeight = () => {
    cachedNavHeight = navRoot.offsetHeight;
  };

  const syncSpacerHeight = (isVisible) => {
    if (isVisible) {
      updateCachedHeight();
    }

    spacer.style.height = isVisible ? `${cachedNavHeight}px` : "0px";
  };

  const setVisible = (next) => {
    if (visible === next) {
      return;
    }

    visible = next;
    navRoot.classList.toggle("prep-bar-scroll--visible", visible);
    navRoot.classList.toggle("prep-bar-scroll--hidden", !visible);
    syncSpacerHeight(visible);
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
    if (visible) {
      syncSpacerHeight(true);
    }
  };

  navRoot.classList.add("prep-bar-scroll-reveal");
  setVisible(window.scrollY <= TOP_ALWAYS_VISIBLE_OFFSET);
  syncSpacerHeight(visible);

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    navRoot.classList.remove(
      "prep-bar-scroll-reveal",
      "prep-bar-scroll--visible",
      "prep-bar-scroll--hidden"
    );
    delete navRoot.dataset.prepBarScrollReveal;
    document.body.classList.remove("prep-bar-scroll-reveal-active");
    spacer.remove();
  };
}
