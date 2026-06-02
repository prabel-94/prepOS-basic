/**
 * Run: node --test js/notes/note-import-file.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMarkdownFile,
  normalizeImportedMarkdown,
  pickMarkdownFile,
  stripUtf8Bom,
} from "./note-import-file.js";

describe("normalizeImportedMarkdown", () => {
  it("strips UTF-8 BOM and normalizes newlines", () => {
    assert.equal(
      normalizeImportedMarkdown("\uFEFF[METADATA]\r\ntitle: x\r\n"),
      "[METADATA]\ntitle: x\n"
    );
  });
});

describe("stripUtf8Bom", () => {
  it("removes only leading BOM", () => {
    assert.equal(stripUtf8Bom("\uFEFFhello"), "hello");
    assert.equal(stripUtf8Bom("hello"), "hello");
  });
});

describe("isMarkdownFile", () => {
  it("accepts known extensions and text types", () => {
    assert.equal(isMarkdownFile({ name: "note.md", type: "" }), true);
    assert.equal(isMarkdownFile({ name: "note.markdown", type: "" }), true);
    assert.equal(isMarkdownFile({ name: "note.txt", type: "" }), true);
    assert.equal(
      isMarkdownFile({ name: "note.bin", type: "text/markdown" }),
      true
    );
    assert.equal(
      isMarkdownFile({ name: "note.bin", type: "text/plain" }),
      true
    );
  });

  it("rejects unrelated files", () => {
    assert.equal(
      isMarkdownFile({ name: "photo.png", type: "image/png" }),
      false
    );
  });
});

describe("pickMarkdownFile", () => {
  it("returns the first acceptable file", () => {
    const files = [
      { name: "a.png", type: "image/png" },
      { name: "b.md", type: "" },
      { name: "c.txt", type: "" },
    ];
    assert.equal(pickMarkdownFile(files)?.name, "b.md");
  });

  it("returns null when nothing matches", () => {
    assert.equal(pickMarkdownFile([{ name: "a.pdf", type: "application/pdf" }]), null);
    assert.equal(pickMarkdownFile(null), null);
  });
});
