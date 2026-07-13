/**
 * Run: node --test js/anchors/anchor-note-renderer.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAnchorNoteSectionHeader,
  renderAnchorNote,
  splitAnchorNoteSections,
} from "./anchor-note-renderer.js";

const SAMPLE_NEW_FORMAT = `George Monck (1608–1670)

George Monck was an English soldier and statesman who played a decisive role in ending the English Commonwealth and restoring the Stuart monarchy.

Context :

- Oliver Cromwell died in 1658 and was succeeded by Richard Cromwell.
- Richard Cromwell resigned in 1659, leading to political instability.

Main Features :

- Commander of the English army stationed in Scotland.
- Marched to London in 1660 to resolve the political crisis.

Key Identity Markers :

- George Monck
- Restoration (1660)

Historical Significance :

- Ended the political instability following the collapse of the Protectorate.

Therefore, George Monck was the key military and political figure who made the Restoration possible.`;

describe("splitAnchorNoteSections", () => {
  it("keeps plain prose intact without details", () => {
    const plain =
      "The Rule of Law is the principle that everyone, including the ruler, is subject to the law.";
    const result = splitAnchorNoteSections(plain);
    assert.equal(result.hasDetails, false);
    assert.equal(result.intro, plain);
    assert.equal(result.details, "");
  });

  it("splits before the first structured section header", () => {
    const result = splitAnchorNoteSections(SAMPLE_NEW_FORMAT);
    assert.equal(result.hasDetails, true);
    assert.match(result.intro, /George Monck was an English soldier/);
    assert.doesNotMatch(result.intro, /Context/);
    assert.match(result.details, /^Context\s*:/m);
    assert.match(result.details, /Historical Significance/);
    assert.match(result.details, /Therefore, George Monck/);
  });

  it("detects Malayalam section headers", () => {
    const malayalam = `ഹെൻറി എട്ടാമൻ

ഹെൻറി എട്ടാമൻ ഇംഗ്ലണ്ടിന്റെ രാജാവായിരുന്നു.

പശ്ചാത്തലം :

- ട്യൂഡർ രാജവംശം
- റോമൻ കത്തോലിക്ക സഭ

ചരിത്രപ്രാധാന്യം :

- ചർച്ച് ഓഫ് ഇംഗ്ലണ്ട് സ്ഥാപനം`;

    const result = splitAnchorNoteSections(malayalam);
    assert.equal(result.hasDetails, true);
    assert.match(result.intro, /ഹെൻറി എട്ടാമൻ/);
    assert.match(result.details, /^പശ്ചാത്തലം\s*:/m);
  });
});

describe("isAnchorNoteSectionHeader", () => {
  it("recognizes known English headers with trailing spaces", () => {
    assert.equal(
      isAnchorNoteSectionHeader("Context :", ["", "- bullet"]),
      true
    );
    assert.equal(
      isAnchorNoteSectionHeader("Main Provisions :", ["- clause"]),
      true
    );
  });

  it("uses bullet heuristic for unknown headers", () => {
    assert.equal(
      isAnchorNoteSectionHeader("Special Traits :", ["", "- one", "- two"]),
      true
    );
    assert.equal(isAnchorNoteSectionHeader("Special Traits :", ["plain prose"]), false);
  });
});

describe("renderAnchorNote", () => {
  it("collapses structured details by default", () => {
    const html = renderAnchorNote(SAMPLE_NEW_FORMAT);
    assert.match(html, /anchor-note-details/);
    assert.match(html, /More about this anchor/);
    assert.match(html, /George Monck was an English soldier/);
    assert.match(html, /anchor-note-section-heading/);
  });

  it("renders fully expanded when collapse is disabled", () => {
    const html = renderAnchorNote(SAMPLE_NEW_FORMAT, {}, { collapseSections: false });
    assert.doesNotMatch(html, /anchor-note-details/);
    assert.match(html, /Main Features/);
    assert.match(html, /Therefore, George Monck/);
  });

  it("does not add collapse chrome for plain notes", () => {
    const html = renderAnchorNote("Short cognition note about Magna Carta.");
    assert.doesNotMatch(html, /anchor-note-details/);
    assert.match(html, /Magna Carta/);
  });
});
