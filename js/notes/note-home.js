/**
 * Topic Notes section for teacher and student home pages (variant-aware).
 */

import { getClient } from "../core/get-client.js";
import { resolveAppPath } from "../core/access.js";
import { getLanguageLabel, normalizeLanguage } from "./note-variants.js";

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

/**
 * @param {"teacher"|"student"|"admin"} role
 */
export async function fetchNotesForHome(role, limit = 30) {
  const sb = await getClient();

  let query = sb
    .from("note_variants")
    .select(
      `
      id,
      language,
      title,
      status,
      updated_at,
      note_id,
      notes (
        id,
        topic_id,
        title,
        topics ( id, name )
      )
    `
    )
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (role === "student") {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

function groupByCanonicalNote(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const noteId = row.notes?.id ?? row.note_id;
    if (!noteId) {
      continue;
    }

    if (!map.has(noteId)) {
      map.set(noteId, {
        note: row.notes,
        variants: [],
      });
    }

    map.get(noteId).variants.push(row);
  }

  return [...map.values()];
}

function resolveVariantHref(variant, role) {
  if (role === "teacher" || role === "admin") {
    if (variant.status === "draft") {
      return resolveAppPath(
        `note.html?variant=${encodeURIComponent(variant.id)}&mode=draft`
      );
    }
  }

  const topicId = variant.notes?.topic_id;
  const lang = normalizeLanguage(variant.language);

  if (topicId) {
    return resolveAppPath(
      `note.html?topic=${encodeURIComponent(topicId)}&lang=${encodeURIComponent(lang)}`
    );
  }

  return resolveAppPath(`note.html?variant=${encodeURIComponent(variant.id)}`);
}

export function renderTopicNotesList(container, grouped = [], role = "student") {
  if (!container) {
    return;
  }

  if (!grouped.length) {
    const hint =
      role === "student"
        ? "No published topic notes yet."
        : "No canonical notes yet. Import from Question Bank → Import canonical note.";

    container.innerHTML = `<div class="empty-state">${escapeHTML(hint)}</div>`;
    return;
  }

  container.innerHTML = grouped
    .map(({ note, variants }) => {
      const topicName = note?.topics?.name ?? note?.title ?? "Topic";
      const variantLines = variants
        .map((v) => {
          const href = resolveVariantHref(v, role);
          const lang = getLanguageLabel(v.language);
          const status =
            role === "student"
              ? ""
              : ` <span class="topic-note-status topic-note-status--${escapeHTML(v.status)}">${escapeHTML(v.status)}</span>`;
          const updated = formatUpdatedAt(v.updated_at);

          return `
            <div class="topic-note-row recent-item mt-10">
              <div class="topic-note-row-main">
                <div><b>${escapeHTML(lang)}</b>${status}</div>
                <div class="topic-note-meta text-muted">${escapeHTML(v.title)}${updated ? ` · ${escapeHTML(updated)}` : ""}</div>
              </div>
              <a class="secondary-btn" href="${escapeHTML(href)}">${role === "student" ? "Read" : v.status === "draft" ? "Refine" : "Read"}</a>
            </div>
          `;
        })
        .join("");

      return `
        <div class="topic-notes-canonical-group mt-10">
          <div class="h3">${escapeHTML(topicName)}</div>
          ${variantLines}
        </div>
      `;
    })
    .join("");
}

export async function loadTopicNotesSection(container, { role = "student", limit = 30 } = {}) {
  if (!container) {
    return;
  }

  container.innerHTML = '<div class="text-muted">Loading topic notes…</div>';

  try {
    const rows = await fetchNotesForHome(role, limit);
    const grouped = groupByCanonicalNote(rows);
    renderTopicNotesList(container, grouped, role);
  } catch (error) {
    console.error("[Topic Notes home]", error);

    const message =
      error?.code === "42P01" || error?.message?.includes("note_variants")
        ? "Topic notes require the latest database migrations."
        : "Unable to load topic notes right now.";

    container.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }
}
