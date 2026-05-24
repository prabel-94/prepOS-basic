/**
 * PrepOS Overlay Infrastructure
 * ---------------------------------------------------------------------------
 * PrepOS overlay infrastructure owns:
 * - modal lifecycle
 * - side-panel lifecycle
 * - overlay stacking
 * - scroll locking
 * - ESC orchestration
 * - future focus management
 *
 * All PrepOS modal/overlay systems must use modal-system.js.
 * Direct body overflow mutation is forbidden outside modal-system.js.
 *
 * Future overlay contract (planned consumers):
 * - mastery inspector
 * - analytics inspector
 * - recommendation dialog
 * - topic explorer
 * - question preview
 * - adaptive session dialog
 */

/** @typedef {"modal"|"side-panel"|"inspector"|"critical-dialog"} OverlayType */

export const OVERLAY_TYPES = Object.freeze({
  MODAL: "modal",
  SIDE_PANEL: "side-panel",
  INSPECTOR: "inspector",
  CRITICAL_DIALOG: "critical-dialog",
});

const OVERLAY_LAYER_BOOST = Object.freeze({
  modal: 0,
  "side-panel": 0,
  inspector: 1000,
  "critical-dialog": 2000,
});

const overlayStack = [];
let scrollLockCount = 0;
let savedBodyOverflow = "";
let escListenerAttached = false;

/** @type {Map<HTMLElement, { options: object, clickHandler: ((e: Event) => void) | null, previousFocus: Element | null }>} */
const overlayRegistry = new Map();

function resolveOverlay(overlayOrId) {
  if (typeof overlayOrId === "string") {
    return document.getElementById(overlayOrId);
  }

  if (overlayOrId instanceof HTMLElement) {
    return overlayOrId;
  }

  return null;
}

function resolveFocusTarget(target) {
  if (!target) {
    return null;
  }

  if (target instanceof HTMLElement) {
    return target;
  }

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  return null;
}

function getOverlayId(overlay) {
  return overlay?.id || null;
}

export function getOverlayZIndex(overlayType, stackIndex) {
  const boost = OVERLAY_LAYER_BOOST[overlayType] ?? 0;
  return 3000 + stackIndex * 100 + boost;
}

function normalizeOverlayType(type) {
  if (type === OVERLAY_TYPES.SIDE_PANEL) return "side-panel";
  if (type === OVERLAY_TYPES.INSPECTOR) return "inspector";
  if (type === OVERLAY_TYPES.CRITICAL_DIALOG) return "critical-dialog";
  return "modal";
}

function applyStackZIndex(overlay, stackIndex, overlayType) {
  overlay.style.zIndex = String(getOverlayZIndex(overlayType, stackIndex));
}

function refreshStackZIndexes() {
  overlayStack.forEach((overlay, index) => {
    const entry = overlayRegistry.get(overlay);
    const overlayType = entry?.options?.overlayType ?? "modal";
    applyStackZIndex(overlay, index, overlayType);
  });
}

function updateDebugGlobals() {
  const stackSnapshot = overlayStack.map((overlay, index) => {
    const entry = overlayRegistry.get(overlay);
    const overlayType = entry?.options?.overlayType ?? "modal";

    return {
      id: getOverlayId(overlay),
      overlayType,
      zIndex: getOverlayZIndex(overlayType, index),
      closeOnEscape: entry?.options?.closeOnEscape !== false,
      closeOnBackdrop: entry?.options?.closeOnBackdrop !== false,
      hasClickListener: Boolean(entry?.clickHandler),
    };
  });

  window.__PREPOS_OVERLAY_STACK__ = stackSnapshot;
  window.__PREPOS_MODAL_STACK__ = stackSnapshot.map((item) => item.id).filter(Boolean);

  if (typeof window.debugPrepOSModals === "function") {
    window.__PREPOS_MODAL_DEBUG__ = window.debugPrepOSModals();
  }
}

export function lockBodyScroll() {
  scrollLockCount += 1;

  if (scrollLockCount === 1) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

export function unlockBodyScroll() {
  if (scrollLockCount <= 0) {
    return;
  }

  scrollLockCount -= 1;

  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow || "";
    savedBodyOverflow = "";
  }
}

function attachEscListener() {
  if (escListenerAttached) {
    return;
  }

  document.addEventListener("keydown", handleEscKey);
  escListenerAttached = true;
}

function detachEscListenerIfIdle() {
  if (overlayStack.length === 0 && escListenerAttached) {
    document.removeEventListener("keydown", handleEscKey);
    escListenerAttached = false;
  }
}

function handleEscKey(event) {
  if (event.key !== "Escape") {
    return;
  }

  const topOverlay = overlayStack[overlayStack.length - 1];
  if (!topOverlay) {
    return;
  }

  const entry = overlayRegistry.get(topOverlay);
  if (entry?.options?.closeOnEscape === false) {
    return;
  }

  closeModal(topOverlay);
}

function createBackdropClickHandler(overlay, options) {
  if (options.overlayType !== "modal" && options.overlayType !== "inspector" && options.overlayType !== "critical-dialog") {
    return null;
  }

  return (event) => {
    if (options.closeOnBackdrop === false) {
      return;
    }

    const target = event.target;
    if (
      target === overlay ||
      target.classList?.contains("prepos-modal-backdrop")
    ) {
      closeModal(overlay);
    }
  };
}

function cleanupOverlayEntry(overlay) {
  const entry = overlayRegistry.get(overlay);
  if (!entry) {
    return;
  }

  if (entry.clickHandler) {
    overlay.removeEventListener("click", entry.clickHandler);
  }

  overlayRegistry.delete(overlay);
}

function applyInitialFocus(options) {
  const target = resolveFocusTarget(options.initialFocus);
  if (target?.focus) {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }
}

function restoreFocus(entry) {
  const explicit = resolveFocusTarget(entry?.options?.restoreFocusTo);
  const target = explicit || entry?.previousFocus;

  if (target?.focus) {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }
}

export function openModal(overlayOrId, options = {}) {
  const overlay = resolveOverlay(overlayOrId);
  if (!overlay) {
    console.warn("[PrepOS Overlay] openModal: element not found", overlayOrId);
    return false;
  }

  if (overlayStack.includes(overlay)) {
    return true;
  }

  const overlayType = normalizeOverlayType(options.overlayType ?? "modal");
  const defaults =
    overlayType === "side-panel"
      ? { closeOnBackdrop: false }
      : { closeOnBackdrop: true };

  const normalizedOptions = {
    overlayType,
    closeOnEscape: options.closeOnEscape !== false,
    closeOnBackdrop:
      options.closeOnBackdrop !== undefined
        ? options.closeOnBackdrop
        : defaults.closeOnBackdrop,
    initialFocus: options.initialFocus ?? null,
    restoreFocusTo: options.restoreFocusTo ?? null,
    onOpen: options.onOpen,
    onClose: options.onClose,
  };

  const previousFocus = document.activeElement instanceof Element
    ? document.activeElement
    : null;

  overlayStack.push(overlay);
  overlay.classList.remove("hidden");
  overlay.classList.add("prepos-overlay-active");
  lockBodyScroll();
  refreshStackZIndexes();

  const clickHandler = createBackdropClickHandler(overlay, normalizedOptions);
  if (clickHandler) {
    overlay.addEventListener("click", clickHandler);
  }

  overlayRegistry.set(overlay, {
    options: normalizedOptions,
    clickHandler,
    previousFocus,
  });

  attachEscListener();

  try {
    normalizedOptions.onOpen?.(overlay);
  } catch (error) {
    console.error("[PrepOS Overlay] onOpen failed", error);
  }

  applyInitialFocus(normalizedOptions);
  updateDebugGlobals();
  return true;
}

export function closeModal(overlayOrId) {
  const overlay = resolveOverlay(overlayOrId);
  if (!overlay) {
    return false;
  }

  const stackIndex = overlayStack.indexOf(overlay);
  if (stackIndex === -1) {
    return false;
  }

  const entry = overlayRegistry.get(overlay);

  try {
    overlay.classList.add("hidden");
    overlay.classList.remove("prepos-overlay-active");

    try {
      entry?.options?.onClose?.(overlay);
    } catch (error) {
      console.error("[PrepOS Overlay] onClose failed", error);
    }
  } finally {
    restoreFocus(entry);
    cleanupOverlayEntry(overlay);
    overlayStack.splice(stackIndex, 1);
    unlockBodyScroll();
    refreshStackZIndexes();
    detachEscListenerIfIdle();
    updateDebugGlobals();
  }

  return true;
}

export function closeTopModal() {
  const topOverlay = overlayStack[overlayStack.length - 1];
  if (!topOverlay) {
    return false;
  }

  return closeModal(topOverlay);
}

export function isModalOpen(overlayOrId) {
  const overlay = resolveOverlay(overlayOrId);
  if (!overlay) {
    return false;
  }

  return overlayStack.includes(overlay);
}

export function getOpenModalStack() {
  return [...overlayStack];
}

export function debugPrepOSModals() {
  return {
    overlayStack: overlayStack.map((overlay, index) => {
      const entry = overlayRegistry.get(overlay);
      const overlayType = entry?.options?.overlayType ?? "modal";

      return {
        id: getOverlayId(overlay),
        overlayType,
        zIndex: getOverlayZIndex(overlayType, index),
        stackOrder: index,
        closeOnEscape: entry?.options?.closeOnEscape !== false,
        closeOnBackdrop: entry?.options?.closeOnBackdrop !== false,
        hasClickListener: Boolean(entry?.clickHandler),
      };
    }),
    openModals: overlayStack.map((overlay) => getOverlayId(overlay)).filter(Boolean),
    scrollLockCount,
    activeListeners: overlayRegistry.size,
    bodyOverflow: document.body.style.overflow,
    savedBodyOverflow,
  };
}

window.debugPrepOSModals = debugPrepOSModals;
window.debugPrepOSOverlays = debugPrepOSModals;
updateDebugGlobals();
