/**
 * Run: node --test js/lexicon/lexicon-group-search.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreLexiconGroupMatch,
  filterLexiconGroups,
  describeLexiconGroupRow,
} from "./lexicon-group-search.js";

const sampleGroups = [
  {
    group_id: "g1",
    default_lexical_class: "EMOTION",
    words: [
      { word: "happy", is_headword: true },
      { word: "glad" },
      { word: "joyful" },
    ],
  },
  {
    group_id: "g2",
    default_lexical_class: "QUALITY",
    words: [
      { word: "beautiful", is_headword: true },
      { word: "pretty" },
    ],
  },
];

describe("lexicon-group-search", () => {
  it("scoreLexiconGroupMatch prefers primary word prefix matches", () => {
    assert.equal(scoreLexiconGroupMatch(sampleGroups[0], "ha"), 100);
    assert.equal(scoreLexiconGroupMatch(sampleGroups[0], "hap"), 100);
  });

  it("scoreLexiconGroupMatch matches related words", () => {
    assert.equal(scoreLexiconGroupMatch(sampleGroups[0], "glad"), 60);
    assert.equal(scoreLexiconGroupMatch(sampleGroups[0], "joy"), 60);
  });

  it("filterLexiconGroups filters by lexical class", () => {
    const result = filterLexiconGroups(sampleGroups, {
      lexicalClass: "QUALITY",
    });
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].group_id, "g2");
  });

  it("filterLexiconGroups finds groups by related word query", () => {
    const result = filterLexiconGroups(sampleGroups, { query: "glad" });
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].group_id, "g1");
  });

  it("filterLexiconGroups sorts alphabetically when query is empty", () => {
    const result = filterLexiconGroups(sampleGroups, { query: "" });
    assert.equal(result.groups[0].group_id, "g2");
    assert.equal(result.groups[1].group_id, "g1");
  });

  it("describeLexiconGroupRow notes related-word matches", () => {
    const row = describeLexiconGroupRow(sampleGroups[0], "glad");
    assert.match(row.subtitle, /match in related: glad/);
    assert.match(row.subtitle, /2 related/);
  });
});
