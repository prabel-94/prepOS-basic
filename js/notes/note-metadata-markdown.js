/**
 * [METADATA] section helpers for the draft editor.
 */

import { splitSections } from "./map-parser.js";

function formatMetadataBody(metadata = {}) {
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join("\n");
}

/**
 * @param {string} markdown
 * @returns {Record<string, string>}
 */
export function readMetadataFromMarkdown(markdown) {
  const { sections } = splitSections(markdown ?? "");
  const metaSection = sections.find((section) => section.key === "metadata");
  if (!metaSection?.body) {
    return {};
  }

  const metadata = {};
  for (const line of metaSection.body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      continue;
    }

    const key = trimmed.slice(0, colon).trim().toLowerCase().replace(/\s+/g, "_");
    const value = trimmed.slice(colon + 1).trim();
    if (key) {
      metadata[key] = value;
    }
  }

  return metadata;
}

/**
 * @param {string} markdown
 * @param {Record<string, string>} metadata
 * @returns {string}
 */
export function writeMetadataToMarkdown(markdown, metadata = {}) {
  const source = String(markdown ?? "");
  const body = formatMetadataBody(metadata);
  const { sections, prelude } = splitSections(source);
  const metaIndex = sections.findIndex((section) => section.key === "metadata");

  if (!body.trim()) {
    if (metaIndex === -1) {
      return source;
    }

    const nextSections = sections.filter((section) => section.key !== "metadata");
    return serializeWithPrelude(prelude, nextSections);
  }

  if (metaIndex === -1) {
    const metaBlock = `[METADATA]\n\n${body}`;
    if (!source.trim()) {
      return metaBlock;
    }

    return `${metaBlock}\n\n${source.trim()}`;
  }

  const nextSections = sections.map((section, index) =>
    index === metaIndex ? { ...section, body } : section
  );

  return serializeWithPrelude(prelude, nextSections);
}

function serializeWithPrelude(prelude, sections) {
  const parts = [];

  if (prelude?.trim()) {
    parts.push(prelude.trim());
  }

  for (const section of sections) {
    if (!section.body?.trim() && section.key !== "metadata") {
      continue;
    }

    parts.push(`[${section.tag}]\n\n${section.body?.trim() ?? ""}`);
  }

  return parts.join("\n\n");
}
