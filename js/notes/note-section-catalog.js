/**
 * Unified section catalog — builtins (MSMDF) today; custom extensions in Phase 2.
 * Phase 1 modal, markdown helpers, and future parser changes use this module only.
 */

import {
  REPRESENTATION_REGISTRY,
  getRegistryEntryById,
} from "./note-representations.js";

/** @typedef {"builtin" | "custom"} SectionSource */

/** @typedef {"infrastructure" | "cognition" | "cognition-merged"} SectionRole */

/**
 * @typedef {
 *   | "generic"
 *   | "narrative"
 *   | "expansion"
 *   | "structural"
 *   | "timeline"
 *   | "quotes"
 *   | "revision"
 *   | "interpretations"
 * } RendererProfile
 */

/**
 * @typedef {object} SectionDefinition
 * @property {string} id
 * @property {string} boundaryTag
 * @property {string} label
 * @property {SectionSource} source
 * @property {SectionRole} role
 * @property {number} [tabOrder]
 * @property {boolean} [showTab]
 * @property {boolean} [persist]
 * @property {RendererProfile} [rendererProfile]
 * @property {string} [mapsTo]
 * @property {string} [readingClass]
 * @property {boolean} [recallTransform]
 * @property {string} [storageField]
 * @property {object} [metadata]
 */

/**
 * @typedef {object} SectionCatalogContext
 * @property {SectionDefinition[]} [customDefinitions]
 */

const BUILTIN_RENDERER_PROFILES = Object.freeze({
  narrative: "narrative",
  expansion: "expansion",
  structural: "structural",
  revision: "revision",
  timeline: "timeline",
  interpretations: "interpretations",
  quotes: "quotes",
  recall: "revision",
});

/**
 * @param {import('./note-representations.js').RepresentationEntry} entry
 * @returns {SectionDefinition}
 */
function registryEntryToSectionDefinition(entry) {
  const mapsToEntry = entry.mapsTo ? getRegistryEntryById(entry.mapsTo) : null;
  const tabOrder =
    entry.tabOrder ?? mapsToEntry?.tabOrder ?? (entry.role === "infrastructure" ? 0 : 999);

  let label = entry.importLabel ?? entry.tabLabel ?? entry.id;
  if (entry.recallTransform) {
    label = `${label} (appears under Revision)`;
  }

  return {
    id: entry.id,
    boundaryTag: entry.msmdfTag,
    label,
    source: "builtin",
    role: entry.role,
    tabOrder,
    showTab:
      entry.role === "cognition" ||
      (entry.role === "cognition-merged" && Boolean(entry.mapsTo)),
    persist: Boolean(entry.persist),
    rendererProfile: BUILTIN_RENDERER_PROFILES[entry.id] ?? "generic",
    mapsTo: entry.mapsTo,
    readingClass: entry.readingClass,
    recallTransform: entry.recallTransform,
    storageField: entry.storageField,
  };
}

let builtinCache = null;

/**
 * @returns {readonly SectionDefinition[]}
 */
export function getBuiltinSectionDefinitions() {
  if (builtinCache) {
    return builtinCache;
  }

  builtinCache = Object.freeze(
    REPRESENTATION_REGISTRY.map(registryEntryToSectionDefinition)
  );

  return builtinCache;
}

/**
 * @param {SectionDefinition[]} builtins
 * @param {SectionDefinition[]} custom
 * @returns {SectionDefinition[]}
 */
export function mergeSectionCatalog(builtins, custom = []) {
  const builtinIds = new Set(builtins.map((def) => def.id));
  const builtinTags = new Set(builtins.map((def) => def.boundaryTag.toUpperCase()));

  const merged = [...builtins];

  for (const def of custom) {
    if (def.source !== "custom") {
      continue;
    }

    if (builtinIds.has(def.id)) {
      throw new Error(`Custom section id "${def.id}" collides with a built-in section.`);
    }

    if (builtinTags.has(def.boundaryTag.toUpperCase())) {
      throw new Error(
        `Custom section tag "${def.boundaryTag}" collides with a built-in MSMDF tag.`
      );
    }

    merged.push(def);
  }

  return merged;
}

/**
 * @param {SectionCatalogContext} [context]
 * @returns {SectionDefinition[]}
 */
export function resolveSectionCatalog(context = {}) {
  const builtins = getBuiltinSectionDefinitions();
  const custom = context.customDefinitions ?? [];
  return mergeSectionCatalog(builtins, custom);
}

/**
 * Sections eligible for the "+ Add section" picker (Phase 1: builtins only).
 * @param {SectionCatalogContext} [context]
 * @returns {SectionDefinition[]}
 */
export function getAddableSectionDefinitions(context = {}) {
  return resolveSectionCatalog(context)
    .filter(
      (def) =>
        def.persist &&
        !def.storageField &&
        def.role !== "infrastructure"
    )
    .sort((a, b) => (a.tabOrder ?? 999) - (b.tabOrder ?? 999) || a.label.localeCompare(b.label));
}

/**
 * @param {SectionCatalogContext} [context]
 * @returns {SectionDefinition[]}
 */
export function getTabSectionDefinitions(context = {}) {
  return resolveSectionCatalog(context)
    .filter(
      (def) =>
        def.showTab !== false &&
        def.role !== "infrastructure" &&
        !def.mapsTo &&
        def.role !== "cognition-merged"
    )
    .sort((a, b) => (a.tabOrder ?? 999) - (b.tabOrder ?? 999) || a.label.localeCompare(b.label));
}

/**
 * @param {string} id
 * @param {SectionCatalogContext} [context]
 * @returns {SectionDefinition|null}
 */
export function getDefinitionById(id, context = {}) {
  return resolveSectionCatalog(context).find((def) => def.id === id) ?? null;
}

/**
 * @param {string} tag
 * @param {SectionCatalogContext} [context]
 * @returns {SectionDefinition|null}
 */
export function getDefinitionByBoundaryTag(tag, context = {}) {
  const upper = String(tag ?? "").trim().toUpperCase();
  return (
    resolveSectionCatalog(context).find(
      (def) => def.boundaryTag.toUpperCase() === upper
    ) ?? null
  );
}

/**
 * @param {SectionDefinition} def
 * @returns {string|null}
 */
export function mapDefinitionToRepresentationBucket(def) {
  if (!def?.persist || def.storageField) {
    return null;
  }

  return def.mapsTo ?? def.id;
}

export const MAX_CUSTOM_SECTIONS = 10;

export const CUSTOM_RENDERER_PROFILES = Object.freeze([
  { id: "generic", label: "Generic prose" },
  { id: "narrative", label: "Narrative" },
  { id: "expansion", label: "Expansion" },
  { id: "structural", label: "Structural" },
  { id: "timeline", label: "Timeline" },
  { id: "quotes", label: "Quotes" },
  { id: "revision", label: "Revision" },
  { id: "interpretations", label: "Interpretations" },
]);

/**
 * @param {string} bucket
 * @param {SectionCatalogContext} [context]
 * @returns {SectionDefinition|null}
 */
export function getDefinitionByRepresentationBucket(bucket, context = {}) {
  const key = String(bucket ?? "").trim();
  if (!key) {
    return null;
  }

  return (
    resolveSectionCatalog(context).find(
      (def) => mapDefinitionToRepresentationBucket(def) === key
    ) ?? null
  );
}

/**
 * @param {SectionCatalogContext} [context]
 * @returns {Record<string, object[]>}
 */
export function createRepresentationBuckets(context = {}) {
  const buckets = {};

  for (const def of resolveSectionCatalog(context)) {
    if (!def.persist || def.storageField) {
      continue;
    }

    const bucket = mapDefinitionToRepresentationBucket(def);
    if (!bucket) {
      continue;
    }

    if (!buckets[bucket]) {
      buckets[bucket] = [];
    }
  }

  return buckets;
}

/**
 * @param {string} label
 * @returns {string}
 */
export function slugifySectionLabel(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

/**
 * @param {string} id — snake_case slug
 * @returns {string}
 */
export function sectionIdToBoundaryTag(id) {
  const slug = String(id ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug) {
    throw new Error("Section name must include letters or numbers.");
  }

  return `EXT:${slug}`;
}

/**
 * @param {object} options
 * @param {string} options.label
 * @param {RendererProfile} [options.rendererProfile]
 * @param {number} [options.tabOrder]
 * @param {SectionCatalogContext} [options.context]
 * @returns {SectionDefinition}
 */
export function buildCustomSectionDefinition({
  label,
  rendererProfile = "generic",
  tabOrder = 520,
  context = {},
}) {
  const trimmedLabel = String(label ?? "").trim();
  if (!trimmedLabel) {
    throw new Error("Custom section name is required.");
  }

  const id = slugifySectionLabel(trimmedLabel);
  if (!id) {
    throw new Error("Section name must include letters or numbers.");
  }

  const customCount = (context.customDefinitions ?? []).filter(
    (def) => def.source === "custom"
  ).length;

  if (customCount >= MAX_CUSTOM_SECTIONS) {
    throw new Error(`At most ${MAX_CUSTOM_SECTIONS} custom sections per variant.`);
  }

  if (getDefinitionById(id, context)) {
    throw new Error(`A section named "${trimmedLabel}" already exists.`);
  }

  const boundaryTag = sectionIdToBoundaryTag(id);
  if (getDefinitionByBoundaryTag(boundaryTag, context)) {
    throw new Error(`Section tag [${boundaryTag}] is already in use.`);
  }

  return {
    id,
    boundaryTag,
    label: trimmedLabel,
    source: "custom",
    role: "cognition",
    tabOrder,
    showTab: true,
    persist: true,
    rendererProfile,
    readingClass: "semantic-reading-flow",
    metadata: {
      created_at: new Date().toISOString(),
    },
  };
}
