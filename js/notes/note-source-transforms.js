/**
 * Text transforms for draft preview formatting actions.
 */

/**
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
export function wrapSelectionAsWikiLink(text, start, end) {
  const selected = String(text ?? "").slice(start, end).trim();
  if (!selected) {
    return text;
  }

  return `${text.slice(0, start)}[[${selected}]]${text.slice(end)}`;
}

/**
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} topicName
 */
export function insertWikiLinkAt(text, start, end, topicName) {
  const name = String(topicName ?? "").trim();
  if (!name) {
    return text;
  }

  return `${text.slice(0, start)}[[${name}]]${text.slice(end)}`;
}

/**
 * Prefix non-empty lines in a range with blockquote markers.
 * @param {string} text
 * @param {number} [start]
 * @param {number} [end]
 */
export function applyQuoteHighlight(text, start = 0, end = text.length) {
  const before = String(text ?? "").slice(0, start);
  const selected = String(text ?? "").slice(start, end);
  const after = String(text ?? "").slice(end);

  const highlighted = selected
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (/^>\s?/.test(trimmed)) {
        return line;
      }

      const indent = line.match(/^\s*/)?.[0] ?? "";
      return `${indent}> ${trimmed}`;
    })
    .join("\n");

  return before + highlighted + after;
}

/**
 * @param {string} text
 * @param {number} level
 */
export function convertTextToHeading(text, level = 2) {
  const safeLevel = Math.min(Math.max(Number(level) || 2, 2), 6);
  const stripped = String(text ?? "")
    .replace(/^>\s+/gm, "")
    .replace(/^#+\s*/, "")
    .trim();

  if (!stripped) {
    return text;
  }

  return `${"#".repeat(safeLevel)} ${stripped}`;
}

/**
 * @param {string} text
 * @param {number} [start]
 * @param {number} [end]
 */
export function prefixSelectionAsNumberedList(text, start = 0, end = text.length) {
  const before = String(text ?? "").slice(0, start);
  const selected = String(text ?? "").slice(start, end);
  const after = String(text ?? "").slice(end);

  const list = selected
    .split("\n")
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (/^[-*•]\s+/.test(trimmed) || /^\d+[\.)]\s+/.test(trimmed)) {
        const stripped = trimmed.replace(/^[-*•]\s+/, "").replace(/^\d+[\.)]\s+/, "");
        return `${index + 1}. ${stripped}`;
      }

      return `${index + 1}. ${trimmed}`;
    })
    .join("\n");

  return before + list + after;
}

/**
 * @param {string[]} [steps]
 * @returns {string}
 */
export function formatRetrievalAnchorBlock(steps = []) {
  const lines = (steps ?? [])
    .map((step) => String(step ?? "").trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Add at least one retrieval step.");
  }

  const body = lines.join("\n↓\n");
  return `\`\`\`ra\n${body}\n\`\`\``;
}

/**
 * Insert a block of markdown at the caret within a unit.
 * @param {string} text
 * @param {number} offset
 * @param {string} insertion
 */
export function insertBlockAt(text, offset, insertion) {
  const source = String(text ?? "");
  const block = String(insertion ?? "").trim();
  if (!block) {
    return source;
  }

  const safeOffset = Math.min(Math.max(offset, 0), source.length);
  const before = source.slice(0, safeOffset).trimEnd();
  const after = source.slice(safeOffset).trimStart();

  if (before && after) {
    return `${before}\n\n${block}\n\n${after}`;
  }

  if (before) {
    return `${before}\n\n${block}`;
  }

  if (after) {
    return `${block}\n\n${after}`;
  }

  return block;
}

/**
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
export function prefixSelectionAsBulletList(text, start, end) {
  const before = String(text ?? "").slice(0, start);
  const selected = String(text ?? "").slice(start, end);
  const after = String(text ?? "").slice(end);

  const list = selected
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (/^[-*•]\s+/.test(trimmed) || /^\d+[\.)]\s+/.test(trimmed)) {
        return line;
      }

      return `- ${trimmed}`;
    })
    .join("\n");

  return before + list + after;
}

/**
 * Insert a divider line at the caret, splitting content when needed.
 * @param {string} text
 * @param {number} offset
 */
export function insertDividerAt(text, offset) {
  const source = String(text ?? "");
  const safeOffset = Math.min(Math.max(offset, 0), source.length);
  const before = source.slice(0, safeOffset).trimEnd();
  const after = source.slice(safeOffset).trimStart();

  if (before && after) {
    return `${before}\n\n---\n\n${after}`;
  }

  if (before) {
    return `${before}\n\n---`;
  }

  if (after) {
    return `---\n\n${after}`;
  }

  return "---";
}

const ATX_HEADING_LINE = /^(#{1,6})\s+(\S.*?)\s*$/;

/**
 * Expand a character range to whole paragraph boundaries (blank-line separated).
 * @param {string} markdown
 * @param {number} start
 * @param {number} end
 */
export function expandRangeToParagraphBoundaries(markdown, start, end) {
  const source = String(markdown ?? "");
  let safeStart = Math.min(Math.max(Number(start) || 0, 0), source.length);
  let safeEnd = Math.min(Math.max(Number(end) || 0, 0), source.length);

  if (safeEnd < safeStart) {
    [safeStart, safeEnd] = [safeEnd, safeStart];
  }

  if (safeStart === safeEnd && safeStart > 0 && safeStart < source.length) {
    const prevBreak = source.lastIndexOf("\n\n", safeStart);
    const nextBreak = source.indexOf("\n\n", safeStart);
    safeStart = prevBreak === -1 ? 0 : prevBreak + 2;
    safeEnd = nextBreak === -1 ? source.length : nextBreak;
  } else {
    const prevBreak = source.lastIndexOf("\n\n", safeStart);
    safeStart = prevBreak === -1 ? 0 : prevBreak + 2;

    const nextBreak = source.indexOf("\n\n", safeEnd);
    safeEnd = nextBreak === -1 ? source.length : nextBreak;
  }

  return { start: safeStart, end: safeEnd };
}

/**
 * Increase ATX heading depth for lines in a text block.
 * @param {string} text
 * @param {number} [increment]
 */
export function nestHeadingsInText(text, increment = 1) {
  const delta = Math.max(Number(increment) || 1, 1);

  return String(text ?? "")
    .split("\n")
    .map((line) => {
      const match = line.match(ATX_HEADING_LINE);
      if (!match) {
        return line;
      }

      const nextLevel = Math.min(match[1].length + delta, 6);
      return `${"#".repeat(nextLevel)} ${match[2]}`;
    })
    .join("\n");
}

/**
 * @param {string} body
 */
export function deriveSectionTitle(body) {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) {
    return "Section";
  }

  const firstLine = trimmed.split("\n").find((line) => line.trim())?.trim() ?? "";
  const heading = firstLine.match(ATX_HEADING_LINE);
  if (heading) {
    return heading[2].trim().slice(0, 120) || "Section";
  }

  return firstLine.replace(/^>\s*/, "").trim().slice(0, 120) || "Section";
}

/**
 * When the wrapped range begins with a heading, promote it to the section title.
 * @param {string} body
 */
export function consumeLeadingHeadingAsTitle(body) {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) {
    return { title: null, body: "" };
  }

  const lines = trimmed.split("\n");
  const first = lines[0]?.trim() ?? "";
  const match = first.match(ATX_HEADING_LINE);
  if (!match) {
    return { title: null, body: trimmed };
  }

  const rest = lines.slice(1).join("\n").trim();
  return { title: match[2].trim(), body: rest };
}

/**
 * Insert a section heading above a markdown character range and nest existing headings inside.
 * @param {string} markdown
 * @param {number} start
 * @param {number} end
 * @param {{ level?: number, title?: string, demoteHeadings?: boolean }} [options]
 */
export function wrapRangeAsSection(markdown, start, end, options = {}) {
  const source = String(markdown ?? "");
  const level = Math.min(Math.max(Number(options.level) || 2, 2), 6);
  const demoteHeadings = options.demoteHeadings !== false;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return source;
  }

  const { start: rangeStart, end: rangeEnd } = expandRangeToParagraphBoundaries(
    source,
    start,
    end
  );

  if (rangeEnd <= rangeStart) {
    return source;
  }

  let body = source.slice(rangeStart, rangeEnd).trim();
  if (!body) {
    return source;
  }

  let title = String(options.title ?? "").trim();
  if (!title) {
    const leading = consumeLeadingHeadingAsTitle(body);
    if (leading.title) {
      title = leading.title;
      body = leading.body;
    } else {
      title = deriveSectionTitle(body);
    }
  }

  if (demoteHeadings && body) {
    body = nestHeadingsInText(body);
  }

  const headingLine = `${"#".repeat(level)} ${title}`;
  const wrapped = body ? `${headingLine}\n\n${body}` : headingLine;

  const before = source.slice(0, rangeStart).replace(/\s+$/, "");
  const after = source.slice(rangeEnd).replace(/^\s+/, "");

  if (!before) {
    return after ? `${wrapped}\n\n${after}` : wrapped;
  }

  if (!after) {
    return `${before}\n\n${wrapped}`;
  }

  return `${before}\n\n${wrapped}\n\n${after}`;
}
