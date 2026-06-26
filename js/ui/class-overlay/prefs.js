/**
 * Teacher markup preferences — global + per-entity + per-ink-layer scales.
 * Persisted across sessions (localStorage).
 */

const PREFS_KEY = "prepos:class-overlay:prefs:v2";
const LEGACY_PREFS_KEY = "prepos:class-overlay:prefs:v1";

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 3;
export const SCALE_STEP = 0.1;
export const COMBINED_SCALE_CAP = 4;

/** @typedef {"pen" | "highlighter" | "eraser" | "fadeInk" | "stickyInk"} ScaleEntity */

export const PEN_WIDTH = 0.0035;
export const HIGHLIGHTER_WIDTH = 0.014;
export const ERASER_WIDTH = 0.018;

const MAX_PEN_PX = 24;
const MAX_HIGHLIGHTER_PX = 48;
const MAX_ERASER_PX = 56;

const DEFAULT_PREFS = Object.freeze({
  globalScale: 1,
  penScale: 1,
  highlighterScale: 1,
  eraserScale: 1,
  fadeInkScale: 1,
  stickyInkScale: 1,
});

/** @type {typeof DEFAULT_PREFS | null} */
let cached = null;

function clampScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 1;
  }

  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 10) / 10));
}

function readLegacyPrefs() {
  try {
    const raw = localStorage.getItem(LEGACY_PREFS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return {
      fadeInkScale: clampScale(parsed.fadeInkScale ?? 1),
      stickyInkScale: clampScale(parsed.stickyInkScale ?? 1),
    };
  } catch {
    return null;
  }
}

export function loadMarkupPrefs() {
  if (cached) {
    return { ...cached };
  }

  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const legacy = parsed ? null : readLegacyPrefs();

    cached = {
      globalScale: clampScale(parsed?.globalScale ?? DEFAULT_PREFS.globalScale),
      penScale: clampScale(parsed?.penScale ?? DEFAULT_PREFS.penScale),
      highlighterScale: clampScale(
        parsed?.highlighterScale ?? DEFAULT_PREFS.highlighterScale
      ),
      eraserScale: clampScale(parsed?.eraserScale ?? DEFAULT_PREFS.eraserScale),
      fadeInkScale: clampScale(
        parsed?.fadeInkScale ?? legacy?.fadeInkScale ?? DEFAULT_PREFS.fadeInkScale
      ),
      stickyInkScale: clampScale(
        parsed?.stickyInkScale ?? legacy?.stickyInkScale ?? DEFAULT_PREFS.stickyInkScale
      ),
    };
  } catch {
    cached = { ...DEFAULT_PREFS };
  }

  return { ...cached };
}

export function saveMarkupPrefs(partial = {}) {
  const current = loadMarkupPrefs();
  const next = { ...current };

  for (const key of Object.keys(DEFAULT_PREFS)) {
    if (partial[key] !== undefined) {
      next[key] = clampScale(partial[key]);
    }
  }

  cached = next;

  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("[Class overlay] Could not save markup prefs:", err);
  }

  return { ...next };
}

export function resetMarkupScales() {
  cached = null;
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }

  return saveMarkupPrefs({ ...DEFAULT_PREFS });
}

/**
 * @param {"fade" | "sticky"} layer
 */
export function getInkScale(layer) {
  const prefs = loadMarkupPrefs();
  return layer === "sticky" ? prefs.stickyInkScale : prefs.fadeInkScale;
}

/**
 * @param {ScaleEntity} entity
 */
export function getEntityScale(entity) {
  const prefs = loadMarkupPrefs();
  const key = `${entity}Scale`;
  if (key in prefs) {
    return prefs[key];
  }

  return 1;
}

function viewportMinDim() {
  return Math.min(window.innerWidth, window.innerHeight);
}

function capWidthFraction(widthFrac, tool) {
  const maxPx = tool === "highlighter" ? MAX_HIGHLIGHTER_PX : MAX_PEN_PX;
  const maxFrac = maxPx / viewportMinDim();
  const capped = Math.min(widthFrac, maxFrac);
  const base = tool === "highlighter" ? HIGHLIGHTER_WIDTH : PEN_WIDTH;
  return Math.min(capped, base * COMBINED_SCALE_CAP);
}

/**
 * @param {"pen" | "highlighter"} tool
 * @param {"fade" | "sticky"} layer
 */
export function computeStrokeWidth(tool, layer) {
  const prefs = loadMarkupPrefs();
  const base = tool === "highlighter" ? HIGHLIGHTER_WIDTH : PEN_WIDTH;
  const entityScale =
    tool === "highlighter" ? prefs.highlighterScale : prefs.penScale;
  const inkScale = layer === "sticky" ? prefs.stickyInkScale : prefs.fadeInkScale;
  const raw = base * entityScale * prefs.globalScale * inkScale;

  return capWidthFraction(raw, tool);
}

export function computeEraserRadiusPx() {
  const prefs = loadMarkupPrefs();
  const raw =
    ERASER_WIDTH * viewportMinDim() * prefs.eraserScale * prefs.globalScale;

  return Math.min(raw, MAX_ERASER_PX);
}

/**
 * Preview diameter in px for toolbar scale preview.
 *
 * @param {"pen" | "highlighter" | "eraser"} tool
 * @param {"fade" | "sticky"} layer
 */
export function previewStrokeDiameterPx(tool, layer) {
  if (tool === "eraser") {
    return computeEraserRadiusPx() * 2;
  }

  return computeStrokeWidth(tool, layer) * viewportMinDim();
}

export function formatInkScale(scale) {
  return `${Number(scale).toFixed(1)}×`;
}
