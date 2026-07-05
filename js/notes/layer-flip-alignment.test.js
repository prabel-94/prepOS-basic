/**
 * Run: node --test js/notes/layer-flip-alignment.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anchorKind,
  extractWikiKeys,
  nearestVisibleAnchorId,
  nearestVisibleSemanticAnchor,
  pickBestSeqMatch,
  pickClosestByRatio,
  restoreElementRank,
} from "./layer-flip-alignment.js";

function mockElement({
  tag = "div",
  className = "",
  dataset = {},
  children = [],
  previousElementSibling = null,
}) {
  const el = {
    tagName: tag.toUpperCase(),
    className,
    dataset,
    previousElementSibling,
    matches(selector) {
      if (selector === "p.semantic-paragraph") {
        return tag === "p" && className.includes("semantic-paragraph");
      }
      if (selector === ".semantic-paragraph-run") {
        return className.includes("semantic-paragraph-run");
      }
      if (selector === ".semantic-inline-block") {
        return className.includes("semantic-inline-block");
      }
      if (selector === ".semantic-chronology-node") {
        return className.includes("semantic-chronology-node");
      }
      if (selector === ".structural-group") {
        return className.includes("structural-group");
      }
      if (selector === "article") {
        return tag === "article";
      }
      if (selector === "details") {
        return tag === "details";
      }
      if (selector === ".semantic-section-heading-only, div.semantic-section-entry") {
        return (
          className.includes("semantic-section-heading-only") ||
          (tag === "div" && className.includes("semantic-section-entry"))
        );
      }
      if (selector === ".semantic-timeline-entry") {
        return className.includes("semantic-timeline-entry");
      }
      if (selector === ".semantic-recall-qa") {
        return className.includes("semantic-recall-qa");
      }
      if (selector === "article, details") {
        return tag === "article" || tag === "details";
      }
      if (selector === ".semantic-recall-qa, .semantic-section-heading-only") {
        return (
          className.includes("semantic-recall-qa") ||
          className.includes("semantic-section-heading-only")
        );
      }
      if (selector === "div.semantic-section-entry") {
        return tag === "div" && className.includes("semantic-section-entry");
      }
      if (selector === ".semantic-paragraph-run, .semantic-inline-block") {
        return (
          className.includes("semantic-paragraph-run") ||
          className.includes("semantic-inline-block")
        );
      }

      return false;
    },
    querySelector(selector) {
      if (selector === ".semantic-anchor[data-anchor-id]") {
        return children.find((c) => c.dataset?.anchorId) ?? null;
      }
      if (selector === ".semantic-anchor") {
        return children.find((c) => c.dataset?.anchorId || c.dataset?.normalizedName) ?? null;
      }
      return null;
    },
  };

  return el;
}

describe("layer-flip-alignment", () => {
  describe("extractWikiKeys", () => {
    it("extracts normalized wiki keys", () => {
      assert.deepEqual(
        extractWikiKeys("The [[Magna Carta]] and [[Charles I]]"),
        ["magna carta", "charles i"]
      );
    });

    it("deduplicates wiki keys", () => {
      assert.deepEqual(
        extractWikiKeys("[[Ship Money]] and again [[Ship Money]]"),
        ["ship money"]
      );
    });
  });

  describe("pickBestSeqMatch", () => {
    it("prefers paragraph anchors over paragraph-run wrappers with the same seq", () => {
      const run = mockElement({
        className: "semantic-paragraph-run",
        dataset: { blockSeq: "12" },
      });
      const paragraph = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        dataset: { blockSeq: "12", blockType: "paragraph" },
      });

      const best = pickBestSeqMatch([run, paragraph], {
        anchorKind: "paragraph",
        blockType: "paragraph",
      });

      assert.equal(best, paragraph);
      assert.ok(restoreElementRank(paragraph) < restoreElementRank(run));
    });
  });

  describe("anchorKind", () => {
    it("classifies paragraph anchors", () => {
      const paragraph = mockElement({
        tag: "p",
        className: "semantic-paragraph",
      });

      assert.equal(anchorKind(paragraph), "paragraph");
    });

    it("classifies chronology nodes", () => {
      const chrono = mockElement({
        className: "semantic-chronology-node",
      });

      assert.equal(anchorKind(chrono), "chronology");
    });
  });

  describe("nearestVisibleAnchorId", () => {
    it("returns anchor_id from within the block", () => {
      const anchorButton = { dataset: { anchorId: "uuid-123" } };
      const block = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        children: [anchorButton],
      });

      assert.equal(nearestVisibleAnchorId(block), "uuid-123");
    });

    it("falls back to previous sibling when block has no anchor", () => {
      const anchorButton = { dataset: { anchorId: "uuid-456" } };
      const prevBlock = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        children: [anchorButton],
      });
      const currentBlock = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        children: [],
        previousElementSibling: prevBlock,
      });

      assert.equal(nearestVisibleAnchorId(currentBlock), "uuid-456");
    });

    it("returns null when no anchors nearby", () => {
      const block = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        children: [],
      });

      assert.equal(nearestVisibleAnchorId(block), null);
    });

    it("returns null for null input", () => {
      assert.equal(nearestVisibleAnchorId(null), null);
    });
  });

  describe("nearestVisibleSemanticAnchor", () => {
    it("captures normalized name for unresolved anchors", () => {
      const anchorButton = {
        dataset: { normalizedName: "magna carta" },
      };
      const block = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        children: [anchorButton],
      });

      assert.deepEqual(nearestVisibleSemanticAnchor(block), {
        anchorId: null,
        anchorNormalizedName: "magna carta",
      });
    });

    it("captures both anchor_id and normalized name when present", () => {
      const anchorButton = {
        dataset: { anchorId: "uuid-789", normalizedName: "charles i" },
      };
      const block = mockElement({
        tag: "p",
        className: "semantic-paragraph",
        children: [anchorButton],
      });

      assert.deepEqual(nearestVisibleSemanticAnchor(block), {
        anchorId: "uuid-789",
        anchorNormalizedName: "charles i",
      });
    });
  });

  describe("pickClosestByRatio", () => {
    it("returns single candidate directly", () => {
      const el = mockElement({ tag: "p", className: "semantic-paragraph" });
      assert.equal(pickClosestByRatio([el], 0.5), el);
    });

    it("returns null for empty array", () => {
      assert.equal(pickClosestByRatio([], 0.5), null);
    });
  });
});
