/**
 * Representation-aware note renderer (semantic cognition hierarchy).
 */

import { renderSemanticAnchors } from "../anchors/anchor-renderer.js";
import { resolveTopicLinks } from "./note-topic-links.js";
import {
  clampParserHeadingLevel,
  resolveSemanticLevel,
  semanticBlockClasses,
  semanticHeadingClasses,
  semanticHeadingTag,
  semanticLevelClass,
  shouldCollapseBlock,
} from "./semantic-hierarchy.js";
import {
  countWikiLinksInText,
  createAnchorOccurrenceTracker,
  defaultCollapsibleOpen,
  defaultStructuralExpanded,
  isDenseParagraph,
  representationReadingClass,
  withReadingErgonomics,
} from "./reading-ergonomics.js";
import { getTabEligibleRepresentations } from "./note-representations.js";
import {
  getDefinitionById,
  getDefinitionByRepresentationBucket,
  getTabSectionDefinitions,
  mapDefinitionToRepresentationBucket,
} from "./note-section-catalog.js";
import { stripHighlightedQuoteLines } from "./quote-highlight.js";
import { lookupEditableUnitId } from "./note-editable-map.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDividerLine(line) {
  return String(line ?? "").trim();
}

function isSemanticDividerLine(line) {
  const trimmed = normalizeDividerLine(line);
  if (!trimmed) {
    return false;
  }

  // Common semantic divider glyphs used in exported MSMDF specimens.
  // Keep pattern detection minimal and tolerant (no full grammar).
  if (trimmed === "---") {
    return true;
  }

  // Box / thin dividers: ━━━━━, ─────, and similar.
  // Accept: only divider-like characters, repeated.
  if (/^[━─—–-]{3,}$/.test(trimmed)) {
    return true;
  }

  return false;
}

function dividerWeight(line) {
  const trimmed = normalizeDividerLine(line);
  if (trimmed.includes("━")) {
    return "heavy";
  }
  if (trimmed === "---") {
    return "hr";
  }
  return "thin";
}

function parseChronologyEventLine(line) {
  const trimmed = String(line ?? "").trim();
  const match = trimmed.match(
    /^(\d{3,4}(?:\s*[–-]\s*\d{3,4})?)\s*[—–-]\s*(.+)$/
  );
  if (!match) {
    return null;
  }

  return {
    date: match[1].trim(),
    label: match[2].trim(),
  };
}

function parseDividerWrappedChronologyNode(paragraphText) {
  const lines = String(paragraphText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 3) {
    return null;
  }

  // Divider / event / divider (+ optional annotation lines)
  if (!isSemanticDividerLine(lines[0]) || !isSemanticDividerLine(lines[2])) {
    return null;
  }

  const event = parseChronologyEventLine(lines[1]);
  if (!event) {
    return null;
  }

  const annotationLines = lines.slice(3);
  const annotation = annotationLines.join(" ").trim() || null;

  return {
    divider: lines[0],
    event,
    annotation,
  };
}

function parseParagraphWithEmbeddedChronology(paragraphText) {
  const lines = String(paragraphText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 3) {
    return null;
  }

  // Find divider/event/divider anywhere in the paragraph, allowing leading cue lines.
  for (let i = 0; i + 2 < lines.length; i += 1) {
    if (!isSemanticDividerLine(lines[i]) || !isSemanticDividerLine(lines[i + 2])) {
      continue;
    }

    const event = parseChronologyEventLine(lines[i + 1]);
    if (!event) {
      continue;
    }

    const prefixLines = lines.slice(0, i);
    const annotation = lines.slice(i + 3).join(" ").trim() || null;

    return {
      prefix: prefixLines,
      node: {
        divider: lines[i],
        event,
        annotation,
      },
    };
  }

  return null;
}

const SEMANTIC_CUE_PATTERN =
  /^(the|through|beginning with|leading to|resulting in|culminating in|following|under|during|because|events such as|conflict escalated through|this culminated in)\s*[:—-]?\s*$/i;

function isSemanticCue(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || trimmed.length > 48) {
    return false;
  }

  return SEMANTIC_CUE_PATTERN.test(trimmed);
}

function normalizeCueDisplay(cueRaw) {
  const trimmed = String(cueRaw ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (/[:—-]\s*$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}:`;
}

function isRetrievalAnchorCueParagraph(block) {
  return (
    block?.block_type === "paragraph" &&
    String(block.content ?? "").trim().toLowerCase() === "retrieval anchor:"
  );
}

function isRetrievalChainArrowLine(line) {
  const trimmed = String(line ?? "").trim();
  return trimmed === "↓" || trimmed === "->" || trimmed === "→";
}

function renderRetrievalAnchorChain(content, topicMap, renderOptions) {
  const lines = String(content ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length);

  if (!lines.length) {
    return "";
  }

  const steps = lines
    .map((line) => {
      if (isRetrievalChainArrowLine(line)) {
        return `<div class="semantic-retrieval-arrow" aria-hidden="true">↓</div>`;
      }

      return `<div class="semantic-retrieval-step">${resolveInlineSemantics(
        line,
        topicMap,
        renderOptions
      )}</div>`;
    })
    .join("");

  return `<div class="semantic-retrieval-chain semantic-escalation-resolution">${steps}</div>`;
}

function renderRetrievalAnchorBlock(cueBlock, payloadBlock, topicMap, renderOptions) {
  const cue = `<div class="semantic-retrieval-cue">Retrieval Anchor</div>`;
  const payload = renderRetrievalAnchorChain(
    payloadBlock?.content ?? "",
    topicMap,
    renderOptions
  );

  return `<div class="semantic-retrieval-block">${cue}${payload}</div>`;
}

function isDividerOnlyBlock(block) {
  if (block?.block_type !== "paragraph" || !block.content) {
    return false;
  }

  const lines = String(block.content)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.length === 1 && isSemanticDividerLine(lines[0]);
}

function renderSemanticDividerElement(line) {
  const weight = dividerWeight(line);
  return `<div class="semantic-divider semantic-divider--${weight} semantic-escalation-transition" aria-hidden="true"></div>`;
}

function renderSemanticDividerFromBlock(block) {
  const line = String(block.content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0];

  return line ? renderSemanticDividerElement(line) : "";
}

function renderSemanticCueElement(cueRaw, topicMap, renderOptions) {
  const display = normalizeCueDisplay(cueRaw);
  if (!display) {
    return "";
  }

  return `<div class="semantic-cue">${resolveInlineSemantics(
    display,
    topicMap,
    renderOptions
  )}</div>`;
}

function renderCueLines(lines, topicMap, renderOptions) {
  const text = (lines ?? []).join(" ").trim();
  if (!text) {
    return "";
  }

  return renderSemanticCueElement(text, topicMap, renderOptions);
}

function renderChronologyNode(
  node,
  topicMap,
  renderOptions,
  representationKey,
  { omitLeadingDivider = false } = {}
) {
  const eventLabel = resolveInlineSemantics(node.event.label, topicMap, renderOptions);
  const annotation = node.annotation
    ? resolveInlineSemantics(node.annotation, topicMap, renderOptions)
    : "";

  const leadingDivider = omitLeadingDivider
    ? ""
    : `<div class="semantic-divider semantic-divider--${dividerWeight(node.divider)}" aria-hidden="true"></div>`;

  return `
    <div class="semantic-chronology-node chronology-group" data-representation="${escapeHTML(
      representationKey
    )}">
      ${leadingDivider}
      <div class="semantic-chronology-row chronology-row">
        <span class="semantic-chronology-date">${escapeHTML(node.event.date)}</span>
        <span class="semantic-chronology-label">${eventLabel}</span>
      </div>
      <div class="semantic-divider semantic-divider--${dividerWeight(node.divider)}" aria-hidden="true"></div>
      ${annotation ? `<div class="semantic-chronology-annotation chronology-annotation">${annotation}</div>` : ""}
    </div>
  `;
}

function renderSemanticEscalationHeading(headingText, parserLevel, topicMap, renderOptions) {
  const semanticLevel = resolveSemanticLevel(parserLevel, { representation: "narrative" });
  const tag = semanticHeadingTag(semanticLevel);

  return `<${tag} class="semantic-heading semantic-escalation-heading semantic-heading--l${semanticLevel}" data-semantic-level="${semanticLevel}">${resolveInlineSemantics(
    headingText,
    topicMap,
    renderOptions
  )}</${tag}>`;
}

function renderSemanticEscalationPayload(
  block,
  topicMap,
  renderOptions,
  representationKey
) {
  if (!block?.heading) {
    return "";
  }

  const parserLevel = clampParserHeadingLevel(block.hierarchy_level);
  const heading = renderSemanticEscalationHeading(
    block.heading,
    parserLevel,
    topicMap,
    renderOptions
  );

  if (!block.content?.trim()) {
    return heading;
  }

  const body = renderBlockBody(block, topicMap, renderOptions, representationKey);

  return `${heading}<div class="semantic-escalation-resolution">${body}</div>`;
}

function renderSemanticEscalationSequence(
  blocks,
  cueIndex,
  topicMap,
  renderOptions,
  representationKey,
  skip
) {
  const cueBlock = blocks[cueIndex];
  const headingBlock = blocks[cueIndex + 1];

  if (
    representationKey !== "narrative" ||
    cueBlock?.block_type !== "paragraph" ||
    !isSemanticCue(String(cueBlock.content ?? "").trim()) ||
    headingBlock?.block_type !== "section" ||
    !headingBlock?.heading
  ) {
    return null;
  }

  let transitionDivider = "";

  if (cueIndex > 0 && !skip.has(cueIndex - 1)) {
    const prev = blocks[cueIndex - 1];
    if (isDividerOnlyBlock(prev)) {
      transitionDivider = renderSemanticDividerFromBlock(prev);
      skip.add(cueIndex - 1);
    }
  }

  const cueEl = renderSemanticCueElement(cueBlock.content, topicMap, renderOptions);
  let payload = renderSemanticEscalationPayload(
    headingBlock,
    topicMap,
    renderOptions,
    representationKey
  );

  skip.add(cueIndex);
  skip.add(cueIndex + 1);

  // Resolution often follows as a separate paragraph block (heading block has no content).
  const resolutionBlock = blocks[cueIndex + 2];
  if (
    !headingBlock.content?.trim() &&
    resolutionBlock?.block_type === "paragraph" &&
    resolutionBlock.content?.trim() &&
    !isSemanticCue(String(resolutionBlock.content).trim()) &&
    !isDividerOnlyBlock(resolutionBlock)
  ) {
    const resolutionBody = renderBlockBody(
      resolutionBlock,
      topicMap,
      renderOptions,
      representationKey
    );
    payload += `<div class="semantic-escalation-resolution">${resolutionBody}</div>`;
    skip.add(cueIndex + 2);
  }

  return `${transitionDivider}<div class="semantic-escalation-group">${cueEl}${payload}</div>`;
}

function linkOptions(renderOptions = {}) {
  return { preferLanguage: renderOptions.preferLanguage ?? "english" };
}

function draftEditSurface(renderOptions, representationKey, block, paraKey) {
  if (!renderOptions.draftEditMode || !renderOptions.editableUnits) {
    return { className: "", attrs: "" };
  }

  const unitId = lookupEditableUnitId(
    renderOptions.editableUnits,
    representationKey,
    block?.sequence_order ?? 0,
    paraKey
  );

  if (!unitId) {
    return { className: "", attrs: "" };
  }

  return {
    className: " note-preview-editable",
    attrs: ` data-editable-id="${escapeHTML(unitId)}" tabindex="0"`,
  };
}

function resolveInlineSemantics(text, topicMap, renderOptions = {}) {
  const opts = withReadingErgonomics(renderOptions);

  // Semantic cognition rendering is authoritative whenever a semanticMap exists.
  // Legacy topic traversal is fallback-only (when no semantic map available).
  if (opts.semanticMap) {
    return renderSemanticAnchors(text, opts.semanticMap, {
      interactive: opts.semanticInteractive !== false,
      previewMode: opts.semanticPreview ? opts.previewMode !== false : false,
      studentMode: opts.studentMode === true,
      highlightEmptyAnchorNotes: opts.highlightEmptyAnchorNotes === true,
      anchorElement: opts.semanticAnchorElement ?? "button",
      anchorOccurrenceTracker: opts.anchorOccurrenceTracker,
    });
  }

  return resolveTopicLinks(text, topicMap, linkOptions(opts));
}

function renderSemanticHeading(
  headingText,
  parserLevel,
  representationKey,
  topicMap,
  renderOptions,
  block
) {
  const semanticLevel = resolveSemanticLevel(parserLevel, { representation: representationKey });
  const tag = semanticHeadingTag(semanticLevel);
  const classes = semanticHeadingClasses(semanticLevel);
  const edit = draftEditSurface(renderOptions, representationKey, block, "heading");

  return `<${tag} class="${classes}${edit.className}" data-semantic-level="${semanticLevel}"${edit.attrs}>${resolveInlineSemantics(
    headingText,
    topicMap,
    renderOptions
  )}</${tag}>`;
}

function renderListContent(content, topicMap, renderOptions, block, representationKey) {
  const lines = String(content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  const items = lines
    .map((line, lineIndex) => {
      const text = line.replace(/^\s*([-*•]|\d+[\.)])\s+/, "");
      const edit = draftEditSurface(
        renderOptions,
        representationKey,
        block,
        `list-${lineIndex}`
      );
      return `<li class="semantic-list-item${edit.className}"${edit.attrs}>${resolveInlineSemantics(
        text,
        topicMap,
        renderOptions
      )}</li>`;
    })
    .join("");

  return `<ul class="canonical-list semantic-list">${items}</ul>`;
}

function renderHighlightedQuoteBlock(
  text,
  topicMap,
  renderOptions,
  block,
  paraIndex
) {
  const quoteLines = stripHighlightedQuoteLines(text);
  if (!quoteLines?.length) {
    return "";
  }

  const inner =
    quoteLines.length === 1
      ? resolveInlineSemantics(quoteLines[0], topicMap, renderOptions)
      : quoteLines
          .map(
            (line) =>
              `<p class="quote-blockquote-line">${resolveInlineSemantics(
                line,
                topicMap,
                renderOptions
              )}</p>`
          )
          .join("");

  const edit = draftEditSurface(renderOptions, "quotes", block, paraIndex);

  return `<blockquote class="quote-blockquote quote-blockquote--highlighted${edit.className}"${edit.attrs}>${inner}</blockquote>`;
}

function renderSemanticParagraph(
  p,
  topicMap,
  renderOptions,
  representationKey,
  block,
  paraIndex
) {
  const tracker = renderOptions.anchorOccurrenceTracker;
  tracker?.resetParagraph?.();

  const trimmed = String(p ?? "").trim();
  if (!trimmed) {
    return "";
  }

  // Important quotes in [QUOTES]: prefix with > for amber highlight.
  if (representationKey === "quotes") {
    const highlighted = renderHighlightedQuoteBlock(
      trimmed,
      topicMap,
      renderOptions,
      block,
      paraIndex
    );
    if (highlighted) {
      return highlighted;
    }
  }

  // Divider utility line (including literal ---).
  if (isSemanticDividerLine(trimmed)) {
    return renderSemanticDividerElement(trimmed);
  }

  // Minimal chronology node stabilization (Timeline + narrative snippets).
  const node = parseDividerWrappedChronologyNode(trimmed);
  if (node && (representationKey === "timeline" || representationKey === "narrative")) {
    return renderChronologyNode(node, topicMap, renderOptions, representationKey);
  }

  // Chronology blocks embedded in a paragraph with leading cue text.
  const embedded = parseParagraphWithEmbeddedChronology(trimmed);
  if (embedded && (representationKey === "timeline" || representationKey === "narrative")) {
    const transition = renderSemanticDividerElement(embedded.node.divider);
    const cue = renderCueLines(embedded.prefix, topicMap, renderOptions);
    const block = renderChronologyNode(embedded.node, topicMap, renderOptions, representationKey, {
      omitLeadingDivider: true,
    });
    return `${transition}<div class="semantic-escalation-group">${cue}${block}</div>`;
  }

  const anchorCount = countWikiLinksInText(trimmed);
  const denseClass = isDenseParagraph(anchorCount) ? " semantic-paragraph--dense" : "";
  const edit = draftEditSurface(renderOptions, representationKey, block, paraIndex);

  return `<p class="canonical-paragraph semantic-paragraph${denseClass}${edit.className}"${edit.attrs}>${resolveInlineSemantics(
    trimmed,
    topicMap,
    renderOptions
  )}</p>`;
}

function renderBlockBody(block, topicMap, renderOptions, representationKey = "narrative") {
  if (block.block_type === "list") {
    return renderListContent(block.content, topicMap, renderOptions, block, representationKey);
  }

  if (!block.content) {
    return "";
  }

  const paragraphs = String(block.content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs
    .map((p, paraIndex) =>
      renderSemanticParagraph(
        p,
        topicMap,
        renderOptions,
        representationKey,
        block,
        paraIndex
      )
    )
    .filter(Boolean)
    .join("");
}

function renderBlock(block, topicMap, renderOptions, representationKey = "narrative") {
  if (block.block_type === "retrieval_anchor") {
    const cue = `<div class="semantic-retrieval-cue">Retrieval Anchor</div>`;
    const payload = renderRetrievalAnchorChain(
      block.content,
      topicMap,
      renderOptions
    );
    return `<div class="semantic-retrieval-block">${cue}${payload}</div>`;
  }

  const parserLevel = clampParserHeadingLevel(block.hierarchy_level);
  const semanticLevel = resolveSemanticLevel(parserLevel, {
    representation: representationKey,
  });
  const blockClass = semanticBlockClasses(semanticLevel, representationKey);
  const sectionEntryClass = semanticLevel === 1 ? " semantic-section-entry" : "";
  const body = renderBlockBody(block, topicMap, renderOptions, representationKey);

  const heading = block.heading
    ? renderSemanticHeading(
        block.heading,
        parserLevel,
        representationKey,
        topicMap,
        renderOptions,
        block
      )
    : "";

  if (!shouldCollapseBlock(block, representationKey)) {
    return `<article class="${blockClass}${sectionEntryClass}" data-semantic-level="${semanticLevel}">${heading}<div class="semantic-body">${body}</div></article>`;
  }

  const open = defaultCollapsibleOpen(representationKey, semanticLevel, block);
  const summaryLabel = block.heading
    ? resolveInlineSemantics(block.heading, topicMap, renderOptions)
    : escapeHTML(block.block_type);

  return `
    <details class="${blockClass}${sectionEntryClass} collapsible semantic-collapsible semantic-collapsible--${representationKey}" data-semantic-level="${semanticLevel}" ${open ? "open" : ""}>
      <summary class="semantic-collapsible-summary semantic-heading--l${semanticLevel}">${summaryLabel}</summary>
      <div class="canonical-block-body semantic-body">${body}</div>
    </details>
  `;
}

function renderRepresentation(
  blocks = [],
  topicMap = {},
  className,
  renderOptions = {},
  representationKey = "narrative"
) {
  if (!blocks.length) {
    return `<p class="canonical-empty">No content in this representation.</p>`;
  }

  const modeClass = representationReadingClass(representationKey);
  const readingOpts = withReadingErgonomics(renderOptions);

  const parts = [];
  const skip = new Set();

  for (let i = 0; i < blocks.length; i += 1) {
    if (skip.has(i)) {
      continue;
    }

    const block = blocks[i];
    const next = blocks[i + 1] ?? null;

    // Retrieval cue grouping: "Retrieval Anchor:" + ```text fence or heading block.
    if (
      representationKey === "narrative" &&
      isRetrievalAnchorCueParagraph(block) &&
      next?.block_type === "retrieval_anchor"
    ) {
      parts.push(
        renderRetrievalAnchorBlock(block, next, topicMap, readingOpts)
      );
      skip.add(i);
      skip.add(i + 1);
      continue;
    }

    if (
      representationKey === "narrative" &&
      isRetrievalAnchorCueParagraph(block) &&
      next?.block_type === "section" &&
      next?.heading
    ) {
      const cue = `<div class="semantic-retrieval-cue">Retrieval Anchor</div>`;
      const payload = renderSemanticEscalationPayload(
        next,
        topicMap,
        readingOpts,
        representationKey
      );
      parts.push(`<div class="semantic-retrieval-block">${cue}${payload}</div>`);
      skip.add(i);
      skip.add(i + 1);
      continue;
    }

    const escalationHtml = renderSemanticEscalationSequence(
      blocks,
      i,
      topicMap,
      readingOpts,
      representationKey,
      skip
    );

    if (escalationHtml) {
      parts.push(escalationHtml);
      continue;
    }

    parts.push(renderBlock(block, topicMap, readingOpts, representationKey));
  }

  return `
    <section class="canonical-representation ${className} ${modeClass}" data-representation="${representationKey}">
      ${parts.join("")}
    </section>
  `;
}

export function renderNarrative(blocks, topicMap, renderOptions) {
  return renderRepresentation(
    blocks,
    topicMap,
    "representation-narrative",
    renderOptions,
    "narrative"
  );
}

export function renderGeneric(blocks, topicMap, renderOptions, representationKey = "generic") {
  const definition = getDefinitionByRepresentationBucket(representationKey, {
    customDefinitions: renderOptions.sectionExtensions ?? [],
  });
  const className =
    definition?.readingClass === "semantic-reading-flow" || !definition?.readingClass
      ? "representation-narrative"
      : `representation-${representationKey}`;

  return renderRepresentation(
    blocks,
    topicMap,
    className,
    renderOptions,
    representationKey
  );
}

// ---------------------------------------------------------------------------
// Structural hierarchy (semantic depth + subordinated interaction)
// ---------------------------------------------------------------------------

const structuralSessionState = new Map();

function sortBlocks(blocks) {
  return [...blocks].sort(
    (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)
  );
}

function isStructuralSection(block) {
  return Boolean(block.heading && block.block_type === "section");
}

export function buildStructuralTree(blocks = []) {
  const root = {
    id: "structural-root",
    children: [],
    blocks: [],
    hierarchy_level: 0,
  };
  const stack = [root];

  for (const block of sortBlocks(blocks)) {
    if (isStructuralSection(block)) {
      const level = block.hierarchy_level ?? 2;
      const node = {
        id: `structural-${block.sequence_order ?? 0}`,
        heading: block.heading,
        hierarchy_level: level,
        blocks: [],
        children: [],
      };

      if (block.content?.trim()) {
        node.blocks.push(block);
      }

      while (stack.length > 1 && stack[stack.length - 1].hierarchy_level >= level) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    const parent = stack[stack.length - 1];
    if (parent === root) {
      root.blocks.push(block);
    } else {
      parent.blocks.push(block);
    }
  }

  return root;
}

function renderStructuralContentBlock(block, topicMap, renderOptions) {
  if (block.block_type === "list") {
    return renderListContent(block.content, topicMap, renderOptions, block, "structural");
  }

  if (!block.content?.trim()) {
    return "";
  }

  const tracker = renderOptions.anchorOccurrenceTracker;

  return String(block.content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, paraIndex) => {
      tracker?.resetParagraph?.();
      const anchorCount = countWikiLinksInText(p);
      const denseClass = isDenseParagraph(anchorCount) ? " semantic-paragraph--dense" : "";
      const edit = draftEditSurface(renderOptions, "structural", block, paraIndex);

      return `<p class="canonical-paragraph structural-leaf semantic-paragraph${denseClass}${edit.className}"${edit.attrs}>${resolveInlineSemantics(
        p,
        topicMap,
        renderOptions
      )}</p>`;
    })
    .join("");
}

function isStructuralExpanded(nodeId, depth, semanticLevel) {
  if (structuralSessionState.has(nodeId)) {
    return structuralSessionState.get(nodeId);
  }

  return defaultStructuralExpanded(depth, semanticLevel);
}

function renderStructuralSectionNode(node, topicMap, depth, renderOptions) {
  const semanticLevel = resolveSemanticLevel(node.hierarchy_level, {
    depth,
    representation: "structural",
  });
  const expanded = isStructuralExpanded(node.id, depth, semanticLevel);
  const indicator = expanded ? "−" : "+";
  const levelClass = semanticLevelClass(semanticLevel);
  const headingTag = semanticHeadingTag(semanticLevel);
  const headingClasses = semanticHeadingClasses(semanticLevel);

  const bodyParts = [
    ...node.blocks.map((b) => renderStructuralContentBlock(b, topicMap, renderOptions)),
    ...node.children.map((child) =>
      renderStructuralSectionNode(child, topicMap, depth + 1, renderOptions)
    ),
  ].filter(Boolean);

  const indent = Math.min(depth, 4);

  return `
    <div class="structural-group ${levelClass}" data-semantic-level="${semanticLevel}" data-depth="${indent}" style="--structural-depth: ${indent}">
      <div class="structural-heading-row">
        <button
          type="button"
          class="structural-toggle"
          aria-expanded="${expanded}"
          aria-controls="structural-panel-${node.id}"
          data-structural-id="${escapeHTML(node.id)}"
          aria-label="${expanded ? "Collapse" : "Expand"} section"
        >
          <span class="structural-indicator" aria-hidden="true">${indicator}</span>
        </button>
        <${headingTag} id="structural-heading-${escapeHTML(node.id)}" class="${headingClasses} structural-heading">${resolveInlineSemantics(node.heading, topicMap, {
    ...renderOptions,
    semanticAnchorElement: "span",
  })}</${headingTag}>
      </div>
      <div
        id="structural-panel-${node.id}"
        class="structural-content${expanded ? "" : " collapsed"}"
        role="region"
        aria-labelledby="structural-heading-${node.id}"
      >
        ${bodyParts.join("")}
      </div>
    </div>
  `;
}

export function renderStructuralSection(node, topicMap, depth = 0, renderOptions) {
  return renderStructuralSectionNode(node, topicMap, depth, renderOptions);
}

export function renderStructural(blocks, topicMap, renderOptions) {
  const readingOpts = withReadingErgonomics(renderOptions);
  const sorted = sortBlocks(blocks);

  if (!sorted.length) {
    return `<p class="canonical-empty">No content in this representation.</p>`;
  }

  const tree = buildStructuralTree(sorted);
  const parts = [];

  if (tree.blocks.length) {
    parts.push(
      `<div class="structural-orphan-content semantic-body">${tree.blocks
        .map((b) => renderStructuralContentBlock(b, topicMap, readingOpts))
        .join("")}</div>`
    );
  }

  for (const child of tree.children) {
    parts.push(renderStructuralSectionNode(child, topicMap, 0, readingOpts));
  }

  if (!parts.length) {
    return renderRepresentation(
      sorted,
      topicMap,
      "representation-structural",
      readingOpts,
      "structural"
    );
  }

  return `
    <section class="canonical-representation representation-structural structural-hierarchy semantic-structural-flow" data-representation="structural">
      ${parts.join("")}
    </section>
  `;
}

export function bindStructuralCollapse(container) {
  if (!container || container.dataset.structuralBound === "true") {
    return;
  }

  container.dataset.structuralBound = "true";

  container.addEventListener("click", (event) => {
    const toggle = event.target.closest(".structural-toggle");
    if (!toggle || !container.contains(toggle)) {
      return;
    }

    const nodeId = toggle.dataset.structuralId;
    const panel = toggle.closest(".structural-group")?.querySelector(".structural-content");
    if (!nodeId || !panel) {
      return;
    }

    const expanded = toggle.getAttribute("aria-expanded") === "true";
    const nextExpanded = !expanded;

    toggle.setAttribute("aria-expanded", String(nextExpanded));
    panel.classList.toggle("collapsed", !nextExpanded);

    const indicator = toggle.querySelector(".structural-indicator");
    if (indicator) {
      indicator.textContent = nextExpanded ? "−" : "+";
    }

    structuralSessionState.set(nodeId, nextExpanded);
  });
}

export function renderRevision(blocks, topicMap, renderOptions) {
  return renderRepresentation(
    blocks,
    topicMap,
    "representation-revision",
    renderOptions,
    "revision"
  );
}

export function renderTimeline(blocks, topicMap, renderOptions) {
  return renderRepresentation(
    blocks,
    topicMap,
    "representation-timeline",
    renderOptions,
    "timeline"
  );
}

export function renderInterpretations(blocks, topicMap, renderOptions) {
  return renderRepresentation(
    blocks,
    topicMap,
    "representation-interpretations",
    renderOptions,
    "interpretations"
  );
}

export function renderQuotes(blocks, topicMap, renderOptions) {
  return renderRepresentation(
    blocks,
    topicMap,
    "representation-quotes",
    renderOptions,
    "quotes"
  );
}

const RENDERER_FUNCTIONS = Object.freeze({
  narrative: renderNarrative,
  structural: renderStructural,
  revision: renderRevision,
  timeline: renderTimeline,
  interpretations: renderInterpretations,
  quotes: renderQuotes,
  generic: renderGeneric,
});

const PROFILE_RENDERERS = Object.freeze({
  generic: renderGeneric,
  narrative: renderNarrative,
  structural: renderStructural,
  timeline: renderTimeline,
  quotes: renderQuotes,
  revision: renderRevision,
  interpretations: renderInterpretations,
});

function resolveRendererForDefinition(def, representationKey) {
  const profile = def?.rendererProfile ?? "generic";
  const renderer = PROFILE_RENDERERS[profile] ?? renderGeneric;

  if (profile === "generic" && representationKey) {
    return (blocks, topicMap, renderOptions) =>
      renderGeneric(blocks, topicMap, renderOptions, representationKey);
  }

  return renderer;
}

const RENDERERS = Object.freeze(
  Object.fromEntries(
    getTabEligibleRepresentations().map((entry) => [
      entry.id,
      RENDERER_FUNCTIONS[entry.id] ?? renderNarrative,
    ])
  )
);

export function renderRepresentationTab(
  key,
  representations,
  topicMap,
  renderOptions = {},
  context = {}
) {
  const catalogContext = {
    customDefinitions:
      context.customDefinitions ?? renderOptions.sectionExtensions ?? [],
  };

  const def =
    getDefinitionById(key, catalogContext) ??
    getDefinitionByRepresentationBucket(key, catalogContext);

  if (def) {
    const renderer = resolveRendererForDefinition(def, key);
    return renderer(representations[key] ?? [], topicMap, {
      ...renderOptions,
      sectionExtensions: catalogContext.customDefinitions,
    });
  }

  const renderer = RENDERERS[key];
  if (!renderer) {
    return "";
  }

  return renderer(representations[key] ?? [], topicMap, renderOptions);
}

export function getAvailableTabs(representations = {}, context = {}) {
  const catalogContext = {
    customDefinitions: context.customDefinitions ?? [],
  };

  return getTabSectionDefinitions(catalogContext)
    .filter((def) => {
      const bucket = mapDefinitionToRepresentationBucket(def);
      return (representations[bucket]?.length ?? 0) > 0;
    })
    .map((def) => ({
      key: mapDefinitionToRepresentationBucket(def),
      label: def.label,
    }));
}
