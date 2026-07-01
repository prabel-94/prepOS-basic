/**
 * Run: node --test js/notes/note-representations.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_BOUNDARY_TAGS,
  MSMDF_PROTOCOL_LABEL,
  MSMDF_PROTOCOL_VERSION,
  MSMDF_V3_CANONICAL_LAYER_TAGS,
  REPRESENTATION_REGISTRY,
  createEmptyRepresentations,
  getImportSectionLabels,
  getPersistedRepresentationIds,
  getPrepOSExtensionEntries,
  getTabEligibleRepresentations,
  isPrepOSExtensionSection,
  mapSectionToRepresentation,
  summarizeDetectedSectionsFromRegistry,
} from "./note-representations.js";
import { parseMapMarkdown } from "./map-parser.js";

describe("note-representations registry", () => {
  it("declares MSMDF v3.1 protocol version", () => {
    assert.equal(MSMDF_PROTOCOL_VERSION, "3.1.0");
    assert.equal(MSMDF_PROTOCOL_LABEL, "MSMDF v3.1");
  });

  it("includes QUOTES in boundary tags", () => {
    assert.ok(CANONICAL_BOUNDARY_TAGS.includes("QUOTES"));
  });

  it("treats QUOTES as a PrepOS extension outside MSMDF v3.1 canonical layers", () => {
    assert.ok(isPrepOSExtensionSection("quotes"));
    assert.equal(getPrepOSExtensionEntries().length, 1);
    assert.equal(getPrepOSExtensionEntries()[0].id, "quotes");
    assert.ok(!MSMDF_V3_CANONICAL_LAYER_TAGS.includes("QUOTES"));
  });

  it("assigns unique ids and msmdf tags", () => {
    const ids = REPRESENTATION_REGISTRY.map((entry) => entry.id);
    const tags = REPRESENTATION_REGISTRY.map((entry) => entry.msmdfTag);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(tags).size, tags.length);
  });

  it("createEmptyRepresentations includes expansion and quotes buckets", () => {
    const reps = createEmptyRepresentations();
    assert.ok(Array.isArray(reps.expansion));
    assert.ok(Array.isArray(reps.quotes));
    assert.ok(Array.isArray(reps.narrative));
    assert.equal(reps.quotes.length, 0);
  });

  it("getPersistedRepresentationIds dedupes recall into revision", () => {
    const ids = getPersistedRepresentationIds();
    assert.ok(ids.includes("revision"));
    assert.ok(ids.includes("quotes"));
    assert.equal(ids.filter((id) => id === "revision").length, 1);
    assert.equal(ids.includes("recall"), false);
  });

  it("maps recall to revision and quotes to quotes", () => {
    assert.equal(mapSectionToRepresentation("recall"), "revision");
    assert.equal(mapSectionToRepresentation("quotes"), "quotes");
    assert.equal(mapSectionToRepresentation("metadata"), null);
    assert.equal(mapSectionToRepresentation("entity_index"), null);
  });

  it("tab-eligible representations follow MSMDF v3.1 tab order", () => {
    const tabs = getTabEligibleRepresentations();
    const ids = tabs.map((entry) => entry.id);
    assert.deepEqual(ids, [
      "narrative",
      "expansion",
      "structural",
      "timeline",
      "interpretations",
      "revision",
      "quotes",
    ]);
  });

  it("import labels include quotes", () => {
    const labels = getImportSectionLabels();
    assert.equal(labels.quotes, "Quotes");
  });
});

describe("parseMapMarkdown with QUOTES section", () => {
  it("parses [QUOTES] into representations.quotes", () => {
    const parsed = parseMapMarkdown(
      `[QUOTES]

## Churchill
Democracy is the worst form of government.

- "Be the change." — attributed quote`
    );

    assert.ok(parsed.representations.quotes.length >= 2);
    const summary = summarizeDetectedSectionsFromRegistry(parsed);
    assert.ok(summary.quotes);
  });
});
