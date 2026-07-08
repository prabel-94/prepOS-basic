/**
 * Section-level markdown composition for the draft editor.
 */

import {
  matchCanonicalSectionLine,
  matchExtensionSectionLine,
  parseMapMarkdown,
  splitSections,
} from "./map-parser.js";
import {
  buildCustomSectionDefinition,
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
 * @param {string} line
 * @returns {string|null}
 */
function matchNestedSectionTag(line) {
  return matchCanonicalSectionLine(line) ?? matchExtensionSectionLine(line);
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
    const tag = matchNestedSectionTag(line);
    if (tag) {
      nested.push(tag);
    }
  }

  if (nested.length) {
    throw new Error(
      `Drop or paste section body only, not a full note. Remove section tags (${nested
        .map((t) => `[${t}]`)
        .join(", ")}). The section tag is added automatically.`
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
 * @returns {{ prelude: boolean, sections: Array<{ id: string, label: string, tag: string, bodyLength: number, bucket: string, source: string }> }}
 */
export function getSectionInventory(markdown, context = {}) {
  const catalog = resolveSectionCatalog(context);
  const { sections, prelude } = splitSections(markdown ?? "", context);

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
        source: definition?.source ?? section.source ?? "builtin",
      };
    }),
  };
}

/**
 * @param {string} markdown
 * @param {string} sectionId
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {string|null}
 */
export function getSectionBody(markdown, sectionId, context = {}) {
  const { sections } = splitSections(markdown ?? "", context);
  const match = sections.find((section) => section.key === sectionId);
  return match?.body ?? null;
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
 * @param {string} markdown
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {{ prelude: string|null, rows: Array<{ tag: string, body: string, tabOrder: number, sequence: number, key: string }> }}
 */
function collectSectionRows(markdown, context = {}) {
  const source = String(markdown ?? "").trim();
  const { sections, prelude } = splitSections(source, context);

  const rows = sections.map((section, index) => {
    const def =
      getDefinitionById(section.key, context) ??
      getDefinitionByBoundaryTag(section.tag, context);

    return {
      key: section.key,
      tag: section.tag,
      body: section.body,
      tabOrder: def?.tabOrder ?? 999,
      sequence: index,
    };
  });

  return { prelude, rows };
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

  if (!source) {
    return formatSectionBlock(definition, trimmedBody);
  }

  const { prelude, rows } = collectSectionRows(source, context);

  rows.push({
    key: definition.id,
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
 * @param {string} markdown
 * @param {string} sectionId
 * @param {string} body
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {string}
 */
export function replaceSectionBody(markdown, sectionId, body, context = {}) {
  const trimmedBody = validateSectionBody(body);
  const { prelude, rows } = collectSectionRows(markdown, context);
  const index = rows.findIndex((row) => row.key === sectionId);

  if (index === -1) {
    throw new Error("Section not found in markdown.");
  }

  rows[index] = {
    ...rows[index],
    body: trimmedBody,
  };

  return serializeMarkdownSections(prelude, rows);
}

/**
 * @param {string} markdown
 * @param {string} sectionId
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {string}
 */
export function deleteSection(markdown, sectionId, context = {}) {
  const { prelude, rows } = collectSectionRows(markdown, context);
  const nextRows = rows.filter((row) => row.key !== sectionId);

  if (nextRows.length === rows.length) {
    throw new Error("Section not found in markdown.");
  }

  return serializeMarkdownSections(prelude, nextRows);
}

/**
 * @param {object} options
 * @param {string} options.label
 * @param {import('./note-section-catalog.js').RendererProfile} [options.rendererProfile]
 * @param {number} [options.tabOrder]
 * @param {import('./note-section-catalog.js').SectionCatalogContext} options.context
 * @returns {import('./note-section-catalog.js').SectionDefinition}
 */
export function createCustomSectionDefinition(options) {
  return buildCustomSectionDefinition(options);
}

/**
 * Preview parse stats for modal feedback.
 * @param {string} markdown
 * @param {import('./note-section-catalog.js').SectionDefinition} definition
 * @param {string} body
 * @param {{ language?: string, title?: string, sectionExtensions?: import('./note-section-catalog.js').SectionDefinition[] }} [parseOptions]
 */
export function previewSectionAddition(markdown, definition, body, parseOptions = {}) {
  const context = {
    customDefinitions: parseOptions.sectionExtensions ?? [],
  };
  const candidate = appendSection(markdown, definition, body, context);
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

/**
 * @param {string} markdown
 * @param {string} sectionId
 * @param {string} body
 * @param {{ language?: string, title?: string, sectionExtensions?: import('./note-section-catalog.js').SectionDefinition[] }} [parseOptions]
 */
export function previewSectionEdit(markdown, sectionId, body, parseOptions = {}) {
  const context = {
    customDefinitions: parseOptions.sectionExtensions ?? [],
  };
  const candidate = replaceSectionBody(markdown, sectionId, body, context);
  const definition = getDefinitionById(sectionId, context);

  if (!definition) {
    throw new Error("Section definition not found.");
  }

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
