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
