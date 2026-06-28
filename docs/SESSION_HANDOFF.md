# Session Handoff — prepOS-basic

**Last updated:** 2026-06-28  
**Branch:** `Question-Bank`  
**Remote:** `https://github.com/prabel-94/prepOS-basic.git`  
**Last pushed commit:** `4479adf` — *overlay drawing tools*

Use this doc when opening the project on another machine. Paste into a new Cursor chat:

> Read `docs/SESSION_HANDOFF.md` and continue from where we left off.

---

## Home machine setup

```powershell
git clone https://github.com/prabel-94/prepOS-basic.git
cd prepOS-basic
git checkout Question-Bank
git pull origin Question-Bank
```

- Open the folder in Cursor (same account recommended for chat sync).
- Supabase config is in `js/config.js` (URL + anon key committed).
- `.cursor/settings.json` enables the Supabase plugin.
- No `package.json` — app is static HTML/JS served locally or via GitHub Pages.
- For DB/migration work: install Supabase CLI and run `supabase link` (link state is not in git).

---

## ⚠️ Uncommitted work (must push before switching machines)

These files were modified locally **after** the last push and are **not on GitHub yet**:

| File | What changed |
|------|----------------|
| `js/notes/note-home.js` | "Create draft from published" now uses `createDraftRevisionFromVariant()` instead of manually copying markdown via `saveNoteVariant()`. Handles `DRAFT_EXISTS` by redirecting to the existing draft. |
| `js/notes/note-draft-editor.js` | On load, if draft has empty `section_extensions`, reconciles from the published variant for the same language, then regenerates the draft from source markdown so custom section definitions carry over. |

**Before leaving this machine:**

```powershell
git add docs/SESSION_HANDOFF.md js/notes/note-draft-editor.js js/notes/note-home.js
git commit -m "Fix draft revision from published and section_extensions reconciliation"
git push origin Question-Bank
```

---

## Recent work (already pushed)

### 1. Class overlay — live teacher markup (Jun 26–28)

Teacher/admin pages auto-boot a drawing overlay via `bootPage()` → `js/ui/class-overlay/boot.js`.

**Features shipped:**
- Pen, highlighter, eraser tools
- **Fade** strokes (ephemeral, TTL-based) vs **sticky** strokes (persist per page/session)
- Color picker + quick-color UI (`color-ui.js`)
- Scale controls (`scale-controls.js`)
- Session management + local persistence (`session.js`, `persistence.js`)
- Toolbar dock (`toolbar.js`, `css/class-overlay.css`)

**Integration:** `js/core/page-boot.js` — overlay boots for `teacher` and `admin` roles unless `classOverlay: false` is passed.

### 2. Anchor resolver improvements (commit `4479adf`)

Extended anchor resolution for overlay/annotation use cases:
- `js/anchors/anchor-resolver.js` — richer resolution kinds
- `js/anchors/anchor-resolver.test.js` — new test coverage
- `js/anchors/anchor-preview.js`, `anchor-selectors.js`, `anchor-storage.js`
- `js/notes/map-parser.js` — minor updates

Run tests in browser or Node if a test runner is set up for `anchor-resolver.test.js`.

### 3. Analytics-driven practice (Jun 26)

Topic-level progress surfaced in practice flows:
- `js/practice/topic-progress-service.js` — fetches/computes topic progress
- `js/practice/topic-progress-ui.js` — UI rendering
- `js/analytics/topic-question-progress.js` — analytics layer
- `js/practice.js` — wired into practice page
- Migration: `20260626000000_user_question_stats_foundation.sql`
- Backfill: `20260626120000_backfill_user_question_stats_from_practice_attempts.sql`

### 4. Teacher ↔ student dual identity (Jun 26–28)

Foundation for linked learner accounts and learner deletion:
- Migrations:
  - `20260627000000_teacher_learner_links_foundation.sql`
  - `20260628000000_delete_learner_foundation.sql`
  - `20260628100000_learner_deletion_impact_practice_metrics.sql`
- Edge functions: `supabase/functions/delete-learner/`, `provision-linked-learner/`
- UI: `js/teacher/student-management.js`, `linked-learner-ui.js`, `learner-details.js`
- Roadmap: `docs/Teacher_Student_Dual_Identity_Roadmap.md`

Phase 0 (founder unblock) in the roadmap is still mostly unchecked — see that doc for the step-by-step runbook.

### 5. Note system (Jun 25–26)

- Variant lifecycle: draft / published / archived per language
- `section_extensions` column — custom section definitions per variant (`20260624000000_note_variants_section_extensions.sql`)
- `createDraftRevisionFromVariant()` in `js/notes/note-storage.js` — canonical way to fork a published note into a draft
- Docs: `docs/Note_Editor_Usage_Guide.md`, `docs/Overlay_Lifecycle_Orchestration.md`

---

## Key architecture pointers

| Area | Entry points |
|------|----------------|
| Page boot | `js/core/page-boot.js`, `js/core/runtime.js` |
| Notes | `js/notes/note-storage.js`, `note-draft-editor.js`, `note-reader.js`, `note-home.js` |
| Class overlay | `js/ui/class-overlay/` |
| Anchors | `js/anchors/` |
| Practice | `js/practice.js`, `js/practice/` |
| Question bank | `qb-manager.html`, `js/qb-manager.js` |
| Teacher tools | `index.html` (teacher home), `js/teacher/` |
| Supabase | `supabase/migrations/`, `js/config.js` |

**Conventions:**
- ES modules, no bundler — pages import from `js/`
- Auth/roles via `bootRuntime()`; teacher gates use `TEACHER_ROLES` from `js/core/access.js`
- GitHub Pages base path auto-detected in `js/config.js` (`PREPOS_BASE_PATH`)

---

## Likely next steps

1. **Commit and push** the uncommitted note draft fixes (see above).
2. **Verify draft-from-published flow** — open a published note on note home, click create draft, confirm `section_extensions` appear in the draft editor.
3. **Class overlay polish** — test fade vs sticky, eraser, color persistence, and behavior when modals are open (`isModalOpen()` disables drawing).
4. **Teacher/student dual identity Phase 0** — follow checklist in `docs/Teacher_Student_Dual_Identity_Roadmap.md` (create prep student account, assign exams).
5. **Apply pending migrations** on Supabase if not already applied (Jun 26–28 migrations listed above).
6. **Question Bank branch** — continue QB manager / question assistance work as needed (`qb-manager.html`, `js/core/question-assistance.js`).

---

## Known issues / watch-outs

- Draft creation from published previously **dropped `section_extensions`** — local fix addresses this but is not pushed yet.
- `createDraftRevisionFromVariant` throws `DRAFT_EXISTS` if a draft already exists for that language; `note-home.js` now redirects to it instead of failing.
- `node_modules/` is gitignored; only needed if using Supabase CLI locally.
- Beta tester credentials are in `README.md` (consider moving to a private doc later).

---

## Cursor context note

Chat history from the other machine does **not** live in git. This file + committed code is the source of truth. After pulling, start a new agent chat and reference this file.
