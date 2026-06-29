/**
 * Class overlay boot — teacher-only markup layer for live instruction.
 */

import { TEACHER_ROLES, resolveAppPath } from "../../core/access.js";
import { createClassOverlayCanvas } from "./canvas.js";
import {
  clearAllSticky,
  clearCurrentPageSticky,
  endSession,
  getOrCreateSession,
  getPageKey,
} from "./session.js";
import {
  createClassOverlayToolbar,
  createClassOverlayDock,
} from "./toolbar.js";
import { getActiveColor } from "./prefs.js";

let booted = false;
let teardown = null;

function ensureStyles() {
  if (document.getElementById("prepos-class-overlay-css")) {
    return;
  }

  const link = document.createElement("link");
  link.id = "prepos-class-overlay-css";
  link.rel = "stylesheet";
  link.href = resolveAppPath("css/class-overlay.css");
  document.head.appendChild(link);
}

function isModalOpen() {
  return Boolean(document.querySelector(".prepos-modal:not(.hidden)"));
}

function updatePointerPolicy(canvas, controller) {
  const allow =
    !isModalOpen() &&
    controller.isOverlayActive() &&
    controller.isOverlayVisible();
  canvas.style.pointerEvents = allow ? "auto" : "none";
}

/**
 * @param {{ role?: string }} runtime
 */
export function bootClassOverlay(runtime) {
  if (booted || !runtime?.role || !TEACHER_ROLES.includes(runtime.role)) {
    return;
  }

  if (document.getElementById("prepos-class-overlay-root")) {
    return;
  }

  booted = true;
  ensureStyles();
  getOrCreateSession();

  const pageKey = getPageKey();
  const root = document.createElement("div");
  root.id = "prepos-class-overlay-root";
  root.className = "prepos-class-overlay-root";

  const canvas = document.createElement("canvas");
  canvas.className = "prepos-class-overlay-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const controller = createClassOverlayCanvas({
    canvas,
    pageKey,
    isDrawingAllowed: () => !isModalOpen(),
  });

  /** @type {ReturnType<typeof createClassOverlayDock> | null} */
  let dock = null;

  const toolbar = createClassOverlayToolbar(controller, {
    onClose: () => {
      toolbar.element.classList.add("prepos-class-overlay-toolbar--hidden");
    },
    onDrawingStateChange: () => {
      syncOverlayUi();
    },
    onColorChange: () => {
      dock?.refreshQuickColors();
    },
    onClearPage: () => {
      controller.clearFade();
      controller.clearSticky();
      clearCurrentPageSticky(pageKey);
      syncOverlayUi();
    },
    onClearAll: () => {
      controller.clearFade();
      controller.clearSticky();
      clearAllSticky();
      syncOverlayUi();
    },
    onEndSession: () => {
      controller.clearFade();
      controller.clearSticky();
      endSession();
      controller.reloadSticky();
      controller.setOverlayActive(false);
      controller.setOverlayVisible(true);
      syncOverlayUi();
    },
  });

  function syncOverlayUi() {
    toolbar.syncToggleLabels();
    toolbar.syncInkMode();
    toolbar.syncTool();
    toolbar.syncScales();
    toolbar.updateStatus();
    dock.sync();
    updatePointerPolicy(canvas, controller);
  }

  dock = createClassOverlayDock(controller, {
    onDrawingToggle: () => {
      controller.setOverlayActive(!controller.isOverlayActive());
      syncOverlayUi();
    },
    onOpenToolbar: () => {
      toolbar.element.classList.remove("prepos-class-overlay-toolbar--hidden");
    },
    onInkOrToolChange: () => {
      toolbar.syncInkMode();
      toolbar.syncTool();
      toolbar.syncScales();
      toolbar.updateStatus();
      dock.sync();
      updatePointerPolicy(canvas, controller);
    },
    onColorChange: () => {
      toolbar.syncColors();
      toolbar.syncScales();
    },
  });

  root.appendChild(toolbar.element);
  toolbar.element.classList.add("prepos-class-overlay-toolbar--hidden");
  root.appendChild(dock.element);
  root.insertBefore(canvas, root.firstChild);
  document.body.appendChild(root);

  const modalObserver = new MutationObserver(() => {
    updatePointerPolicy(canvas, controller);
  });
  modalObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  function onPageHide() {
    controller.flush();
  }

  function onKeyDown(event) {
    if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d")) {
      return;
    }

    event.preventDefault();
    controller.setOverlayActive(!controller.isOverlayActive());
    syncOverlayUi();
  }

  function onPageShow() {
    controller.reloadSticky();
    syncOverlayUi();
  }

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("keydown", onKeyDown);

  controller.setInkMode("fade");
  controller.setTool("pen");
  controller.setColor(getActiveColor());
  controller.setOverlayActive(false);
  controller.setOverlayVisible(true);
  syncOverlayUi();

  teardown = () => {
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("keydown", onKeyDown);
    modalObserver.disconnect();
    controller.destroy();
    root.remove();
    booted = false;
    teardown = null;
  };
}

export function destroyClassOverlay() {
  teardown?.();
}
