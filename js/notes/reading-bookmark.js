/**
 * PrepOS Reading Bookmark — auto-saves and restores scroll position per note variant.
 *
 * Uses the existing captureLayerScrollState/restoreLayerScrollState infrastructure.
 * Controlled by the "reading.autoBookmark" preference.
 */

import { getPreference } from "../core/preferences.js";
import { captureLayerScrollState, restoreLayerScrollState } from "./layer-flip-alignment.js";

const STORAGE_PREFIX = "prepos:reading-bookmark:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

function storageKey(variantId) {
  return `${STORAGE_PREFIX}${variantId}`;
}

function readBookmark(variantId) {
  try {
    const raw = localStorage.getItem(storageKey(variantId));
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (Date.now() - entry.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(variantId));
      return null;
    }

    return entry.state ?? null;
  } catch {
    return null;
  }
}

function writeBookmark(variantId, state) {
  if (!variantId || !state) return;

  try {
    localStorage.setItem(
      storageKey(variantId),
      JSON.stringify({ state, savedAt: Date.now() })
    );
  } catch {
    // quota — silent
  }
}

function clearBookmark(variantId) {
  localStorage.removeItem(storageKey(variantId));
}

function pruneOldBookmarks() {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;

      try {
        const data = JSON.parse(localStorage.getItem(key));
        entries.push({ key, savedAt: data?.savedAt ?? 0 });
      } catch {
        localStorage.removeItem(key);
      }
    }

    if (entries.length <= MAX_ENTRIES) return;

    entries.sort((a, b) => a.savedAt - b.savedAt);
    const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
    for (const { key } of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/**
 * Initialize reading bookmark for a published note reader.
 *
 * @param {object} options
 * @param {string} options.variantId - active variant UUID
 * @param {HTMLElement} options.contentEl - the content container for scroll capture
 * @param {() => string} options.getActiveTab - returns current representation tab key
 * @returns {{ restore: () => boolean, destroy: () => void }}
 */
export function initReadingBookmark({ variantId, contentEl, getActiveTab }) {
  if (!variantId || !contentEl) {
    return { restore: () => false, destroy: () => {} };
  }

  let active = true;

  function isEnabled() {
    return getPreference("reading.autoBookmark", true) === true;
  }

  function save() {
    if (!active || !isEnabled()) return;

    const state = captureLayerScrollState(contentEl);
    if (!state) return;

    state.tab = getActiveTab?.() ?? null;
    writeBookmark(variantId, state);
  }

  function restore() {
    if (!isEnabled()) return false;

    const state = readBookmark(variantId);
    if (!state) return false;

    restoreLayerScrollState(contentEl, state);
    clearBookmark(variantId);
    return true;
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      save();
    }
  }

  function onPageHide() {
    save();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  pruneOldBookmarks();

  function destroy() {
    active = false;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
  }

  return { restore, destroy };
}
