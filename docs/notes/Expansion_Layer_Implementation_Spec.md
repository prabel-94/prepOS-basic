# PrepOS Expansion Layer — Implementation Spec

PrepOS does **not** parse “Expansion Units” as a special grammar. An Expansion Unit is any ATX heading inside an `[EXPANSION]` section, grouped at render time into a collapsible card.

**Core files:** `js/notes/map-parser.js`, `js/notes/note-renderer.js`, `js/notes/semantic-hierarchy.js`, `js/notes/reading-ergonomics.js`, `js/anchors/anchor-renderer.js`, `css/style.css` (`.semantic-expansion-cards`).

---

## 1. Parsing

**Layer start:** a line matching `^\s*#?\s*\[([A-Z][A-Z0-9_]+)\]\s*$` that resolves to `EXPANSION`.

Accepted:

- `[EXPANSION]`
- `# [EXPANSION]`
- `#[EXPANSION]`

Not a boundary: `## [EXPANSION]` (only one optional `#`).

**Layer end:** next registered section boundary (`[NARRATIVE]`, `[STRUCTURAL]`, etc.) or EOF.

**Unit start / end:** there is no `BEGIN`/`END` marker and no recognition of the string `"Expansion Unit"`.

| Event | Rule |
|--------|------|
| Unit start | Any ATX heading `#`–`######` inside the Expansion body → `block_type: "section"` |
| Unit end | Next heading with `hierarchy_level <=` this section’s level (peer or higher) |
| Nested body | Deeper headings (`###` under `##`) stay inside the parent until a peer/higher heading |

Implementation: parse creates a `section` block (usually empty `content`); body lines become sibling `paragraph` / `list` / nested `section` blocks. Grouping is in `collectSectionBodyBlocks` at render time.

**Are headings mandatory?**  
For collapsible “units”: yes — without headings you only get flat paragraphs/lists. Headings are not required for the `[EXPANSION]` layer to parse.

**Recognised heading levels:** ATX `#`–`######` only (`^(#{1,6})\s+(.+)$`). Setext (`===` / `---`) is not headings. `#Title` without a space after `#` is not a heading.

**Multiple units per file:** yes — unlimited same-level headings = sequential sibling units. Multiple `[EXPANSION]` sections append into the same `representations.expansion` array.

**Blank lines:**

- End a paragraph (flush).
- Do not end a section or list by themselves.
- Not stored in block content.
- Separate blank-line-separated paragraphs become separate `paragraph` blocks (later joined visually as a fluid run).

**Nested headings:** yes. Child if `child.hierarchy_level > parent`; stop at `<= parent`. Nested collapsibles recurse.

---

## 2. Rendering

| Behavior | Implementation |
|----------|----------------|
| Display | HTML `<details>` / `<summary>` under class `semantic-expansion-cards` |
| Cards | CSS card chrome on `.semantic-expansion-cards .semantic-block--expansion` (border, radius, padding, background) — not a separate component |
| Collapsible | Yes (`shouldCollapseBlock` is true for Expansion sections) |
| Title only initially | **Level ≤ 2:** open by default (title + body). **Level ≥ 3:** closed (summary only until opened) |
| Empty heading-only section | Non-collapsible `semantic-section-heading-only` div |
| Inline / fluid prose | Consecutive heading-less paragraphs → one `.semantic-paragraph-run` (not hover/popover expansion) |
| Search indexing | No unit-level search/FTS. Only `[[...]]` → `topic_links` harvest + render-time semantic anchors |

Entry: `renderExpansion` → `renderRepresentation(..., "expansion")`.

---

## 3. Anchor Handling

**Detection:** `/\[\[([^\]]+)\]\]/g` in `map-parser.js` and `anchor-renderer.js`.

| Question | Answer |
|----------|--------|
| Rendered inline? | Yes — interactive semantic anchors when a map exists; otherwise topic-link / escaped plain text |
| In headings? | Yes (e.g. `## Expansion Unit 3 — [[Magna Carta]]`) |
| Multiple per paragraph? | Yes (global regex) |
| Restrictions | Empty `[[]]` skipped; names normalized/deduped via `normalizeAnchorName`. Nested `]` inside the label is not supported. No Expansion-specific ban on `[[...]]` |

`` ```text `` / `` ```ra `` fences become `retrieval_anchor` blocks in any layer (including Expansion); there is no Expansion-only ban in code.

---

## 4. Markdown Rules

**Supported in Expansion:**

| Syntax | Support |
|--------|---------|
| ATX headings `#`–`######` | Yes |
| Paragraphs | Yes |
| Lists `-` `*` `•` `1.` `1)` | Yes |
| `[[wiki anchors]]` | Yes |
| `**bold**` | Yes (`renderMarkdownEmphasis`) |
| Pipe tables | Yes (`parseMarkdownTable`) |
| Purpose blockquotes | Yes if first line is `> **…Purpose…**` (or Malayalam `ലക്ഷ്യം`) |
| Dividers `---` / `━━━` | Yes → `.semantic-divider` |
| Standalone `↓` | Treated as retrieval-chain arrow in renderer |

**Not full CommonMark:**

| Syntax | Behavior |
|--------|----------|
| Italics `*…*` / `_…_` | Not rendered as italics; shown as literal escaped text |
| `[text](url)` | Not first-class links |
| Generic `` ``` `` fences | Only `` ```text `` / `` ```ra `` are special; other fences are ordinary lines |
| Setext headings | Not headings |

**What breaks / mis-parses:**

- `## [EXPANSION]` never opens the layer.
- Unclosed `` ```text `` / `` ```ra `` consumes until closing `` ``` `` or EOF.
- `#Heading` (no space) is not a heading.
- A lone `---` line is a divider, not a heading underline.

---

## 5. Special Syntax

| Kind | What PrepOS actually recognises |
|------|----------------------------------|
| Layer tags | `[EXPANSION]` (plus other registry boundaries) |
| Alias | `INTERPRETATION` → `INTERPRETATIONS` (not Expansion-specific) |
| Purpose callout | `> **Expansion Purpose**` (title must match `/purpose/i` or `ലക്ഷ്യം`) |
| Fences | `` ```text ``, `` ```ra `` |
| Metadata | `[METADATA]` key:value elsewhere in the doc — no Expansion-specific keys |
| Reserved unit titles | **None** — `"Expansion Unit"`, `"Examination Insights"`, etc. are author conventions only |
| Hidden metadata on units | Optional `metadata_json.default_open` at render time; parser does not emit this for Expansion today |

---

## 6. Expansion-specific Formatting Rules

- **Canonical format in samples:** `## Expansion Unit N — Title` (level 2). Not enforced by code.
- **Renderer heading names:** none required.
- **“Examination Insight(s)”:** not special-cased anywhere in JS.
- **One H1 per unit:** not required. Samples use `##` for units; Malayalam samples often use `#`. Any level 1–6 works; open/closed default depends on level (≤2 open, ≥3 closed).

---

## 7. Real Example (as the parser expects)

From `docs/notes/msmdf-samples/english-revolution/English Revolution Expansion note (english).md`:

```markdown
# [EXPANSION]
## English Revolution (1603–1689)
### Part I — Constitutional and Religious Foundations

Unlike the Narrative Layer, the Expansion Layer does not retell the historical story. Instead, it develops the major concepts, institutions, and constitutional ideas that underpin the Narrative.

---

## Expansion Unit 1 — Why the English Revolution Matters

The English Revolution is regarded as one of the greatest constitutional revolutions in history because it permanently altered the relationship between the ruler and the governed.

---

## Expansion Unit 3 — [[Magna Carta]]

### Historical Context

King John's military failures and heavy taxation provoked widespread opposition among the English barons.

In 1215 they compelled him to accept the [[Magna Carta]].

### Constitutional Importance

Although originally intended to protect aristocratic privileges, Magna Carta gradually acquired far broader constitutional significance.

It established several enduring principles:

• The king is subject to law.

• Arbitrary government is illegitimate.

### Long-Term Legacy

Over succeeding centuries, Magna Carta came to symbolize:

- Rule of Law
- Limited Government
- Constitutional Liberty
```

**How this actually runs:**

1. `# [EXPANSION]` → Expansion representation.
2. Each `## …` → collapsible card, open by default.
3. Nested `### …` → nested collapsibles, closed by default.
4. Body after a heading is sibling blocks until the next peer/higher heading.
5. `[[Magna Carta]]` in heading and body → topic links / semantic anchors.
