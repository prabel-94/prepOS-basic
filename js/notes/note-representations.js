/**
 * PrepOS representation registry — single source of truth for MSMDF sections.
 * Parser, storage, selectors, renderer tabs, and import UI derive from this module.
 */

/** @typedef {"cognition" | "cognition-merged" | "infrastructure"} RepresentationRole */

/**
 * @typedef {object} RepresentationEntry
 * @property {string} id — internal key (e.g. narrative, quotes)
 * @property {string} msmdfTag — bracket tag without brackets (e.g. NARRATIVE)
 * @property {RepresentationRole} role
 * @property {string} [tabLabel]
 * @property {number} [tabOrder]
 * @property {boolean} [persist]
 * @property {"blocks"} [tabPolicy]
 * @property {string} [readingClass]
 * @property {string} [importLabel]
 * @property {string} [mapsTo] — merge into another representation bucket (e.g. recall → revision)
 * @property {string} [storageField] — separate parsed field (e.g. entity_index)
 * @property {boolean} [recallTransform] — apply recall block_type metadata
 */

/** @type {ReadonlyArray<RepresentationEntry>} */
export const REPRESENTATION_REGISTRY = Object.freeze([
  {
    id: "metadata",
    msmdfTag: "METADATA",
    role: "infrastructure",
    importLabel: "Metadata",
  },
  {
    id: "narrative",
    msmdfTag: "NARRATIVE",
    role: "cognition",
    tabLabel: "Narrative",
    tabOrder: 10,
    persist: true,
    tabPolicy: "blocks",
    readingClass: "semantic-reading-flow",
    importLabel: "Narrative",
  },
  {
    id: "structural",
    msmdfTag: "STRUCTURAL",
    role: "cognition",
    tabLabel: "Structural",
    tabOrder: 20,
    persist: true,
    tabPolicy: "blocks",
    readingClass: "semantic-structural-flow",
    importLabel: "Structural",
  },
  {
    id: "revision",
    msmdfTag: "REVISION",
    role: "cognition",
    tabLabel: "Revision",
    tabOrder: 30,
    persist: true,
    tabPolicy: "blocks",
    readingClass: "semantic-revision-compact",
    importLabel: "Revision",
  },
  {
    id: "timeline",
    msmdfTag: "TIMELINE",
    role: "cognition",
    tabLabel: "Timeline",
    tabOrder: 40,
    persist: true,
    tabPolicy: "blocks",
    readingClass: "semantic-timeline-linear",
    importLabel: "Timeline",
  },
  {
    id: "interpretations",
    msmdfTag: "INTERPRETATIONS",
    role: "cognition",
    tabLabel: "Interpretations",
    tabOrder: 50,
    persist: true,
    tabPolicy: "blocks",
    readingClass: "semantic-interpretations-compact",
    importLabel: "Interpretations",
  },
  {
    id: "quotes",
    msmdfTag: "QUOTES",
    role: "cognition",
    tabLabel: "Quotes",
    tabOrder: 55,
    persist: true,
    tabPolicy: "blocks",
    readingClass: "semantic-quotes-gallery",
    importLabel: "Quotes",
  },
  {
    id: "recall",
    msmdfTag: "RECALL",
    role: "cognition-merged",
    mapsTo: "revision",
    persist: true,
    recallTransform: true,
    importLabel: "Recall",
  },
  {
    id: "entity_index",
    msmdfTag: "ENTITY_INDEX",
    role: "infrastructure",
    storageField: "entity_index",
    importLabel: "Entity index",
  },
]);

/** MSMDF section boundary tags (registry order). */
export const CANONICAL_BOUNDARY_TAGS = Object.freeze(
  REPRESENTATION_REGISTRY.map((entry) => entry.msmdfTag)
);

const REGISTRY_BY_ID = new Map(REPRESENTATION_REGISTRY.map((entry) => [entry.id, entry]));
const REGISTRY_BY_TAG = new Map(
  REPRESENTATION_REGISTRY.map((entry) => [entry.msmdfTag.toUpperCase(), entry])
);

/** @type {Readonly<Record<string, string>>} */
export const SECTION_ANCHORS = Object.freeze(
  Object.fromEntries(REPRESENTATION_REGISTRY.map((entry) => [entry.msmdfTag, entry.id]))
);

let persistedIdsCache = null;
let tabEligibleCache = null;

/**
 * @param {string} tag — uppercased MSMDF tag
 * @returns {string|null}
 */
export function getSectionKeyFromTag(tag) {
  return REGISTRY_BY_TAG.get(String(tag ?? "").toUpperCase())?.id ?? null;
}

/**
 * @param {string} sectionKey
 * @returns {RepresentationEntry|null}
 */
export function getRegistryEntryById(sectionKey) {
  return REGISTRY_BY_ID.get(sectionKey) ?? null;
}

/**
 * Unique representation bucket ids persisted to note_blocks (dedupes mapsTo).
 * @returns {readonly string[]}
 */
export function getPersistedRepresentationIds() {
  if (persistedIdsCache) {
    return persistedIdsCache;
  }

  const bucketOrder = new Map();
  for (const entry of REPRESENTATION_REGISTRY) {
    if (!entry.persist || entry.storageField) {
      continue;
    }

    const bucket = entry.mapsTo ?? entry.id;
    const order = entry.tabOrder ?? entry.mapsTo
      ? (REGISTRY_BY_ID.get(entry.mapsTo)?.tabOrder ?? 999)
      : (entry.tabOrder ?? 999);

    if (!bucketOrder.has(bucket)) {
      bucketOrder.set(bucket, order);
    }
  }

  persistedIdsCache = Object.freeze(
    [...bucketOrder.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([id]) => id)
  );

  return persistedIdsCache;
}

/**
 * @returns {Record<string, []>}
 */
export function createEmptyRepresentations() {
  const representations = {};

  for (const id of getPersistedRepresentationIds()) {
    representations[id] = [];
  }

  return representations;
}

/**
 * @param {string} sectionKey
 * @returns {string|null}
 */
export function mapSectionToRepresentation(sectionKey) {
  const entry = getRegistryEntryById(sectionKey);
  if (!entry?.persist || entry.storageField) {
    return null;
  }

  return entry.mapsTo ?? entry.id;
}

/**
 * @param {string} sectionKey
 * @returns {boolean}
 */
export function isMetadataSection(sectionKey) {
  return sectionKey === "metadata";
}

/**
 * @param {string} sectionKey
 * @returns {boolean}
 */
export function isEntityIndexSection(sectionKey) {
  return getRegistryEntryById(sectionKey)?.storageField === "entity_index";
}

/**
 * @param {string} sectionKey
 * @returns {boolean}
 */
export function shouldApplyRecallTransform(sectionKey) {
  return Boolean(getRegistryEntryById(sectionKey)?.recallTransform);
}

/**
 * @param {object[]} blocks — mutated in place
 */
export function applyRecallBlockTransform(blocks) {
  for (const block of blocks) {
    block.block_type = block.block_type === "section" ? "recall_section" : "recall";
    block.metadata_json = {
      ...block.metadata_json,
      source_section: "recall",
    };
  }
}

/**
 * Cognition representations eligible for reader tabs (excludes merged-only sources).
 * @returns {readonly RepresentationEntry[]}
 */
export function getTabEligibleRepresentations() {
  if (tabEligibleCache) {
    return tabEligibleCache;
  }

  tabEligibleCache = Object.freeze(
    REPRESENTATION_REGISTRY.filter(
      (entry) => entry.role === "cognition" && entry.tabLabel && entry.tabPolicy === "blocks"
    ).sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0))
  );

  return tabEligibleCache;
}

/**
 * @param {string} representationKey
 * @returns {string|undefined}
 */
export function getReadingClassForRepresentation(representationKey) {
  const entry = REGISTRY_BY_ID.get(representationKey);
  if (entry?.readingClass) {
    return entry.readingClass;
  }

  const mergedSource = REPRESENTATION_REGISTRY.find(
    (candidate) => candidate.mapsTo === representationKey && candidate.readingClass
  );

  return mergedSource?.readingClass;
}

/**
 * Import UI section labels (includes prelude handled separately).
 * @returns {Readonly<Record<string, string>>}
 */
export function getImportSectionLabels() {
  /** @type {Record<string, string>} */
  const labels = {
    prelude: "Prelude (pre-section)",
  };

  for (const entry of REPRESENTATION_REGISTRY) {
    if (entry.importLabel) {
      labels[entry.id] = entry.importLabel;
    }
  }

  return Object.freeze(labels);
}

/**
 * @param {Array<{ key: string, tag: string }>} sections
 * @param {Record<string, object[]>} representations
 * @param {object[]} entityIndexBlocks
 */
export function buildBoundaryReport(sections, representations, entityIndexBlocks) {
  const detected = new Map();

  for (const section of sections) {
    detected.set(section.key, {
      tag: section.tag,
      key: section.key,
      detected: true,
    });
  }

  return CANONICAL_BOUNDARY_TAGS.map((tag) => {
    const entry = REGISTRY_BY_TAG.get(tag);
    const key = entry?.id ?? getSectionKeyFromTag(tag);
    const info = key ? detected.get(key) : null;
    let blockCount = 0;

    if (key === "metadata") {
      blockCount = info ? 1 : 0;
    } else if (entry?.storageField === "entity_index") {
      blockCount = entityIndexBlocks.length;
    } else if (entry?.recallTransform) {
      blockCount = (representations.revision ?? []).filter(
        (block) => block.metadata_json?.source_section === "recall"
      ).length;
    } else if (entry?.persist && !entry.storageField) {
      const bucket = entry.mapsTo ?? entry.id;
      blockCount = representations[bucket]?.length ?? 0;
    }

    return {
      tag,
      key,
      detected: Boolean(info) || blockCount > 0,
      block_count: blockCount,
    };
  });
}

/**
 * Summarize detected sections for import UI.
 * @param {object} parsed
 */
export function summarizeDetectedSectionsFromRegistry(parsed) {
  const reps = parsed?.representations ?? {};
  const boundaries = parsed?.parser_diagnostics?.boundaries ?? [];

  const boundaryDetected = (tag) =>
    boundaries.some((boundary) => boundary.tag === tag && boundary.detected);

  /** @type {Record<string, boolean>} */
  const summary = {
    prelude: Boolean(parsed?.parser_diagnostics?.prelude?.preserved),
  };

  for (const entry of REPRESENTATION_REGISTRY) {
    if (entry.id === "metadata") {
      summary.metadata =
        Boolean(parsed?.metadata && Object.keys(parsed.metadata).length) ||
        boundaryDetected(entry.msmdfTag);
      continue;
    }

    if (entry.storageField === "entity_index") {
      summary.entity_index =
        (parsed?.entity_index?.length ?? 0) > 0 || boundaryDetected(entry.msmdfTag);
      continue;
    }

    if (entry.recallTransform) {
      summary.recall =
        (reps.revision ?? []).some(
          (block) => block.metadata_json?.source_section === "recall"
        ) || boundaryDetected(entry.msmdfTag);
      continue;
    }

    if (entry.persist && entry.role === "cognition") {
      summary[entry.id] =
        (reps[entry.id]?.length ?? 0) > 0 || boundaryDetected(entry.msmdfTag);
    }
  }

  return summary;
}
