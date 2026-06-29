/**
 * Shared markup color UI — presets + toolbar custom color.
 */

import {
  PRESET_COLORS,
  isPresetColor,
  loadMarkupPrefs,
  normalizeHexColor,
  setActiveColor,
} from "./prefs.js";

/**
 * Five quick-pick colors: 4 presets + custom from toolbar prefs.
 */
export function getQuickColorOptions() {
  const prefs = loadMarkupPrefs();
  const customSlot = isPresetColor(prefs.activeColor)
    ? prefs.lastCustomColor
    : prefs.activeColor;

  return [...PRESET_COLORS, customSlot];
}

/**
 * @param {object} controller
 * @param {string} color
 */
export function applyMarkupColor(controller, color) {
  const hex = normalizeHexColor(color);
  setActiveColor(hex);
  controller.setColor(hex);
  return hex;
}

export function getActiveMarkupColor() {
  return loadMarkupPrefs().activeColor;
}

/**
 * @param {HTMLElement} popover
 */
export function renderQuickColorPopover(popover) {
  if (!popover) {
    return;
  }

  const active = getActiveMarkupColor().toLowerCase();
  const colors = getQuickColorOptions();

  popover.innerHTML = colors
    .map((color, index) => {
      const normalized = normalizeHexColor(color).toLowerCase();
      const isActive = normalized === active;
      const label = index < PRESET_COLORS.length ? "Preset color" : "Custom color";

      return `
        <button
          type="button"
          class="prepos-class-overlay-quick-color-swatch${isActive ? " is-active" : ""}"
          data-quick-color="${normalized}"
          style="--swatch:${normalized}"
          title="${label}"
          aria-label="${label}"
        ></button>
      `;
    })
    .join("");
}

/**
 * @param {HTMLElement} popover
 * @param {HTMLElement} anchor
 * @param {HTMLElement} dockRoot
 */
export function positionQuickColorPopover(popover, anchor, dockRoot) {
  const anchorRect = anchor.getBoundingClientRect();
  const dockRect = dockRoot.getBoundingClientRect();
  const popoverWidth = 152;

  const left = Math.max(
    4,
    anchorRect.left - dockRect.left - popoverWidth - 6
  );
  const top = anchorRect.top - dockRect.top;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.dockRoot
 * @param {HTMLElement} options.popover
 * @param {object} options.controller
 * @param {() => void} [options.onColorChange]
 */
export function mountQuickColorLongPress({ dockRoot, popover, controller, onColorChange }) {
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD_PX = 8;

  let longPressTimer = 0;
  let longPressStartX = 0;
  let longPressStartY = 0;
  let longPressMoved = false;
  let longPressAnchor = null;
  let longPressOpened = false;

  function closePopover() {
    popover?.classList.add("prepos-class-overlay-quick-color-popover--hidden");
    popover?.setAttribute("aria-hidden", "true");
  }

  function openPopover(anchor) {
    if (!popover) {
      return;
    }

    renderQuickColorPopover(popover);
    positionQuickColorPopover(popover, anchor, dockRoot);
    popover.classList.remove("prepos-class-overlay-quick-color-popover--hidden");
    popover.setAttribute("aria-hidden", "false");
  }

  function clearLongPressTimer() {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }

  function attachLongPress(anchor) {
    anchor.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      clearLongPressTimer();
      longPressMoved = false;
      longPressOpened = false;
      longPressStartX = event.clientX;
      longPressStartY = event.clientY;
      longPressAnchor = anchor;

      try {
        anchor.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      longPressTimer = window.setTimeout(() => {
        if (longPressMoved || longPressAnchor !== anchor) {
          return;
        }

        longPressOpened = true;
        anchor.dataset.suppressClick = "1";
        openPopover(anchor);
      }, LONG_PRESS_MS);
    });

    anchor.addEventListener("pointermove", (event) => {
      if (!longPressTimer) {
        return;
      }

      const dx = event.clientX - longPressStartX;
      const dy = event.clientY - longPressStartY;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        longPressMoved = true;
        clearLongPressTimer();
      }
    });

    function endLongPress(event) {
      clearLongPressTimer();

      if (anchor.hasPointerCapture?.(event.pointerId)) {
        anchor.releasePointerCapture(event.pointerId);
      }

      if (longPressOpened) {
        window.setTimeout(() => {
          delete anchor.dataset.suppressClick;
        }, 0);
      }

      longPressAnchor = null;
      longPressMoved = false;
      longPressOpened = false;
    }

    anchor.addEventListener("pointerup", endLongPress);
    anchor.addEventListener("pointercancel", endLongPress);
  }

  popover?.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-quick-color]");
    if (!swatch) {
      return;
    }

    applyMarkupColor(controller, swatch.dataset.quickColor);
    renderQuickColorPopover(popover);
    onColorChange?.();
    closePopover();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (popover?.classList.contains("prepos-class-overlay-quick-color-popover--hidden")) {
        return;
      }

      if (popover.contains(event.target)) {
        return;
      }

      if (event.target.closest("[data-quick-color-long-press]")) {
        return;
      }

      closePopover();
    },
    true
  );

  dockRoot.querySelectorAll("[data-quick-color-long-press]").forEach(attachLongPress);

  return {
    closePopover,
    refresh: () => renderQuickColorPopover(popover),
  };
}

export { isPresetColor, normalizeHexColor };
