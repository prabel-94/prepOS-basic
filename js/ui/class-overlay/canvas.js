/**
 * Class overlay canvas — fade (ephemeral) + sticky ink layers.
 */

import { loadStickyStrokes, saveStickyStrokes } from "./persistence.js";
import { computeEraserRadiusPx, computeStrokeWidth } from "./prefs.js";

export const MAX_FADE_STROKES = 200;
export const DEFAULT_FADE_TTL_MS = 5000;
export const DEFAULT_FADE_WINDOW_MS = 1500;

const PEN_WIDTH = 0.0035;
const HIGHLIGHTER_WIDTH = 0.014;
const ERASER_WIDTH = 0.018;

function createStrokeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clonePoints(points) {
  return points.map(([x, y]) => [x, y]);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 * @param {number} scrollX
 * @param {number} scrollY
 * @param {{ opacity?: number, layer?: "fade" | "sticky" }} [options]
 */
function traceStrokePath(ctx, stroke, scrollX, scrollY) {
  const points = stroke.points;
  const [x0, y0] = points[0];
  ctx.moveTo(x0 - scrollX, y0 - scrollY);

  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i];
    ctx.lineTo(x - scrollX, y - scrollY);
  }
}

function drawStroke(ctx, stroke, scrollX, scrollY, options = {}) {
  const points = stroke.points;
  if (!points?.length) {
    return;
  }

  const opacity = options.opacity ?? 1;
  const layer = options.layer ?? stroke.layer ?? "sticky";
  const isFade = layer === "fade";
  const isHighlighter = stroke.tool === "highlighter";
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  const lineWidth = stroke.width * minDim;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  if (isFade) {
    ctx.globalAlpha = opacity * (isHighlighter ? 0.28 : 0.52);
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([
      Math.max(3, lineWidth * 1.2),
      Math.max(5, lineWidth * 2),
    ]);
    ctx.beginPath();
    traceStrokePath(ctx, stroke, scrollX, scrollY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Sticky: solid stroke with a subtle outline for legibility on any background.
  if (!isHighlighter) {
    ctx.globalAlpha = opacity * 0.35;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = lineWidth + Math.max(2, lineWidth * 0.35);
    ctx.beginPath();
    traceStrokePath(ctx, stroke, scrollX, scrollY);
    ctx.stroke();
  }

  ctx.globalAlpha = opacity * (isHighlighter ? 0.42 : 0.98);
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  if (isHighlighter) {
    ctx.globalCompositeOperation = "multiply";
  }

  ctx.beginPath();
  traceStrokePath(ctx, stroke, scrollX, scrollY);
  ctx.stroke();
  ctx.restore();
}

function strokeBounds(stroke) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of stroke.points ?? []) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function eraserRadiusPx() {
  return computeEraserRadiusPx();
}

function widthForInk(layer, isHighlighter) {
  const tool = isHighlighter ? "highlighter" : "pen";
  return computeStrokeWidth(tool, layer === "sticky" ? "sticky" : "fade");
}

function boundsIntersect(a, b, padding = 0) {
  return !(
    a.maxX + padding < b.minX - padding ||
    a.minX - padding > b.maxX + padding ||
    a.maxY + padding < b.minY - padding ||
    a.minY - padding > b.maxY + padding
  );
}

function getDocumentMetrics() {
  const docEl = document.documentElement;
  const body = document.body;

  return {
    width: Math.max(
      body?.scrollWidth ?? 0,
      docEl.scrollWidth,
      window.innerWidth
    ),
    height: Math.max(
      body?.scrollHeight ?? 0,
      docEl.scrollHeight,
      window.innerHeight
    ),
    scrollX: window.scrollX || docEl.scrollLeft || 0,
    scrollY: window.scrollY || docEl.scrollTop || 0,
  };
}

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {string} options.pageKey
 * @param {() => boolean} [options.isDrawingAllowed]
 */
export function createClassOverlayCanvas({ canvas, pageKey, isDrawingAllowed }) {
  const ctx = canvas.getContext("2d");
  let fadeStrokes = [];
  let stickyStrokes = loadStickyStrokes(pageKey);
  let activeStroke = null;
  let inkMode = "fade";
  let tool = "pen";
  let color = "#e11d48";
  let fadeTtlMs = DEFAULT_FADE_TTL_MS;
  let fadeWindowMs = DEFAULT_FADE_WINDOW_MS;
  let overlayActive = false;
  let overlayVisible = true;
  let animationFrame = 0;
  let saveTimer = 0;
  let width = 0;
  let height = 0;
  let resizeObserver = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function onLayoutChange() {
    redraw();
  }

  function persistStickySoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveStickyStrokes(pageKey, stickyStrokes);
    }, 120);
  }

  function persistStickyNow() {
    window.clearTimeout(saveTimer);
    saveStickyStrokes(pageKey, stickyStrokes);
  }

  function redraw(now = Date.now()) {
    if (!ctx) {
      return;
    }

    const { scrollX, scrollY } = getDocumentMetrics();
    ctx.clearRect(0, 0, width, height);

    for (const stroke of stickyStrokes) {
      drawStroke(ctx, stroke, scrollX, scrollY, { opacity: 1, layer: "sticky" });
    }

    fadeStrokes = fadeStrokes.filter((stroke) => now - stroke.createdAt < stroke.ttlMs);

    for (const stroke of fadeStrokes) {
      const age = now - stroke.createdAt;
      const remaining = stroke.ttlMs - age;
      let opacity = 1;

      if (remaining <= stroke.fadeWindowMs) {
        opacity = Math.max(0, remaining / stroke.fadeWindowMs);
      }

      drawStroke(ctx, stroke, scrollX, scrollY, { opacity, layer: "fade" });
    }

    if (activeStroke) {
      drawStroke(ctx, activeStroke, scrollX, scrollY, {
        opacity: inkMode === "fade" ? 0.85 : 1,
        layer: inkMode,
      });
    }
  }

  function syncInkModeClass() {
    canvas.classList.toggle("prepos-class-overlay-canvas--fade-ink", inkMode === "fade");
    canvas.classList.toggle("prepos-class-overlay-canvas--sticky-ink", inkMode === "sticky");
  }

  function tick() {
    redraw(Date.now());
    animationFrame = window.requestAnimationFrame(tick);
  }

  function normalizePoint(clientX, clientY) {
    const { scrollX, scrollY } = getDocumentMetrics();
    return [clientX + scrollX, clientY + scrollY];
  }

  function canDraw() {
    return (
      overlayActive &&
      overlayVisible &&
      tool !== "eraser" &&
      (typeof isDrawingAllowed !== "function" || isDrawingAllowed())
    );
  }

  function canErase() {
    return (
      overlayActive &&
      overlayVisible &&
      tool === "eraser" &&
      inkMode === "sticky" &&
      (typeof isDrawingAllowed !== "function" || isDrawingAllowed())
    );
  }

  function syncPointerEvents() {
    canvas.style.pointerEvents =
      overlayActive && overlayVisible ? "auto" : "none";
  }

  function commitStroke(stroke) {
    if (!stroke?.points?.length) {
      return;
    }

    if (stroke.layer === "fade") {
      fadeStrokes.push({
        ...stroke,
        createdAt: Date.now(),
        ttlMs: fadeTtlMs,
        fadeWindowMs,
      });
      if (fadeStrokes.length > MAX_FADE_STROKES) {
        fadeStrokes = fadeStrokes.slice(-MAX_FADE_STROKES);
      }
      return;
    }

    stickyStrokes.push(stroke);
    persistStickySoon();
  }

  function eraseAt(point) {
    const radius = eraserRadiusPx();
    const hitBox = {
      minX: point[0] - radius,
      minY: point[1] - radius,
      maxX: point[0] + radius,
      maxY: point[1] + radius,
    };

    const before = stickyStrokes.length;
    stickyStrokes = stickyStrokes.filter((stroke) => {
      const bounds = strokeBounds(stroke);
      return !boundsIntersect(bounds, hitBox, radius * 0.5);
    });

    if (stickyStrokes.length !== before) {
      persistStickySoon();
    }
  }

  function startStroke(clientX, clientY) {
    if (canErase()) {
      eraseAt(normalizePoint(clientX, clientY));
      activeStroke = {
        id: createStrokeId(),
        tool: "eraser",
        layer: "sticky",
        points: [normalizePoint(clientX, clientY)],
        createdAt: Date.now(),
      };
      return;
    }

    if (!canDraw()) {
      return;
    }

    const isHighlighter = tool === "highlighter";
    activeStroke = {
      id: createStrokeId(),
      tool: isHighlighter ? "highlighter" : "pen",
      color,
      width: widthForInk(inkMode, isHighlighter),
      points: [normalizePoint(clientX, clientY)],
      layer: inkMode,
      createdAt: Date.now(),
      ttlMs: fadeTtlMs,
      fadeWindowMs,
    };
  }

  function extendStroke(clientX, clientY) {
    if (!activeStroke) {
      return;
    }

    const point = normalizePoint(clientX, clientY);

    if (activeStroke.tool === "eraser") {
      eraseAt(point);
      activeStroke.points.push(point);
      return;
    }

    activeStroke.points.push(point);
  }

  function endStroke() {
    if (!activeStroke) {
      return;
    }

    if (activeStroke.tool !== "eraser") {
      commitStroke(activeStroke);
    }

    activeStroke = null;
    redraw();
  }

  function onPointerDown(event) {
    if (!overlayActive || !overlayVisible) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (!canDraw() && !canErase()) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    startStroke(event.clientX, event.clientY);
    redraw(Date.now());
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!activeStroke) {
      return;
    }

    extendStroke(event.clientX, event.clientY);
    redraw();
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (!activeStroke) {
      return;
    }

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    endStroke();
    event.preventDefault();
  }

  function onPointerCancel(event) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    activeStroke = null;
    redraw();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onLayoutChange, { passive: true });

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      onLayoutChange();
    });
    resizeObserver.observe(document.documentElement);
    if (document.body) {
      resizeObserver.observe(document.body);
    }
  }

  syncPointerEvents();
  syncInkModeClass();
  animationFrame = window.requestAnimationFrame(tick);
  resize();

  return {
    setInkMode(mode) {
      inkMode = mode === "sticky" ? "sticky" : "fade";
      syncInkModeClass();
    },

    getInkMode() {
      return inkMode;
    },

    setTool(nextTool) {
      tool = nextTool;
    },

    getTool() {
      return tool;
    },

    setColor(nextColor) {
      color = nextColor;
    },

    getColor() {
      return color;
    },

    setFadeTtl(ms) {
      fadeTtlMs = ms;
    },

    setOverlayActive(active) {
      overlayActive = active;
      if (!active) {
        activeStroke = null;
      }
      canvas.classList.toggle("prepos-class-overlay-canvas--inactive", !active);
      syncPointerEvents();
    },

    isOverlayActive() {
      return overlayActive;
    },

    setOverlayVisible(visible) {
      overlayVisible = visible;
      canvas.classList.toggle("prepos-class-overlay-canvas--hidden", !visible);
      syncPointerEvents();
    },

    isOverlayVisible() {
      return overlayVisible;
    },

    clearFade() {
      fadeStrokes = [];
      redraw();
    },

    clearSticky() {
      stickyStrokes = [];
      persistStickyNow();
      redraw();
    },

    reloadSticky() {
      stickyStrokes = loadStickyStrokes(pageKey);
      redraw();
    },

    getStickyCount() {
      return stickyStrokes.length;
    },

    flush() {
      persistStickyNow();
    },

    destroy() {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(saveTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onLayoutChange);
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      persistStickyNow();
    },
  };
}
