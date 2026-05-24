/**
 * Topic link resolution for canonical notes ([[Topic Name]]).
 */

export function normalizeTopicName(name = "") {
  return String(name).trim().toLowerCase();
}

/**
 * Resolve topic names to topic IDs (create missing topics when allowed).
 */
export async function resolveTopicLinks(sb, topicNames = [], { createMissing = true } = {}) {
  const unique = [];
  const seen = new Set();

  for (const name of topicNames) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeTopicName(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(trimmed);
  }

  const resolved = [];

  for (const name of unique) {
    const normalized = normalizeTopicName(name);

    const { data: existing } = await sb
      .from("topics")
      .select("id, name")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (existing?.id) {
      resolved.push({
        name: existing.name,
        normalized_name: normalized,
        topic_id: existing.id,
      });
      continue;
    }

    if (!createMissing) {
      resolved.push({
        name,
        normalized_name: normalized,
        topic_id: null,
      });
      continue;
    }

    const { data: created, error } = await sb
      .from("topics")
      .insert({
        name,
        normalized_name: normalized,
      })
      .select("id, name")
      .single();

    if (error) {
      console.warn("topic link create failed:", name, error.message);
      resolved.push({
        name,
        normalized_name: normalized,
        topic_id: null,
      });
      continue;
    }

    resolved.push({
      name: created.name,
      normalized_name: normalized,
      topic_id: created.id,
    });
  }

  return resolved;
}

export function buildTopicLinkRows(noteId, parsedLinks = [], resolvedTopics = []) {
  const byName = new Map(
    resolvedTopics.map((t) => [normalizeTopicName(t.name), t])
  );

  return parsedLinks.map((link) => {
    const resolved = byName.get(normalizeTopicName(link.name));
    return {
      note_id: noteId,
      linked_topic_id: resolved?.topic_id ?? null,
      linked_topic_name: link.name,
      linked_from_block_id: null,
    };
  });
}
