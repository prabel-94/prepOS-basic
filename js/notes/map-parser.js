/**
 * MSMDF v1 → Canonical Object
 * Parser responsibilities only: section detection, extraction, topic links.
 * Never rewrites source prose.
 */

const SECTION_ANCHORS = Object.freeze({
  METADATA: "metadata",
  NARRATIVE: "narrative",
  STRUCTURAL: "structural",
  REVISION: "revision",
  TIMELINE: "timeline",
  INTERPRETATIONS: "interpretations",
  RECALL: "recall",
});

const REPRESENTATION_KEYS = Object.freeze([
  "narrative",
  "structural",
  "revision",
  "timeline",
  "interpretations",
]);

const ANCHOR_PATTERN =
  /^#\s*\[(METADATA|NARRATIVE|STRUCTURAL|REVISION|TIMELINE|INTERPRETATIONS|RECALL)\]\s*$/im;

const TOPIC_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

function normalizeNewlines(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
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

function extractBlocks(sectionKey, body) {
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
        metadata_json: current.metadata_json ?? {},
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

function splitSections(markdown) {
  const sections = [];
  const lines = markdown.split("\n");
  let currentKey = null;
  let buffer = [];

  function pushSection() {
    if (currentKey === null) {
      return;
    }

    sections.push({
      key: currentKey,
      body: buffer.join("\n").trim(),
    });
    buffer = [];
  }

  for (const line of lines) {
    const anchorMatch = line.match(
      /^#\s*\[(METADATA|NARRATIVE|STRUCTURAL|REVISION|TIMELINE|INTERPRETATIONS|RECALL)\]\s*$/i
    );

    if (anchorMatch) {
      pushSection();
      currentKey = SECTION_ANCHORS[anchorMatch[1].toUpperCase()];
      continue;
    }

    if (currentKey !== null) {
      buffer.push(line);
    }
  }

  pushSection();
  return sections;
}

/**
 * Parse MSMDF semantic markdown into a canonical object.
 * @param {string} rawMarkdown
 * @param {{ language?: string, title?: string }} [options]
 * @returns {object}
 */
export function parseMapMarkdown(rawMarkdown, options = {}) {
  const markdown = normalizeNewlines(rawMarkdown);
  const sections = splitSections(markdown);

  const metadata = {};
  const representations = {
    narrative: [],
    structural: [],
    revision: [],
    timeline: [],
    interpretations: [],
  };

  const topicLinks = [];
  const globalTopicSeen = new Set();

  for (const section of sections) {
    if (section.key === "metadata") {
      Object.assign(metadata, parseMetadataSection(section.body));
      continue;
    }

    const representationKey = mapSectionToRepresentation(section.key);
    if (!representationKey) {
      continue;
    }

    const blocks = extractBlocks(representationKey, section.body);

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

  const preambleEnd = markdown.search(ANCHOR_PATTERN);
  const preamble =
    preambleEnd > 0 ? markdown.slice(0, preambleEnd).trim() : "";

  if (preamble && !sections.length) {
    representations.narrative.push(
      ...extractBlocks("narrative", preamble)
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

  const language =
    options.language || metadata.language || "english";
  const title = options.title || metadata.title || null;

  return {
    metadata,
    canonical_note: {
      title,
      map_version: metadata.map_version || metadata.version || null,
      canonical_version: metadata.canonical_version || null,
    },
    variant: {
      language,
      title,
    },
    source: {
      raw_markdown: markdown,
      source_type: metadata.source_type || "map",
      map_version: metadata.map_version || metadata.version || null,
      canonical_version: metadata.canonical_version || null,
    },
    representations,
    topic_links: topicLinks,
  };
}

/**
 * Summarize which representation sections were detected (for import UI).
 */
export function summarizeDetectedSections(parsed) {
  const reps = parsed?.representations ?? {};
  return {
    metadata: Boolean(parsed?.metadata && Object.keys(parsed.metadata).length),
    narrative: (reps.narrative?.length ?? 0) > 0,
    structural: (reps.structural?.length ?? 0) > 0,
    revision: (reps.revision?.length ?? 0) > 0,
    timeline: (reps.timeline?.length ?? 0) > 0,
    interpretations: (reps.interpretations?.length ?? 0) > 0,
    recall: (reps.revision ?? []).some(
      (b) => b.metadata_json?.source_section === "recall"
    ),
  };
}
