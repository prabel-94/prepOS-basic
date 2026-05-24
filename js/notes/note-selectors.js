/**
 * Read selectors for canonical notes (reader + import).
 */

import { getClient } from "../core/get-client.js";
import { buildTopicMap } from "./note-topic-links.js";

export async function fetchNoteById(noteId) {
  if (!noteId) {
    return null;
  }

  const sb = await getClient();

  const { data: note, error } = await sb
    .from("notes")
    .select(
      `
      id,
      topic_id,
      title,
      language,
      map_version,
      canonical_version,
      status,
      created_at,
      updated_at,
      topics ( id, name )
    `
    )
    .eq("id", noteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return note;
}

export async function fetchNoteBlocks(noteId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("note_blocks")
    .select("*")
    .eq("note_id", noteId)
    .order("representation_type")
    .order("sequence_order");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchNoteTopicLinks(noteId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("note_topic_links")
    .select(
      `
      id,
      linked_topic_id,
      linked_topic_name,
      topics ( id, name )
    `
    )
    .eq("note_id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchTopicById(topicId) {
  if (!topicId) {
    return null;
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from("topics")
    .select("id, name")
    .eq("id", topicId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchPublishedNoteForTopic(topicId) {
  const sb = await getClient();

  const { data, error } = await sb
    .from("notes")
    .select("id, title, status, updated_at")
    .eq("topic_id", topicId)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function groupBlocksByRepresentation(blocks = []) {
  const grouped = {
    narrative: [],
    structural: [],
    revision: [],
    timeline: [],
    interpretations: [],
  };

  for (const block of blocks) {
    const key = block.representation_type;
    if (grouped[key]) {
      grouped[key].push(block);
    }
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort(
      (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)
    );
  }

  return grouped;
}

export async function loadCanonicalNoteBundle(noteId) {
  const [note, blocks, topicLinks] = await Promise.all([
    fetchNoteById(noteId),
    fetchNoteBlocks(noteId),
    fetchNoteTopicLinks(noteId),
  ]);

  if (!note) {
    return null;
  }

  const topicMap = buildTopicMap(topicLinks);

  return {
    note,
    blocks,
    representations: groupBlocksByRepresentation(blocks),
    topicLinks,
    topicMap,
  };
}
