# Note Editor — Capabilities Audit

**Date:** June 11, 2026  
**Scope:** Draft workspace (`note.html?mode=draft`), import entry (`notes-import.html`), and supporting modules  
**Audience:** Product/engineering reference for what teachers can do today vs. what is missing

---

## Executive summary

PrepOS has a **dual-surface draft editor** for canonical MSMDF notes:

| Surface | Role |
|---------|------|
| **Edit mode (default)** | Click-to-edit on the rendered preview; changes sync back to raw markdown |
| **Preview mode** | Read-only representation tabs (same renderer as students) |
| **Source mode** | Full-document monospace textarea for power users |
| **+ Add section** | Modal to append a new MSMDF section without hand-typing tags |

Initial content still enters via **Import canonical note** (`notes-import.html`) — paste, upload, or drag-drop a full MSMDF file. The draft workspace is for refinement and publish.

**Maturity:** Strong for MSMDF-native paragraph editing and semantic preview; weak for section lifecycle (no delete/reorder/edit-section modal), no autosave, and preview-edit mapping has known fragility.

---

## 1. Entry points

| Path | Who | Purpose |
|------|-----|---------|
| `note.html?variant={id}&mode=draft` | Teacher, admin | **Primary editor** |
| `notes-import.html?id={topic}` | Teacher, admin | First import / new language variant |
| `note.html?variant={id}` (no draft mode) | All roles | Published **reader** — not an editor |
| Teacher home / QB → Import canonical note | Teacher | Routes to import, then draft |

Draft mode requires `variant.status === 'draft'` and teacher/admin role.

---

## 2. Draft workspace — view modes

Toolbar (`note-draft-editor.js`):

| Button | Mode | Behavior |
|--------|------|----------|
| **Edit** | `edit-preview` | Default on load. Rendered tabs + inline editing |
| **Preview** | `preview` | Read-only tabs; anchor governance still works |
| **Source** | `edit` | Hides tabs; shows `#semanticSourceEditor` textarea |
| **Save Draft** | — | `regenerateVariantFromMarkdown()` → DB blocks, links, anchors |
| **Publish Language Variant** | — | Advisory semantic review → publish → redirect to published reader |

Unsaved changes are held in the textarea until **Save Draft** or **Publish**. Status line shows e.g. “Updated (unsaved)” after inline edits.

---

## 3. Representation tabs (reader parity)

Tabs appear for any MSMDF cognition section that has parsed blocks:

| Tab | MSMDF tag | Editable in preview? |
|-----|-----------|----------------------|
| Narrative | `[NARRATIVE]` | Yes |
| Structural | `[STRUCTURAL]` | Yes (headings, paragraphs; collapse UI in preview) |
| Revision | `[REVISION]` | Yes |
| Timeline | `[TIMELINE]` | Partial (chronology blocks excluded from edit map) |
| Interpretations | `[INTERPRETATIONS]` | Yes |
| Quotes | `[QUOTES]` | Yes (+ quote highlight formatting) |
| Recall | `[RECALL]` | Merged into Revision tab — not a separate tab |

Infrastructure sections (`[METADATA]`, `[ENTITY_INDEX]`) are not tabs; edit only via **Source**.

---

## 4. Inline preview editing (Edit mode)

**Modules:** `note-preview-editor.js`, `note-editable-map.js`, `note-source-patch.js`, `note-preview-format-toolbar.js`, `note-source-transforms.js`

### How it works

1. `buildEditableUnitMap()` parses markdown and maps paragraphs, headings, and list lines to **character ranges** in the raw source.
2. Renderer marks editable nodes with `data-editable-id` and class `note-preview-editable`.
3. Teacher clicks a unit → `contentEditable` plain text → on blur, `replaceUnitRange()` patches the textarea.

### Interaction

| Action | Behavior |
|--------|----------|
| Click paragraph / heading / list item | Begin editing that unit |
| **Enter** | Split into two paragraphs (`\n\n` in source) |
| **Shift+Enter** | Soft line break within paragraph |
| **Escape** | Revert unit text; discard edits |
| Blur | Commit to source (triggers preview refresh) |

### Floating format toolbar (on text selection)

| Control | Effect |
|---------|--------|
| **Link** | Selection → `[[Selected]]`; or prompt for `[[Topic Name]]` |
| **H2 / H3** | Convert selection or whole unit to `##` / `###` heading |
| **• List** | Prefix lines with `- ` bullets |
| **Quote** | Visible only on **Quotes** tab; prefix lines with `> ` |
| **Divider** | Insert `---` at caret |

Toolbar edits apply to the **active unit’s text**, then sync to full markdown.

### What is **not** editable in preview

(`note-editable-map.js` — `isParagraphEditableForDraft`)

- Empty paragraphs
- Divider-only lines (`---`)
- Chronology-style timeline paragraphs (multi-line with `---` separators)
- `Retrieval anchor:` labels
- Blocks that fail `indexOf` match in source (duplicate text, drift)
- Semantic anchor markup (governed via anchor inspector, not inline prose edit)
- **Recall** blocks as distinct units (live under Revision representation)

---

## 5. Section management

### Implemented: **+ Add section**

**Modules:** `note-section-modal.js`, `note-section-markdown.js`, `note-section-catalog.js`

| Capability | Detail |
|------------|--------|
| Open from | Tab bar in Edit or Preview mode (also when no sections exist) |
| Section picker | All addable builtins: Narrative, Structural, Revision, Timeline, Interpretations, Quotes, Recall |
| Input | Paste/type **body only** — `[TAG]` added automatically |
| Validation | Rejects empty body; rejects nested `[SECTION]` lines in paste |
| Live preview | Block count + topic link count before add |
| Insert order | By registry `tabOrder`, not always document end |
| Persist | Updates textarea only until Save Draft |

### Not implemented

| Capability | Status |
|------------|--------|
| Edit entire section in modal | Missing |
| Delete section | Missing |
| Reorder sections | Missing |
| Custom section types (`[EXT:…]`) | Designed (Phase 2), not shipped |
| Section inventory UI | API exists (`getSectionInventory`); no UI strip |
| Append to existing vs new boundary | Both work at parse level; UI does not distinguish |

---

## 6. Source mode

| Capability | Detail |
|------------|--------|
| Editor | `#semanticSourceEditor` — monospace textarea |
| Format | Full MSMDF v1.2 document |
| Autocomplete for `[[topics]]` | No |
| Section tag hints | No (syntax help only on import page) |
| Syntax highlighting | No |
| Parse-on-type | No — parse on Save / mode switch |

Appropriate for bulk paste, metadata/entity_index edits, and fixes preview-edit cannot reach.

---

## 7. Import page (`notes-import.html`)

Separate from draft workspace but part of the authoring pipeline:

| Capability | Detail |
|------------|--------|
| Paste MSMDF | Full document |
| File upload | `.md`, `.markdown`, `.txt` |
| Drag-and-drop | Same file types |
| Parse | Section checklist + topic link detection |
| Language | English / Malayalam |
| Save | Draft or publish on save |
| Existing variants | Shows published/draft per language; create draft revision |
| Redirect | To draft workspace or published reader |

Import does **not** offer inline preview editing — only parse review then save.

---

## 8. Semantic / anchor integration (draft)

| Capability | Detail |
|------------|--------|
| Semantic state summary | Shown above tab content in preview |
| Click anchors in preview | Governance actions (promote, dormancy, etc.) via `anchor-governance.js` |
| Publish review | Non-blocking modal listing candidates, dormant, canonical refs |
| Topic links `[[…]]` | Created via format toolbar or source; resolved on save |
| Backlinks panel | **Disabled** in draft workspace (`backlinksEl` cleared) |

---

## 9. Publish & lifecycle

| Capability | Detail |
|------------|--------|
| Save draft | Regenerates `note_blocks`, `note_sources`, topic links, anchor links |
| Publish | Archives prior published variant in same language (14 days) |
| Language streams | Independent per English/Malayalam |
| Create draft from published | From import page or teacher home — copies published source |
| Discard draft | No UI |
| View archived variants | No UI |

---

## 10. Technical architecture

```
note-draft-editor.js          ← orchestrator
├── note-preview-editor.js    ← click-to-edit, keyboard
├── note-editable-map.js      ← source ↔ DOM unit ranges
├── note-source-patch.js      ← range replacements
├── note-preview-format-toolbar.js
├── note-source-transforms.js
├── note-section-modal.js     ← + Add section
├── note-section-markdown.js
├── note-section-catalog.js   ← SectionDefinition (Phase 2 ready)
├── note-renderer.js          ← tabs + draftEditSurface attributes
├── note-storage.js           ← persist pipeline
└── note-publish.js           ← publish + review
```

**Persistence model:** Single blob `note_sources.raw_markdown` is source of truth; blocks are derived on each save.

---

## 11. Test coverage

| Module | Tests |
|--------|-------|
| `map-parser.js` | Yes |
| `note-representations.js` | Yes |
| `note-section-catalog.js` | Yes |
| `note-section-markdown.js` | Yes |
| `note-source-patch.js` | Yes (+ editable map) |
| `note-source-transforms.js` | Yes |
| `quote-highlight.js` | Yes |
| `note-import-file.js` | Yes |
| `note-preview-editor.js` | **No** |
| `note-draft-editor.js` | **No** E2E |
| `note-section-modal.js` | **No** |

---

## 12. Known limitations & risks

### Preview-edit mapping

- Units located via `markdown.indexOf(para, cursor)` — **duplicate identical paragraphs** can map to wrong range.
- After many edits, cursor-based sequential scan may miss units if source order diverges from parse order.
- No undo/redo; mistaken blur commits immediately to textarea (recoverable via Escape only while focused).

### UX gaps

- No autosave — data loss if tab closed before Save Draft.
- Link insertion uses `prompt()` — no topic autocomplete (legacy `topic-note.html` had suggest box).
- No visual indicator of which sections exist vs missing (only empty-state copy).
- **Recall** content editable only when viewing Revision tab, not labeled separately.

### Product gaps (vs. modern note editors)

- No rich text (bold/italic) — markdown conventions only
- No images / attachments
- No search within note
- No collaborative or locking editing
- No version history or diff
- No custom sections yet

---

## 13. Capability matrix (quick reference)

| Feature | Import | Draft Edit | Draft Preview | Source | Published reader |
|---------|--------|------------|---------------|--------|------------------|
| Paste full MSMDF | ✓ | — | — | ✓ | — |
| File upload | ✓ | — | — | — | — |
| Representation tabs | — | ✓ | ✓ | — | ✓ |
| Click paragraph edit | — | ✓ | — | — | — |
| Format toolbar | — | ✓ | — | — | — |
| + Add section | — | ✓ | ✓ | — | — |
| Full source edit | — | — | — | ✓ | — |
| Save / publish | ✓ | ✓ | ✓ | ✓ | — |
| Anchor governance | — | ✓ | ✓ | — | Read-only |
| Semantic anchors click | — | ✓ | ✓ | — | ✓ (student inspector) |
| Backlinks | — | — | — | — | ✓ |
| Language tabs | — | — | — | — | ✓ (reader) |
| Delete section | — | — | — | manual | — |
| Custom sections | — | — | — | — | — |

---

## 14. Recommended next steps (priority)

1. **Section edit modal** — open existing section body in same modal as Add; `replaceSectionBody()` in `note-section-markdown.js`.
2. **Section delete** — remove boundary + body from markdown; paired with inventory strip.
3. **Autosave debounce** — optional; reduces data-loss anxiety.
4. **Stable unit IDs** — block IDs in `metadata_json` or source offsets from parser, not `indexOf`.
5. **Topic link autocomplete** in format toolbar (reuse QB topic search).
6. **Phase 2 custom sections** — per `Note_Section_Definition_Phase2_Design.md`.

---

*Audit reflects codebase state as of June 11, 2026.*
