/**
 * Maps rendered draft-edit units to character ranges in raw MSMDF markdown.
 */

import { parseMapMarkdown } from "./map-parser.js";
import { isHighlightedQuoteText } from "./quote-highlight.js";

const EDITABLE_REPRESENTATIONS = new Set([
  "narrative",
  "revision",
  "interpretations",
  "quotes",
  "timeline",
  "structural",
]);

function normalizeNewlines(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function isDividerLine(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed === "---" || /^-{3,}$/.test(trimmed);
}

function isChronologyParagraph(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3) {
    return false;
  }

  return lines.some((line) => line === "---" || /^-{3,}$/.test(line));
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
    return false;
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

/**
 * @param {string} rawMarkdown
 * @returns {Map<string, object>}
 */
export function buildEditableUnitMap(rawMarkdown) {
  const markdown = normalizeNewlines(rawMarkdown);
  const parsed = parseMapMarkdown(markdown);
  const units = new Map();
  let cursor = 0;

  for (const representation of EDITABLE_REPRESENTATIONS) {
    const blocks = parsed.representations?.[representation] ?? [];
    if (!blocks.length) {
      continue;
    }

    for (const block of sortBlocks(blocks)) {
      const blockSeq = block.sequence_order ?? 0;

      if (block.heading && block.block_type === "section") {
        const level = Math.min(Math.max(block.hierarchy_level ?? 2, 1), 6);
        const headingLine = `${"#".repeat(level)} ${block.heading}`;
        const pos = markdown.indexOf(headingLine, cursor);
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
          cursor = pos + headingLine.length;
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

          const pos = markdown.indexOf(line, cursor);
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
          cursor = pos + line.length;
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

        const pos = markdown.indexOf(para, cursor);
        if (pos === -1) {
          continue;
        }

        const id = unitId(representation, blockSeq, pi);
        units.set(id, {
          id,
          representation,
          blockSequence: blockSeq,
          paraIndex: pi,
          kind: "paragraph",
          sourceText: para,
          start: pos,
          end: pos + para.length,
          editable: true,
        });
        cursor = pos + para.length;
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
