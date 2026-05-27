/**
 * Semantic hierarchy rendering — maps parser heading levels to cognition roles.
 * Pure helpers (no DOM). MSMDF levels 1–6 are semantic depth, not just ATX markers.
 */

export const SEMANTIC_LEVEL_MIN = 1;
export const SEMANTIC_LEVEL_MAX = 6;

export const SEMANTIC_LEVEL_LABELS = Object.freeze({
  1: "major conceptual phase",
  2: "important subsection",
  3: "supporting semantic cluster",
  4: "detail grouping",
  5: "micro semantic label",
  6: "micro semantic label",
});

/**
 * @param {number|null|undefined} level
 * @returns {number} 1–6
 */
export function clampParserHeadingLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n < 1) {
    return 2;
  }

  return Math.min(SEMANTIC_LEVEL_MAX, Math.max(SEMANTIC_LEVEL_MIN, Math.round(n)));
}

/**
 * Resolve semantic cognition level for rendering.
 *
 * @param {number|null|undefined} parserLevel — block.hierarchy_level from MSMDF
 * @param {{ depth?: number, representation?: string }} [context]
 * @returns {number} 1–6
 */
export function resolveSemanticLevel(parserLevel, { depth = 0, representation = "narrative" } = {}) {
  const base = clampParserHeadingLevel(parserLevel);

  if (representation === "structural" && depth > 0) {
    return Math.min(SEMANTIC_LEVEL_MAX, base + Math.min(depth, 1));
  }

  return base;
}

/**
 * Document heading tag (h2–h6). Page title remains h1 outside this system.
 *
 * @param {number} semanticLevel
 * @returns {string}
 */
export function semanticHeadingTag(semanticLevel) {
  const level = clampParserHeadingLevel(semanticLevel);
  return `h${Math.min(6, level + 1)}`;
}

/**
 * @param {number} semanticLevel
 * @returns {string}
 */
export function semanticHeadingClasses(semanticLevel) {
  const level = clampParserHeadingLevel(semanticLevel);
  return `semantic-heading semantic-heading--l${level}`;
}

/**
 * @param {number} semanticLevel
 * @returns {string}
 */
export function semanticLevelClass(semanticLevel) {
  return `semantic-level-${clampParserHeadingLevel(semanticLevel)}`;
}

/**
 * @param {string} representationKey
 * @returns {boolean}
 */
export function isNarrativeRepresentation(representationKey) {
  return representationKey === "narrative";
}

/**
 * Narrative stays fluid (no collapse). Structural uses tree toggles. Others may collapse.
 *
 * @param {object} block
 * @param {string} representationKey
 * @returns {boolean}
 */
export function shouldCollapseBlock(block, representationKey) {
  if (representationKey === "narrative" || representationKey === "structural") {
    return false;
  }

  return (
    block.block_type === "section" ||
    block.block_type === "recall_section" ||
    Boolean(block.heading)
  );
}

/**
 * @param {number} semanticLevel
 * @param {string} representationKey
 * @returns {string}
 */
export function semanticBlockClasses(semanticLevel, representationKey) {
  const parts = [
    "semantic-block",
    semanticLevelClass(semanticLevel),
    `semantic-block--${representationKey}`,
  ];

  return parts.join(" ");
}
