/**
 * Maps rendered draft-edit units to character ranges in raw MSMDF markdown.
 */

import { parseMapMarkdown, splitSections } from "./map-parser.js";
import { isHighlightedQuoteText } from "./quote-highlight.js";
import { isChronologyParagraph } from "./note-chronology.js";
import {
  mapDefinitionToRepresentationBucket,
  resolveSectionCatalog,
} from "./note-section-catalog.js";

function normalizeNewlines(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function isDividerLine(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed === "---" || /^-{3,}$/.test(trimmed);
}

/**
 * @param {string} text
 * @param {string} representation
 */
export function isParagraphEditableForDraft(text, representation) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return false;
  }

  if (isDividerLine(trimmed)) {
    return false;
  }

  if (isChronologyParagraph(trimmed)) {
    return representation === "narrative" || representation === "timeline";
  }

  if (representation === "quotes" && isHighlightedQuoteText(trimmed)) {
    return true;
  }

  if (trimmed.toLowerCase() === "retrieval anchor:") {
    return false;
  }

  return true;
}

function unitId(representation, blockSequence, paraKey) {
  return `${representation}:${blockSequence}:${paraKey}`;
}

function sortBlocks(blocks = []) {
  return [...blocks].sort(
    (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)
  );
}

function getEditableRepresentations(context = {}) {
  return new Set(
    resolveSectionCatalog(context)
      .filter((def) => def.persist && !def.storageField && def.role !== "infrastructure")
      .map((def) => mapDefinitionToRepresentationBucket(def))
      .filter(Boolean)
  );
}

/**
 * @param {string} markdown
 * @param {string} needle
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @param {number} cursor
 */
function indexOfInRange(markdown, needle, rangeStart, rangeEnd, cursor) {
  const from = Math.max(rangeStart, cursor);
  const slice = markdown.slice(from, rangeEnd);
  const relative = slice.indexOf(needle);

  if (relative === -1) {
    return -1;
  }

  return from + relative;
}

/**
 * @param {string} rawMarkdown
 * @param {import('./note-section-catalog.js').SectionCatalogContext} [context]
 * @returns {Map<string, object>}
 */
export function buildEditableUnitMap(rawMarkdown, context = {}) {
  const markdown = normalizeNewlines(rawMarkdown);
  const parsed = parseMapMarkdown(markdown, {
    sectionExtensions: context.customDefinitions ?? [],
  });
  const units = new Map();
  const { sections } = splitSections(markdown, context);

  const sectionRangesByTag = new Map();
  for (const section of sections) {
    sectionRangesByTag.set(String(section.tag).toUpperCase(), {
      start: section.bodyStart ?? 0,
      end: section.bodyEnd ?? markdown.length,
    });
  }

  const sectionCursors = new Map();

  function nextPosition(needle, boundaryTag) {
    const tag = String(boundaryTag ?? "").toUpperCase();
    const range = sectionRangesByTag.get(tag) ?? {
      start: 0,
      end: markdown.length,
    };
    const cursor = sectionCursors.get(tag) ?? range.start;
    const pos = indexOfInRange(markdown, needle, range.start, range.end, cursor);

    if (pos !== -1) {
      sectionCursors.set(tag, pos + needle.length);
    }

    return pos;
  }

  for (const representation of getEditableRepresentations(context)) {
    const blocks = parsed.representations?.[representation] ?? [];
    if (!blocks.length) {
      continue;
    }

    for (const block of sortBlocks(blocks)) {
      const blockSeq = block.sequence_order ?? 0;
      const boundaryTag = block.metadata_json?.msmdf_boundary ?? null;

      if (block.heading && block.block_type === "section") {
        const level = Math.min(Math.max(block.hierarchy_level ?? 2, 1), 6);
        const headingLine = `${"#".repeat(level)} ${block.heading}`;
        const pos = nextPosition(headingLine, boundaryTag);
        if (pos !== -1) {
          const id = unitId(representation, blockSeq, "heading");
          units.set(id, {
            id,
            representation,
            blockSequence: blockSeq,
            paraIndex: -1,
            kind: "heading",
            sourceText: headingLine,
            start: pos,
            end: pos + headingLine.length,
            editable: true,
          });
        }
      }

      if (block.block_type === "retrieval_anchor") {
        continue;
      }

      if (block.block_type === "list" && block.content) {
        const lines = block.content.split("\n");
        for (let li = 0; li < lines.length; li += 1) {
          const line = lines[li].trimEnd();
          if (!line.trim()) {
            continue;
          }

          const pos = nextPosition(line, boundaryTag);
          if (pos === -1) {
            continue;
          }

          const id = unitId(representation, blockSeq, `list-${li}`);
          units.set(id, {
            id,
            representation,
            blockSequence: blockSeq,
            paraIndex: li,
            kind: "list-item",
            sourceText: line,
            start: pos,
            end: pos + line.length,
            editable: true,
          });
        }
        continue;
      }

      const content = block.content?.trim();
      if (!content) {
        continue;
      }

      const paragraphs = content
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);

      for (let pi = 0; pi < paragraphs.length; pi += 1) {
        const para = paragraphs[pi];
        if (!isParagraphEditableForDraft(para, representation)) {
          continue;
        }

        const pos = nextPosition(para, boundaryTag);
        if (pos === -1) {
          continue;
        }

        const id = unitId(representation, blockSeq, pi);
        units.set(id, {
          id,
          representation,
          blockSequence: blockSeq,
          paraIndex: pi,
          kind: isChronologyParagraph(para) ? "chronology" : "paragraph",
          sourceText: para,
          start: pos,
          end: pos + para.length,
          editable: true,
        });
      }
    }
  }

  return units;
}

/**
 * @param {Map<string, object>} units
 * @param {string} representation
 * @param {number} blockSequence
 * @param {number|string} paraKey
 * @returns {string|null}
 */
export function lookupEditableUnitId(units, representation, blockSequence, paraKey) {
  const id = unitId(representation, blockSequence, paraKey);
  return units.has(id) ? id : null;
}
