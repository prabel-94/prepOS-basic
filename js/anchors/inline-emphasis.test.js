/**
 * Run: node --test js/anchors/inline-emphasis.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  boldWrapAroundMatch,
  maybeWrapBoldHtml,
  renderMarkdownEmphasis,
} from "./inline-emphasis.js";
import { renderSemanticAnchors } from "./anchor-renderer.js";
import { resolveTopicLinks } from "../notes/note-topic-links.js";

describe("boldWrapAroundMatch", () => {
  it("detects ** immediately wrapping a wiki-link span", () => {
    const text = "**[[Consent of the Governed]]**";
    const matchStart = 2;
    const matchEnd = text.length - 2;
    const wrap = boldWrapAroundMatch(text, matchStart, matchEnd, 0);
    assert.deepEqual(wrap, { start: 0, end: text.length, bold: true });
  });

  it("ignores non-adjacent bold markers", () => {
    const text = "**idea** [[Consent of the Governed]]";
    const matchStart = text.indexOf("[[");
    const matchEnd = text.indexOf("]]") + 2;
    const wrap = boldWrapAroundMatch(text, matchStart, matchEnd, 0);
    assert.equal(wrap.bold, false);
  });
});

describe("renderSemanticAnchors bold wrapping", () => {
  it("renders **[[Label]]** as a bold semantic anchor", () => {
    const html = renderSemanticAnchors("**[[Consent of the Governed]]**", {
      "Consent of the Governed": {
        state: "existing",
        source_text: "Consent of the Governed",
        display_name: "Consent of the Governed",
        anchor_id: "a1",
      },
    });

    assert.match(html, /<strong>[\s\S]*semantic-anchor[\s\S]*Consent of the Governed[\s\S]*<\/strong>/);
    assert.doesNotMatch(html, /\*\*/);
  });

  it("renders unresolved bold-wrapped anchors without literal asterisks", () => {
    const html = renderSemanticAnchors("**[[Unknown Topic]]**", {});
    assert.equal(html, "<strong>Unknown Topic</strong>");
  });
});

describe("resolveTopicLinks bold wrapping", () => {
  it("renders **[[Label]]** as a bold unresolved topic link", () => {
    const html = resolveTopicLinks("**[[Consent of the Governed]]**", {});

    assert.equal(
      html,
      '<strong><span class="topic-link unresolved">Consent of the Governed</span></strong>'
    );
  });
});

describe("renderMarkdownEmphasis", () => {
  it("still bolds ordinary prose", () => {
    assert.equal(
      renderMarkdownEmphasis("Before **1215** after"),
      "Before <strong>1215</strong> after"
    );
  });

  it("maybeWrapBoldHtml wraps only when bold is true", () => {
    assert.equal(maybeWrapBoldHtml("x", true), "<strong>x</strong>");
    assert.equal(maybeWrapBoldHtml("x", false), "x");
  });
});
