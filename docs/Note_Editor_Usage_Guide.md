# Note Editor — Usage Guide

**Audience:** Teachers and admins authoring canonical MSMDF notes  
**Last updated:** June 2026

---

## Overview

PrepOS notes use **semantic markdown (MSMDF v1.2)** — a structured text format with section tags like `[NARRATIVE]` and `[STRUCTURAL]`. Teachers typically:

1. **Import** a note (paste or upload MSMDF)
2. **Refine** in the draft editor
3. **Save** and **publish** per language (English / Malayalam)

The editor is **not** a rich-text Word processor. You edit **plain markdown** either through a visual preview or a source textarea. What you see in preview maps back to the underlying MSMDF file.

---

## Getting started

### Open the draft editor

| Step | Action |
|------|--------|
| 1 | From Question Bank or teacher home, use **Import canonical note** for a new topic, or open an existing draft |
| 2 | URL pattern: `note.html?variant={id}&mode=draft` |
| 3 | Requires **teacher or admin** role and a variant with status **draft** |

### First import (`notes-import.html`)

- **Paste**, **upload**, or **drag-drop** an `.md` / `.txt` file
- Review detected sections and topic links
- Choose language and **Save as draft** (or publish directly)
- You are redirected to the draft workspace

---

## Draft workspace layout

```
┌─────────────────────────────────────────────────────────┐
│  Topic title · DRAFT badge · Last updated               │
├─────────────────────────────────────────────────────────┤
│  [Edit] [Preview] [Source] [Metadata] [Save] [Publish]│
├─────────────────────────────────────────────────────────┤
│  Sections:  Narrative ✎ ×  |  Timeline ✎ ×  |  …       │  ← section inventory
├─────────────────────────────────────────────────────────┤
│  [Narrative] [Structural] [Timeline] … [+ Add section]  │  ← representation tabs
├─────────────────────────────────────────────────────────┤
│  Semantic state summary (anchors, candidates)           │
│  … rendered note content …                              │
└─────────────────────────────────────────────────────────┘
```

**Important:** Changes are held in memory until you click **Save Draft** or **Publish**. There is no autosave.

---

## Three editing modes

| Mode | Button | Best for |
|------|--------|----------|
| **Edit** | `Edit` | Day-to-day refinement — click paragraphs, headings, and lists in the preview |
| **Preview** | `Preview` | Read-only check (same view students will see); anchor inspection still works |
| **Source** | `Source` | Full MSMDF document, bulk paste, `[METADATA]`, fixes preview cannot reach |

Switch modes anytime. Unsaved edits in the source textarea carry across mode switches.

---

## Section management

### Section inventory strip

Above the representation tabs, a **Sections** row lists every MSMDF section in the document:

- **✎** — open the section editor modal (edit body only; the `[TAG]` stays in source)
- **×** — delete the section (confirmation required); removes tag and all body content
- **custom** badge — teacher-defined section types

### Add a section

Click **+ Add section** on the tab bar.

| Option | What you do |
|--------|-------------|
| **Standard MSMDF section** | Pick type (Narrative, Structural, Timeline, etc.) and paste/type **body only** — the `[NARRATIVE]` tag is added automatically |
| **Custom section** | Enter a name (e.g. “Case Studies”), choose how it renders, paste body — creates `[EXT:CASE_STUDIES]` and a new tab |

Live preview shows block count and topic links before you confirm.

### Edit or delete a section

- **Edit:** inventory ✎ or add flow — change body text; section tag unchanged
- **Delete:** inventory × — removes entire section from markdown; custom types are also removed from section definitions

After any section change, click **Save Draft** to persist.

---

## Inline editing (Edit mode)

### Click to edit

In **Edit** mode, editable blocks show a subtle hover outline. Click to edit:

| Block type | Where |
|------------|-------|
| Paragraphs | All cognition tabs |
| Headings | Narrative, Structural tree headings, Revision/Interpretations collapsible titles |
| List items | Bullet and numbered lines |
| Quote highlights | Quotes tab (`>` prefixed lines) |
| Chronology events | Narrative and Timeline (click the event card) |

### Keyboard shortcuts (while editing a block)

| Key | Action |
|-----|--------|
| **Enter** | Split into two paragraphs (blank line in source); at the **end** of a block, opens a new empty paragraph and keeps you typing |
| **Shift+Enter** | Soft line break within the same paragraph |
| **Escape** | Discard edits and revert |

Click outside the block (or tab away) to **commit** changes to the source.

### What is not click-editable

Edit these in **Source** mode instead:

- Divider-only lines (`---`)
- Retrieval anchor blocks (`Retrieval anchor:` + ` ```text ` fence)
- Semantic escalation bundles (cue → heading → resolution groups)
- `[METADATA]` and `[ENTITY_INDEX]` sections

---

## Format toolbar

Select text inside an active editing block (or place the caret) to show the floating toolbar.

| Control | Inserts / effect | Available on |
|---------|------------------|----------------|
| **Topic** | `[[Topic Name]]` — searchable topic picker | All tabs |
| **Anchor** | `[[Anchor Name]]` — searchable semantic anchor picker | All tabs |
| **Heading…** | H2–H6 (`##` through `######`) | All tabs |
| **• List** | `- ` bullet prefix per line | All tabs |
| **1. List** | `1.` `2.` numbered prefix per line | All tabs |
| **Quote** | `> ` quote highlight (amber blockquote) | **Quotes** tab only |
| **Chrono** | Structured timeline event (divider / date — event / divider) | **Narrative**, **Timeline** |
| **Retrieve** | Retrieval anchor template with ` ```text ` fence | **Narrative** only |
| **Divider** | `---` at caret | All tabs |

**Topic vs Anchor:** Both use `[[…]]` syntax. **Topic** links navigate to other topic notes. **Anchor** links connect to the governed semantic anchor system (candidates, promotion, dormancy).

---

## Section-by-section tips

### Narrative

- Best tab for **fluid prose**, wiki links, and retrieval anchors
- Use **Retrieve** to insert a retrieval chain; edit steps in Source if needed
- Chronology snippets can appear inside narrative paragraphs — use **Chrono** or click existing events to edit

### Structural

- Content is organized as a **collapsible tree** from `##`–`######` headings
- **Click section headings** in the tree to edit them (same as narrative headings)
- Use the **Heading…** picker to set depth; deeper `##` levels nest under parents
- Leaf paragraphs under each heading are click-editable

### Timeline

- Use **Chrono** to insert events: `---` / `1947 — Independence` / `---`
- Click an existing chronology card to edit date, label, and optional annotation
- Plain paragraphs (non-chronology) are still click-editable

### Revision (includes Recall)

- `[RECALL]` content appears under the **Revision** tab
- Section headings inside collapsible blocks are **click-editable** on the summary line
- Compact layout — good for review bullets and recall prompts

### Interpretations

- Same editing model as Revision (collapsible sections + paragraphs)
- Good for multiple perspectives or debate points

### Quotes

- Use **Quote** in the toolbar to prefix lines with `>`
- Highlighted quotes render as amber blockquotes in the reader

### Custom sections

- Appear as their own tab with the name you chose
- Render according to the profile you picked (generic prose, structural tree, etc.)
- Marked **custom** in the section inventory

---

## Metadata

Click **Metadata** on the main toolbar (available in any mode).

Edits the `[METADATA]` block at the top of the MSMDF file:

| Field | Purpose |
|-------|---------|
| Title | Note title |
| Language | `english` or `malayalam` |
| Map version | MSMDF map version |
| Canonical version | Schema version (usually `1.2`) |
| Source type | e.g. `map` |

If no `[METADATA]` section exists, one is created when you save.

---

## Semantic anchors (draft preview)

In **Edit** or **Preview** mode, `[[anchor]]` markers in the text appear as interactive semantic anchors.

| Action | How |
|--------|-----|
| Inspect state | Click an anchor — candidate, canonical, dormant, etc. |
| Govern | Use actions in the inspector (promote, link to topic, dormancy) |

Anchor governance updates the database immediately; prose edits still require **Save Draft**.

---

## Save and publish

### Save Draft

1. Click **Save Draft**
2. The system re-parses MSMDF → regenerates blocks, topic links, and anchor links
3. Status confirms success; preview refreshes

Save often after large edits. Closing the browser before saving loses unsaved work.

### Publish Language Variant

1. Click **Publish Language Variant**
2. Review the **semantic publish advisory** (non-blocking)
3. Confirm publish
4. Prior published variant in the **same language** is archived (14 days), then removed
5. You are redirected to the published reader

English and Malayalam publish **independently**.

---

## Source mode reference

Switch to **Source** for power editing. Minimal MSMDF structure:

```markdown
[METADATA]

title: My Topic Note
language: english

[NARRATIVE]

Opening paragraph with a [[Related Topic]] link.

## Subsection

More prose.

[STRUCTURAL]

## Major phase

Detail under this heading.

[TIMELINE]

---
1947 — Independence
---
End of British rule

[QUOTES]

> Important quote line here

[REVISION]

- Key fact one
- Key fact two

[RECALL]

Quick recall prompt

[EXT:CASE_STUDIES]

Custom section body (if you created a custom type)
```

Section tags must be on their own line (optional single `#` prefix allowed: `# [NARRATIVE]`).

---

## Workflow cheat sheet

| Goal | Steps |
|------|-------|
| New note from scratch | Import → paste minimal `[NARRATIVE]` body → Save draft → + Add section for more |
| Fix a typo | Edit mode → click paragraph → edit → Save Draft |
| Add wiki link | Select text → **Topic** or type `[[Name]]` |
| Add timeline event | Timeline tab → edit a paragraph → **Chrono** (or click existing event) |
| Add structural outline | Structural tab → **Heading…** or Source `##` lines |
| New custom tab | + Add section → Custom → name + content |
| Bulk restructure | Source mode → edit full markdown → Save Draft |
| Publish to students | Save Draft → Publish Language Variant |

---

## Limitations (know before you edit)

| Limitation | Workaround |
|------------|------------|
| No autosave | Click **Save Draft** regularly |
| No rich text (bold/italic buttons) | Use markdown conventions in Source if needed |
| No images or attachments | Not supported in MSMDF v1.2 |
| Retrieval anchors / escalation groups | Edit in Source |
| Undo/redo | Not available — use Escape before blur, or Source + git history |
| Entity index | Parse-only today — edit `[ENTITY_INDEX]` in Source |

---

## Related docs

- `docs/Note_Editor_Capabilities_Audit.md` — full capability matrix
- `docs/Note_System_Complete_Audit.md` — system architecture
- `docs/Note_Section_Definition_Phase2_Design.md` — custom sections design

---

*For import syntax help, see the checklist on `notes-import.html` when parsing a file.*
