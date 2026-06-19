/**
 * Run: node --test js/notes/note-metadata-markdown.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readMetadataFromMarkdown,
  writeMetadataToMarkdown,
} from "./note-metadata-markdown.js";

describe("note-metadata-markdown", () => {
  it("reads and writes metadata section", () => {
    const markdown = `[METADATA]\n\ntitle: Old\nlanguage: english\n\n[NARRATIVE]\n\nBody.`;
    const metadata = readMetadataFromMarkdown(markdown);
    assert.equal(metadata.title, "Old");
    assert.equal(metadata.language, "english");

    const updated = writeMetadataToMarkdown(markdown, {
      ...metadata,
      title: "New title",
    });

    assert.match(updated, /title: New title/);
    assert.match(updated, /\[NARRATIVE\]/);
  });

  it("prepends metadata when missing", () => {
    const updated = writeMetadataToMarkdown("[NARRATIVE]\n\nBody.", {
      title: "Fresh",
    });

    assert.ok(updated.indexOf("[METADATA]") < updated.indexOf("[NARRATIVE]"));
    assert.match(updated, /title: Fresh/);
  });
});
