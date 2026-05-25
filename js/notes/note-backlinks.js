/**
 * Reverse semantic knowledge references ("Referenced In") — canonical, not per-variant.
 */

import { getClient } from "../core/get-client.js";
import { resolveAppPath } from "../core/access.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Notes (canonical) that reference this topic via any variant's [[links]].
 * @param {string} topicId — topic being viewed
 */
export async function getReferencedInTopics(topicId, { publishedOnly = true } = {}) {
  if (!topicId) {
    return [];
  }

  const sb = await getClient();

  const { data, error } = await sb
    .from("note_topic_links")
    .select(
      `
      linked_topic_id,
      note_variants!inner (
        id,
        status,
        note_id,
        notes!inner (
          id,
          title,
          topic_id,
          topics ( id, name )
        )
      )
    `
    )
    .eq("linked_topic_id", topicId);

  if (error) {
    throw new Error(error.message);
  }

  const seenNoteIds = new Set();
  const results = [];

  for (const row of data ?? []) {
    const variant = row.note_variants;
    const note = variant?.notes;

    if (!note?.id || !note.topics?.name) {
      continue;
    }

    if (publishedOnly && variant.status !== "published") {
      continue;
    }

    if (note.topic_id === topicId) {
      continue;
    }

    if (seenNoteIds.has(note.id)) {
      continue;
    }

    seenNoteIds.add(note.id);
    results.push({
      topic_id: note.topics.id,
      topic_name: note.topics.name,
      note_id: note.id,
      note_title: note.title,
    });
  }

  results.sort((a, b) =>
    a.topic_name.localeCompare(b.topic_name, undefined, { sensitivity: "base" })
  );

  return results;
}

export function renderReferencedInPanel(backlinks = [], { preferLanguage = "english" } = {}) {
  if (!backlinks.length) {
    return "";
  }

  const items = backlinks
    .map((entry) => {
      const href = resolveAppPath(
        `note.html?topic=${encodeURIComponent(entry.topic_id)}&lang=${encodeURIComponent(preferLanguage)}`
      );
      return `<li><a href="${escapeHTML(href)}" class="topic-link referenced-in-link" data-topic-id="${escapeHTML(entry.topic_id)}">${escapeHTML(entry.topic_name)}</a></li>`;
    })
    .join("");

  return `
    <section class="referenced-in" aria-label="Referenced In">
      <h3 class="referenced-in-heading">Referenced In</h3>
      <ul class="referenced-in-list">${items}</ul>
    </section>
  `;
}
