/**
 * MSMDF v1.2 → Canonical Object
 * Parser responsibilities: canonical section boundaries, block extraction, topic links.
 * Never rewrites source prose. Semantic resolution remains downstream.
 */

/** MSMDF v1.2 canonical representation boundary tags (line-whole section openers). */
export const CANONICAL_BOUNDARY_TAGS = Object.freeze([
  "METADATA",
  "NARRATIVE",
  "STRUCTURAL",
  "REVISION",
  "TIMELINE",
  "INTERPRETATIONS",
  "RECALL",
  "ENTITY_INDEX",
]);

const SECTION_ANCHORS = Object.freeze({
  METADATA: "metadata",
  NARRATIVE: "narrative",
  STRUCTURAL: "structural",
  REVISION: "revision",
  TIMELINE: "timeline",
  INTERPRETATIONS: "interpretations",
  RECALL: "recall",
  ENTITY_INDEX: "entity_index",
});

const REPRESENTATION_KEYS = Object.freeze([
  "narrative",
  "structural",
  "revision",
  "timeline",
  "interpretations",
]);

/**
 * MSMDF v1.2 section line: optional leading #, bracket tag, whitespace tolerant.
 * Does NOT treat ## [TAG] as a section boundary (single optional # only).
 */
const SECTION_LINE_PATTERN = new RegExp(
  `^\\s*#?\\s*\\[(${CANONICAL_BOUNDARY_TAGS.join("|")})\\]\\s*$`,
  "i"
);

export const MSMDF_SECTION_SYNTAX_EXAMPLES = Object.freeze([
  "[NARRATIVE]",
  "# [NARRATIVE]",
  "#[NARRATIVE]",
]);

export const MSMDF_SECTION_SYNTAX_HELP =
  "Expected canonical section forms include [NARRATIVE] or # [NARRATIVE] (see MSMDF v1.2).";

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

function sectionKeyFromTag(tag) {
  return SECTION_ANCHORS[tag] ?? null;
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

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

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

function mapSectionToRepresentation(sectionKey) {
  if (sectionKey === "recall") {
    return "revision";
  }

  if (REPRESENTATION_KEYS.includes(sectionKey)) {
    return sectionKey;
  }

  return null;
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

    const key = name.toLowerCase();
    if (seen.has(key)) {
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
 * @returns {{ sections: Array<{ key: string, body: string, tag: string }>, prelude: string|null }}
 */
export function splitSections(markdown) {
  const sections = [];
  const lines = markdown.split("\n");
  let currentKey = null;
  let currentTag = null;
  let buffer = [];
  let preludeLines = [];
  let preludeCaptured = null;

  function pushSection() {
    if (currentKey === null) {
      return;
    }

    sections.push({
      key: currentKey,
      tag: currentTag,
      body: buffer.join("\n").trim(),
    });
    buffer = [];
  }

  for (const line of lines) {
    const tag = matchCanonicalSectionLine(line);

    if (tag) {
      pushSection();

      if (preludeCaptured === null) {
        const preludeBody = preludeLines.join("\n").trim();
        if (preludeBody) {
          preludeCaptured = preludeBody;
        }
        preludeLines = [];
      }

      currentTag = tag;
      currentKey = sectionKeyFromTag(tag);
      continue;
    }

    if (currentKey !== null) {
      buffer.push(line);
    } else {
      preludeLines.push(line);
    }
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

function buildBoundaryReport(sections, representations, entityIndexBlocks, preludeBlocks) {
  const detected = new Map();

  for (const section of sections) {
    detected.set(section.key, {
      tag: section.tag,
      key: section.key,
      detected: true,
    });
  }

  const boundaries = CANONICAL_BOUNDARY_TAGS.map((tag) => {
    const key = sectionKeyFromTag(tag);
    const info = detected.get(key);
    let blockCount = 0;

    if (key === "entity_index") {
      blockCount = entityIndexBlocks.length;
    } else if (key === "metadata") {
      blockCount = info ? 1 : 0;
    } else {
      const repKey = mapSectionToRepresentation(key);
      blockCount = repKey ? (representations[repKey]?.length ?? 0) : 0;
      if (key === "recall") {
        blockCount = (representations.revision ?? []).filter(
          (b) => b.metadata_json?.source_section === "recall"
        ).length;
      }
    }

    return {
      tag,
      key,
      detected: Boolean(info) || blockCount > 0,
      block_count: blockCount,
    };
  });

  return boundaries;
}

/**
 * Parse MSMDF semantic markdown into a canonical object.
 * @param {string} rawMarkdown
 * @param {{ language?: string, title?: string }} [options]
 * @returns {object}
 */
export function parseMapMarkdown(rawMarkdown, options = {}) {
  const markdown = normalizeNewlines(rawMarkdown);
  const { sections, prelude } = splitSections(markdown);

  const metadata = {};
  const representations = {
    narrative: [],
    structural: [],
    revision: [],
    timeline: [],
    interpretations: [],
  };
  const entityIndexBlocks = [];
  const parserDiagnostics = {
    msmdf_version: "1.2",
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
    representations.narrative.push(...preludeBlocks);
    parserDiagnostics.prelude = {
      preserved: true,
      block_count: preludeBlocks.length,
      char_count: prelude.length,
    };
  }

  for (const section of sections) {
    if (section.key === "metadata") {
      Object.assign(metadata, parseMetadataSection(section.body));
      continue;
    }

    if (section.key === "entity_index") {
      entityIndexBlocks.push(
        ...extractBlocks("entity_index", section.body, {
          msmdf_boundary: "entity_index",
        })
      );
      continue;
    }

    const representationKey = mapSectionToRepresentation(section.key);
    if (!representationKey) {
      parserDiagnostics.warnings.push(
        `Unmapped canonical boundary [${section.tag}] was detected but not stored in representations.`
      );
      continue;
    }

    const blocks = extractBlocks(representationKey, section.body, {
      msmdf_boundary: section.tag,
    });

    if (section.key === "recall") {
      for (const block of blocks) {
        block.block_type = block.block_type === "section" ? "recall_section" : "recall";
        block.metadata_json = {
          ...block.metadata_json,
          source_section: "recall",
        };
      }
    }

    representations[representationKey].push(...blocks);

    blocks.forEach((block, index) => {
      const blockLinks = extractTopicLinks(
        [block.heading, block.content].filter(Boolean).join("\n"),
        representationKey,
        index
      );

      for (const link of blockLinks) {
        const dedupeKey = link.name.toLowerCase();
        if (globalTopicSeen.has(dedupeKey)) {
          continue;
        }
        globalTopicSeen.add(dedupeKey);
        topicLinks.push(link);
      }
    });
  }

  if (!sections.length && prelude && !representations.narrative.length) {
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
  const title = options.title || metadata.title || null;

  return {
    metadata,
    canonical_note: {
      title,
      map_version: metadata.map_version || metadata.version || null,
      canonical_version: metadata.canonical_version || metadata.canonical_version || "1.2",
    },
    variant: {
      language,
      title,
    },
    source: {
      raw_markdown: markdown,
      source_type: metadata.source_type || "map",
      map_version: metadata.map_version || metadata.version || null,
      canonical_version: metadata.canonical_version || metadata.canonical_version || "1.2",
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
  const reps = parsed?.representations ?? {};
  const boundaries = parsed?.parser_diagnostics?.boundaries ?? [];

  const boundaryDetected = (tag) =>
    boundaries.some((b) => b.tag === tag && b.detected);

  return {
    metadata:
      Boolean(parsed?.metadata && Object.keys(parsed.metadata).length) ||
      boundaryDetected("METADATA"),
    narrative: (reps.narrative?.length ?? 0) > 0 || boundaryDetected("NARRATIVE"),
    structural: (reps.structural?.length ?? 0) > 0 || boundaryDetected("STRUCTURAL"),
    revision: (reps.revision?.length ?? 0) > 0 || boundaryDetected("REVISION"),
    timeline: (reps.timeline?.length ?? 0) > 0 || boundaryDetected("TIMELINE"),
    interpretations:
      (reps.interpretations?.length ?? 0) > 0 || boundaryDetected("INTERPRETATIONS"),
    recall:
      (reps.revision ?? []).some((b) => b.metadata_json?.source_section === "recall") ||
      boundaryDetected("RECALL"),
    entity_index:
      (parsed?.entity_index?.length ?? 0) > 0 || boundaryDetected("ENTITY_INDEX"),
    prelude: Boolean(parsed?.parser_diagnostics?.prelude?.preserved),
  };
}
