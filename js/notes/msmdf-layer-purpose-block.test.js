/**
 * Run: node --test js/notes/msmdf-layer-purpose-block.test.js
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isLayerPurposeBlock,
  isLayerPurposeTitle,
  parseLayerPurposeBlock,
} from "./msmdf-layer-purpose-block.js";
import { parseMapMarkdown } from "./map-parser.js";
import { renderRepresentationTab } from "./note-renderer.js";

const structuralSample = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../docs/notes/Sample v3 Exports/English Revolution Structural (english).md"
  ),
  "utf8"
);

describe("msmdf-layer-purpose-block", () => {
  it("parses a blockquote purpose intro", () => {
    const text = `> **Structural Purpose**
>
> This layer reorganizes the Narrative and Expansion into a hierarchical conceptual framework.`;

    assert.ok(isLayerPurposeBlock(text));
    const parsed = parseLayerPurposeBlock(text);
    assert.equal(parsed.title, "Structural Purpose");
    assert.match(parsed.body, /hierarchical conceptual framework/);
  });

  it("rejects non-purpose blockquotes", () => {
    const text = `> **Important Note**
>
> This is not a purpose block.`;

    assert.equal(parseLayerPurposeBlock(text), null);
  });

  it("accepts Malayalam MSMDF-LX purpose titles", () => {
    const text = `> **ഘടനാപരമായ ലക്ഷ്യം**
>
> ഈ Structural Layer Narrative-ലെയും Expansion-ലെയും അറിവിനെ പുനഃസംഘടിപ്പിക്കുന്നു.`;

    assert.ok(isLayerPurposeTitle("ഘടനാപരമായ ലക്ഷ്യം"));
    assert.ok(isLayerPurposeBlock(text));
    const parsed = parseLayerPurposeBlock(text);
    assert.equal(parsed.title, "ഘടനാപരമായ ലക്ഷ്യം");
    assert.match(parsed.body, /Structural Layer/);
  });
});

describe("purpose callout rendering", () => {
  it("renders structural sample purpose without raw blockquote markers", () => {
    const parsed = parseMapMarkdown(structuralSample);
    const html = renderRepresentationTab("structural", parsed.representations, {});

    assert.match(html, /msmdf-layer-purpose/);
    assert.match(html, /Structural Purpose/);
    assert.match(html, /hierarchical conceptual framework/);
    assert.doesNotMatch(html, /&gt; \*\*Structural Purpose\*\*/);
    assert.doesNotMatch(html, /> \*\*Structural Purpose\*\*/);
  });

  it("renders Malayalam timeline purpose titles", () => {
    const parsed = parseMapMarkdown(
      `[TIMELINE]

> **ടൈംലൈൻ ലക്ഷ്യം**
>
> Chronological orientation for examination recall.`
    );

    const html = renderRepresentationTab("timeline", parsed.representations, {});
    assert.match(html, /msmdf-layer-purpose/);
    assert.match(html, /ടൈംലൈൻ ലക്ഷ്യം/);
  });
});
