/**
 * PrepOS Platform Modal System
 * ---------------------------------------------------------------------------
 * All PrepOS modal/overlay systems must use modal-system.js.
 * Direct body overflow mutation is forbidden outside modal-system.js.
 *
 * Owns: modal stack, scroll-lock refcount, ESC/backdrop handling, z-index
 * layering, and guaranteed cleanup on close.
 */

const modalStack = [];
let scrollLockCount = 0;
let savedBodyOverflow = "";
let escListenerAttached = false;

/** @type {Map<HTMLElement, { options: object, clickHandler: (e: Event) => void }>} */
const modalRegistry = new Map();

function resolveModal(modalOrId) {
  if (typeof modalOrId === "string") {
    return document.getElementById(modalOrId);
  }

  if (modalOrId instanceof HTMLElement) {
    return modalOrId;
  }

  return null;
}

function getModalId(modal) {
  return modal?.id || null;
}

function updateDebugGlobals() {
  window.__PREPOS_MODAL_STACK__ = modalStack.map(getModalId).filter(Boolean);

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
  if (modalStack.length === 0 && escListenerAttached) {
    document.removeEventListener("keydown", handleEscKey);
    escListenerAttached = false;
  }
}

function handleEscKey(event) {
  if (event.key !== "Escape") {
    return;
  }

  const topModal = modalStack[modalStack.length - 1];
  if (!topModal) {
    return;
  }

  const entry = modalRegistry.get(topModal);
  if (entry?.options?.closeOnEscape === false) {
    return;
  }

  closeModal(topModal);
}

function createBackdropClickHandler(modal, options) {
  return (event) => {
    if (options.closeOnBackdrop === false) {
      return;
    }

    const target = event.target;
    if (
      target === modal ||
      target.classList?.contains("prepos-modal-backdrop")
    ) {
      closeModal(modal);
    }
  };
}

function cleanupModalEntry(modal) {
  const entry = modalRegistry.get(modal);
  if (!entry) {
    return;
  }

  if (entry.clickHandler) {
    modal.removeEventListener("click", entry.clickHandler);
  }

  modalRegistry.delete(modal);
}

export function openModal(modalOrId, options = {}) {
  const modal = resolveModal(modalOrId);
  if (!modal) {
    console.warn("[PrepOS Modal] openModal: element not found", modalOrId);
    return false;
  }

  if (modalStack.includes(modal)) {
    return true;
  }

  const normalizedOptions = {
    closeOnEscape: options.closeOnEscape !== false,
    closeOnBackdrop: options.closeOnBackdrop !== false,
    onOpen: options.onOpen,
    onClose: options.onClose,
  };

  modalStack.push(modal);
  modal.classList.remove("hidden");
  lockBodyScroll();

  const clickHandler = createBackdropClickHandler(modal, normalizedOptions);
  modal.addEventListener("click", clickHandler);
  modalRegistry.set(modal, {
    options: normalizedOptions,
    clickHandler,
  });

  attachEscListener();

  try {
    normalizedOptions.onOpen?.(modal);
  } catch (error) {
    console.error("[PrepOS Modal] onOpen failed", error);
  }

  updateDebugGlobals();
  return true;
}

export function closeModal(modalOrId) {
  const modal = resolveModal(modalOrId);
  if (!modal) {
    return false;
  }

  const stackIndex = modalStack.indexOf(modal);
  if (stackIndex === -1) {
    return false;
  }

  const entry = modalRegistry.get(modal);

  try {
    modal.classList.add("hidden");

    try {
      entry?.options?.onClose?.(modal);
    } catch (error) {
      console.error("[PrepOS Modal] onClose failed", error);
    }
  } finally {
    cleanupModalEntry(modal);
    modalStack.splice(stackIndex, 1);
    unlockBodyScroll();
    detachEscListenerIfIdle();
    updateDebugGlobals();
  }

  return true;
}

export function closeTopModal() {
  const topModal = modalStack[modalStack.length - 1];
  if (!topModal) {
    return false;
  }

  return closeModal(topModal);
}

export function isModalOpen(modalOrId) {
  const modal = resolveModal(modalOrId);
  if (!modal) {
    return false;
  }

  return modalStack.includes(modal);
}

export function getOpenModalStack() {
  return [...modalStack];
}

export function debugPrepOSModals() {
  return {
    openModals: modalStack.map((modal) => ({
      id: getModalId(modal),
      closeOnEscape: modalRegistry.get(modal)?.options?.closeOnEscape !== false,
      closeOnBackdrop:
        modalRegistry.get(modal)?.options?.closeOnBackdrop !== false,
    })),
    scrollLockCount,
    bodyOverflow: document.body.style.overflow,
    savedBodyOverflow,
  };
}

window.debugPrepOSModals = debugPrepOSModals;
updateDebugGlobals();
