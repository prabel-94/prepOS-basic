/**
 * Run: node --test js/notes/layer-flip-alignment.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractWikiKeys } from "./layer-flip-alignment.js";

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
});
