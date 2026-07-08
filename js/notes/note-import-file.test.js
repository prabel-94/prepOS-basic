/**
 * Run: node --test js/notes/note-import-file.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  bindMarkdownFileDrop,
  dragEventHasFiles,
  isMarkdownFile,
  normalizeImportedMarkdown,
  pickMarkdownFile,
  stripUtf8Bom,
} from "./note-import-file.js";

function createFakeDropTarget() {
  const listeners = new Map();
  const classes = new Set();

  return {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    contains: () => false,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((entry) => entry !== handler)
      );
    },
    emit(type, event) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
  };
}

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

describe("dragEventHasFiles", () => {
  it("detects Files in dataTransfer.types", () => {
    assert.equal(
      dragEventHasFiles({ dataTransfer: { types: ["Files"] } }),
      true
    );
    assert.equal(
      dragEventHasFiles({ dataTransfer: { types: ["text/plain"] } }),
      false
    );
    assert.equal(dragEventHasFiles({}), false);
  });
});

describe("bindMarkdownFileDrop", () => {
  const OriginalFileReader = globalThis.FileReader;

  before(() => {
    globalThis.FileReader = class FakeFileReader {
      readAsText(file) {
        Promise.resolve(
          typeof file?.text === "function"
            ? file.text()
            : String(file?._testContent ?? "")
        ).then((value) => {
          this.result = value;
          this.onload?.();
        });
      }
    };
  });

  after(() => {
    if (OriginalFileReader) {
      globalThis.FileReader = OriginalFileReader;
    } else {
      delete globalThis.FileReader;
    }
  });

  it("rejects non-markdown drops via onError", async () => {
    const target = createFakeDropTarget();
    const errors = [];

    bindMarkdownFileDrop(target, {
      onText: () => {
        throw new Error("should not load");
      },
      onError: (message) => errors.push(message),
      rejectMessage: "Drop a markdown file.",
    });

    target.emit("drop", {
      preventDefault() {},
      dataTransfer: {
        types: ["Files"],
        files: [{ name: "photo.png", type: "image/png", size: 10 }],
      },
    });

    assert.deepEqual(errors, ["Drop a markdown file."]);
  });

  it("loads markdown text on drop", async () => {
    const target = createFakeDropTarget();
    const loaded = [];
    const file = new File(["Section body line."], "section.md", {
      type: "text/markdown",
    });

    bindMarkdownFileDrop(target, {
      onText: (payload) => {
        loaded.push(payload);
      },
      onError: (message) => {
        throw new Error(message);
      },
    });

    target.emit("drop", {
      preventDefault() {},
      dataTransfer: {
        types: ["Files"],
        files: [file],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].text, "Section body line.");
    assert.equal(loaded[0].filename, "section.md");
  });

  it("toggles drag-over class and cleans up listeners", () => {
    const target = createFakeDropTarget();
    const unbind = bindMarkdownFileDrop(target, {
      dragOverClass: "note-section-drag-over",
      onText: () => {},
    });

    target.emit("dragover", {
      preventDefault() {},
      dataTransfer: { types: ["Files"], dropEffect: "none" },
    });
    assert.equal(target.classList.contains("note-section-drag-over"), true);

    target.emit("dragleave", { relatedTarget: null });
    assert.equal(target.classList.contains("note-section-drag-over"), false);

    assert.equal(target.listenerCount("drop"), 1);
    unbind();
    assert.equal(target.listenerCount("drop"), 0);
  });
});
