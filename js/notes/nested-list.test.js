/**
 * Run: node --test js/notes/nested-list.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNestedListTree,
  parseNestedListLines,
} from "./nested-list.js";

describe("nested-list", () => {
  it("parses indent depth from list lines", () => {
    const items = parseNestedListLines(`- [[Magna Carta]] (1215)
  - King subject to law
  - Beginning of limited monarchy
- Growth of Parliament`);

    assert.equal(items.length, 4);
    assert.equal(items[0].indent, 0);
    assert.equal(items[0].text, "[[Magna Carta]] (1215)");
    assert.equal(items[1].indent, 2);
    assert.equal(items[1].text, "King subject to law");
    assert.equal(items[3].indent, 0);
  });

  it("builds a nested tree from indented items", () => {
    const tree = buildNestedListTree(
      parseNestedListLines(`- Parent
  - Child one
  - Child two
- Sibling`)
    );

    assert.equal(tree.length, 2);
    assert.equal(tree[0].text, "Parent");
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].text, "Child one");
    assert.equal(tree[1].text, "Sibling");
    assert.equal(tree[1].children.length, 0);
  });
});
