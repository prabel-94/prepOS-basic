# Semantic Renderer Stabilization — Phase 1

**Goal:** Stabilize PrepOS semantic rendering so semantically-authored educational markdown remains **readable and cognitively coherent**, without rewriting the parser, introducing AST engines, or redesigning rendering architecture.

**Specimen used for validation:** `c:\Users\prabe\Downloads\PrepOS_Renderer_Stabilization\SPECIMEN_English_Revolution.md`

---

## A) Renderer stabilization implementation (what changed)

### Files changed

- `js/notes/note-renderer.js`
- `css/style.css`

### Core strategy

Keep the existing block model and representation routing, but add a **minimal semantic utility pass** at render-time to recognize high-frequency constructs that currently leak as prose:

- Divider lines (e.g. `━━━━━━━━━━`, `────────`, `---`)
- Divider-wrapped chronology nodes (date/event + annotation)
- Retrieval cue sequences (`Retrieval Anchor:` + immediate heading payload)

These constructs now render as small semantic HTML utilities (`<div class="semantic-divider">`, `<div class="semantic-chronology-node">`, `<div class="semantic-retrieval-block">`) rather than literal paragraph text.

---

## B) Semantic utility detectors added

All detectors are intentionally shallow pattern checks (no grammar engine).

Implemented in `js/notes/note-renderer.js`:

- `isSemanticDividerLine(line)`
  - Detects divider-only lines including literal `---` and repeated divider glyphs (`━`, `─`, `—`, `–`, `-`).
- `dividerWeight(line)`
  - Classifies divider as `heavy` (`━`), `thin` (default), or `hr` (`---`).
- `parseChronologyEventLine(line)`
  - Detects `YYYY — label` / `YYYY–YYYY — label` (supports en-dash/em-dash/hyphen).
- `parseDividerWrappedChronologyNode(paragraphText)`
  - Detects divider/event/divider (+ optional annotation lines) inside a single paragraph block that contains embedded newlines.

Grouping heuristic:

- Retrieval cue grouping inside `renderRepresentation()`:
  - If in `narrative`, and a paragraph is exactly `Retrieval Anchor:` and the next block is a heading (`section` block with `heading`), render them together inside a `semantic-retrieval-block`.

---

## C) Render leakage patterns fixed (Phase 1)

Validated against the specimen:

- **Divider leakage**
  - Before: `━━━━━━━━━━` / `---` rendered as `<p>…</p>` literal artifacts.
  - After: rendered as `<div class="semantic-divider …">` calm intentional separators.

- **Timeline chronology collapse**
  - Before: a whole chronology node (divider/event/divider/annotation) rendered as a single prose paragraph.
  - After: rendered as a minimal chronology block:
    - divider
    - date + label row
    - divider
    - annotation block

- **Retrieval cue disconnection**
  - Before: `Retrieval Anchor:` floated as an orphan paragraph; payload heading appeared unrelated.
  - After: `Retrieval Anchor` cue + immediate heading payload render inside a single retrieval wrapper.

---

## D) Minimal CSS additions

Added small, calm utility styles in `css/style.css`:

- `.semantic-divider` + variants:
  - `.semantic-divider--heavy`
  - `.semantic-divider--thin`
  - `.semantic-divider--hr`
- `.semantic-chronology-node`, `.semantic-chronology-row`, `.semantic-chronology-date`, `.semantic-chronology-label`, `.semantic-chronology-annotation`
- `.semantic-retrieval-block`, `.semantic-retrieval-cue`

No redesign; utilities inherit the existing reading ergonomics and max-width cadence.

---

## E) Regression checklist (must remain true)

### Semantic anchors (published + preview)
- Inline `[[...]]` anchor rendering still flows through `resolveInlineSemantics()` unchanged.
- Inspector bindings and semantic click authority remain unchanged (renderer only emits HTML).

### Structural rendering
- Structural tab still uses its dedicated renderer (`buildStructuralTree`), untouched.

### Timeline readability
- Divider-wrapped nodes render as chronology rows and annotations.
- Divider glyphs no longer leak as literal paragraph text.

### Narrative readability
- Narrative remains paragraph-flow dominant.
- Only clearly semantic constructs (divider lines, divider-wrapped chronology blocks, retrieval cue sequences) get special treatment.

### Mobile
- New utilities are simple block-level elements; no complex layout dependencies.

### Overlay orchestration / inspectors
- No modal/overlay code touched.

---

## Quick validation notes (specimen)

After changes:

- Timeline HTML no longer contains literal `━━━━━━━━` text.
- Literal `---` no longer renders as `<p>---</p>` in the tested representations.
- Timeline now includes `semantic-chronology-node` blocks.
- Narrative now includes `semantic-retrieval-block` for `Retrieval Anchor:` sequences.

---

## Next (optional, future phases)

Phase 1 intentionally avoids deeper systems. Possible later improvements (not part of this phase):

- Broaden chronology detection beyond divider-wrapped nodes (e.g. bare `1215 — [[Magna Carta]]` lines).
- Treat timeline “layer headings” as owning their subsequent nodes (requires block grouping / tree-like pass).
- Add minimal handling for semantic spacing rhythm blocks if specimens require it.

