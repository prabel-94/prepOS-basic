/**
 * PrepOS Preferences — hybrid localStorage + Supabase store.
 *
 * Read path:  localStorage (instant) → merge from Supabase (async, server wins if newer).
 * Write path: localStorage (instant) + debounced Supabase upsert.
 */

import { getClient } from "./get-client.js";

const STORAGE_KEY = "prepos:preferences";
const STORAGE_TS_KEY = "prepos:preferences:updated_at";
const FLUSH_DEBOUNCE_MS = 800;

const DEFAULTS = Object.freeze({
  "reading.autoBookmark": true,
  "reading.defaultLanguage": "english",
  "practice.assistanceDefault": false,
  "practice.adaptiveMode": true,
  "practice.defaultSessionLimit": 10,
});

let cache = null;
let flushTimer = null;
let dirty = false;
const listeners = new Map();

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocal(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    localStorage.setItem(STORAGE_TS_KEY, new Date().toISOString());
  } catch {
    // quota exceeded — silent
  }
}

function ensureCache() {
  if (!cache) {
    cache = { ...DEFAULTS, ...readLocal() };
  }
  return cache;
}

function notify(key, value) {
  const cbs = listeners.get(key);
  if (cbs) {
    for (const cb of cbs) {
      try { cb(value, key); } catch { /* ignore */ }
    }
  }

  const wildcards = listeners.get("*");
  if (wildcards) {
    for (const cb of wildcards) {
      try { cb(value, key); } catch { /* ignore */ }
    }
  }
}

async function flushToServer() {
  if (!dirty) return;
  dirty = false;

  try {
    const sb = await getClient();
    const prefs = ensureCache();

    const localOnly = { ...prefs };
    for (const key of Object.keys(DEFAULTS)) {
      if (localOnly[key] === DEFAULTS[key]) {
        delete localOnly[key];
      }
    }

    await sb.rpc("upsert_user_preferences", {
      p_preferences: localOnly,
    });
  } catch (err) {
    console.warn("[Preferences] Flush failed:", err.message);
    dirty = true;
  }
}

function scheduleFlush() {
  dirty = true;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushToServer, FLUSH_DEBOUNCE_MS);
}

// --- Public API ---

export function getPreference(key, defaultValue) {
  const prefs = ensureCache();
  const value = prefs[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  return DEFAULTS[key] ?? undefined;
}

export function setPreference(key, value) {
  const prefs = ensureCache();
  const prev = prefs[key];
  if (prev === value) return;

  prefs[key] = value;
  cache = prefs;
  writeLocal(prefs);
  scheduleFlush();
  notify(key, value);
}

export function setPreferences(entries = {}) {
  const prefs = ensureCache();
  let changed = false;

  for (const [key, value] of Object.entries(entries)) {
    if (prefs[key] !== value) {
      prefs[key] = value;
      changed = true;
      notify(key, value);
    }
  }

  if (changed) {
    cache = prefs;
    writeLocal(prefs);
    scheduleFlush();
  }
}

export function getAllPreferences() {
  return { ...ensureCache() };
}

export function getPreferenceDefaults() {
  return { ...DEFAULTS };
}

export function onPreferenceChange(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);

  return () => {
    listeners.get(key)?.delete(callback);
  };
}

/**
 * Sync from Supabase on boot. Server row wins if newer than local timestamp.
 * Call once after auth is confirmed.
 */
export async function syncPreferencesFromServer() {
  try {
    const sb = await getClient();
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return;

    const { data, error } = await sb
      .from("user_preferences")
      .select("preferences, updated_at")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) {
      console.warn("[Preferences] Sync read failed:", error.message);
      return;
    }

    if (!data) return;

    const localTs = localStorage.getItem(STORAGE_TS_KEY);
    const serverTs = data.updated_at;

    if (localTs && new Date(localTs) > new Date(serverTs)) {
      scheduleFlush();
      return;
    }

    const serverPrefs = data.preferences ?? {};
    const merged = { ...DEFAULTS, ...serverPrefs, ...readLocal() };

    const serverKeys = Object.keys(serverPrefs);
    for (const key of serverKeys) {
      merged[key] = serverPrefs[key];
    }

    cache = merged;
    writeLocal(merged);
  } catch (err) {
    console.warn("[Preferences] Sync failed:", err.message);
  }
}

/**
 * Force-flush pending writes immediately (use on pagehide).
 */
export function flushPreferencesSync() {
  if (!dirty) return;
  dirty = false;
  clearTimeout(flushTimer);

  try {
    const prefs = ensureCache();
    const localOnly = { ...prefs };
    for (const key of Object.keys(DEFAULTS)) {
      if (localOnly[key] === DEFAULTS[key]) {
        delete localOnly[key];
      }
    }

    const sb = window.supabaseClient;
    if (!sb) return;

    const body = JSON.stringify({ p_preferences: localOnly });
    const url = `${window.SUPABASE_URL}/rest/v1/rpc/upsert_user_preferences`;
    const token = sb.auth?.session?.()?.access_token;

    if (url && token && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    }
  } catch {
    // best-effort on page leave
  }
}

window.addEventListener("pagehide", flushPreferencesSync);
