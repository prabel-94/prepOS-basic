/**
 * Sticky stroke persistence (localStorage only).
 */

import {
  getSessionMeta,
  registerStickyPage,
  stickyPageStorageKey,
} from "./session.js";

export const MAX_STICKY_STROKES_PER_PAGE = 500;

/**
 * @param {object} stroke
 */
export function serializeStroke(stroke) {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: stroke.points,
  };
}

/**
 * @param {object} raw
 */
export function deserializeStroke(raw) {
  if (!raw?.points?.length) {
    return null;
  }

  return {
    id: raw.id ?? `stroke-${Math.random().toString(36).slice(2)}`,
    tool: raw.tool === "highlighter" ? "highlighter" : "pen",
    color: raw.color ?? "#e11d48",
    width: Number(raw.width) || 0.004,
    points: raw.points,
    layer: "sticky",
    createdAt: raw.createdAt ?? Date.now(),
  };
}

export function loadStickyStrokes(pageKey) {
  const meta = getSessionMeta();
  if (!meta?.sessionId || !pageKey) {
    return [];
  }

  try {
    const raw = localStorage.getItem(stickyPageStorageKey(meta.sessionId, pageKey));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return (parsed?.strokes ?? [])
      .map(deserializeStroke)
      .filter(Boolean)
      .slice(-MAX_STICKY_STROKES_PER_PAGE);
  } catch {
    return [];
  }
}

export function saveStickyStrokes(pageKey, strokes = []) {
  const meta = getSessionMeta();
  if (!meta?.sessionId || !pageKey) {
    return;
  }

  if (!strokes.length) {
    localStorage.removeItem(stickyPageStorageKey(meta.sessionId, pageKey));
    return;
  }

  registerStickyPage(pageKey);

  const payload = {
    version: 1,
    strokes: strokes.slice(-MAX_STICKY_STROKES_PER_PAGE).map(serializeStroke),
  };

  try {
    localStorage.setItem(
      stickyPageStorageKey(meta.sessionId, pageKey),
      JSON.stringify(payload)
    );
  } catch (err) {
    console.warn("[Class overlay] Could not save sticky strokes:", err);
  }
}
