# Semantic Renderer Stabilization — Phase 1.1 / 1.2 (Semantic Rhythm)

**Goal:** Incrementally refine renderer rhythm for semantically-authored educational markdown, focusing on **semantic block containment**, **chronology grouping**, **escalation continuity**, and **compact heading rhythm** (mobile-priority).

**Constraints honored:** No parser redesign, no AST/cognition engines, no renderer frameworks, no rewrite of `note-renderer.js`.

---

## A) Implementation (what changed)

### Files changed

- `js/notes/note-renderer.js`
- `css/style.css`

### 1) Semantic block containment (mixed paragraphs)

**Problem:** Semantically-authored markdown often embeds a divider-wrapped chronology block inside a larger paragraph, e.g.:

```
Beginning with:
━━━━━━━━━━
1215 — [[Magna Carta]]
━━━━━━━━━━
Early constitutional limitation on monarchy
```

Previously, this became a single prose paragraph, and the divider block stayed “trapped” inside paragraph flow.

**Change:** Added a lightweight paragraph scan that can **extract divider/event/divider** sequences even when preceded by cue lines.

New helper:

- `parseParagraphWithEmbeddedChronology(paragraphText)`
  - Finds divider/event/divider anywhere in the paragraph lines
  - Returns `{ prefix: [...cueLines], node: { divider, event, annotation } }`

Render behavior:

- cue lines render as `.semantic-cue` paragraph
- chronology renders as a **single `.chronology-group`** block
- both wrapped in `.semantic-escalation-group` to enforce block-level containment and compact rhythm

### 2) Chronology group containment

**Change:** Chronology rendering now uses a single wrapper:

- `.semantic-chronology-node.chronology-group`
  - divider
  - `.chronology-row` (date + label)
  - divider
  - `.chronology-annotation` (optional)

This keeps divider/event/annotation visually unified as **one cognition unit**.

### 3) Semantic escalation grouping (cue + heading)

**Problem:** Cue + heading patterns like:

```
The:
# [[Eleven Years’ Tyranny]]
```

Previously rendered as a floating cue paragraph + a structurally-spaced heading.

**Change:** Added a minimal heuristic in `renderRepresentation()` for Narrative:

- if a short paragraph ends with `:`/`—`/`-` and matches common cue prefixes (The / Through / Beginning with / Leading to / Culminating in / etc.)
- and the next block is a heading (`section` block)

…then render them inside a `.semantic-escalation-group`:

- cue renders as `.semantic-cue-line`
- heading renders immediately after, with compact spacing (CSS-only)

### 4) Compact semantic heading rhythm

**Change:** Added CSS rules so headings inside `.semantic-escalation-group` do not “explode” spacing:

- reduced top margin for `.semantic-escalation-group .semantic-heading`
- calm cue line styling
- slightly tighter divider spacing inside `.chronology-group`

---

## B) New semantic grouping heuristics added

- **Embedded chronology extraction**: divider/event/divider found anywhere in a paragraph → render as a single chronology group with optional cue.
- **Cue + heading escalation grouping**: short cue paragraph + immediate heading → render as a single escalation group.

These heuristics are:

- shallow (pattern checks only)
- narrative-scoped (to avoid structural/other representations)
- non-invasive (no new parse schema)

---

## C) Remaining known rhythm limitations (intentionally left for later)

- **Non-divider chronology lines** (e.g. `1215 — [[Magna Carta]]` without dividers) still render as prose unless authored as divider-wrapped nodes.
- **Layer heading ownership** (Timeline “layer” headings owning subsequent nodes) is still flat because blocks remain siblings (would require a grouping pass).
- **Emoji arrows / inline transitions** (`➡️`) remain inline semantics (not turned into a transition widget).
- **Very long cue lines** (multi-sentence cues) are not grouped to avoid over-fragmenting narrative calmness.

---

## D) Minimal CSS additions

Added small utility classes only:

- `.semantic-escalation-group`
- `.semantic-cue`, `.semantic-cue-line`
- `.chronology-group` spacing tweaks

No redesign; preserves existing semantic reading ergonomics and max-width cadence.

---

## E) Regression checklist (must remain true)

- **Semantic anchors**: `resolveInlineSemantics()` path remains authoritative; inspector bindings unaffected.
- **Structural rendering**: structural tree renderer unchanged.
- **Narrative calmness**: only cue/divider/chronology patterns trigger special grouping.
- **Mobile priority**: compact spacing rules apply only inside grouping wrappers.

