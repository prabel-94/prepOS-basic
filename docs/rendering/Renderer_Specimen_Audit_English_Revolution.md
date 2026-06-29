# Renderer Audit vs Real Specimen — English Revolution (MSMDF v1.2 export)

**Scope:** Audit only (no fixes yet).  
**Specimen source:** `c:\Users\prabe\Downloads\PrepOS_Renderer_Stabilization\SPECIMEN_English_Revolution.md`  
**Renderer target:** `js/notes/note-renderer.js` + `js/notes/map-parser.js` + existing CSS.

---

## 1) What the specimen contains (stress patterns)

High-frequency formatting constructs in the specimen:

- **Divider lines**: `━━━━━━━━━━` (and also literal `---` as section separator lines inside representations)
- **Timeline chronology blocks**: repeated 4-line “divider / event / divider / annotation”
- **Narrative micro-chronology**: divider-wrapped chronology inside `[NARRATIVE]`
- **Retrieval cue blocks**: literal line `Retrieval Anchor:` followed by a heading line like `### [[Ship Money]] → ...`
- **Arrow cues**: `→` and `➡️` used as semantic transitions / emphasis markers
- **Entity Index & Validation sections**: `[ENTITY_INDEX]` and `[FINAL_VALIDATION]` appear in specimen export

---

## 2) How PrepOS parses this specimen today (facts)

### 2.1 MSMDF boundary recognition

- The specimen uses `[NARRATIVE] [STRUCTURAL] [REVISION] [TIMELINE] [INTERPRETATIONS] [RECALL] [ENTITY_INDEX]`.
- The specimen also includes `[CANONICAL_METADATA]` and `[FINAL_VALIDATION]` **which are not canonical boundary tags** in PrepOS.

**Observed parse behavior:**

- `[CANONICAL_METADATA]` is **not recognized as a boundary**, so the “canonical metadata” section appears as **prelude** and is parsed into **Narrative blocks**.
- `[FINAL_VALIDATION]` is **not recognized**, so its content is **not stored** as a distinct representation in `parsed.representations`. (It remains “unmapped boundary” content in the raw markdown but not surfaced as a tab.)
- `[ENTITY_INDEX]` is parsed into `parsed.entity_index[]` blocks (separate field), but **is not rendered as a tab** and is **not persisted** to `note_blocks` by `flattenBlocks()`.

### 2.2 Representation block counts (from `parseMapMarkdown`)

The specimen parses into the following representation block counts:

- **Narrative**: 117 blocks  
- **Structural**: 77 blocks  
- **Revision**: 35 blocks  
- **Timeline**: 14 blocks  
- **Interpretations**: 16 blocks

### 2.3 Timeline block shape (critical)

Timeline chronology nodes are **not parsed** into any chronology-specific block type. Each chronology node becomes a **single `paragraph` block** containing embedded newlines:

- Example `timeline` paragraph content shape:
  - `━━━━━━━━━━\n1215 — [[Magna Carta]]\n━━━━━━━━━━\nEarly constitutional limitation on monarchy`

Also, the specimen includes literal `---` lines inside representations; these become plain `paragraph` blocks too (Timeline has 1, Narrative has 4, Revision has 1 in this specimen).

---

## 3) How PrepOS renders this specimen today (facts)

### 3.1 Timeline is routed correctly but rendered as prose

Timeline rendering path:

`renderRepresentationTab('timeline')` → `renderTimeline()` → `renderRepresentation(..., 'timeline')` → `renderBlock()` → `renderBlockBody()`.

**Key fact:** `renderTimeline()` is a thin alias around generic `renderRepresentation()`; it does not implement chronology rendering.

### 3.2 Divider leakage (Timeline + Narrative)

Because divider lines are plain paragraph text, Timeline HTML contains literal divider characters:

- **Observed output shape** (simplified):
  - `<p class="semantic-paragraph">━━━━━━━━━━\n1215 — …\n━━━━━━━━━━\nEarly …</p>`

So `━━━━━━━━━━` renders as **visible paragraph content**, not as an intentional divider element.

### 3.3 Chronology semantics collapse (Timeline)

Root renderer behavior:

- `renderBlockBody()` splits paragraphs on **blank-line boundaries only** (`\n{2,}`).
- Timeline chronology nodes in the specimen have **single newlines** between divider/event/annotation, so the entire node stays inside **one `<p>`**.
- HTML collapses newlines in a `<p>` into whitespace, producing **unstyled prose flow** instead of a 2-row (event + annotation) chronology structure.

Additionally:

- The Timeline layer heading `# ENGLISH REVOLUTION — CHRONOLOGY LAYER` becomes a `section` block with `content: null`, which renders as a collapsible `<details>` with an **empty body**, while chronology paragraphs render as **sibling** articles — so the “layer” does not semantically own its nodes in the DOM.

### 3.4 Retrieval cue instability (Narrative)

The specimen uses:

```
Retrieval Anchor:
### [[Ship Money]] → arbitrary taxation without parliamentary consent
```

Observed render behavior:

- `Retrieval Anchor:` becomes a standalone paragraph `<p>Retrieval Anchor:</p>` (visually “floating”).
- The next line becomes a heading block (e.g. semantic level 3), so the cue and its payload are **disconnected** unless the reader mentally binds them.

This matches the stabilization brief’s “retrieval emphasis instability”.

### 3.5 Literal `---` lines leak as paragraphs

The specimen includes many Markdown-like separator lines `---`. In PrepOS’s current parsing/rendering pipeline, `---` is treated as ordinary non-empty text, so it becomes a `paragraph` block and renders as `<p>---</p>` unless authored with blank-line structure that changes grouping.

There is no global “separator stripping” in `map-parser.js` or `note-renderer.js` today.

---

## 4) Where each failure lives (authority audit)

### Renderer-level (primary)

- **No semantic detection** for:
  - divider lines (`━━━━━━━━━━`, `────────`, etc.)
  - chronology event rows (`YYYY — [[Topic]]`)
  - retrieval cue paragraphs (`Retrieval Anchor:`)
  - semantic spacing rhythm / intentional beat lines
- Timeline uses the generic prose pipeline (`renderBlockBody` → `<p>…</p>`).

### Parser-level (secondary, amplifying)

- `extractBlocks()` only recognizes: `section`, `list`, `paragraph`.
- It does not classify chronology constructs.
- Timeline “node” structure is stored as a single paragraph with embedded newlines, making renderer-side stabilization harder unless the renderer splits on single newlines or detects divider blocks inside paragraph content.

### Protocol mismatch (specimen vs PrepOS tags)

- `[CANONICAL_METADATA]` / `[FINAL_VALIDATION]` are not recognized boundaries in PrepOS’s canonical tag set, so they’re not represented as tabs/blocks the way the specimen expects.

---

## 5) Minimal baseline conclusions (pre-fix)

- PrepOS currently renders the specimen’s semantic markdown **as generic prose blocks** for Timeline and for several “utility” constructs inside Narrative/Revision.
- Divider leakage (`━━━━━━━━━━`, `---`) and chronology collapse are **expected outcomes** of the current `paragraph` model + `\n\n` splitting rule.
- Retrieval cues are semantically present but **not grouped** with their associated heading payload.

This audit establishes the concrete target behaviors described in `IMPLEMENTATION_Renderer_Stabilization.md` before any stabilization changes are introduced.

