# Revision Representation Rendering Parity Audit

**Scope:** Diagnostic only (no fixes implemented).  
**Symptom:** `[REVISION]` renders correctly in **Draft Preview** but appears degraded in **Published Reader** (missing recall prompts, flattened groupings, altered rhythm).  
**Hypothesis under test:** Draft Preview Output ≠ Published Reader Output for the same note.

---

## Executive summary

**The renderer pipeline is shared.** Both Draft Preview and Published Reader call the same function:

```text
renderRepresentationTab('revision', representations, topicMap, renderOptions)
  → renderRevision()
  → renderRepresentation(..., 'revision')
  → renderBlock() / renderBlockBody()
```

There is **no legacy Revision renderer** and **no Revision-specific branch** that differs between draft and published.

**The divergence is not caused by different HTML generation logic for Revision.**  
It is caused by **different input payloads** (and often **different variant rows**) reaching the same renderer.

**Primary root cause:** Draft Preview renders **live-parsed** markdown from the textarea; Published Reader renders **persisted `note_blocks`** for the resolved variant — which is frequently **not the same variant** the teacher is previewing.

**Secondary amplifier (Revision-specific):** `[RECALL]` content is parser-merged into the `revision` representation at parse time. If the published variant’s stored blocks are stale relative to the draft textarea (especially missing merged recall blocks), **only the Revision tab** visibly degrades while other tabs may still appear to match.

---

## A. Root cause

### Primary: Data source + variant identity mismatch

| Aspect | Draft Preview | Published Reader |
|--------|---------------|------------------|
| **Entry** | `note-draft-editor.js` → `showPreviewMode()` | `note-reader.js` → `bootPublishedReader()` |
| **Representation source** | `prepareDraftSemanticPreview(textarea)` → `parseMapMarkdown(live)` | `loadVariantBundle(variantId)` → `groupBlocksByRepresentation(note_blocks)` |
| **Variant resolved** | Draft workspace variant (`status = draft`, `?variant=<draftId>&mode=draft`) | Published variant (`status = published`) when using home **Read** link (`?topic=...&lang=...`) |
| **topicMap** | `{}` (empty) | `buildTraversalTopicMap(note_topic_links)` |
| **semanticMap** | Always built from candidates + governed links | Built only if `preparePublishedStudentSemanticMap()` returns entries |

**Critical real-world path:**

1. Teacher publishes English variant **P**.
2. Teacher clicks **View draft** (or creates draft revision) → new/edited draft variant **D**.
3. Draft Preview parses **D’s textarea** (live, includes `[RECALL]` and latest edits).
4. Teacher clicks **Read** on home → `note.html?topic=...&lang=english` → loads **P**, not **D**.
5. **P’s `note_blocks`** may lack content present in **D’s live parse** → Revision tab looks “flattened” or incomplete.

This matches the observed symptom: **Active Recall visible in preview, missing in published Read.**

### Secondary: Unsaved / stale persistence

Even on the **same variant ID**:

- Draft Preview always parses **current textarea** (may include unsaved edits).
- Published Reader always renders **last persisted `note_blocks`**.

Publish **does** call `regenerateVariantFromMarkdown()` when `rawMarkdown` is passed (`note-draft-editor.js` → `publishCanonicalVariant(variant.id, { rawMarkdown })`), so blocks **should** match at publish time. Any comparison **before save/publish**, or after editing a **separate draft revision**, reintroduces mismatch.

### Not the root cause: Renderer fork

Verified: **no** `renderRevisionRepresentation`, **no** legacy published path, **no** Revision bypass of `note-renderer.js`.

Phase 1/1.1 semantic stabilization helpers (`semantic-escalation-group`, `chronology-group`, embedded chronology extraction) are gated to **`representationKey === 'narrative'`** only. They do **not** explain Revision-only divergence between draft and published.

---

## B. Evidence (code locations & call chains)

### Draft Preview chain

```text
note-draft-editor.js
  showPreviewMode()
    prepareDraftSemanticPreview(sourceEditorEl.value, { variantId })
      parseMapMarkdown(markdown)                    // LIVE PARSE
      attachSemanticCandidates / resolveAnchorCandidates
      buildSemanticMapFromCandidates
    renderPreviewContent()
      renderRepresentationTab(activeTab, previewParsed.representations, {}, previewRenderOptions)
```

Key lines:

- `js/notes/note-draft-editor.js` — `renderRepresentationTab(..., previewParsed.representations, {}, previewRenderOptions)`
- `js/anchors/anchor-preview.js` — `prepareDraftSemanticPreview()` uses `parseMapMarkdown`, not `note_blocks`

### Published Reader chain

```text
note-reader.js
  bootPublishedReader({ bundle })
    loadVariantBundle(ctx.variant.id)               // ALREADY LOADED
      fetchNoteBlocks(variantId)
      groupBlocksByRepresentation(blocks)
    renderActiveTab()
      renderRepresentationTab(activeTab, bundle.representations, bundle.topicMap, renderOptions)
```

Key lines:

- `js/notes/note-reader.js` — `renderRepresentationTab(activeTab, bundle.representations, bundle.topicMap, renderOptions)`
- `js/notes/note-selectors.js` — `loadVariantBundle()` → `fetchNoteBlocks()` + `groupBlocksByRepresentation()`

### Variant resolution divergence (home Read vs draft workspace)

**Teacher home Read link** (`js/notes/note-home.js`):

```javascript
// Published row → topic URL, NOT draft variant id
note.html?topic=<topicId>&lang=<language>
```

**Published resolution** (`js/notes/note-reader.js` → `resolveVariantContext`):

```javascript
fetchPublishedVariantForTopic(topicId, preferLang)  // status = 'published' only
```

**Draft workspace** requires `variant.status === 'draft'` and `mode=draft`.

So when both a **published variant** and a **draft revision** exist for the same language, **Read** and **Preview** intentionally target **different variant rows**.

### Storage pipeline (when blocks ARE persisted)

```text
saveNoteVariant / regenerateVariantFromMarkdown
  parseMapMarkdown(rawMarkdown)
  flattenBlocks(parsed)           // narrative, structural, revision, timeline, interpretations ONLY
  insertBlocksAndLinks()          // note_blocks rows
```

`[RECALL]` is **not** a separate stored representation. Parser merges it into `representations.revision` with `block_type: recall | recall_section` and `metadata_json.source_section: 'recall'` (`js/notes/map-parser.js`).

Publish status change alone does **not** rewrite blocks (`js/notes/note-publish.js`) unless `rawMarkdown` is supplied (draft publish flow does supply it).

### Renderer parity proof (controlled test)

When **identical revision blocks** and **identical renderOptions** are fed to `renderRepresentationTab('revision', ...)`:

- Live-parsed blocks vs `flattenBlocks`-shaped stored blocks → **HTML identical** (specimen test).
- Different `semanticMap` / `topicMap` → **structure identical**; only inline anchor markup differs.

Conclusion: **If block payloads match, output matches.**

---

## C. Impact assessment

| Area | Assessment |
|------|------------|
| **Revision only?** | **Most likely yes** in practice — `[RECALL]` merge affects `revision` block count/content disproportionately. Other tabs can match when only recall section differs between variants. |
| **Multiple representations?** | Same data-source divergence applies to all tabs; Revision shows it most clearly. |
| **Entire published reader?** | Published reader path is consistent; issue is **inputs**, not a separate published renderer. |
| **Rendering vs storage?** | Evidence points to **block payload / variant mismatch**, not anchor-count-only cosmetic difference. Semantic summaries can look fine while Revision blocks differ. |

### Revision-specific rendering behavior (same on both paths)

When blocks **do** match, both paths share:

- `shouldCollapseBlock()` → Revision sections/recall headings become `<details>` collapsibles
- `defaultCollapsibleOpen('revision', level)` → **level ≤ 2 open**, **level ≥ 3 closed by default**

On the English Revolution specimen: **19** collapsible `<details>`, **10 closed by default** (mostly `###` recall prompts). This affects draft and published **equally** when blocks match. It does **not** explain draft-good / published-bad unless published blocks are literally missing those sections.

---

## D. Representation comparison table

| Representation | Draft Preview source | Published Reader source | Renderer | Match if same variant + same source? |
|----------------|---------------------|-------------------------|----------|--------------------------------------|
| Narrative | Live parse | `note_blocks` | `renderNarrative` → shared | ✓ Yes |
| Structural | Live parse | `note_blocks` | `renderStructural` (tree) | ✓ Yes |
| **Revision** | Live parse (+ merged `[RECALL]`) | `note_blocks` | `renderRevision` → shared | ✓ Yes **if blocks match** |
| Timeline | Live parse | `note_blocks` | `renderTimeline` → shared | ✓ Yes |
| Interpretations | Live parse | `note_blocks` | `renderInterpretations` → shared | ✓ Yes |

**Semantic helper usage (Phase 1 stabilization):**

| Helper | Draft | Published | Revision affected? |
|--------|-------|-----------|-------------------|
| `renderSemanticHeading` | ✓ | ✓ | ✓ (headings) |
| `semantic-escalation-group` | ✓ | ✓ | ✗ (narrative-only) |
| `chronology-group` | ✓ | ✓ | ✗ (narrative/timeline-only) |
| `defaultCollapsibleOpen` | ✓ | ✓ | ✓ (Revision collapsibles) |
| `reading-ergonomics` | ✓ | ✓ | ✓ |

---

## E. Recommended fix (smallest path to parity)

**Goal:** `Draft Preview Output = Published Reader Output` for the same language stream.

### Recommended (minimal, high confidence)

**1. Align variant resolution for teacher Read**

When a draft revision exists, teacher **Read** from home currently opens the **published** variant via topic URL. For parity testing (and possibly product intent), consider:

- Teacher **Read** on a published row → `note.html?variant=<publishedId>` (explicit variant)
- Or show which variant is being read (draft vs published badge)

This does not fix stale blocks but removes the **wrong-variant** comparison trap.

**2. Published reader: render from source markdown (parity with preview)**

Smallest semantic fix aligned with “draft preview is source of truth”:

```text
bootPublishedReader:
  fetch note_sources.raw_markdown
  parseMapMarkdown(raw_markdown)
  use parsed.representations for renderRepresentationTab
  (keep note_blocks for persistence/search, or regenerate if hash mismatch)
```

This makes Published Reader use the **same representation payload shape** as Draft Preview without changing Revision-specific renderer code.

**3. Parity guard on save/publish (diagnostic → optional assert)**

Before/after `regenerateVariantFromMarkdown`:

```javascript
console.assert(
  flattenBlocks(parseMapMarkdown(raw)).filter(r => r.representation_type === 'revision').length
  === fetchedRevisionBlocks.length
);
```

Catch recall-merge / persistence drift early.

### Optional (UX, not parity root cause)

- Open Revision `recall` / level-3 prompt collapsibles by default (`defaultCollapsibleOpen` tweak for `block_type === 'recall'` or `source_section === 'recall'`) so prompts are not hidden — applies equally once blocks match.

### Not recommended for this fix

- Parser redesign
- New representation renderer registry
- Revision-specific HTML engine

---

## F. Regression checklist (after fix)

- [ ] Same variant ID: Revision block count (parse vs DB) matches
- [ ] `[RECALL]` prompts visible in Published Revision tab
- [ ] Narrative / Structural / Timeline / Interpretations unchanged
- [ ] Teacher home Read opens intended variant (published vs draft)
- [ ] Semantic anchors work in published reader (semanticMap path)
- [ ] Mobile Revision tab: recall prompts readable
- [ ] Publish flow regenerates blocks from textarea markdown
- [ ] Draft revision + published coexistence: no silent wrong-variant read

---

## G. Diagnostic commands (for on-device verification)

Add temporarily before `renderRepresentationTab` in both paths:

```javascript
// Draft preview (note-draft-editor.js → renderPreviewContent)
console.log('DRAFT REVISION', {
  variantId: variant.id,
  status: variant.status,
  blocks: previewParsed.representations.revision?.length,
  recallBlocks: previewParsed.representations.revision?.filter(
    (b) => b.metadata_json?.source_section === 'recall'
  ).length,
});

// Published reader (note-reader.js → renderActiveTab)
console.log('PUBLISHED REVISION', {
  variantId: bundle.variant.id,
  status: bundle.variant.status,
  blocks: bundle.representations.revision?.length,
  recallBlocks: bundle.representations.revision?.filter(
    (b) => b.metadata_json?.source_section === 'recall'
  ).length,
});
```

**Expected finding in failing case:**

- Draft: higher `blocks` / `recallBlocks`, or different `variantId`
- Published: lower counts on **different** `variantId` (published row vs draft row)

---

## H. Conclusion

| Question | Answer |
|----------|--------|
| Different renderer? | **No** — same `renderRevision` / `renderRepresentationTab` |
| Different semantic helpers for Revision? | **No** — stabilization pass is narrative-scoped |
| Different block payload? | **Yes** — live parse vs `note_blocks`; often **different variant** |
| Publish corrupts blocks? | **No evidence** — publish regenerates when `rawMarkdown` provided |
| Why Revision specifically? | **`[RECALL]` → revision merge** makes block diff most visible there |

**Draft Preview is the source of truth today because it parses the authoritative authoring surface (textarea). Published Reader renders a persisted snapshot that may belong to a different variant or an older save.**

Fix parity by aligning **variant selection** and/or **representation payload source** — not by rewriting Revision rendering.
