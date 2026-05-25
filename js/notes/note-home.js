/**
 * Topic Notes section for teacher and student home pages.
 */

import { getClient } from "../core/get-client.js";
import { resolveAppPath } from "../core/access.js";

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatUpdatedAt(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function dedupePublishedByTopic(notes = []) {
  const seen = new Set();
  const result = [];

  for (const note of notes) {
    const key = note.topic_id;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(note);
  }

  return result;
}

/**
 * @param {"teacher"|"student"|"admin"} role
 */
export async function fetchNotesForHome(role, limit = 20) {
  const sb = await getClient();

  let query = sb
    .from("notes")
    .select(
      `
      id,
      title,
      status,
      language,
      updated_at,
      topic_id,
      topics ( id, name )
    `
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (role === "student") {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = data ?? [];

  if (role === "student") {
    return dedupePublishedByTopic(rows);
  }

  return rows;
}

function resolveNoteHref(note, role) {
  const topicId = note.topic_id;
  const noteId = note.id;

  if (role === "teacher" || role === "admin") {
    if (note.status === "draft") {
      return resolveAppPath(`note.html?id=${encodeURIComponent(noteId)}&mode=draft`);
    }
    if (topicId) {
      return resolveAppPath(`note.html?topic=${encodeURIComponent(topicId)}`);
    }
    return resolveAppPath(`note.html?id=${encodeURIComponent(noteId)}`);
  }

  if (topicId) {
    return resolveAppPath(`note.html?topic=${encodeURIComponent(topicId)}`);
  }

  return resolveAppPath(`note.html?id=${encodeURIComponent(noteId)}`);
}

function resolveActionLabel(note, role) {
  if (role === "student") {
    return "Read note";
  }

  return note.status === "draft" ? "Refine draft" : "Read note";
}

export function renderTopicNotesList(container, notes = [], role = "student") {
  if (!container) {
    return;
  }

  if (!notes.length) {
    const hint =
      role === "student"
        ? "No published topic notes yet. Your teacher will publish canonical notes when they are ready."
        : "No canonical notes yet. Import from Question Bank → Import canonical note.";

    container.innerHTML = `<div class="empty-state">${escapeHTML(hint)}</div>`;
    return;
  }

  container.innerHTML = notes
    .map((note) => {
      const topicName = note.topics?.name ?? "Topic";
      const href = resolveNoteHref(note, role);
      const action = resolveActionLabel(note, role);
      const status =
        role === "student"
          ? ""
          : `<span class="topic-note-status topic-note-status--${escapeHTML(note.status)}">${escapeHTML(note.status)}</span>`;
      const updated = formatUpdatedAt(note.updated_at);
      const meta = [note.language, updated].filter(Boolean).join(" · ");

      return `
        <div class="topic-note-row recent-item mt-10">
          <div class="topic-note-row-main">
            <div><b>${escapeHTML(topicName)}</b>${status}</div>
            <div class="topic-note-meta text-muted">${escapeHTML(note.title)}${meta ? ` · ${escapeHTML(meta)}` : ""}</div>
          </div>
          <a class="secondary-btn" href="${escapeHTML(href)}">${escapeHTML(action)}</a>
        </div>
      `;
    })
    .join("");
}

/**
 * Load and render Topic Notes into a home page container.
 * @param {HTMLElement|null} container
 * @param {{ role?: string, limit?: number }} [options]
 */
export async function loadTopicNotesSection(container, { role = "student", limit = 20 } = {}) {
  if (!container) {
    return;
  }

  container.innerHTML =
    '<div class="text-muted">Loading topic notes…</div>';

  try {
    const notes = await fetchNotesForHome(role, limit);
    renderTopicNotesList(container, notes, role);
  } catch (error) {
    console.error("[Topic Notes home]", error);

    const message =
      error?.code === "42P01" || error?.message?.includes("notes")
        ? "Topic notes are not available yet. Apply the latest database migrations."
        : "Unable to load topic notes right now.";

    container.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
}
