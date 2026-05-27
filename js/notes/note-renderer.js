/**
 * Representation-aware note renderer (semantic cognition hierarchy).
 */

import { renderSemanticAnchors } from "../anchors/anchor-renderer.js";
import { resolveTopicLinks } from "./note-topic-links.js";
import {
  clampParserHeadingLevel,
  isNarrativeRepresentation,
  resolveSemanticLevel,
  semanticBlockClasses,
  semanticHeadingClasses,
  semanticHeadingTag,
  semanticLevelClass,
  shouldCollapseBlock,
} from "./semantic-hierarchy.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkOptions(renderOptions = {}) {
  return { preferLanguage: renderOptions.preferLanguage ?? "english" };
}

function resolveInlineSemantics(text, topicMap, renderOptions = {}) {
  if (renderOptions.studentSemanticMode && renderOptions.semanticMap) {
    return renderSemanticAnchors(text, renderOptions.semanticMap, {
      interactive: renderOptions.semanticInteractive !== false,
      studentMode: true,
      anchorElement: renderOptions.semanticAnchorElement ?? "button",
    });
  }

  if (renderOptions.semanticPreview && renderOptions.semanticMap) {
    return renderSemanticAnchors(text, renderOptions.semanticMap, {
      interactive: renderOptions.semanticInteractive !== false,
      previewMode: renderOptions.previewMode !== false,
      studentMode: renderOptions.studentMode === true,
      anchorElement: renderOptions.semanticAnchorElement ?? "button",
    });
  }

  return resolveTopicLinks(text, topicMap, linkOptions(renderOptions));
}

function renderSemanticHeading(headingText, parserLevel, representationKey, topicMap, renderOptions) {
  const semanticLevel = resolveSemanticLevel(parserLevel, { representation: representationKey });
  const tag = semanticHeadingTag(semanticLevel);
  const classes = semanticHeadingClasses(semanticLevel);

  return `<${tag} class="${classes}" data-semantic-level="${semanticLevel}">${resolveInlineSemantics(
    headingText,
    topicMap,
    renderOptions
  )}</${tag}>`;
}

function renderListContent(content, topicMap, renderOptions) {
  const lines = String(content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  const items = lines
    .map((line) => {
      const text = line.replace(/^\s*([-*•]|\d+[\.)])\s+/, "");
      return `<li>${resolveInlineSemantics(text, topicMap, renderOptions)}</li>`;
    })
    .join("");

  return `<ul class="canonical-list semantic-list">${items}</ul>`;
}

function renderBlockBody(block, topicMap, renderOptions) {
  if (block.block_type === "list") {
    return renderListContent(block.content, topicMap, renderOptions);
  }

  if (!block.content) {
    return "";
  }

  const paragraphs = String(block.content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs
    .map(
      (p) =>
        `<p class="canonical-paragraph semantic-paragraph">${resolveInlineSemantics(p, topicMap, renderOptions)}</p>`
    )
    .join("");
}

function renderBlock(block, topicMap, renderOptions, representationKey = "narrative") {
  const parserLevel = clampParserHeadingLevel(block.hierarchy_level);
  const semanticLevel = resolveSemanticLevel(parserLevel, {
    representation: representationKey,
  });
  const blockClass = semanticBlockClasses(semanticLevel, representationKey);
  const body = renderBlockBody(block, topicMap, renderOptions);

  const heading = block.heading
    ? renderSemanticHeading(
        block.heading,
        parserLevel,
        representationKey,
        topicMap,
        renderOptions
      )
    : "";

  if (!shouldCollapseBlock(block, representationKey)) {
    return `<article class="${blockClass}" data-semantic-level="${semanticLevel}">${heading}<div class="semantic-body">${body}</div></article>`;
  }

  const open = block.metadata_json?.default_open === true;
  const summaryLabel = block.heading
    ? resolveInlineSemantics(block.heading, topicMap, renderOptions)
    : escapeHTML(block.block_type);

  return `
    <details class="${blockClass} collapsible semantic-collapsible" data-semantic-level="${semanticLevel}" ${open ? "open" : ""}>
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

  const modeClass = isNarrativeRepresentation(representationKey)
    ? "semantic-reading-flow"
    : "semantic-representation-blocks";

  return `
    <section class="canonical-representation ${className} ${modeClass}" data-representation="${representationKey}">
      ${blocks.map((b) => renderBlock(b, topicMap, renderOptions, representationKey)).join("")}
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
    return renderListContent(block.content, topicMap, renderOptions);
  }

  if (!block.content?.trim()) {
    return "";
  }

  return String(block.content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p class="canonical-paragraph structural-leaf semantic-paragraph">${resolveInlineSemantics(p, topicMap, renderOptions)}</p>`
    )
    .join("");
}

function isStructuralExpanded(nodeId, depth) {
  if (structuralSessionState.has(nodeId)) {
    return structuralSessionState.get(nodeId);
  }

  return depth === 0;
}

function renderStructuralSectionNode(node, topicMap, depth, renderOptions) {
  const expanded = isStructuralExpanded(node.id, depth);
  const indicator = expanded ? "−" : "+";
  const semanticLevel = resolveSemanticLevel(node.hierarchy_level, {
    depth,
    representation: "structural",
  });
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
  const sorted = sortBlocks(blocks);

  if (!sorted.length) {
    return `<p class="canonical-empty">No content in this representation.</p>`;
  }

  const tree = buildStructuralTree(sorted);
  const parts = [];

  if (tree.blocks.length) {
    parts.push(
      `<div class="structural-orphan-content semantic-body">${tree.blocks
        .map((b) => renderStructuralContentBlock(b, topicMap, renderOptions))
        .join("")}</div>`
    );
  }

  for (const child of tree.children) {
    parts.push(renderStructuralSectionNode(child, topicMap, 0, renderOptions));
  }

  if (!parts.length) {
    return renderRepresentation(
      sorted,
      topicMap,
      "representation-structural",
      renderOptions,
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

const RENDERERS = Object.freeze({
  narrative: renderNarrative,
  structural: renderStructural,
  revision: renderRevision,
  timeline: renderTimeline,
  interpretations: renderInterpretations,
});

export function renderRepresentationTab(key, representations, topicMap, renderOptions = {}) {
  const renderer = RENDERERS[key];
  if (!renderer) {
    return "";
  }

  return renderer(representations[key] ?? [], topicMap, renderOptions);
}

export function getAvailableTabs(representations = {}) {
  return [
    { key: "narrative", label: "Narrative" },
    { key: "structural", label: "Structural" },
    { key: "revision", label: "Revision" },
    { key: "timeline", label: "Timeline" },
    { key: "interpretations", label: "Interpretations" },
  ].filter((tab) => (representations[tab.key]?.length ?? 0) > 0);
}
