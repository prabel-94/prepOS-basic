/**
 * Canonical note publish workflow.
 */

import { getClient } from "../core/get-client.js";
import { regenerateDraftFromMarkdown } from "./note-storage.js";

const PUBLISH_CONFIRM_MESSAGE =
  "Publish this canonical note?\n\nStudents will now see this version.";

/**
 * @param {string} noteId
 * @param {{ rawMarkdown?: string, title?: string, language?: string }} [options]
 * Save latest source (optional) then set status to published.
 */
export async function publishCanonicalNote(noteId, options = {}) {
  if (!noteId) {
    throw new Error("noteId is required");
  }

  if (options.rawMarkdown?.trim()) {
    await regenerateDraftFromMarkdown({
      noteId,
      rawMarkdown: options.rawMarkdown,
      title: options.title,
      language: options.language,
    });
  }

  const sb = await getClient();

  const { data: note, error: fetchError } = await sb
    .from("notes")
    .select("id, status")
    .eq("id", noteId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (note.status === "published") {
    return note;
  }

  const { data, error } = await sb
    .from("notes")
    .update({ status: "published" })
    .eq("id", noteId)
    .select("id, status, topic_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function confirmPublish() {
  return window.confirm(PUBLISH_CONFIRM_MESSAGE);
}
