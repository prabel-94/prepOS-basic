/**
 * Topic link resolution for canonical notes ([[Topic Name]]).
 * DB persistence helpers + safe wiki-style traversal rendering.
 */

import { resolveAppPath } from "../core/access.js";
import { renderMarkdownEmphasis } from "../anchors/inline-emphasis.js";

export function normalizeTopicName(name = "") {
  return String(name).trim().toLowerCase();
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function lookupTopicEntry(topicMap, label) {
  if (!topicMap || !label) {
    return null;
  }

  const trimmed = String(label).trim();
  if (!trimmed) {
    return null;
  }

  if (topicMap[trimmed]?.id) {
    return topicMap[trimmed];
  }

  const normalized = normalizeTopicName(trimmed);

  for (const key of Object.keys(topicMap)) {
    const entry = topicMap[key];
    if (!entry) {
      continue;
    }

    if (normalizeTopicName(key) === normalized && entry.id) {
      return entry;
    }

    if (entry.title && normalizeTopicName(entry.title) === normalized && entry.id) {
      return entry;
    }
  }

  return null;
}

/**
 * Convert [[Topic Name]] markers into navigable knowledge links (HTML-safe).
 * @param {string} text
 * @param {Record<string, { id?: string, title?: string }>} topicMap
 * @returns {string}
 */
export function resolveTopicLinks(text, topicMap = {}, options = {}) {
  const preferLanguage = options.preferLanguage ?? "english";
  if (!text) {
    return "";
  }

  const parts = [];
  let lastIndex = 0;
  const pattern = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    parts.push(escapeHTML(text.slice(lastIndex, match.index)));

    const label = match[1].trim();
    const entry = lookupTopicEntry(topicMap, label);
    const display = entry?.title ?? label;

    if (entry?.topic_id || entry?.id) {
      const topicId = entry.topic_id ?? entry.id;
      const href = resolveAppPath(
        `note.html?topic=${encodeURIComponent(topicId)}&lang=${encodeURIComponent(preferLanguage)}`
      );
      parts.push(
        `<a href="${escapeHTML(href)}" class="topic-link" data-topic-id="${escapeHTML(topicId)}">${escapeHTML(display)}</a>`
      );
    } else {
      parts.push(
        `<span class="topic-link unresolved">${escapeHTML(label)}</span>`
      );
    }

    lastIndex = pattern.lastIndex;
  }

  parts.push(renderMarkdownEmphasis(text.slice(lastIndex)));
  return parts.join("");
}

/**
 * Build traversal map from note_topic_links rows (+ joined topics).
 * @param {Array} topicLinks
 * @returns {Record<string, { id: string|null, title: string }>}
 */
export function buildTopicMap(topicLinks = []) {
  const map = {};

  for (const link of topicLinks) {
    const displayName = (link.linked_topic_name ?? link.topics?.name ?? "").trim();
    if (!displayName) {
      continue;
    }

    const id = link.linked_topic_id ?? link.topics?.id ?? null;
    const title = link.topics?.name ?? displayName;

    map[displayName] = { id, topic_id: id, title };
  }

  return map;
}

/**
 * Resolve topic names to topic IDs for storage (import pipeline).
 */
export async function resolveTopicNamesForStorage(
  sb,
  topicNames = [],
  { createMissing = true } = {}
) {
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

export function buildTopicLinkRows(variantId, parsedLinks = [], resolvedTopics = []) {
  const byName = new Map(
    resolvedTopics.map((t) => [normalizeTopicName(t.name), t])
  );

  return parsedLinks.map((link) => {
    const resolved = byName.get(normalizeTopicName(link.name));
    return {
      variant_id: variantId,
      linked_topic_id: resolved?.topic_id ?? null,
      linked_topic_name: link.name,
      linked_from_block_id: null,
    };
  });
}
