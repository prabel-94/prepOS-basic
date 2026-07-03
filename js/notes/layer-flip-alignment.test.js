/**
 * Run: node --test js/notes/layer-flip-alignment.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anchorKind,
  extractWikiKeys,
  pickBestSeqMatch,
  restoreElementRank,
} from "./layer-flip-alignment.js";

function mockElement({ tag = "div", className = "", dataset = {}, matches = () => false }) {
  return {
    tagName: tag.toUpperCase(),
    className,
    dataset,
    matches(selector) {
      if (typeof matches === "function" && matches(selector)) {
        return true;
      }

      if (selector === "p.semantic-paragraph") {
        return tag === "p" && className.includes("semantic-paragraph");
      }
      if (selector === ".semantic-paragraph-run") {
        return className.includes("semantic-paragraph-run");
      }
      if (selector === ".semantic-inline-block") {
        return className.includes("semantic-inline-block");
      }

      return false;
    },
  };
}

describe("layer-flip-alignment", () => {
  it("extracts normalized wiki keys", () => {
    assert.deepEqual(extractWikiKeys("The [[Magna Carta]] and [[Charles I]]"), [
      "magna carta",
      "charles i",
    ]);
  });

  it("deduplicates wiki keys", () => {
    assert.deepEqual(
      extractWikiKeys("[[Ship Money]] and again [[Ship Money]]"),
      ["ship money"]
    );
  });

  it("prefers paragraph anchors over paragraph-run wrappers with the same seq", () => {
    const run = mockElement({ className: "semantic-paragraph-run", dataset: { blockSeq: "12" } });
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

  it("classifies paragraph anchors", () => {
    const paragraph = mockElement({
      tag: "p",
      className: "semantic-paragraph",
    });

    assert.equal(anchorKind(paragraph), "paragraph");
  });
});
