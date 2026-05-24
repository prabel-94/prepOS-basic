/**
 * Representation-aware note renderer (not generic markdown).
 */

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkifyTopicReferences(text, topicLinkMap = new Map()) {
  if (!text) {
    return "";
  }

  const parts = [];
  let lastIndex = 0;
  const pattern = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    parts.push(escapeHTML(text.slice(lastIndex, match.index)));
    const trimmed = match[1].trim();
    const topicId = topicLinkMap.get(trimmed.toLowerCase());

    if (topicId) {
      parts.push(
        `<a class="canonical-topic-link" href="note.html?topic=${encodeURIComponent(topicId)}">${escapeHTML(trimmed)}</a>`
      );
    } else {
      parts.push(
        `<span class="canonical-topic-link unresolved">${escapeHTML(trimmed)}</span>`
      );
    }

    lastIndex = pattern.lastIndex;
  }

  parts.push(escapeHTML(text.slice(lastIndex)));
  return parts.join("");
}

function renderListContent(content, topicLinkMap) {
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
      return `<li>${linkifyTopicReferences(text, topicLinkMap)}</li>`;
    })
    .join("");

  return `<ul class="canonical-list">${items}</ul>`;
}

function renderBlock(block, topicLinkMap) {
  const heading = block.heading
    ? `<h${Math.min(Math.max(block.hierarchy_level || 3, 2), 4)} class="canonical-block-heading">${linkifyTopicReferences(block.heading, topicLinkMap)}</h${Math.min(Math.max(block.hierarchy_level || 3, 2), 4)}>`
    : "";

  let body = "";

  if (block.block_type === "list") {
    body = renderListContent(block.content, topicLinkMap);
  } else if (block.content) {
    const paragraphs = String(block.content)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    body = paragraphs
      .map(
        (p) =>
          `<p class="canonical-paragraph">${linkifyTopicReferences(p, topicLinkMap)}</p>`
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

  return `
    <details class="canonical-block collapsible" ${open ? "open" : ""}>
      <summary>${heading || escapeHTML(block.block_type)}</summary>
      <div class="canonical-block-body">${body}</div>
    </details>
  `;
}

function buildTopicLinkMap(topicLinks = []) {
  const map = new Map();

  for (const link of topicLinks) {
    const topicId = link.linked_topic_id ?? link.topics?.id;
    const name =
      link.linked_topic_name ??
      link.topics?.name ??
      "";

    if (topicId && name) {
      map.set(name.trim().toLowerCase(), topicId);
    }
  }

  return map;
}

function renderRepresentation(blocks = [], topicLinks = [], className) {
  const topicLinkMap = buildTopicLinkMap(topicLinks);

  if (!blocks.length) {
    return `<p class="canonical-empty">No content in this representation.</p>`;
  }

  return `
    <section class="canonical-representation ${className}">
      ${blocks.map((b) => renderBlock(b, topicLinkMap)).join("")}
    </section>
  `;
}

export function renderNarrative(blocks, topicLinks) {
  return renderRepresentation(blocks, topicLinks, "representation-narrative");
}

export function renderStructural(blocks, topicLinks) {
  return renderRepresentation(blocks, topicLinks, "representation-structural");
}

export function renderRevision(blocks, topicLinks) {
  return renderRepresentation(blocks, topicLinks, "representation-revision");
}

export function renderTimeline(blocks, topicLinks) {
  return renderRepresentation(blocks, topicLinks, "representation-timeline");
}

export function renderInterpretations(blocks, topicLinks) {
  return renderRepresentation(blocks, topicLinks, "representation-interpretations");
}

const RENDERERS = Object.freeze({
  narrative: renderNarrative,
  structural: renderStructural,
  revision: renderRevision,
  timeline: renderTimeline,
  interpretations: renderInterpretations,
});

export function renderRepresentationTab(key, representations, topicLinks) {
  const renderer = RENDERERS[key];
  if (!renderer) {
    return "";
  }

  return renderer(representations[key] ?? [], topicLinks);
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
