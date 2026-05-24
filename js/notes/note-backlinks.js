/**
 * Reverse semantic knowledge references ("Referenced In").
 * One-hop only; uses note_topic_links + canonical notes + topics.
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
 * All published canonical notes that reference this topic via [[...]] links.
 * @param {string} topicId — topic being viewed
 * @param {{ publishedOnly?: boolean }} [options]
 * @returns {Promise<Array<{ topic_id, topic_name, note_id, note_title }>>}
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
      note_id,
      linked_topic_id,
      notes!inner (
        id,
        title,
        status,
        topic_id,
        updated_at,
        topics ( id, name )
      )
    `
    )
    .eq("linked_topic_id", topicId);

  if (error) {
    throw new Error(error.message);
  }

  const seenTopicIds = new Set();
  const results = [];

  for (const row of data ?? []) {
    const note = row.notes;
    const sourceTopic = note?.topics;

    if (!note?.id || !sourceTopic?.id || !sourceTopic?.name) {
      continue;
    }

    if (publishedOnly && note.status !== "published") {
      continue;
    }

    if (note.topic_id === topicId) {
      continue;
    }

    if (seenTopicIds.has(sourceTopic.id)) {
      continue;
    }

    seenTopicIds.add(sourceTopic.id);
    results.push({
      topic_id: sourceTopic.id,
      topic_name: sourceTopic.name,
      note_id: note.id,
      note_title: note.title ?? sourceTopic.name,
    });
  }

  results.sort((a, b) =>
    a.topic_name.localeCompare(b.topic_name, undefined, { sensitivity: "base" })
  );

  return results;
}

/**
 * Lightweight "Referenced In" panel HTML. Returns empty string when no backlinks.
 */
export function renderReferencedInPanel(backlinks = []) {
  if (!backlinks.length) {
    return "";
  }

  const items = backlinks
    .map((entry) => {
      const href = resolveAppPath(
        `note.html?topic=${encodeURIComponent(entry.topic_id)}`
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
