/**
 * MSMDF → Canonical Object
 * Parser responsibilities: canonical section boundaries, block extraction, topic links.
 * Never rewrites source prose. Semantic resolution remains downstream.
 */

import {
  CANONICAL_BOUNDARY_TAGS,
  applyRecallBlockTransform,
  buildBoundaryReport,
  getSectionKeyFromTag,
  isEntityIndexSection,
  isMetadataSection,
  mapSectionToRepresentation,
  shouldApplyRecallTransform,
  summarizeDetectedSectionsFromRegistry,
} from "./note-representations.js";
import {
  createRepresentationBuckets,
  getDefinitionByBoundaryTag,
  getDefinitionById,
  mapDefinitionToRepresentationBucket,
  resolveSectionCatalog,
} from "./note-section-catalog.js";
import { normalizeAnchorName } from "../anchors/anchor-normalization.js";

export { CANONICAL_BOUNDARY_TAGS };

/**
 * MSMDF section line: optional leading #, bracket tag, whitespace tolerant.
 * Does NOT treat ## [TAG] as a section boundary (single optional # only).
 */
const SECTION_LINE_PATTERN = new RegExp(
  `^\\s*#?\\s*\\[(${CANONICAL_BOUNDARY_TAGS.join("|")})\\]\\s*$`,
  "i"
);

const EXTENSION_SECTION_LINE_PATTERN = /^\s*#?\s*\[(EXT:[A-Z][A-Z0-9_]+)\]\s*$/i;

export const MSMDF_SECTION_SYNTAX_EXAMPLES = Object.freeze([
  "[NARRATIVE]",
  "[EXPANSION]",
  "# [NARRATIVE]",
  "#[NARRATIVE]",
]);

export const MSMDF_SECTION_SYNTAX_HELP =
  "Expected section boundaries include [NARRATIVE], [EXPANSION], or # [NARRATIVE] (MSMDF v3.0).";

const TOPIC_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

function normalizeNewlines(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/**
 * @param {string} line
 * @returns {string|null} canonical tag name uppercased
 */
export function matchCanonicalSectionLine(line) {
  const match = String(line ?? "").match(SECTION_LINE_PATTERN);
  if (!match) {
    return null;
  }

  return match[1].toUpperCase();
}

/**
 * @param {string} line
 * @returns {string|null}
 */
export function matchExtensionSectionLine(line) {
  const match = String(line ?? "").match(EXTENSION_SECTION_LINE_PATTERN);
  if (!match) {
    return null;
  }

  return match[1].toUpperCase();
}

/**
 * @param {string} line
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {{ key: string, tag: string, source: 'builtin' | 'custom' }|null}
 */
export function matchSectionBoundary(line, context = {}) {
  const builtinTag = matchCanonicalSectionLine(line);
  if (builtinTag) {
    const key = getSectionKeyFromTag(builtinTag);
    return key
      ? { key, tag: builtinTag, source: "builtin" }
      : null;
  }

  const extTag = matchExtensionSectionLine(line);
  if (!extTag) {
    return null;
  }

  const definition = getDefinitionByBoundaryTag(extTag, context);
  if (!definition) {
    return null;
  }

  return {
    key: definition.id,
    tag: definition.boundaryTag.toUpperCase(),
    source: definition.source === "custom" ? "custom" : "builtin",
  };
}

function parseMetadataSection(body) {
  const metadata = {};
  const lines = body.split("\n");

  for (const line of lines) {
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

function headingLevel(line) {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    heading: match[2].trim(),
  };
}

function isListLine(line) {
  return /^\s*([-*•]|\d+[\.)])\s+/.test(line);
}

/** Opening fence: ```text or ```ra (MSMDF v3 semantic coding). */
const FENCED_SEMANTIC_OPEN_PATTERN = /^```\s*(text|ra)\s*$/i;
const FENCED_CODE_CLOSE_PATTERN = /^```\s*$/;

/**
 * @param {string} line
 * @returns {"text"|"ra"|null}
 */
function matchFencedSemanticOpen(line) {
  const match = String(line ?? "").trim().match(FENCED_SEMANTIC_OPEN_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

function isFencedCodeClose(line) {
  return FENCED_CODE_CLOSE_PATTERN.test(String(line ?? "").trim());
}

/**
 * Resolve MSMDF protocol / grammar versions from metadata (v1.2–v3.0 field aliases).
 * @param {Record<string, string>} metadata
 */
export function resolveMsmdfVersions(metadata = {}) {
  const protocol =
    metadata.protocol ||
    metadata.msmdf ||
    metadata.msmdf_version ||
    metadata.msmdf_state ||
    null;

  const version =
    metadata.version ||
    metadata.map_version ||
    metadata.canonical_version ||
    null;

  const grammarVersion =
    metadata.grammar_version ||
    metadata.grammar ||
    metadata.grammar_version_number ||
    null;

  const versionStr = String(version ?? "").trim();
  const protocolText = String(protocol ?? "").trim();
  const grammarStr = String(grammarVersion ?? "").trim();

  const isV3 =
    /^3(\.|$)/.test(versionStr) ||
    /3\.0/i.test(protocolText) ||
    grammarStr.startsWith("3");

  const isExplicitLegacy =
    /v?1\.2/i.test(String(metadata.msmdf_version ?? "")) ||
    /^2\./i.test(versionStr) ||
    /v?2\./i.test(String(metadata.msmdf_version ?? ""));

  let msmdf_generation = "unspecified";
  if (isV3) {
    msmdf_generation = "3.x";
  } else if (isExplicitLegacy) {
    msmdf_generation = "legacy";
  }

  return {
    protocol: protocol ?? (isV3 ? "MSMDF" : null),
    version: version ?? (isV3 ? "3.0.0" : null),
    grammar_version: grammarVersion ?? (isV3 ? "3.0.0" : null),
    msmdf_generation,
  };
}

function extractBlocks(sectionKey, body, extraMetadata = {}) {
  const lines = body.split("\n");
  const blocks = [];
  let sequence = 0;
  let current = null;

  function flush() {
    if (!current) {
      return;
    }

    const content = current.lines.join("\n").trim();
    if (content || current.heading) {
      blocks.push({
        representation_type: sectionKey,
        block_type: current.block_type,
        heading: current.heading ?? null,
        content: content || null,
        hierarchy_level: current.hierarchy_level ?? null,
        sequence_order: sequence++,
        metadata_json: {
          ...extraMetadata,
          ...(current.metadata_json ?? {}),
        },
      });
    }

    current = null;
  }

  function pushRetrievalAnchorBlock(content, fenceLang = "text") {
    const trimmed = String(content ?? "").trim();
    if (!trimmed) {
      return;
    }

    blocks.push({
      representation_type: sectionKey,
      block_type: "retrieval_anchor",
      heading: null,
      content: trimmed,
      hierarchy_level: null,
      sequence_order: sequence++,
      metadata_json: {
        ...extraMetadata,
        fence_lang: fenceLang,
      },
    });
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    const fenceLang = matchFencedSemanticOpen(trimmed);
    if (fenceLang) {
      flush();
      const fenceLines = [];

      for (lineIndex += 1; lineIndex < lines.length; lineIndex += 1) {
        const fenceLine = lines[lineIndex].replace(/\s+$/, "");
        if (isFencedCodeClose(fenceLine.trim())) {
          break;
        }
        fenceLines.push(fenceLine);
      }

      pushRetrievalAnchorBlock(fenceLines.join("\n"), fenceLang);
      continue;
    }

    if (!trimmed) {
      if (current?.block_type === "paragraph" && current.lines.length) {
        flush();
      }
      continue;
    }

    const heading = headingLevel(trimmed);
    if (heading) {
      flush();
      current = {
        block_type: "section",
        heading: heading.heading,
        hierarchy_level: heading.level,
        lines: [],
        metadata_json: {},
      };
      continue;
    }

    if (isListLine(trimmed)) {
      if (current?.block_type !== "list") {
        flush();
        current = {
          block_type: "list",
          heading: null,
          hierarchy_level: null,
          lines: [],
          metadata_json: {},
        };
      }
      current.lines.push(line);
      continue;
    }

    if (!current || current.block_type !== "paragraph") {
      flush();
      current = {
        block_type: "paragraph",
        heading: null,
        hierarchy_level: null,
        lines: [],
        metadata_json: {},
      };
    }

    current.lines.push(line);
  }

  flush();
  return blocks;
}

function extractTopicLinks(markdown, sectionKey = null, blockIndex = null) {
  const links = [];
  const seen = new Set();
  let match;

  TOPIC_LINK_PATTERN.lastIndex = 0;
  while ((match = TOPIC_LINK_PATTERN.exec(markdown)) !== null) {
    const name = match[1].trim();
    if (!name) {
      continue;
    }

    const key = normalizeAnchorName(name);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({
      name,
      raw: match[0],
      section: sectionKey,
      block_index: blockIndex,
    });
  }

  return links;
}

/**
 * @param {string} markdown
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {{ sections: Array<{ key: string, body: string, tag: string, source?: string, bodyStart?: number, bodyEnd?: number }>, prelude: string|null }}
 */
export function splitSections(markdown, context = {}) {
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.split("\n");
  const sections = [];
  let currentKey = null;
  let currentTag = null;
  let currentSource = null;
  let buffer = [];
  let preludeLines = [];
  let preludeCaptured = null;
  let currentBodyStart = null;
  let offset = 0;

  function pushSection() {
    if (currentKey === null) {
      return;
    }

    const body = buffer.join("\n").trim();
    const bodyEnd = offset;

    sections.push({
      key: currentKey,
      tag: currentTag,
      body,
      source: currentSource ?? "builtin",
      bodyStart: currentBodyStart ?? 0,
      bodyEnd,
    });
    buffer = [];
    currentBodyStart = null;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineStart = offset;
    const boundary = matchSectionBoundary(line, context);

    if (boundary) {
      pushSection();

      if (preludeCaptured === null) {
        const preludeBody = preludeLines.join("\n").trim();
        if (preludeBody) {
          preludeCaptured = preludeBody;
        }
        preludeLines = [];
      }

      currentTag = boundary.tag;
      currentKey = boundary.key;
      currentSource = boundary.source;
      currentBodyStart = lineStart + line.length + (lineIndex < lines.length - 1 ? 1 : 0);
      offset = lineStart + line.length + 1;
      continue;
    }

    if (currentKey !== null) {
      buffer.push(line);
    } else {
      preludeLines.push(line);
    }

    offset = lineStart + line.length + (lineIndex < lines.length - 1 ? 1 : 0);
  }

  pushSection();

  if (preludeCaptured === null) {
    const trailingPrelude = preludeLines.join("\n").trim();
    if (trailingPrelude) {
      preludeCaptured = trailingPrelude;
    }
  }

  return {
    sections,
    prelude: preludeCaptured,
  };
}

/**
 * Parse MSMDF semantic markdown into a canonical object.
 * @param {string} rawMarkdown
 * @param {{ language?: string, title?: string, sectionExtensions?: import('./note-section-catalog.js').SectionDefinition[] }} [options]
 * @returns {object}
 */
export function parseMapMarkdown(rawMarkdown, options = {}) {
  const markdown = normalizeNewlines(rawMarkdown);
  const catalogContext = {
    customDefinitions: options.sectionExtensions ?? [],
  };
  const catalog = resolveSectionCatalog(catalogContext);
  const { sections, prelude } = splitSections(markdown, catalogContext);

  const metadata = {};
  const representations = createRepresentationBuckets(catalogContext);
  const entityIndexBlocks = [];
  const parserDiagnostics = {
    msmdf_version: null,
    grammar_version: null,
    msmdf_generation: "unspecified",
    prelude: null,
    boundaries: [],
    warnings: [],
  };

  const topicLinks = [];
  const globalTopicSeen = new Set();

  if (prelude) {
    const preludeBlocks = extractBlocks("narrative", prelude, {
      msmdf_provenance: "prelude",
    });
    if (!representations.narrative) {
      representations.narrative = [];
    }
    representations.narrative.push(...preludeBlocks);
    parserDiagnostics.prelude = {
      preserved: true,
      block_count: preludeBlocks.length,
      char_count: prelude.length,
    };
  }

  for (const line of markdown.split("\n")) {
    const extTag = matchExtensionSectionLine(line);
    if (!extTag) {
      continue;
    }

    if (!getDefinitionByBoundaryTag(extTag, catalogContext)) {
      parserDiagnostics.warnings.push(
        `Unknown extension section [${extTag}] was ignored. Register it as a custom section first.`
      );
    }
  }

  for (const section of sections) {
    const definition = getDefinitionById(section.key, catalogContext);

    if (isMetadataSection(section.key)) {
      Object.assign(metadata, parseMetadataSection(section.body));
      continue;
    }

    if (isEntityIndexSection(section.key)) {
      entityIndexBlocks.push(
        ...extractBlocks("entity_index", section.body, {
          msmdf_boundary: "entity_index",
        })
      );
      continue;
    }

    let representationKey = mapSectionToRepresentation(section.key);

    if (!representationKey && definition) {
      representationKey = mapDefinitionToRepresentationBucket(definition);
    }

    if (!representationKey) {
      parserDiagnostics.warnings.push(
        `Unmapped canonical boundary [${section.tag}] was detected but not stored in representations.`
      );
      continue;
    }

    if (!representations[representationKey]) {
      representations[representationKey] = [];
    }

    const blocks = extractBlocks(representationKey, section.body, {
      msmdf_boundary: section.tag,
      section_source: section.source ?? definition?.source ?? "builtin",
      renderer_profile: definition?.rendererProfile ?? "generic",
    });

    if (shouldApplyRecallTransform(section.key)) {
      applyRecallBlockTransform(blocks);
    }

    representations[representationKey].push(...blocks);

    blocks.forEach((block, index) => {
      const blockLinks = extractTopicLinks(
        [block.heading, block.content].filter(Boolean).join("\n"),
        representationKey,
        index
      );

      for (const link of blockLinks) {
        const dedupeKey = normalizeAnchorName(link.name);
        if (!dedupeKey || globalTopicSeen.has(dedupeKey)) {
          continue;
        }
        globalTopicSeen.add(dedupeKey);
        topicLinks.push(link);
      }
    });
  }

  if (!sections.length && prelude && !representations.narrative?.length) {
    if (!representations.narrative) {
      representations.narrative = [];
    }
    representations.narrative.push(
      ...extractBlocks("narrative", prelude, { msmdf_provenance: "prelude" })
    );
  }

  for (const link of extractTopicLinks(markdown)) {
    const dedupeKey = link.name.toLowerCase();
    if (globalTopicSeen.has(dedupeKey)) {
      continue;
    }
    globalTopicSeen.add(dedupeKey);
    topicLinks.push(link);
  }

  parserDiagnostics.boundaries = buildBoundaryReport(
    sections,
    representations,
    entityIndexBlocks
  );

  if (prelude && sections.length) {
    parserDiagnostics.warnings.push(
      "Content before the first canonical section was preserved as narrative prelude blocks."
    );
  }

  const language = options.language || metadata.language || "english";
  const title = options.title || metadata.title || metadata.topic || null;
  const versions = resolveMsmdfVersions(metadata);

  parserDiagnostics.msmdf_version = versions.version;
  parserDiagnostics.grammar_version = versions.grammar_version;
  parserDiagnostics.msmdf_generation = versions.msmdf_generation;

  if (versions.msmdf_generation === "legacy") {
    parserDiagnostics.warnings.push(
      "Document metadata does not declare MSMDF v3.0; parsed with backward-compatible rules."
    );
  }

  return {
    metadata: {
      ...metadata,
      protocol: metadata.protocol ?? versions.protocol,
      version: metadata.version ?? versions.version,
      grammar_version: metadata.grammar_version ?? versions.grammar_version,
    },
    canonical_note: {
      title,
      map_version: metadata.map_version || metadata.version || versions.version,
      canonical_version:
        metadata.canonical_version || metadata.protocol || versions.version,
    },
    variant: {
      language,
      title,
    },
    source: {
      raw_markdown: markdown,
      source_type: metadata.source_type || "map",
      map_version: metadata.map_version || metadata.version || versions.version,
      canonical_version:
        metadata.canonical_version || metadata.protocol || versions.version,
    },
    representations,
    entity_index: entityIndexBlocks,
    topic_links: topicLinks,
    parser_diagnostics: parserDiagnostics,
  };
}

/**
 * Human-readable list of detected canonical section tags for UI.
 */
export function formatDetectedSectionTags(parsed) {
  const tags = (parsed?.parser_diagnostics?.boundaries ?? [])
    .filter((b) => b.detected && b.tag !== "METADATA")
    .map((b) => `[${b.tag}]`);

  if (parsed?.parser_diagnostics?.prelude?.preserved) {
    tags.unshift("[prelude]");
  }

  return tags;
}

/**
 * Summarize which representation sections were detected (for import UI).
 */
export function summarizeDetectedSections(parsed) {
  return summarizeDetectedSectionsFromRegistry(parsed);
}
