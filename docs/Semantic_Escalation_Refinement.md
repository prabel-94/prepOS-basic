# Semantic Escalation Refinement — Renderer Micro-Pass

**Goal:** Refine semantic escalation continuity so cue → emphasis → resolution feels calm and connected (especially on mobile), without parser changes or renderer rewrites.

---

## A) Implementation summary

### Files changed

- `js/notes/note-renderer.js`
- `css/style.css`

### Behavioral changes

#### 1) Transition divider ownership

When a divider-only paragraph precedes a cue + heading escalation sequence, the divider now renders **above** the escalation group as a transition boundary (`.semantic-escalation-transition`), not visually “below” the cue.

#### 2) Compact escalation payload (no article chrome)

Cue + heading sequences no longer wrap the heading block in a full `<article class="semantic-block">` hierarchy shell.

Instead:

- `.semantic-cue` — anticipation line (e.g. `The:`)
- `.semantic-escalation-heading` — emphasis escalation (compact rhythm)
- `.semantic-escalation-resolution` — following body text (e.g. “deepened fears of absolutism.”)

#### 3) Embedded chronology + cue

For paragraphs like `Beginning with:` + divider-wrapped chronology:

- First divider renders as **transition** above the group
- Chronology group omits duplicate leading divider inside the group
- Cue + chronology remain inside `.semantic-escalation-group`

#### 4) Retrieval blocks

Retrieval cue + heading payloads now use the same compact escalation heading renderer (still wrapped in `.semantic-retrieval-block`).

---

## B) New escalation heuristics

- `isSemanticCue(line)` — lightweight cue detection (`The:`, `Through:`, `Beginning with:`, etc.)
- `isDividerOnlyBlock(block)` — paragraph containing only a divider line
- `renderSemanticEscalationSequence(...)` — groups optional transition divider + cue + compact heading payload
- `renderSemanticEscalationHeading(...)` — emphasis heading without major section separation
- `renderSemanticEscalationPayload(...)` — heading + resolution body without article wrapper
- Chronology: `omitLeadingDivider` when transition divider is rendered outside the group

---

## C) Remaining limitations

- Escalation grouping only applies to **Narrative** representation.
- Cues must match the short prefix heuristic (≤ 48 chars).
- Headings that are true document sections (no cue) still use standard hierarchy rendering.
- Multi-block escalation (cue → heading → multiple paragraphs) only includes resolution text stored in the heading block’s `content` field.

---

## D) CSS refinements

- `.semantic-escalation-transition` — transition divider spacing before groups
- `.semantic-escalation-heading` — compact emphasis rhythm
- `.semantic-escalation-resolution` — tight connection to resolution paragraphs
- Mobile (`max-width: 640px`) — smaller escalation heading size, tighter group spacing, chronology row wrap

---

## E) Regression checklist

- [ ] Mobile: `The:` → heading → body reads as one rhythm unit
- [ ] Divider appears above escalation, not below cue
- [ ] True section headings (no cue) still use normal hierarchy spacing
- [ ] Chronology grouping unchanged for Timeline tab
- [ ] Semantic anchors still resolve via `resolveInlineSemantics()`
- [ ] Narrative overall flow remains calm (no card/widget fragmentation)
