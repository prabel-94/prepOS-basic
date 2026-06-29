# PrepOS — Overlay Lifecycle Orchestration

**Phase:** Workflow-oriented overlay transitions (minimal extension of `modal-system.js`)  
**Primary workflow target:** Anchor Inspector → Anchor Note Editor  
**Constraints honored:** No `modal-system.js` rewrite; semantic interaction authority unchanged; draft vs published separation preserved.

---

## Summary

PrepOS overlays now support **workflow transitions**, not only mechanical stacking.

The first concrete transition implemented:

**Inspector → Editor = replace** (no dual stacked workflow overlays)

**Editor → Inspector = restore** (optional refresh after save/cancel)

Reading scroll position is preserved across this transition via `suppressNextReadingRestore()`.

---

## A) Implementation

### New: `js/ui/overlay-transitions.js`

- `replaceOverlay({ fromOverlay, openNext, suppressReadingRestore })`
  - Closes the current overlay if open
  - Optionally suppresses one reading-context restore (workflow transition, not final dismiss)
  - Opens the next overlay surface

### Updated: `js/ui/teacher-inspector.js`

- `bindAnchorNoteEditorActions()` now uses `replaceOverlay()` when opening the anchor note editor
- Save **and** Cancel both reopen a refreshed anchor inspector
- Inspector close during replace does **not** trigger premature scroll restore

### Updated: `js/notes/reading-ergonomics.js`

- `suppressNextReadingRestore()` — one-shot guard for workflow transitions
- `restoreReadingContextIfNeeded()` respects suppression before clearing pending context

### Unchanged (by design)

- `js/ui/modal-system.js` — stack, ESC, backdrop, scroll lock, z-index
- Draft governance preview flow
- Published semantic click authority (inspector-first cognition)

---

## B) Overlay role hierarchy

| Role | Overlay type (`modal-system`) | Workflow authority |
|------|------------------------------|-------------------|
| **Inspector** | `inspector` | Contextual cognition (orient, read) |
| **Editor** | `critical-dialog` (editor surfaces) | Primary workflow surface |
| **Dialog** | `critical-dialog` / `window.confirm` | Temporary blocking layer |
| **Governance** | `inspector` + governance context | Editorial authority (draft) |
| **Side-panel** | `side-panel` (future) | Parallel utility |

**Rule:** Editors dominate inspectors. Inspectors must not remain active underneath editor workflow surfaces.

---

## C) Workflow transition matrix

| From | To | Transition | Status |
|------|-----|------------|--------|
| Anchor Inspector | Anchor Note Editor | **Replace** | ✅ Implemented |
| Anchor Note Editor | Anchor Inspector (save) | **Restore** | ✅ Implemented |
| Anchor Note Editor | Anchor Inspector (cancel) | **Restore** | ✅ Implemented |
| Anchor Inspector | De-anchor confirm (`window.confirm`) | **Stack** | Unchanged (native confirm) |
| Anchor Inspector | Canonical topic picker | **Stack** | Unchanged |
| Semantic anchor click | Anchor Inspector | Open | Unchanged |
| Publish review | Publish confirm | Replace/close | Unchanged |
| Final inspector dismiss | Reading surface | Restore scroll | Unchanged |

---

## D) Reading context continuity

| Event | Behavior |
|-------|----------|
| Open anchor inspector from reading | `captureReadingContext(anchorEl)` |
| Close inspector (final dismiss) | `restoreReadingContextIfNeeded()` |
| Inspector → Editor (replace) | `suppressNextReadingRestore()` then close inspector |
| Editor save/cancel → Inspector | Reopen inspector; reading restore deferred until final dismiss |

This prevents scroll “jumps” when transitioning between workflow overlays.

---

## E) Regression checklist

| Scenario | Expected |
|----------|----------|
| Open anchor inspector | Single inspector overlay |
| Create/Edit anchor note | Inspector closes; editor opens alone |
| Save anchor note | Editor closes; inspector reopens with updated note |
| Cancel anchor note | Editor closes; inspector reopens (unchanged note) |
| ESC on editor | Closes editor (modal-system behavior) |
| ESC on inspector | Closes inspector; restores reading position |
| Backdrop click | Respects `closeOnBackdrop` per overlay |
| Draft governance inspector | Unchanged (separate flow) |
| Published student semantic click | Inspector opens (read-only) |
| Published teacher semantic click | Inspector opens; edit note uses replace flow |
| Mobile | Existing modal sizing; no stacked inspector+editor |

---

## F) Future extensions (not in this phase)

- `transitionOverlay()` wrapper for logging/debug
- Explicit `restoreOverlay(parentContext)` with lightweight return tokens
- Publish review → publish as explicit replace transition
- Side-panel ↔ inspector coordination

---

## Critical principle

Overlays should support **cognition continuity**.

Users manage meaning — not UI layers.

This phase makes the first workflow transition explicit: **replace, not stack**, for inspector → editor.
