/**
 * Two-level scale UI — global vertical rail + long-press entity popovers.
 */

import {
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  formatInkScale,
  loadMarkupPrefs,
  previewStrokeDiameterPx,
  resetMarkupScales,
  saveMarkupPrefs,
} from "./prefs.js";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 8;

/**
 * @param {object} options
 * @param {HTMLElement} options.toolbarRoot
 * @param {() => { tool: string, inkMode: string }} options.getActiveState
 * @param {() => void} [options.onPrefsChange]
 */
export function mountToolbarScaleControls({ toolbarRoot, getActiveState, onPrefsChange }) {
  const shell = toolbarRoot.querySelector("[data-toolbar-shell]");
  const previewCanvas = toolbarRoot.querySelector("[data-scale-preview]");
  const globalInput = toolbarRoot.querySelector("[data-global-scale]");
  const globalValue = toolbarRoot.querySelector("[data-global-scale-value]");
  const popover = toolbarRoot.querySelector("[data-entity-scale-popover]");
  const popoverTitle = toolbarRoot.querySelector("[data-entity-popover-title]");
  const popoverInput = toolbarRoot.querySelector("[data-entity-scale-input]");
  const popoverValue = toolbarRoot.querySelector("[data-entity-scale-value]");

  let activeEntity = null;
  let longPressTimer = 0;
  let longPressStartX = 0;
  let longPressStartY = 0;
  let longPressMoved = false;
  let longPressTarget = null;

  function notifyChange() {
    syncAllControls();
    updatePreview();
    onPrefsChange?.();
  }

  function syncAllControls() {
    const prefs = loadMarkupPrefs();
    globalInput.value = String(prefs.globalScale);
    globalValue.textContent = formatInkScale(prefs.globalScale);

    if (activeEntity && popoverInput) {
      const key = `${activeEntity}Scale`;
      const value = prefs[key] ?? 1;
      popoverInput.value = String(value);
      popoverValue.textContent = formatInkScale(value);
    }
  }

  function updatePreview() {
    if (!previewCanvas) {
      return;
    }

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const { tool, inkMode } = getActiveState();
    const previewTool =
      tool === "highlighter" || tool === "eraser" ? tool : "pen";
    const diameter = previewStrokeDiameterPx(previewTool, inkMode);
    const size = previewCanvas.width;
    const radius = Math.min(size / 2 - 2, Math.max(2, diameter / 2));

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle =
      previewTool === "eraser"
        ? "rgba(180, 83, 9, 0.35)"
        : inkMode === "fade"
          ? "rgba(124, 58, 237, 0.65)"
          : "rgba(15, 118, 110, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function entityLabel(entity) {
    const labels = {
      pen: "Pen size",
      highlighter: "Highlighter size",
      eraser: "Eraser size",
      fadeInk: "Fade ink width",
      stickyInk: "Sticky ink width",
    };

    return labels[entity] ?? "Size";
  }

  function closePopover() {
    activeEntity = null;
    popover?.classList.add("prepos-class-overlay-entity-popover--hidden");
    popover?.setAttribute("aria-hidden", "true");
  }

  function openPopover(anchor, entity) {
    if (!popover || !popoverInput) {
      return;
    }

    activeEntity = entity;
    popoverTitle.textContent = entityLabel(entity);
    popover.classList.remove("prepos-class-overlay-entity-popover--hidden");
    popover.setAttribute("aria-hidden", "false");

    const prefs = loadMarkupPrefs();
    const value = prefs[`${entity}Scale`] ?? 1;
    popoverInput.value = String(value);
    popoverValue.textContent = formatInkScale(value);

    const anchorRect = anchor.getBoundingClientRect();
    const toolbarRect = toolbarRoot.getBoundingClientRect();
    const popoverWidth = 52;
    const left = anchorRect.left - toolbarRect.left - popoverWidth - 8;
    const top = anchorRect.top - toolbarRect.top;

    popover.style.left = `${Math.max(4, left)}px`;
    popover.style.top = `${Math.max(4, top)}px`;
  }

  function clearLongPress() {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
    longPressTarget = null;
    longPressMoved = false;
  }

  function attachLongPress(anchor, entity) {
    anchor.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      longPressMoved = false;
      longPressStartX = event.clientX;
      longPressStartY = event.clientY;
      longPressTarget = anchor;
      clearLongPress();

      longPressTimer = window.setTimeout(() => {
        if (longPressMoved || longPressTarget !== anchor) {
          return;
        }

        openPopover(anchor, entity);
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
        clearLongPress();
      }
    });

    anchor.addEventListener("pointerup", clearLongPress);
    anchor.addEventListener("pointercancel", clearLongPress);
    anchor.addEventListener("pointerleave", clearLongPress);
  }

  globalInput?.addEventListener("input", (event) => {
    saveMarkupPrefs({ globalScale: Number(event.target.value) });
    notifyChange();
  });

  popoverInput?.addEventListener("input", (event) => {
    if (!activeEntity) {
      return;
    }

    saveMarkupPrefs({ [`${activeEntity}Scale`]: Number(event.target.value) });
    popoverValue.textContent = formatInkScale(
      loadMarkupPrefs()[`${activeEntity}Scale`]
    );
    notifyChange();
  });

  toolbarRoot.querySelector("[data-reset-scales]")?.addEventListener("click", () => {
    resetMarkupScales();
    notifyChange();
  });

  toolbarRoot.querySelector("[data-popover-close]")?.addEventListener("click", () => {
    closePopover();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!activeEntity || popover?.classList.contains("prepos-class-overlay-entity-popover--hidden")) {
      return;
    }

    if (popover.contains(event.target)) {
      return;
    }

    if (event.target.closest("[data-entity-long-press]")) {
      return;
    }

    closePopover();
  });

  toolbarRoot.querySelectorAll("[data-entity-long-press]").forEach((anchor) => {
    attachLongPress(anchor, anchor.dataset.entityLongPress);
  });

  syncAllControls();
  updatePreview();

  return {
    sync: syncAllControls,
    updatePreview,
    closePopover,
  };
}

export function renderGlobalScaleRail() {
  return `
    <aside class="prepos-class-overlay-global-rail" aria-label="Global markup size">
      <span class="prepos-class-overlay-global-rail-label">All</span>
      <div class="prepos-class-overlay-global-slider-wrap">
        <input
          type="range"
          class="prepos-class-overlay-global-slider"
          data-global-scale
          min="${SCALE_MIN}"
          max="${SCALE_MAX}"
          step="${SCALE_STEP}"
          value="1"
          aria-label="Global markup size"
          aria-valuemin="${SCALE_MIN}"
          aria-valuemax="${SCALE_MAX}"
        />
      </div>
      <span class="prepos-class-overlay-global-rail-value" data-global-scale-value>1.0×</span>
      <canvas
        class="prepos-class-overlay-scale-preview"
        data-scale-preview
        width="36"
        height="36"
        aria-hidden="true"
      ></canvas>
    </aside>
  `;
}

export function renderEntityScalePopover() {
  return `
    <div
      class="prepos-class-overlay-entity-popover prepos-class-overlay-entity-popover--hidden"
      data-entity-scale-popover
      role="dialog"
      aria-hidden="true"
      aria-label="Tool size"
    >
      <span class="prepos-class-overlay-entity-popover-title" data-entity-popover-title>Size</span>
      <div class="prepos-class-overlay-entity-slider-wrap">
        <input
          type="range"
          class="prepos-class-overlay-entity-slider"
          data-entity-scale-input
          min="${SCALE_MIN}"
          max="${SCALE_MAX}"
          step="${SCALE_STEP}"
          value="1"
          aria-label="Tool size"
        />
      </div>
      <span class="prepos-class-overlay-entity-popover-value" data-entity-scale-value>1.0×</span>
      <button type="button" class="prepos-class-overlay-popover-done" data-popover-close>Done</button>
    </div>
  `;
}
