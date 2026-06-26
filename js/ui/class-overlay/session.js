/**
 * Class overlay session — sticky ink scope across pages (localStorage).
 */

const STORAGE_PREFIX = "prepos:class-overlay:v1";
const META_KEY = `${STORAGE_PREFIX}:meta`;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PAGES_PER_SESSION = 30;

function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function isExpired(meta) {
  if (!meta?.expiresAt) {
    return false;
  }

  return Date.now() > new Date(meta.expiresAt).getTime();
}

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function stickyPageStorageKey(sessionId, pageKey) {
  return `${STORAGE_PREFIX}:${sessionId}:page:${pageKey}`;
}

/**
 * Stable key for the current document (pathname + canonical query).
 */
export function getPageKey(location = window.location) {
  const path = location.pathname.split("/").pop() || "index.html";
  const params = new URLSearchParams(location.search);
  const keys = ["topic", "variant", "lang", "id", "exam"];

  const parts = [path];
  for (const key of keys) {
    const value = params.get(key);
    if (value) {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join("|");
}

export function getOrCreateSession() {
  let meta = readMeta();

  if (!meta?.sessionId || isExpired(meta)) {
    if (meta?.sessionId) {
      clearSessionStorage(meta.sessionId);
    }

    meta = {
      sessionId: createSessionId(),
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      pageKeys: [],
    };
    writeMeta(meta);
  }

  return meta;
}

export function getSessionMeta() {
  const meta = readMeta();
  if (!meta?.sessionId || isExpired(meta)) {
    return null;
  }

  return meta;
}

export function registerStickyPage(pageKey) {
  const meta = getOrCreateSession();
  const pageKeys = new Set(meta.pageKeys ?? []);
  pageKeys.add(pageKey);

  meta.pageKeys = [...pageKeys].slice(-MAX_PAGES_PER_SESSION);
  meta.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  writeMeta(meta);

  return meta;
}

export function listStickyPageKeys() {
  return getSessionMeta()?.pageKeys ?? [];
}

function clearSessionStorage(sessionId) {
  const meta = readMeta();
  const keys = meta?.pageKeys ?? [];

  for (const pageKey of keys) {
    localStorage.removeItem(stickyPageStorageKey(sessionId, pageKey));
  }

  localStorage.removeItem(META_KEY);
}

export function clearCurrentPageSticky(pageKey) {
  const meta = getSessionMeta();
  if (!meta?.sessionId) {
    return;
  }

  localStorage.removeItem(stickyPageStorageKey(meta.sessionId, pageKey));

  meta.pageKeys = (meta.pageKeys ?? []).filter((key) => key !== pageKey);
  writeMeta(meta);
}

export function clearAllSticky() {
  const meta = readMeta();
  if (!meta?.sessionId) {
    localStorage.removeItem(META_KEY);
    return;
  }

  clearSessionStorage(meta.sessionId);
}

export function endSession() {
  clearAllSticky();
  return getOrCreateSession();
}
