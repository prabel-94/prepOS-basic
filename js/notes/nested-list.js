/**
 * Nested bullet list parsing and HTML rendering (indent-aware).
 */

const LIST_LINE_PATTERN = /^(\s*)([-*•]|\d+[\.)])\s+(.*)$/;

/**
 * @param {string} content
 * @returns {Array<{ indent: number, text: string }>}
 */
export function parseNestedListLines(content) {
  const items = [];

  for (const line of String(content ?? "").split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(LIST_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const indent = match[1].replace(/\t/g, "  ").length;
    items.push({
      indent,
      text: match[3].trim(),
    });
  }

  return items;
}

/**
 * @param {Array<{ indent: number, text: string }>} items
 * @returns {Array<{ text: string, children: object[] }>}
 */
export function buildNestedListTree(items) {
  const root = { children: [] };
  const stack = [{ indent: -1, node: root }];

  for (const item of items) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= item.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    const node = { text: item.text, children: [] };
    parent.children.push(node);
    stack.push({ indent: item.indent, node });
  }

  return root.children;
}

/**
 * @param {object} params
 * @returns {string}
 */
export function renderNestedListHtml({
  content,
  topicMap,
  renderOptions,
  block,
  representationKey,
  renderListItem,
}) {
  const tree = buildNestedListTree(parseNestedListLines(content));

  if (!tree.length) {
    return "";
  }

  function renderNodes(nodes, keyPrefix) {
    const items = nodes
      .map((node, index) => {
        const itemKey = `${keyPrefix}-${index}`;
        const nested = node.children.length
          ? `<ul class="canonical-list semantic-list semantic-list--nested">${renderNodes(
              node.children,
              itemKey
            )}</ul>`
          : "";

        return renderListItem({
          text: node.text,
          block,
          representationKey,
          itemKey,
          topicMap,
          renderOptions,
          nested,
        });
      })
      .join("");

    return items;
  }

  return `<ul class="canonical-list semantic-list">${renderNodes(tree, "list")}</ul>`;
}
