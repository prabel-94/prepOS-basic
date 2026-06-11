/**
 * Section-level markdown composition for the draft editor.
 */

import { matchCanonicalSectionLine, parseMapMarkdown, splitSections } from "./map-parser.js";
import {
  getDefinitionByBoundaryTag,
  getDefinitionById,
  mapDefinitionToRepresentationBucket,
  resolveSectionCatalog,
} from "./note-section-catalog.js";

/**
 * @param {import('./note-section-catalog.js').SectionDefinition} definition
 * @returns {string}
 */
export function formatSectionBoundary(definition) {
  return `[${definition.boundaryTag}]`;
}

/**
 * @param {string} body
 */
export function validateSectionBody(body) {
  const trimmed = String(body ?? "").trim();

  if (!trimmed) {
    throw new Error("Section content cannot be empty.");
  }

  const nested = [];
  for (const line of trimmed.split("\n")) {
    const tag = matchCanonicalSectionLine(line);
    if (tag) {
      nested.push(tag);
    }
  }

  if (nested.length) {
    throw new Error(
      `Remove section tags from your paste (${nested.map((t) => `[${t}]`).join(", ")}). The section tag is added automatically.`
    );
  }

  return trimmed;
}

/**
 * @param {import('./note-section-catalog.js').SectionDefinition} definition
 * @param {string} body
 * @returns {string}
 */
export function formatSectionBlock(definition, body) {
  const trimmed = validateSectionBody(body);
  return `${formatSectionBoundary(definition)}\n\n${trimmed}`;
}

/**
 * @param {string} markdown
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {{ prelude: boolean, sections: Array<{ id: string, label: string, tag: string, bodyLength: number, bucket: string }> }}
 */
export function getSectionInventory(markdown, context = {}) {
  const catalog = resolveSectionCatalog(context);
  const { sections, prelude } = splitSections(markdown ?? "");

  return {
    prelude: Boolean(prelude?.trim()),
    sections: sections.map((section) => {
      const definition =
        getDefinitionById(section.key, context) ??
        getDefinitionByBoundaryTag(section.tag, context);

      return {
        id: section.key,
        label: definition?.label ?? section.key,
        tag: section.tag,
        bodyLength: section.body?.length ?? 0,
        bucket: definition
          ? mapDefinitionToRepresentationBucket(definition)
          : section.key,
      };
    }),
  };
}

/**
 * Rebuild markdown with sections sorted by catalog tabOrder.
 * @param {string|null} prelude
 * @param {Array<{ tag: string, body: string }>} sectionRows
 * @returns {string}
 */
export function serializeMarkdownSections(prelude, sectionRows = []) {
  const parts = [];

  if (prelude?.trim()) {
    parts.push(prelude.trim());
  }

  for (const row of sectionRows) {
    if (!row.body?.trim()) {
      continue;
    }

    parts.push(`${formatSectionBoundary({ boundaryTag: row.tag })}\n\n${row.body.trim()}`);
  }

  return parts.join("\n\n");
}

/**
 * Insert or append a section block in registry tabOrder.
 * @param {string} markdown
 * @param {import('./note-section-catalog.js').SectionDefinition} definition
 * @param {string} body
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {string}
 */
export function appendSection(markdown, definition, body, context = {}) {
  if (!definition) {
    throw new Error("A section definition is required.");
  }

  const trimmedBody = validateSectionBody(body);
  const source = String(markdown ?? "").trim();
  const catalog = resolveSectionCatalog(context);

  if (!source) {
    return formatSectionBlock(definition, trimmedBody);
  }

  const { sections, prelude } = splitSections(source);

  /** @type {Array<{ tag: string, body: string, tabOrder: number, sequence: number }>} */
  const rows = sections.map((section, index) => {
    const def =
      getDefinitionById(section.key, context) ??
      getDefinitionByBoundaryTag(section.tag, context);

    return {
      tag: section.tag,
      body: section.body,
      tabOrder: def?.tabOrder ?? 999,
      sequence: index,
    };
  });

  rows.push({
    tag: definition.boundaryTag,
    body: trimmedBody,
    tabOrder: definition.tabOrder ?? 999,
    sequence: rows.length,
  });

  rows.sort(
    (a, b) =>
      a.tabOrder - b.tabOrder ||
      a.sequence - b.sequence
  );

  return serializeMarkdownSections(prelude, rows);
}

/**
 * Preview parse stats for modal feedback.
 * @param {string} markdown
 * @param {import('./note-section-catalog.js').SectionDefinition} definition
 * @param {string} body
 * @param {{ language?: string, title?: string }} [parseOptions]
 */
export function previewSectionAddition(markdown, definition, body, parseOptions = {}) {
  const candidate = appendSection(markdown, definition, body);
  const parsed = parseMapMarkdown(candidate, parseOptions);
  const bucket = mapDefinitionToRepresentationBucket(definition);
  const blocks = bucket ? (parsed.representations?.[bucket] ?? []) : [];
  const topicLinks = parsed?.topic_links?.length ?? 0;

  return {
    markdown: candidate,
    blockCount: blocks.length,
    topicLinkCount: topicLinks,
    bucket,
  };
}
