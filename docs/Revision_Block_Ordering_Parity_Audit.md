# Revision Block Ordering Parity Audit

**Scope:** Diagnostic only (no fixes implemented).  
**Symptom:** Revision content exists in both Draft Preview and Published Reader (identical block counts), but **Published Reader interleaves** revision concepts with recall prompts.  
**Confirmed NOT the cause:** missing blocks, stale publish, parser loss, renderer styling, collapse defaults.

---

## Executive summary

**Root cause:** `sequence_order` is assigned **per MSMDF section** (resets at each boundary), but **Published Reader reconstructs order by sorting on `sequence_order` alone**. When `[RECALL]` is parser-merged into `representations.revision`, recall blocks reuse `sequence_order` values `0, 1, 2, …` that **collide** with revision block values. DB fetch + `groupBlocksByRepresentation()` re-sort by this field and **interleave** revision and recall blocks.

**Draft Preview** renders the in-memory parser array in **document order** (append order from `representations.revision.push(...blocks)`). It does **not** re-sort by `sequence_order`.

**Divergence location:** `fetchNoteBlocks()` → `.order("sequence_order")` combined with section-local `sequence_order` values at parse time.

---

## A. Root cause (exact)

```text
extractBlocks() resets sequence_order per MSMDF section
        ↓
[REVISION] blocks: sequence_order 0..N
[RECALL]   blocks: sequence_order 0..M  (collision)
        ↓
parseMapMarkdown appends recall into representations.revision (correct array order)
        ↓
Draft Preview: uses array order directly ✓
        ↓
flattenBlocks persists collision sequence_order values to note_blocks
        ↓
fetchNoteBlocks ORDER BY representation_type, sequence_order
        ↓
groupBlocksByRepresentation sorts by sequence_order
        ↓
Published Reader: interleaved revision + recall ✗
```

**One-line:** Section-local `sequence_order` + global sort by `sequence_order` = recall/revision interleaving.

---

## B. Evidence

### 1. Parser output order (source of truth)

**File:** `js/notes/map-parser.js`

- `extractBlocks()` uses `let sequence = 0` **inside each section call** (line ~125).
- `[REVISION]` and `[RECALL]` are separate `extractBlocks()` invocations → **both start at 0**.
- Recall merge (option **C** — merged at parse, not at fetch):

```javascript
// section.key === "recall" → block_type recall / recall_section
representations[representationKey].push(...blocks);  // appended after revision blocks
```

**In-memory order is correct:** all `[REVISION]` blocks, then all `[RECALL]` blocks.

### 2. Simulated divergence (English Revolution specimen)

Sorting published-style by `sequence_order` only:

| Index | Draft (array order) | Published-sim (sort by seq) |
|-------|---------------------|-----------------------------|
| 0 | REVISION — ULTRA-REVISION LAYER (seq 0) | Same ✓ |
| 1 | REVISION — Constitutional Evolution (seq 1) | **RECALL — ACTIVE RECALL LAYER (seq 0)** ✗ |
| 2 | REVISION — list (seq 2) | REVISION — Constitutional Evolution (seq 1) |
| 3 | … | RECALL — Recall Prompts (seq 1) |

**First divergence index: 1** — matches reported interleaving.

Draft: 35 revision blocks, 19 recall-related. Counts match; **order does not**.

### 3. Flattening stage

**File:** `js/notes/note-storage.js` — `flattenBlocks()`

```javascript
sequence_order: block.sequence_order ?? 0,  // passes section-local values unchanged
```

Flattening **preserves collision values**; does not assign global indices.

### 4. Persistence layer

**Table:** `note_blocks` (`supabase/migrations/20260601000000_notes_canonical_infrastructure.sql`)

| Column | Role |
|--------|------|
| `sequence_order` | integer — **only** ordering metadata |
| `representation_type` | e.g. `revision` |
| `metadata_json` | includes `msmdf_boundary`: `REVISION` or `RECALL` |
| `created_at` | insert timestamp (not used for ordering today) |

No `global_sequence`, `section_order`, or composite sort key.

### 5. Retrieval layer

**File:** `js/notes/note-selectors.js` — `fetchNoteBlocks()`

```javascript
.order("representation_type")
.order("sequence_order");
```

Within `representation_type = 'revision'`, sort is **by `sequence_order` only** → collisions interleave REVISION and RECALL blocks.

### 6. Reconstruction layer

**File:** `js/notes/note-selectors.js` — `groupBlocksByRepresentation()`

```javascript
grouped[key].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
```

**Re-sorts** by the same colliding field (redundant with fetch order but same bug).

### 7. Draft vs Published rendering entry

| Path | Block order source |
|------|-------------------|
| **Draft Preview** | `previewParsed.representations.revision` — **parser array order** |
| **Published Reader** | `bundle.representations.revision` — **DB sort by sequence_order** |

Both call `renderRepresentationTab('revision', …)` — **same renderer**, **different block order**.

---

## C. Recall merge model (actual implementation)

**Answer: C — merged during parse**

| Stage | Behavior |
|-------|----------|
| Parse | `[RECALL]` → `representations.revision` with `block_type: recall \| recall_section`, `metadata_json.source_section: 'recall'` |
| Storage | Single `representation_type: 'revision'` rows (recall not separate tab) |
| Fetch | All revision rows sorted by `sequence_order` (broken) |
| Render | Same `renderRevision()` |

Recall is **not** stored as a separate representation. It is **not** re-merged at fetch time. Ordering breaks because **sequence numbers collide** after merge.

---

## D. Minimal fix proposal

**Goal:** Published Reader order = Draft Preview order (parser array order).

### Recommended (smallest, highest confidence)

**Renumber `sequence_order` to a global index per representation when persisting:**

In `flattenBlocks()` (or immediately after parse merge):

```javascript
blocks.forEach((block, index) => {
  rows.push({
    ...
    sequence_order: index,  // global within representation_type, not section-local
  });
});
```

This aligns stored order with parser append order. Existing `fetchNoteBlocks` + `groupBlocksByRepresentation` then work unchanged.

**Migration note:** Re-save or regenerate variants once to rewrite `note_blocks.sequence_order` for affected notes.

### Alternative (fetch-time only — no DB rewrite)

Sort by composite key in `groupBlocksByRepresentation()`:

```javascript
const SECTION_RANK = { REVISION: 0, RECALL: 1 };
// sort by (SECTION_RANK[metadata.msmdf_boundary], sequence_order)
```

Works for revision+recall but is **special-case**; renumber at flatten is cleaner and fixes all representations if similar collisions exist elsewhere.

### Not recommended

- CSS / renderer reorder hacks
- Parser section redesign
- Sort by `created_at` (batch inserts may share timestamps)

---

## E. Regression checklist (after fix)

- [ ] Revision tab: ultra-revision content **before** active recall (document order)
- [ ] Draft Preview order === Published Reader order (first 20 blocks identical)
- [ ] Narrative / Structural / Timeline / Interpretations order unchanged
- [ ] `[RECALL]`-only notes (no `[REVISION]`) still render
- [ ] Re-save existing Malayalam/English variants restores order
- [ ] `sequence_order` unique per `variant_id` + `representation_type`

---

## F. Diagnostic snippet (verify on device)

```javascript
// After parse (draft truth)
console.table(
  parsed.representations.revision.map((b, index) => ({
    index,
    sequence_order: b.sequence_order,
    boundary: b.metadata_json?.msmdf_boundary,
    block_type: b.block_type,
    heading: b.heading?.slice(0, 50),
  }))
);

// After loadVariantBundle (published)
console.table(
  bundle.representations.revision.map((b, index) => ({
    index,
    sequence_order: b.sequence_order,
    boundary: b.metadata_json?.msmdf_boundary,
    block_type: b.block_type,
    heading: b.heading?.slice(0, 50),
  }))
);
```

**Expect before fix:** same counts, different row order when `sequence_order` collisions exist.  
**Expect after fix:** identical tables.

---

## G. Conclusion

| Question | Answer |
|----------|--------|
| Where does ordering diverge? | **Between parser array order and DB fetch sort by `sequence_order`** |
| Why counts match but UI wrong? | All blocks persisted; **sort key collides** across merged sections |
| Is renderer at fault? | **No** |
| Is parser at fault? | **Partially** — section-local `sequence_order` is fine for in-memory use; **broken only when sorted globally without renumbering** |
| Draft preview source of truth? | **Yes** — parser append order |

**Fix:** Global renumbering of `sequence_order` per representation at flatten/persist time (minimal one-loop change in `flattenBlocks`).
