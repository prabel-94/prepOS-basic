/**
 * Representation-aware note renderer (not generic markdown).
 */

import { resolveTopicLinks } from "./note-topic-links.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderListContent(content, topicMap) {
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
      return `<li>${resolveTopicLinks(text, topicMap)}</li>`;
    })
    .join("");

  return `<ul class="canonical-list">${items}</ul>`;
}

function renderBlock(block, topicMap) {
  const heading = block.heading
    ? `<h${Math.min(Math.max(block.hierarchy_level || 3, 2), 4)} class="canonical-block-heading">${resolveTopicLinks(block.heading, topicMap)}</h${Math.min(Math.max(block.hierarchy_level || 3, 2), 4)}>`
    : "";

  let body = "";

  if (block.block_type === "list") {
    body = renderListContent(block.content, topicMap);
  } else if (block.content) {
    const paragraphs = String(block.content)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    body = paragraphs
      .map(
        (p) =>
          `<p class="canonical-paragraph">${resolveTopicLinks(p, topicMap)}</p>`
      )
      .join("");
  }

  const collapsible =
    block.block_type === "section" ||
    block.block_type === "recall_section" ||
    Boolean(block.heading);

  if (!collapsible) {
    return `<article class="canonical-block">${heading}${body}</article>`;
  }

  const open = block.metadata_json?.default_open === true;
  const summaryLabel = block.heading
    ? resolveTopicLinks(block.heading, topicMap)
    : escapeHTML(block.block_type);

  return `
    <details class="canonical-block collapsible" ${open ? "open" : ""}>
      <summary>${summaryLabel}</summary>
      <div class="canonical-block-body">${body}</div>
    </details>
  `;
}

function renderRepresentation(blocks = [], topicMap = {}, className) {
  if (!blocks.length) {
    return `<p class="canonical-empty">No content in this representation.</p>`;
  }

  return `
    <section class="canonical-representation ${className}">
      ${blocks.map((b) => renderBlock(b, topicMap)).join("")}
    </section>
  `;
}

export function renderNarrative(blocks, topicMap) {
  return renderRepresentation(blocks, topicMap, "representation-narrative");
}

// ---------------------------------------------------------------------------
// Structural hierarchy (interactive pedagogical compression — renderer only)
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

/**
 * Build nested groups from canonical hierarchy_level + sequence_order.
 */
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

function renderStructuralContentBlock(block, topicMap) {
  if (block.block_type === "list") {
    return renderListContent(block.content, topicMap);
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
        `<p class="canonical-paragraph structural-leaf">${resolveTopicLinks(p, topicMap)}</p>`
    )
    .join("");
}

function isStructuralExpanded(nodeId, depth) {
  if (structuralSessionState.has(nodeId)) {
    return structuralSessionState.get(nodeId);
  }

  return depth === 0;
}

function renderStructuralSectionNode(node, topicMap, depth) {
  const expanded = isStructuralExpanded(node.id, depth);
  const indicator = expanded ? "▼" : "▶";

  const bodyParts = [
    ...node.blocks.map((b) => renderStructuralContentBlock(b, topicMap)),
    ...node.children.map((child) =>
      renderStructuralSectionNode(child, topicMap, depth + 1)
    ),
  ].filter(Boolean);

  const indent = Math.min(depth, 6);

  return `
    <div class="structural-group" data-depth="${indent}" style="--structural-depth: ${indent}">
      <button
        type="button"
        class="structural-toggle"
        aria-expanded="${expanded}"
        aria-controls="structural-panel-${node.id}"
        data-structural-id="${escapeHTML(node.id)}"
      >
        <span class="structural-indicator" aria-hidden="true">${indicator}</span>
        <span class="structural-heading">${resolveTopicLinks(node.heading, topicMap)}</span>
      </button>
      <div
        id="structural-panel-${node.id}"
        class="structural-content${expanded ? "" : " collapsed"}"
        role="region"
        aria-label="${escapeHTML(node.heading)}"
      >
        ${bodyParts.join("")}
      </div>
    </div>
  `;
}

export function renderStructuralSection(node, topicMap, depth = 0) {
  return renderStructuralSectionNode(node, topicMap, depth);
}

export function renderStructural(blocks, topicMap) {
  const sorted = sortBlocks(blocks);

  if (!sorted.length) {
    return `<p class="canonical-empty">No content in this representation.</p>`;
  }

  const tree = buildStructuralTree(sorted);
  const parts = [];

  if (tree.blocks.length) {
    parts.push(
      `<div class="structural-orphan-content">${tree.blocks
        .map((b) => renderStructuralContentBlock(b, topicMap))
        .join("")}</div>`
    );
  }

  for (const child of tree.children) {
    parts.push(renderStructuralSectionNode(child, topicMap, 0));
  }

  if (!parts.length) {
    return renderRepresentation(sorted, topicMap, "representation-structural");
  }

  return `
    <section class="canonical-representation representation-structural structural-hierarchy">
      ${parts.join("")}
    </section>
  `;
}

/**
 * Bind toggle behavior for structural hierarchy (session-local state).
 */
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
      indicator.textContent = nextExpanded ? "▼" : "▶";
    }

    structuralSessionState.set(nodeId, nextExpanded);
  });
}

export function renderRevision(blocks, topicMap) {
  return renderRepresentation(blocks, topicMap, "representation-revision");
}

export function renderTimeline(blocks, topicMap) {
  return renderRepresentation(blocks, topicMap, "representation-timeline");
}

export function renderInterpretations(blocks, topicMap) {
  return renderRepresentation(blocks, topicMap, "representation-interpretations");
}

const RENDERERS = Object.freeze({
  narrative: renderNarrative,
  structural: renderStructural,
  revision: renderRevision,
  timeline: renderTimeline,
  interpretations: renderInterpretations,
});

export function renderRepresentationTab(key, representations, topicMap) {
  const renderer = RENDERERS[key];
  if (!renderer) {
    return "";
  }

  return renderer(representations[key] ?? [], topicMap);
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
