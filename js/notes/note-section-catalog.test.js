/**
 * Run: node --test js/notes/note-section-catalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getAddableSectionDefinitions,
  getBuiltinSectionDefinitions,
  getDefinitionById,
  mapDefinitionToRepresentationBucket,
  mergeSectionCatalog,
  resolveSectionCatalog,
} from "./note-section-catalog.js";

describe("note-section-catalog", () => {
  it("maps builtin registry entries to section definitions", () => {
    const builtins = getBuiltinSectionDefinitions();
    assert.ok(builtins.length >= 8);

    const narrative = getDefinitionById("narrative");
    assert.equal(narrative?.source, "builtin");
    assert.equal(narrative?.boundaryTag, "NARRATIVE");
    assert.equal(narrative?.rendererProfile, "narrative");
  });

  it("maps recall to revision bucket", () => {
    const recall = getDefinitionById("recall");
    assert.equal(mapDefinitionToRepresentationBucket(recall), "revision");
  });

  it("excludes infrastructure sections from addable picker", () => {
    const addable = getAddableSectionDefinitions();
    const ids = addable.map((def) => def.id);

    assert.ok(ids.includes("narrative"));
    assert.ok(ids.includes("recall"));
    assert.ok(!ids.includes("metadata"));
    assert.ok(!ids.includes("entity_index"));
  });

  it("merges custom definitions without builtin id collisions", () => {
    const builtins = getBuiltinSectionDefinitions();
    const custom = [
      {
        id: "case_studies",
        boundaryTag: "EXT:CASE_STUDIES",
        label: "Case Studies",
        source: "custom",
        role: "cognition",
        tabOrder: 520,
        persist: true,
        rendererProfile: "generic",
      },
    ];

    const merged = resolveSectionCatalog({ customDefinitions: custom });
    assert.equal(merged.length, builtins.length + 1);
    assert.ok(getDefinitionById("case_studies", { customDefinitions: custom }));
  });

  it("rejects custom section id collisions", () => {
    assert.throws(
      () =>
        mergeSectionCatalog(getBuiltinSectionDefinitions(), [
          {
            id: "narrative",
            boundaryTag: "EXT:NARRATIVE",
            label: "Dup",
            source: "custom",
            role: "cognition",
          },
        ]),
      /collides with a built-in/
    );
  });
});
