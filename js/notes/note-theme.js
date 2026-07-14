/**
 * Note reader color scheme (light / dark / system).
 * Class `note-theme-dark` on body drives CSS; preference syncs via preferences store.
 */

import {
  getPreference,
  setPreference,
  onPreferenceChange,
} from "../core/preferences.js";

export const NOTE_THEME_CLASS = "note-theme-dark";
export const NOTE_COLOR_SCHEME_PREF = "reading.colorScheme";

const VALID = new Set(["light", "dark", "system"]);

export function normalizeNoteColorScheme(value) {
  if (VALID.has(value)) return value;
  return "light";
}

export function resolveNoteColorScheme(prefValue) {
  const scheme = normalizeNoteColorScheme(
    prefValue ?? getPreference(NOTE_COLOR_SCHEME_PREF, "light")
  );
  if (scheme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return scheme;
}

function syncToggleButton(resolved) {
  const btn = document.querySelector("[data-note-theme-toggle]");
  if (!btn) return;

  const isDark = resolved === "dark";
  btn.setAttribute("aria-pressed", isDark ? "true" : "false");
  btn.setAttribute(
    "aria-label",
    isDark ? "Switch to light reading" : "Switch to dark reading"
  );
  btn.title = isDark ? "Light reading" : "Dark reading";
  btn.dataset.themeResolved = resolved;
}

/**
 * Apply resolved light/dark to the note reader page.
 */
export function applyNoteTheme(prefValue) {
  if (!document.body?.classList.contains("note-reader-page")) {
    return resolveNoteColorScheme(prefValue);
  }

  const resolved = resolveNoteColorScheme(prefValue);
  document.body.classList.toggle(NOTE_THEME_CLASS, resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  syncToggleButton(resolved);
  return resolved;
}

export function setNoteColorScheme(value) {
  const scheme = normalizeNoteColorScheme(value);
  setPreference(NOTE_COLOR_SCHEME_PREF, scheme);
  return applyNoteTheme(scheme);
}

/** FAB toggle: flip between light and dark (never lands on system). */
export function toggleNoteTheme() {
  const next = resolveNoteColorScheme() === "dark" ? "light" : "dark";
  return setNoteColorScheme(next);
}

/**
 * Wire FAB + preference listeners for the note reader page.
 */
export function initNoteThemeControls() {
  applyNoteTheme();

  const btn = document.querySelector("[data-note-theme-toggle]");
  btn?.addEventListener("click", () => {
    toggleNoteTheme();
  });

  onPreferenceChange(NOTE_COLOR_SCHEME_PREF, (value) => {
    applyNoteTheme(value);
  });

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (getPreference(NOTE_COLOR_SCHEME_PREF, "light") === "system") {
      applyNoteTheme("system");
    }
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onSystemChange);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(onSystemChange);
  }

  return () => {
    if (typeof mq.removeEventListener === "function") {
      mq.removeEventListener("change", onSystemChange);
    } else if (typeof mq.removeListener === "function") {
      mq.removeListener(onSystemChange);
    }
  };
}
