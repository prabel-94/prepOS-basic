# Structural Layer Parser Specification

**Status:** Analysis only (no code changes)  
**Date:** 2026-07-21  
**Scope:** How the Structural Layer is parsed, stored, and rendered in PrepOS today; constraints for generation; Concept Graph compatibility.

**Verdict:** The Structural Layer is **not** a dedicated graph/relationship parser. It is the shared MSMDF block extractor (`extractBlocks` in `map-parser.js`) under `[STRUCTURAL]`, then a **heading-tree renderer** (`buildStructuralTree` / `renderStructural`). Protocol grammar (operators, Master Formula, Structural Blocks as semantic objects) is mostly **authoring convention**, not first-class parse types.

---

## 1. Current Parser Contract

### Entry point

| Stage | Module | Behaviour |
|-------|--------|-----------|
| Section split | `js/notes/map-parser.js` → `splitSections` / `parseMapMarkdown` | Detects `[STRUCTURAL]` (or `# [STRUCTURAL]`) |
| Block extract | `extractBlocks("structural", body)` | Same extractor as Narrative/Timeline/etc. |
| Persist | `js/notes/note-storage.js` → `flattenBlocks` | Rows with `representation_type: "structural"` |
| Render | `js/notes/note-renderer.js` → `renderStructural` | Builds tree from section headings |

### Expected markdown syntax

```text
[STRUCTURAL]          # or: # [STRUCTURAL]
# Domain / Title      # ATX headings #–######
## Subsection
### Entity / cluster

> **Structural Purpose**
> …purpose prose…

---

- bullet
  - nested bullet
1. numbered item

[[Wiki Entity]]

↓                     # protocol operator (plain text today)
+
=
```

### Heading hierarchy

| Rule | Actual behaviour |
|------|------------------|
| Supported levels | `#`–`######` → `hierarchy_level` 1–6 |
| Required names | **None** at parser level (no reserved domain names) |
| Ordering | **Significant** for tree shape and display order (`sequence_order`) |
| Duplicate headings | **Allowed** — become sibling nodes with distinct ids |
| Nested sections | **Yes** — via ATX depth; tree uses stack: child if `level > parent.level` |
| Arbitrary headings | **Yes** — any heading text is accepted |
| `## [STRUCTURAL]` | **Not** a section boundary (only optional single `#` before `[TAG]`) |

### Required section names

**Parser:** none.

**Protocol (MSMDF §3.11 / A.22):** Soft requirements — purpose callout; domain grouping; one Master Formula — **not enforced** by code.

### Block types produced under Structural

From `extractBlocks`:

1. `section` — ATX heading (`heading`, `hierarchy_level`)
2. `list` — consecutive list lines (`-`, `*`, `•`, `1.`, `1)`)
3. `paragraph` — everything else (including `---`, `↓`, purpose blockquotes, bare labels)
4. `retrieval_anchor` — only `` ```text `` / `` ```ra `` fences

---

## 2. Supported Structural Components

| Component | Status | Notes |
|-----------|--------|-------|
| Hierarchical heading tree | **Officially supported** | Core of `buildStructuralTree` |
| Nested bullet / numbered lists | **Officially supported** | Indent-aware (`nested-list.js`); mixed markers in one list block OK |
| Wiki anchors `[[Name]]` | **Officially supported** | Topic links / semantic anchors in headings & leaves |
| Layer purpose callout | **Officially supported** (render) | Blockquote + `**…Purpose…**` / Malayalam `ലക്ഷ്യം` |
| `---` horizontal rules | **Officially supported** (render) | → `semantic-divider--hr` |
| Multi-level hierarchies | **Officially supported** | Depth capped visually at 4 for indent CSS |
| Collapsible sections | **Officially supported** | Custom toggles, not `<details>` |
| Lone `↓` / `+` / `=` / `➡️` operators | **Tolerated** | Stored as paragraphs; rendered as plain `<p>` leaves (not relationship nodes) |
| Bare label lines (`Cause`, `Objectives`) | **Tolerated** | Plain paragraphs under a section |
| `vs` contrast lines | **Tolerated** | Author convention in samples |
| `` ```text `` / `` ```ra `` fences | **Tolerated (unsafe for Structural UX)** | Parsed as `retrieval_anchor`, but structural renderer **does not** apply retrieval-chain chrome |
| Markdown tables | **Ignored as tables** | Become multi-line paragraphs; no table HTML on structural path |
| Diagrams / Mermaid | **Ignored / unsafe** | No special handling |
| Labelled edges (`A --rel--> B`) | **Ignored** | No relationship AST |
| Cross-links beyond `[[…]]` | **Not supported** | No block-to-block refs |
| `note_relationships` graph rows | **Schema only / unused** | Not written from Structural parse |
| Callouts other than purpose | **Ignored** | Ordinary `>` lines stay paragraph text unless purpose-shaped |
| Code blocks (generic fences) | **Unsafe / incomplete** | Non-`text`/`ra` fences are **not** opened as fences; backticks may leak into paragraphs |

---

## 3. Rendering Behaviour

Pipeline:

```text
blocks[] → sort by sequence_order
        → buildStructuralTree (section nodes + attached content)
        → renderStructuralSectionNode (recursive)
```

### Collapsible behaviour

- Custom `+/-` button (`.structural-toggle`), not `<details>`
- Default expand (`defaultStructuralExpanded`):
  - depth `0` → open
  - depth `1` and `semanticLevel ≤ 3` → open
  - deeper → closed
- Session map `structuralSessionState` remembers toggles
- Ancestors auto-expand for layer-flip alignment (`expandStructuralAncestors`)

### Indentation

- Tree depth → `data-depth` clamped to `0–4`
- CSS pads by `data-depth`; left rail on `.structural-content`
- `--structural-depth` is set inline but **unused** by CSS

### Heading rendering

- Semantic level = clamped parser level; for structural with `depth > 0`, level bumps by at most +1
- Tag = `h{level+1}` (capped `h6`) → `#` → `h2`, etc.
- Headings resolve `[[anchors]]` as `<span>` (not clickable buttons) inside the tree header

### Nested section rendering

- Content blocks of a node render **before** child sections
- Orphan pre-heading content → `.structural-orphan-content` (samples usually put purpose under the first `#` title instead)

### Anchor rendering

- `[[Entity]]` → topic links / semantic anchors via `resolveInlineSemantics`
- Dense paragraphs (≥3 wiki links) get `semantic-paragraph--dense`

### Parser / renderer limitations

- Structural path **does not** call `renderSemanticParagraph`, so it misses:
  - retrieval arrow chrome for `↓` / `->` / `→`
  - markdown tables
  - full retrieval-anchor chain UI
- Heading lines flush immediately: body after a heading is a **separate** block, not `section.content`
- Blank lines flush paragraphs; lists continue across skipped blank lines
- Numbered and bullet markers share one list tree; nesting is indent-based, not marker-type-based

### Formatting restrictions (practical)

Prefer ATX headings + indented lists + `[[anchors]]` + optional purpose/`---`/`↓` text. Avoid relying on tables, generic fences, or operator semantics for machine-readable structure.

### CSS hooks

| Selector | Role |
|----------|------|
| `.structural-hierarchy.semantic-structural-flow` | Max-width reading column |
| `.structural-group` / `[data-depth="1"–"4"]` | Depth padding |
| `.structural-heading-row`, `.structural-toggle`, `.structural-indicator` | Expand/collapse chrome |
| `.structural-content` / `.collapsed` | Panel body; `display: none` when collapsed |
| `.structural-orphan-content` | Pre-heading body |
| `.msmdf-layer-purpose--structural` | Purpose callout styling |

---

## 4. Data Model

### Database (`note_blocks`)

From `supabase/migrations/20260601000000_notes_canonical_infrastructure.sql` (+ variant migration):

| Column | Role for Structural |
|--------|---------------------|
| `variant_id` | Language variant owner |
| `representation_type` | `"structural"` |
| `block_type` | `section` \| `list` \| `paragraph` \| `retrieval_anchor` |
| `heading` | ATX text (sections) |
| `content` | Body / list lines |
| `hierarchy_level` | 1–6 for sections |
| `sequence_order` | Document order |
| `metadata_json` | e.g. `msmdf_boundary`, `renderer_profile: "structural"`, `fence_lang` |

Related unused graph table: `note_relationships (source_entity, relationship_type, target_entity)` — **never populated** by the Structural parser.

### Parser output shape

```js
{
  representations: {
    structural: [
      {
        representation_type: "structural",
        block_type: "section" | "list" | "paragraph" | "retrieval_anchor",
        heading: string | null,
        content: string | null,
        hierarchy_level: number | null,
        sequence_order: number,
        metadata_json: { msmdf_boundary, section_source, renderer_profile, ... }
      }
    ]
  },
  topic_links: [...],
  parser_diagnostics: {...}
}
```

### Internal AST

Not a protocol Structural-Block AST. Runtime-only tree:

```js
{
  id, heading, hierarchy_level, sequenceOrder,
  blocks: [/* non-section children */],
  children: [/* nested section nodes */]
}
```

### Renderer expectations

- At least one block with content or headings
- Sections drive collapse UI; lists/paragraphs fill panels
- Empty structural bucket → tab omitted (`tabPolicy: "blocks"`)

### Registry

`js/notes/note-representations.js` registers Structural as:

- `id: "structural"`
- `msmdfTag: "STRUCTURAL"`
- `role: "cognition"`
- `tabLabel: "Structural"`
- `readingClass: "semantic-structural-flow"`
- `persist: true`

---

## 5. Structural Layer Constraints

### Hard (breaks or degrades parse/render)

1. Must include a recognized `[STRUCTURAL]` boundary line.
2. Use ATX headings `#`–`######` for hierarchy — not bold-only “fake headings”.
3. Do not use `## [STRUCTURAL]` as the layer boundary.
4. Nesting is by heading level, not by numbering text (`1.` / `1.1` are cosmetic).
5. List nesting requires real indentation (spaces/tabs), not visual-only alignment.
6. Purpose callout must be a contiguous blockquote with first line `**…Purpose…**` (or `**…ലക്ഷ്യം**`) and ≥1 body line — or it renders as raw `>` text.
7. Do not rely on blank-line-separated “Structural Blocks” as separate semantic objects — they are flat paragraphs under the current heading.
8. Fenced code blocks other than `text`/`ra` are not first-class Structural constructs.
9. Pipe tables will not render as tables in Structural.
10. Avoid assuming `↓` creates edges — it is plain text today.

### Soft (protocol / quality; not code-enforced)

- Purpose block at start of knowledge layers (MSMDF §3.11)
- One conceptual relationship per Structural Block (A.22)
- Domains group related blocks
- One Master Formula per major topic
- Derive from Narrative + Expansion; no new facts
- Prefer operators `↓` `+` `=` `➡️` (A.6)

### Edge cases

- Same-level consecutive `#` headings → **siblings**, even if numbering implies nesting
- Purpose placed after `# Title` nests **inside** that title’s panel (sample pattern)
- Duplicate headings → duplicate UI nodes
- Very deep trees: indent CSS stops changing after depth 4; collapse still works

---

## 6. Existing Examples & Pattern Classification

Samples:

- `docs/notes/msmdf-samples/english-revolution/English Revolution Structural (english).md`
- `docs/notes/msmdf-samples/english-revolution/English Revolution Structural (mal).md`

| Pattern | Classification |
|---------|----------------|
| `# [STRUCTURAL]` then topic `#` title | **Convention** (works; purpose hangs under title) |
| `> **Structural Purpose**` / Malayalam purpose | **Protocol requirement** + **renderer-supported** |
| Numbered domains `# 1. …` / `# 2. …` | **Author preference** (parser only sees level 1 siblings) |
| `##` subsections, `### [[Entity]]` | **Parser requirement** for nesting + **convention** for entity-as-heading |
| Nested `-` lists with indent | **Parser/renderer requirement** for hierarchy in lists |
| `---` between clusters | **Renderer-supported divider**; protocol-neutral |
| Lone `↓` progression chains | **Protocol grammar** + **historical convention**; **not** parsed as relationships |
| Labels like `Cause`, `Objectives`, `vs` | **Author preference** |
| `# Master Structural Flow` with `+` / `↓` | **Protocol Master Formula idea**; stored as headings + paragraphs |
| Parallel EN/ML structure | **Convention** for bilingual variants |

English sample empirically: **283 blocks** — ~72 sections, ~50 lists, ~161 paragraphs (many are `↓` or `---`).

---

## 7. Future Compatibility — Concept Graph

### Can the current parser support richer graphs?

| Need | Today | Gap |
|------|-------|-----|
| Multi-level hierarchies | Yes (headings + lists) | OK |
| Concept networks | Partial via `[[anchors]]` | No edges between concepts |
| Labelled relationships | No | Operators not typed |
| Dependency / causal chains | Visual `↓` only | No chain/block object |
| Graph-like markdown | No | Would need new syntax or post-pass |
| Persist graph | `note_relationships` exists | Unused by app |

**Conclusion:** Good enough for **collapsible concept outlines**; **not** sufficient for a true Concept Graph without parser enhancements. Protocol A.22 already *claims* Structural Blocks / operators / Master Formulae should be first-class — implementation lags.

### Minimal backward-compatible enhancements

1. **Operator recognition pass** (post-`extractBlocks` or in structural render): treat runs of `paragraph` lines alternating `node / ↓|→|+|=|➡️ / node` as `relationship_chain` blocks — leave unknown paragraphs alone.
2. **Structural Block boundaries**: optional explicit fence or blank-line+heading heuristic that groups chains under a domain without changing old samples’ HTML much.
3. **Master Formula detector**: heading matching `/Master Structural|Master Formula/i` + following `=`/`+` pattern → `block_type: "master_formula"`.
4. **Populate `note_relationships`** from chains (`source`, `relationship_type` from operator, `target`) while keeping `note_blocks` as source of truth for text.
5. **Structural renderer**: map chains to compact flow UI (reuse retrieval-arrow styling) without requiring authors to change existing `↓` samples.
6. **Optional labelled edge syntax** (new, additive), e.g. `[[A]] --causes--> [[B]]`, ignored by old renderer path until enabled.

Do **not** require graph syntax for existing notes — detect patterns in current plain text.

---

## Deliverable Summary

### 1. Current parser contract

Shared MSMDF extractor under `[STRUCTURAL]`; hierarchy = ATX 1–6; content = list/paragraph/retrieval_anchor; no required domain names; order matters; duplicates OK; nesting via heading levels.

### 2. Rendering behaviour

Collapsible heading tree with shallow-open bias; indent by depth; purpose asides; `---` → HR; `[[anchors]]` resolved; operators/tables/retrieval fences largely plain or underpowered on this path.

### 3. Supported syntax

`[STRUCTURAL]`, `#`–`######`, nested lists, wiki links, purpose blockquotes, `---` dividers.

### 4. Unsupported / non-semantic syntax

Labelled graph edges, tables-as-tables, Mermaid, typed Structural Blocks, Master Formula objects, operator AST, `note_relationships` writes.

### 5. Constraints generation must follow

Valid boundary tag; real ATX + indent nesting; purpose shape if desired; don’t depend on operator/table/fence semantics; expect same-level `#` to be siblings.

### 6. Recommended generation rules

- Open with `[STRUCTURAL]` + purpose callout
- Domains as `#`, clusters as `##`, entities as `### [[Name]]`
- Facts in indented bullets; use `---` between clusters
- Use `↓` / `+` / `=` for human-readable chains (future-detectable)
- End with `# Master Structural Flow` formula
- Keep prose minimal; put explanation in Narrative/Expansion
- Mirror structure across language variants

### 7. Suggested parser enhancements

Additive operator-chain / Master Formula / optional labelled-edge detection + optional `note_relationships` sync; keep flat-block storage and tree render as default so current samples remain valid.

---

## Code & protocol anchors

| Area | Location |
|------|----------|
| Parser | `js/notes/map-parser.js` (`extractBlocks`, `parseMapMarkdown`) |
| Tree + render | `js/notes/note-renderer.js` (`buildStructuralTree`, `renderStructural`, `bindStructuralCollapse`) |
| Nested lists | `js/notes/nested-list.js` |
| Purpose callouts | `js/notes/msmdf-layer-purpose-block.js` |
| Semantic levels | `js/notes/semantic-hierarchy.js` |
| Collapse defaults | `js/notes/reading-ergonomics.js` |
| Storage | `js/notes/note-storage.js` |
| Registry | `js/notes/note-nxt.js` |
| Schema | `supabase/migrations/20260601000000_notes_canonical_infrastructure.sql` |
| Protocol | MSMDF v3.1 §3.11, §8, A.6, A.22 |
| Samples | `docs/notes/msmdf-samples/english-revolution/*Structural*` |
| Render tests | `js/notes/note-renderer-fixes.test.js` (`structural layer rendering`) |
| Parser tests | `js/notes/map-parser.test.js` (`[STRUCTURAL] with heading hierarchy`) |
