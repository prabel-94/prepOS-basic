/**
 * Class overlay toolbar — fade/sticky modes, tools, session controls.
 */

import { listStickyPageKeys } from "./session.js";
import { DEFAULT_FADE_TTL_MS } from "./canvas.js";
import {
  isPresetColor,
  loadMarkupPrefs,
} from "./prefs.js";
import { applyMarkupColor, normalizeHexColor } from "./color-ui.js";
import {
  mountToolbarScaleControls,
  renderEntityScalePopover,
  renderGlobalScaleRail,
} from "./scale-controls.js";

const FADE_TTL_OPTIONS = Object.freeze([
  { ms: 3000, label: "3s" },
  { ms: 5000, label: "5s" },
  { ms: 10000, label: "10s" },
]);

/**
 * @param {object} controller — canvas controller API
 * @param {object} actions
 * @param {(detail: object) => void} [actions.onClearPage]
 * @param {() => void} [actions.onClearAll]
 * @param {() => void} [actions.onEndSession]
 * @param {() => void} [actions.onClose]
 * @param {() => void} [actions.onDrawingStateChange]
 * @param {() => void} [actions.onColorChange]
 */
export function createClassOverlayToolbar(controller, actions = {}) {
  const root = document.createElement("div");
  root.className = "prepos-class-overlay-toolbar";
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Class markup tools");

  root.innerHTML = `
    <div class="prepos-class-overlay-toolbar-shell" data-toolbar-shell>
      <div class="prepos-class-overlay-toolbar-main">
        <div class="prepos-class-overlay-toolbar-header">
          <span class="prepos-class-overlay-toolbar-title">Class markup</span>
          <button
            type="button"
            class="prepos-class-overlay-close"
            data-toolbar-close
            aria-label="Close toolbar"
            title="Close"
          >×</button>
        </div>
        <div class="prepos-class-overlay-toolbar-row prepos-class-overlay-status" data-overlay-status>
          Drawing off · Fade ink
        </div>
        <div class="prepos-class-overlay-toolbar-row">
          <button
            type="button"
            class="prepos-class-overlay-btn is-active"
            data-ink-mode="fade"
            data-entity-long-press="fadeInk"
            title="Fade ink (long-press for width)"
          >Fade</button>
          <button
            type="button"
            class="prepos-class-overlay-btn"
            data-ink-mode="sticky"
            data-entity-long-press="stickyInk"
            title="Sticky ink (long-press for width)"
          >Sticky</button>
        </div>
        <div class="prepos-class-overlay-toolbar-row">
          <button
            type="button"
            class="prepos-class-overlay-btn is-active"
            data-tool="pen"
            data-entity-long-press="pen"
            title="Pen (long-press for size)"
          >Pen</button>
          <button
            type="button"
            class="prepos-class-overlay-btn"
            data-tool="highlighter"
            data-entity-long-press="highlighter"
            title="Highlighter (long-press for size)"
          >Hi</button>
          <button
            type="button"
            class="prepos-class-overlay-btn"
            data-tool="eraser"
            data-entity-long-press="eraser"
            title="Eraser (long-press for size)"
          >Eraser</button>
        </div>
        <div class="prepos-class-overlay-toolbar-row prepos-class-overlay-colors">
          <button type="button" class="prepos-class-overlay-swatch is-active" data-color="#e11d48" title="Red" style="--swatch:#e11d48"></button>
          <button type="button" class="prepos-class-overlay-swatch" data-color="#facc15" title="Yellow" style="--swatch:#facc15"></button>
          <button type="button" class="prepos-class-overlay-swatch" data-color="#ffffff" title="White" style="--swatch:#ffffff"></button>
          <button type="button" class="prepos-class-overlay-swatch" data-color="#1e293b" title="Dark" style="--swatch:#1e293b"></button>
          <button
            type="button"
            class="prepos-class-overlay-swatch prepos-class-overlay-swatch--custom"
            data-color="custom"
            title="Custom color"
            style="--swatch:#e11d48"
          ><span class="prepos-class-overlay-swatch-custom-icon" aria-hidden="true">◐</span></button>
          <input
            type="color"
            class="prepos-class-overlay-color-input"
            data-color-picker
            value="#e11d48"
            tabindex="-1"
            aria-label="Choose custom color"
          />
        </div>
        <p class="prepos-class-overlay-color-hint prepos-class-overlay-color-hint--hidden text-muted" data-color-hint>
          Bright colors work best for highlighter.
        </p>
        <div class="prepos-class-overlay-toolbar-row">
          <label class="prepos-class-overlay-ttl-label">
            Fade
            <select class="prepos-class-overlay-ttl" data-fade-ttl aria-label="Fade duration">
              ${FADE_TTL_OPTIONS.map(
                (opt) =>
                  `<option value="${opt.ms}"${opt.ms === DEFAULT_FADE_TTL_MS ? " selected" : ""}>${opt.label}</option>`
              ).join("")}
            </select>
          </label>
        </div>
        <div class="prepos-class-overlay-toolbar-row">
          <button type="button" class="prepos-class-overlay-btn" data-overlay-toggle title="Toggle drawing (Ctrl+Shift+D)">
            Drawing off
          </button>
          <button type="button" class="prepos-class-overlay-btn" data-overlay-visibility title="Show/hide ink layer">
            Hide ink
          </button>
        </div>
        <div class="prepos-class-overlay-toolbar-row">
          <button type="button" class="prepos-class-overlay-btn" data-clear-page>Clear page</button>
          <button type="button" class="prepos-class-overlay-btn" data-clear-all>Clear all</button>
          <button type="button" class="prepos-class-overlay-btn" data-end-session>End session</button>
          <button type="button" class="prepos-class-overlay-btn" data-reset-scales title="Reset all size sliders to 1.0×">
            Reset sizes
          </button>
        </div>
        <p class="prepos-class-overlay-hint text-muted">
          Tap ✎ to draw. Long-press ✎ for this panel.
          Tap <strong>◐</strong> for a custom color (saved for quick access). Long-press tools for individual size.
        </p>
      </div>
      ${renderGlobalScaleRail()}
      ${renderEntityScalePopover()}
    </div>
  `;

  const statusEl = root.querySelector("[data-overlay-status]");
  const toggleBtn = root.querySelector("[data-overlay-toggle]");
  const visibilityBtn = root.querySelector("[data-overlay-visibility]");
  const colorPicker = root.querySelector("[data-color-picker]");
  const customSwatch = root.querySelector('[data-color="custom"]');
  const colorHint = root.querySelector("[data-color-hint]");

  function applyColor(nextColor) {
    applyMarkupColor(controller, nextColor);
    syncColorControls();
    syncScaleUi();
    actions.onColorChange?.();
  }

  function syncColorControls() {
    const prefs = loadMarkupPrefs();
    const active = prefs.activeColor;
    const presetActive = isPresetColor(active);

    controller.setColor(active);

    root.querySelectorAll("[data-color]").forEach((btn) => {
      if (btn.dataset.color === "custom") {
        const customDisplay = presetActive ? prefs.lastCustomColor : active;
        btn.style.setProperty("--swatch", customDisplay);
        btn.classList.toggle("is-active", !presetActive);
        return;
      }

      btn.classList.toggle(
        "is-active",
        btn.dataset.color.toLowerCase() === active.toLowerCase()
      );
    });

    if (colorPicker) {
      colorPicker.value = presetActive ? prefs.lastCustomColor : active;
    }

    colorHint?.classList.toggle(
      "prepos-class-overlay-color-hint--hidden",
      controller.getTool() !== "highlighter"
    );
  }

  const scaleControls = mountToolbarScaleControls({
    toolbarRoot: root,
    getActiveState: () => ({
      tool: controller.getTool(),
      inkMode: controller.getInkMode(),
      color: controller.getColor(),
    }),
    onPrefsChange: () => {
      scaleControls.updatePreview();
    },
  });

  function setActiveButton(selector, activeValue, attr) {
    root.querySelectorAll(selector).forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute(attr) === activeValue);
    });
  }

  function updateStatus() {
    const pages = listStickyPageKeys().length;
    const mode = controller.getInkMode() === "sticky" ? "Sticky" : "Fade";
    const drawing = controller.isOverlayActive() ? "on" : "off";
    const visible = controller.isOverlayVisible() ? "visible" : "hidden";
    statusEl.textContent = `Class markup · ${mode} · draw ${drawing} · ${visible} · ${pages} page${pages === 1 ? "" : "s"}`;
  }

  function syncToggleLabels() {
    toggleBtn.textContent = controller.isOverlayActive() ? "Drawing on" : "Drawing off";
    toggleBtn.classList.toggle("is-active", controller.isOverlayActive());
    visibilityBtn.textContent = controller.isOverlayVisible() ? "Hide ink" : "Show ink";
  }

  function syncScaleUi() {
    scaleControls.sync();
    scaleControls.updatePreview();
    syncColorControls();
  }

  root.addEventListener("click", (event) => {
    const longPressBtn = event.target.closest("[data-entity-long-press]");
    if (longPressBtn?.dataset.suppressClick === "1") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.target.closest("[data-toolbar-close]")) {
      scaleControls.closePopover();
      actions.onClose?.();
      return;
    }

    const inkBtn = event.target.closest("[data-ink-mode]");
    if (inkBtn) {
      const mode = inkBtn.dataset.inkMode;
      controller.setInkMode(mode);
      if (mode === "fade" && controller.getTool() === "eraser") {
        controller.setTool("pen");
      }
      setActiveButton("[data-ink-mode]", mode, "data-ink-mode");
      setActiveButton("[data-tool]", controller.getTool(), "data-tool");
      updateStatus();
      syncScaleUi();
      actions.onDrawingStateChange?.();
      return;
    }

    const toolBtn = event.target.closest("[data-tool]");
    if (toolBtn) {
      const nextTool = toolBtn.dataset.tool;
      if (nextTool === "eraser") {
        controller.setInkMode("sticky");
        setActiveButton("[data-ink-mode]", "sticky", "data-ink-mode");
      }
      controller.setTool(nextTool);
      setActiveButton("[data-tool]", nextTool, "data-tool");
      syncScaleUi();
      actions.onDrawingStateChange?.();
      return;
    }

    const swatch = event.target.closest("[data-color]");
    if (swatch) {
      if (swatch.dataset.color === "custom") {
        colorPicker?.click();
        return;
      }

      applyColor(swatch.dataset.color);
      return;
    }

    if (event.target.closest("[data-overlay-toggle]")) {
      controller.setOverlayActive(!controller.isOverlayActive());
      syncToggleLabels();
      updateStatus();
      actions.onDrawingStateChange?.();
      return;
    }

    if (event.target.closest("[data-overlay-visibility]")) {
      controller.setOverlayVisible(!controller.isOverlayVisible());
      syncToggleLabels();
      updateStatus();
      actions.onDrawingStateChange?.();
      return;
    }

    if (event.target.closest("[data-clear-page]")) {
      actions.onClearPage?.();
      updateStatus();
      return;
    }

    if (event.target.closest("[data-clear-all]")) {
      actions.onClearAll?.();
      updateStatus();
      return;
    }

    if (event.target.closest("[data-end-session]")) {
      actions.onEndSession?.();
      updateStatus();
      syncToggleLabels();
    }
  });

  root.querySelector("[data-fade-ttl]")?.addEventListener("change", (event) => {
    controller.setFadeTtl(Number(event.target.value) || DEFAULT_FADE_TTL_MS);
  });

  colorPicker?.addEventListener("input", (event) => {
    applyColor(event.target.value);
  });

  syncToggleLabels();
  setActiveButton("[data-ink-mode]", controller.getInkMode(), "data-ink-mode");
  setActiveButton("[data-tool]", controller.getTool(), "data-tool");
  updateStatus();
  syncScaleUi();

  return {
    element: root,
    updateStatus,
    syncToggleLabels,
    syncInkMode() {
      setActiveButton("[data-ink-mode]", controller.getInkMode(), "data-ink-mode");
      syncScaleUi();
    },
    syncTool() {
      setActiveButton("[data-tool]", controller.getTool(), "data-tool");
      syncScaleUi();
    },
    syncScales: syncScaleUi,
    syncColors: syncColorControls,
    collapse() {
      root.classList.toggle("prepos-class-overlay-toolbar--collapsed");
    },
  };
}

import { mountQuickColorLongPress } from "./color-ui.js";

const FAB_LONG_PRESS_MS = 480;

/**
 * Bottom dock: quick controls (when drawing) + FAB draw toggle. Long-press FAB opens toolbar.
 *
 * @param {object} controller
 * @param {object} actions
 * @param {() => void} actions.onDrawingToggle
 * @param {() => void} actions.onOpenToolbar
 * @param {() => void} actions.onInkOrToolChange
 * @param {() => void} [actions.onColorChange]
 */
export function createClassOverlayDock(controller, actions = {}) {
  const dock = document.createElement("div");
  dock.className = "prepos-class-overlay-dock";
  dock.setAttribute("aria-label", "Class markup controls");

  const colorPopover = document.createElement("div");
  colorPopover.className =
    "prepos-class-overlay-quick-color-popover prepos-class-overlay-quick-color-popover--hidden";
  colorPopover.setAttribute("role", "menu");
  colorPopover.setAttribute("aria-label", "Quick color picker");
  colorPopover.setAttribute("aria-hidden", "true");

  const quick = document.createElement("div");
  quick.className = "prepos-class-overlay-quick prepos-class-overlay-quick--hidden";
  quick.setAttribute("role", "toolbar");
  quick.setAttribute("aria-label", "Quick markup controls");
  quick.innerHTML = `
    <div class="prepos-class-overlay-quick-row" role="group" aria-label="Ink mode">
      <button
        type="button"
        class="prepos-class-overlay-quick-btn is-active"
        data-quick-ink="fade"
        data-quick-color-long-press
        title="Fade ink (long-press for color)"
      >Fade</button>
      <button
        type="button"
        class="prepos-class-overlay-quick-btn"
        data-quick-ink="sticky"
        data-quick-color-long-press
        title="Sticky ink (long-press for color)"
      >Sticky</button>
    </div>
    <div class="prepos-class-overlay-quick-row" role="group" aria-label="Drawing tool">
      <button
        type="button"
        class="prepos-class-overlay-quick-btn is-active"
        data-quick-tool="pen"
        data-quick-color-long-press
        title="Pen (long-press for color)"
      >Pen</button>
      <button
        type="button"
        class="prepos-class-overlay-quick-btn prepos-class-overlay-quick-btn--hi"
        data-quick-tool="highlighter"
        data-quick-color-long-press
        title="Highlighter (long-press for color)"
      >Hi</button>
    </div>
    <button
      type="button"
      class="prepos-class-overlay-quick-btn prepos-class-overlay-quick-btn--erase"
      data-quick-eraser
      title="Erase sticky ink"
    >Erase</button>
  `;

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "prepos-class-overlay-fab";
  fab.title = "Toggle drawing (long-press for settings)";
  fab.setAttribute("aria-label", "Toggle class markup drawing");
  fab.setAttribute("aria-pressed", "false");
  fab.textContent = "✎";

  dock.appendChild(quick);
  dock.appendChild(colorPopover);
  dock.appendChild(fab);

  const quickColorPicker = mountQuickColorLongPress({
    dockRoot: dock,
    popover: colorPopover,
    controller,
    onColorChange: () => {
      actions.onColorChange?.();
    },
  });

  let longPressTimer = 0;
  let longPressFired = false;

  function setQuickActive(selector, activeValue, attr) {
    quick.querySelectorAll(selector).forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute(attr) === activeValue);
    });
  }

  function sync() {
    const drawing = controller.isOverlayActive();
    const inkMode = controller.getInkMode();
    const tool = controller.getTool();

    quick.classList.toggle("prepos-class-overlay-quick--hidden", !drawing);
    fab.classList.toggle("prepos-class-overlay-fab--drawing", drawing);
    fab.setAttribute("aria-pressed", drawing ? "true" : "false");
    fab.title = drawing
      ? "Stop drawing (long-press for settings)"
      : "Start drawing (long-press for settings)";

    dock.classList.toggle("prepos-class-overlay-dock--fade-ink", drawing && inkMode === "fade" && tool !== "eraser" && tool !== "highlighter");
    dock.classList.toggle("prepos-class-overlay-dock--sticky-ink", drawing && inkMode === "sticky" && tool !== "eraser" && tool !== "highlighter");
    dock.classList.toggle(
      "prepos-class-overlay-dock--eraser",
      drawing && tool === "eraser"
    );
    dock.classList.toggle(
      "prepos-class-overlay-dock--highlighter",
      drawing && tool === "highlighter"
    );

    setQuickActive("[data-quick-ink]", inkMode, "data-quick-ink");
    setQuickActive("[data-quick-tool]", tool, "data-tool");
    quick.querySelector("[data-quick-eraser]")?.classList.toggle(
      "is-active",
      tool === "eraser"
    );
  }

  function clearLongPress() {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }

  fab.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    longPressFired = false;
    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      actions.onOpenToolbar?.();
    }, FAB_LONG_PRESS_MS);
  });

  fab.addEventListener("pointerup", (event) => {
    if (event.button !== 0) {
      return;
    }

    clearLongPress();
    if (longPressFired) {
      event.preventDefault();
      return;
    }

    actions.onDrawingToggle?.();
  });

  fab.addEventListener("pointercancel", clearLongPress);
  fab.addEventListener("pointerleave", clearLongPress);
  fab.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  quick.addEventListener("click", (event) => {
    const longPressBtn = event.target.closest("[data-quick-color-long-press]");
    if (longPressBtn?.dataset.suppressClick === "1") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const inkBtn = event.target.closest("[data-quick-ink]");
    if (inkBtn) {
      const mode = inkBtn.dataset.quickInk;
      controller.setInkMode(mode);
      if (controller.getTool() === "eraser") {
        controller.setTool("pen");
      }
      actions.onInkOrToolChange?.();
      sync();
      return;
    }

    if (event.target.closest("[data-quick-eraser]")) {
      controller.setInkMode("sticky");
      controller.setTool("eraser");
      actions.onInkOrToolChange?.();
      sync();
      return;
    }

    const toolBtn = event.target.closest("[data-quick-tool]");
    if (toolBtn) {
      controller.setTool(toolBtn.dataset.quickTool);
      actions.onInkOrToolChange?.();
      sync();
    }
  });

  sync();

  return {
    element: dock,
    fab,
    quick,
    sync,
    refreshQuickColors: () => quickColorPicker.refresh(),
    closeQuickColorPopover: () => quickColorPicker.closePopover(),
  };
}

/** @deprecated Use createClassOverlayDock */
export function createToolbarToggleButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "prepos-class-overlay-fab";
  btn.title = "Class markup tools";
  btn.setAttribute("aria-label", "Toggle class markup toolbar");
  btn.textContent = "✎";
  return btn;
}
