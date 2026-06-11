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
    .filter((def) => def.showTab !== false && def.role !== "infrastructure")
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
