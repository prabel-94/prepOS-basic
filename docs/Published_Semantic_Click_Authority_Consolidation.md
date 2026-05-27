# PrepOS — Published Semantic Click Authority Consolidation

**Goal:** Make semantic anchor cognition the authoritative interaction model for **all** published readers (student / teacher / admin).  
**Constraints honored:** Parser/MSMDF unchanged; `resolveTopicLinks()` preserved as fallback; draft governance path unchanged.

---

## Updated authority flow (published)

### Primary (authoritative) path — when a semantic map is available

1. Published reader builds a `semanticMap` for the variant (batched from `note_anchor_links`).
2. Renderer sees `semanticMap` and renders `[[...]]` as semantic anchors (buttons/spans), not `<a href>`.
3. A single published click binder owns click authority:
   - semantic anchor click → Anchor Inspector
   - optional canonical note open remains **inside inspector**

### Fallback (legacy compatibility) path — only when no semantic map

- If semantic map cannot be built (missing data/RLS/legacy content), rendering falls back to:
  - `resolveTopicLinks()` → `<a href="note.html?topic=...">`

---

## What changed (implementation)

### 1) Renderer authority (`js/notes/note-renderer.js`)

- **Before:** semantic anchors only in `studentSemanticMode` or `semanticPreview`
- **Now:** if `renderOptions.semanticMap` exists, `renderSemanticAnchors()` is used **regardless of role**
- `resolveTopicLinks()` remains fallback-only when `semanticMap` is absent

### 2) Published semantic map built for all roles (`js/notes/note-reader.js`)

- Published reader now attempts to build a semantic map for the variant for **all roles**.
- When present, it is passed to the renderer and the published click binder is attached.

### 3) Unified published click binder (`js/anchors/anchor-student-reader.js`)

- Added `bindPublishedSemanticReading()` for student/teacher/admin published surfaces.
- Opens anchor inspector first for all semantic clicks.

### 4) Inspector capability separation preserved (`js/ui/teacher-inspector.js`)

- Student mode remains read-only inspector.
- Teacher/admin published mode can show **Edit Anchor Note** without enabling note-governance buttons.
- Governance actions (Promote/De-anchor) are now shown only when `governanceContext.apply` exists (draft preview path).

---

## Compatibility notes (what remains fallback-only)

- `resolveTopicLinks()` and `<a href="note.html?topic=...">` navigation remains available when:
  - semantic map is unavailable
  - or legacy content is being viewed without anchor links

---

## Regression checklist

- **Published student**: semantic anchors → inspector → optional canonical note ✅
- **Published teacher/admin**: semantic anchors → inspector → optional canonical note ✅
- **Canonical anchors**: do not navigate directly; still go inspector first ✅
- **Multilingual**: map built per variant id; inspector uses preferLanguage ✅
- **Legacy topic links**: still work when semantic map absent ✅
- **Unresolved / missing semantic map**: falls back to `resolveTopicLinks()` ✅
- **Draft governance**: preview pipeline + governance inspector unchanged ✅
- **Reading ergonomics**: repeated-anchor softening + context restore preserved ✅
- **Mobile**: unchanged layout contracts; inspector remains micro-modal ✅

