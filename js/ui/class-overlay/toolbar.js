/**
 * Class overlay toolbar — fade/sticky modes, tools, session controls.
 */

import { listStickyPageKeys } from "./session.js";
import { DEFAULT_FADE_TTL_MS } from "./canvas.js";

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
 */
export function createClassOverlayToolbar(controller, actions = {}) {
  const root = document.createElement("div");
  root.className = "prepos-class-overlay-toolbar";
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Class markup tools");

  root.innerHTML = `
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
      <button type="button" class="prepos-class-overlay-btn is-active" data-ink-mode="fade" title="Fading ink (default)">
        Fade
      </button>
      <button type="button" class="prepos-class-overlay-btn" data-ink-mode="sticky" title="Sticky ink (persists until cleared)">
        Sticky
      </button>
    </div>
    <div class="prepos-class-overlay-toolbar-row">
      <button type="button" class="prepos-class-overlay-btn is-active" data-tool="pen" title="Pen">Pen</button>
      <button type="button" class="prepos-class-overlay-btn" data-tool="highlighter" title="Highlighter">Hi</button>
      <button type="button" class="prepos-class-overlay-btn" data-tool="eraser" title="Eraser (sticky only)">Eraser</button>
    </div>
    <div class="prepos-class-overlay-toolbar-row">
      <button type="button" class="prepos-class-overlay-swatch is-active" data-color="#e11d48" title="Red" style="--swatch:#e11d48"></button>
      <button type="button" class="prepos-class-overlay-swatch" data-color="#facc15" title="Yellow" style="--swatch:#facc15"></button>
      <button type="button" class="prepos-class-overlay-swatch" data-color="#ffffff" title="White" style="--swatch:#ffffff"></button>
      <button type="button" class="prepos-class-overlay-swatch" data-color="#1e293b" title="Dark" style="--swatch:#1e293b"></button>
    </div>
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
    </div>
    <p class="prepos-class-overlay-hint text-muted">Fade ink disappears automatically. Use Sticky to keep marks across pages.</p>
  `;

  const statusEl = root.querySelector("[data-overlay-status]");
  const toggleBtn = root.querySelector("[data-overlay-toggle]");
  const visibilityBtn = root.querySelector("[data-overlay-visibility]");

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

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-toolbar-close]")) {
      actions.onClose?.();
      return;
    }

    const inkBtn = event.target.closest("[data-ink-mode]");
    if (inkBtn) {
      const mode = inkBtn.dataset.inkMode;
      controller.setInkMode(mode);
      setActiveButton("[data-ink-mode]", mode, "data-ink-mode");
      updateStatus();
      return;
    }

    const toolBtn = event.target.closest("[data-tool]");
    if (toolBtn) {
      const nextTool = toolBtn.dataset.tool;
      controller.setTool(nextTool);
      setActiveButton("[data-tool]", nextTool, "data-tool");
      return;
    }

    const swatch = event.target.closest("[data-color]");
    if (swatch) {
      controller.setColor(swatch.dataset.color);
      setActiveButton("[data-color]", swatch.dataset.color, "data-color");
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

  syncToggleLabels();
  updateStatus();

  return {
    element: root,
    updateStatus,
    syncToggleLabels,
    collapse() {
      root.classList.toggle("prepos-class-overlay-toolbar--collapsed");
    },
  };
}

export function createToolbarToggleButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "prepos-class-overlay-fab";
  btn.title = "Class markup tools";
  btn.setAttribute("aria-label", "Toggle class markup toolbar");
  btn.textContent = "✎";
  return btn;
}
