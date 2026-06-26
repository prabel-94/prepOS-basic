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
  createToolbarToggleButton,
} from "./toolbar.js";

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

  const toolbar = createClassOverlayToolbar(controller, {
    onClearPage: () => {
      controller.clearFade();
      controller.clearSticky();
      clearCurrentPageSticky(pageKey);
      toolbar.updateStatus();
    },
    onClearAll: () => {
      controller.clearFade();
      controller.clearSticky();
      clearAllSticky();
      toolbar.updateStatus();
    },
    onEndSession: () => {
      controller.clearFade();
      controller.clearSticky();
      endSession();
      controller.reloadSticky();
      controller.setOverlayActive(true);
      controller.setOverlayVisible(true);
      toolbar.syncToggleLabels();
      toolbar.updateStatus();
    },
  });

  const fab = createToolbarToggleButton();
  fab.addEventListener("click", () => {
    toolbar.element.classList.toggle("prepos-class-overlay-toolbar--hidden");
  });

  root.appendChild(canvas);
  root.appendChild(toolbar.element);
  toolbar.element.classList.add("prepos-class-overlay-toolbar--hidden");
  root.appendChild(fab);
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
    toolbar.syncToggleLabels();
    toolbar.updateStatus();
    updatePointerPolicy(canvas, controller);
  }

  function onPageShow() {
    controller.reloadSticky();
    toolbar.updateStatus();
  }

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("keydown", onKeyDown);

  controller.setInkMode("fade");
  controller.setTool("pen");
  controller.setOverlayActive(true);
  controller.setOverlayVisible(true);
  updatePointerPolicy(canvas, controller);
  toolbar.updateStatus();

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
