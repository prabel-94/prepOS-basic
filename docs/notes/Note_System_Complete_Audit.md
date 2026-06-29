# PrepOS Note System — Complete Audit Report

**Date:** June 11, 2026  
**Scope:** Database schema, security, client pipeline, UI/UX, integrations, tests, and technical debt  
**Codebase:** `prepOS-v1` (vanilla JS multi-page app + Supabase Postgres)

---

## Executive Summary

PrepOS operates **two parallel note systems** that share a topic anchor but diverge in storage, format, and user experience:

| System | Entry point | Storage | Status |
|--------|-------------|---------|--------|
| **Canonical MSMDF pipeline** | `note.html`, `notes-import.html` | `notes` → `note_variants` → blocks/sources/links | **Active, primary** |
| **Legacy WYSIWYG editor** | `topic-note.html` | `topics.note_html`, `topics.note_title` | **Deprecated but still linked from QB** |

The canonical system is architecturally mature: MSMDF v1.2 semantic markdown is parsed into multi-representation blocks, stored per language variant, governed by RLS, and rendered through a custom reader with semantic anchors, wiki links, and backlinks. Teachers import and refine notes in a draft workspace; students read published variants only.

**Strengths:** Variant lifecycle (draft → published → archived), bilingual support (English/Malayalam), representation registry as single source of truth, deep anchor integration, defense-in-depth publish archiving (client + DB trigger), and unit tests on the parser layer.

**Critical gaps:** Dual-system confusion from Question Bank routing, unused DB tables (`note_entities`, `note_relationships`), no note search, no delete/archive management UI, no integration with practice/exams/flashcards, client-only writes with no server API, and legacy columns on `topics` not tracked in local migrations.

**Overall maturity:** Backend schema **7/10**, canonical pipeline **8/10**, product integration **4/10**, student discoverability **5/10**.

---

## 1. Architecture Overview

PrepOS is **not a React/Next.js app**. Notes are implemented as ES modules in a static HTML MPA. All canonical note CRUD goes through the **browser Supabase client** (`js/core/get-client.js`). There are **no REST API routes**, **no server actions**, and **no Supabase Edge Functions** for notes.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HTML Entry Points                                │
├──────────────────┬──────────────────────┬──────────────────────────────┤
│ note.html        │ notes-import.html    │ topic-note.html (LEGACY)     │
│ note-reader.js   │ note-import-boot.js  │ topic-note.js                │
└────────┬─────────┴──────────┬───────────┴──────────────┬───────────────┘
         │                    │                          │
         ▼                    ▼                          ▼
┌────────────────┐   ┌─────────────────┐      ┌──────────────────┐
│ Read pipeline  │   │ Write pipeline  │      │ topics table     │
│ note-selectors │   │ note-storage    │      │ note_html/title  │
│ note-renderer  │   │ map-parser      │      └──────────────────┘
│ note-backlinks │   │ note-publish    │
└────────┬───────┘   └────────┬────────┘
         │                    │
         └────────┬───────────┘
                  ▼
         ┌─────────────────┐
         │ Supabase Postgres│
         │ notes            │
         │ note_variants    │
         │ note_blocks      │
         │ note_sources     │
         │ note_topic_links │
         │ note_anchor_links│
         └─────────────────┘
```

### Anchor subsystem coupling

Notes are tightly integrated with `js/anchors/` (15 modules). Semantic `[[anchor]]` markers in MSMDF content sync to `note_anchor_links` and connect to the global `anchors` / `anchor_variants` / `anchor_notes` tables. **Do not confuse `anchor_notes`** (short inspector cognition snippets) with canonical topic notes.

---

## 2. Data Model

### 2.1 Entity-relationship (canonical)

```
topics (1) ──< notes (UNIQUE topic_id — one canonical container per topic)
                  │
                  └──< note_variants (many per language stream)
                           │
                           ├──< note_sources (raw MSMDF markdown)
                           ├──< note_blocks (parsed representation blocks)
                           ├──< note_topic_links ([[Topic]] cross-links)
                           ├──< note_entities (schema only — unused in JS)
                           ├──< note_relationships (schema only — unused in JS)
                           └──< note_anchor_links (semantic anchor bindings)
```

### 2.2 Table reference

#### `notes` — canonical container

| Column | Purpose |
|--------|---------|
| `id` | UUID primary key |
| `topic_id` | FK → `topics`, **unique** (one note per topic) |
| `title` | Canonical title |
| `map_version`, `canonical_version` | MSMDF / schema versioning |
| `created_by`, `created_at`, `updated_at` | Audit |

**Removed in variant migration:** `language`, `status`, `scheduled_delete_at` (moved to `note_variants`).

#### `note_variants` — per-language lifecycle

| Column | Purpose |
|--------|---------|
| `id` | UUID primary key |
| `note_id` | FK → `notes` |
| `language` | `english` \| `malayalam` \| `bilingual` |
| `title` | Variant display title |
| `status` | `draft` \| `published` \| `archived` |
| `scheduled_delete_at` | Set when archived; 14-day retention |
| `created_by`, `created_at`, `updated_at` | Audit |

**Constraint:** Unique partial index — one `published` variant per `(note_id, language)`.

#### Child tables (all keyed by `variant_id`)

| Table | Purpose |
|-------|---------|
| `note_sources` | Immutable-by-convention raw markdown (`immutable` defaults `true`; drafts allow UPDATE) |
| `note_blocks` | Parsed blocks: `representation_type`, `block_type`, `heading`, `content`, `hierarchy_level`, `sequence_order`, `metadata_json` |
| `note_topic_links` | Wiki links: `linked_topic_id`, `linked_topic_name`, `linked_from_block_id` |
| `note_entities` | Entity index rows — **never written by application** |
| `note_relationships` | Entity relationship triples — **never written by application** |
| `note_anchor_links` | Anchor bindings with `state` (`candidate` \| `active` \| `dormant`) |

### 2.3 Migration timeline

| Migration | Purpose |
|-----------|---------|
| `20260601000000_notes_canonical_infrastructure.sql` | Core tables, indexes, initial RLS |
| `20260605000000_note_sources_draft_update.sql` | UPDATE policy on `note_sources` for draft refinement |
| `20260607000000_note_variants_architecture.sql` | Introduces `note_variants`, migrates data, topic-unique containers |
| `20260608000000_variant_lifecycle_cleanup.sql` | `archived` status, publish-sibling trigger, pg_cron cleanup |
| `20260609000000_fix_note_variant_staff_rls.sql` | Any teacher/admin can write (drops per-`created_by` ownership) |
| `20260610000000_fix_note_variants_insert_rls.sql` | Fixes INSERT 42501; explicit grants |
| `20260611000000_anchor_system_foundation.sql` | Anchor system + `note_anchor_links` |

### 2.4 Database automation

- **`notes_set_updated_at`** — trigger on `notes`
- **`note_variants_set_updated_at`** — trigger on `note_variants`
- **`archive_published_variant_siblings`** — on publish, archives prior published siblings in same language stream, sets `scheduled_delete_at = now() + 14 days`
- **`cleanup_archived_note_variants()`** — daily pg_cron job deletes archived variants past retention (cascade deletes children). Logs notice if pg_cron unavailable.

### 2.5 Legacy storage (parallel system)

`js/topic-note.js` reads/writes `topics.note_title`, `topics.note_html`, `topics.note_updated_at`. These columns are **not defined in local SQL migrations** — likely remote-only schema. This creates migration drift risk and makes the legacy path invisible to version-controlled schema.

---

## 3. Security & RLS

### 3.1 Role helpers

From `20260517120000_enable_rls_backend_authority.sql`:

- `current_user_role()` — from `public.users.role`
- `is_admin()`, `is_teacher_or_admin()`

### 3.2 Note-specific helpers (current)

| Function | Logic |
|----------|-------|
| `can_read_canonical_note(note_id)` | Admin/teacher: yes; student: only if any **published** variant exists |
| `can_write_canonical_note(note_id)` | Admin or teacher (no ownership check) |
| `can_read_variant(variant_id)` | Admin/teacher: all statuses; student: **published only** |
| `can_write_variant(variant_id)` | Admin or teacher |

### 3.3 Visibility matrix

| Role | Draft variants | Published | Archived |
|------|----------------|-----------|----------|
| Teacher/Admin | Read/write | Read/write | Read (not publishable) |
| Student | **No access** | Read only | **No access** |

### 3.4 Policy notes

- **`note_variants` has two overlapping SELECT policies** (`note_variants_select_visible` for students + `note_variants_select_staff` for teachers). Postgres OR-combines them; works but is harder to reason about than a single policy.
- **Ownership model changed:** Phase 1 required `created_by = auth.uid()` for teachers. Current model allows **any teacher to edit any note** — intentional for multi-teacher workflows but differs from initial design.
- **Explicit grants** on `notes` and `note_variants` for `authenticated` role (`20260610000000`).

### 3.5 Security considerations

| Risk | Severity | Detail |
|------|----------|--------|
| Client-only writes | Medium | All publish/archive logic runs in browser; malicious client could attempt direct Supabase calls (mitigated by RLS) |
| Partial consistency on save | Low | `note_topic_links` and `note_anchor_links` insert failures log warnings but don't fail the save |
| No audit log | Low | No history of who published/changed what beyond `updated_at` |
| Legacy topic columns | Medium | `topics.note_html` bypasses canonical RLS model entirely |

---

## 4. MSMDF Format & Processing Pipeline

### 4.1 Format

**MSMDF v1.2** — custom semantic markdown with bracket section tags:

| Section tag | Representation | Reader tab |
|-------------|----------------|------------|
| `[METADATA]` | Infrastructure | — |
| `[NARRATIVE]` | Cognition | Narrative |
| `[STRUCTURAL]` | Cognition | Structural |
| `[REVISION]` | Cognition | Revision |
| `[TIMELINE]` | Cognition | Timeline |
| `[INTERPRETATIONS]` | Cognition | Interpretations |
| `[QUOTES]` | Cognition | Quotes |
| `[RECALL]` | Merged into Revision | — |
| `[ENTITY_INDEX]` | Parsed, counted for validation | — (not persisted to DB) |

Registry: `js/notes/note-representations.js` — single source of truth for parser, storage, renderer tabs, and import UI.

Parser: `js/notes/map-parser.js` — no third-party markdown library.

### 4.2 Write pipeline

```
MSMDF markdown
  → parseMapMarkdown()
  → attachSemanticCandidates() [anchors]
  → getOrCreateCanonicalNote() → notes
  → insert/update note_variants
  → insert note_sources
  → delete + reinsert note_blocks, note_topic_links
  → syncVariantAnchorLinks()
```

Entry points:
- **Import:** `notes-import.html` → `note-import.js` → `saveNoteVariant()`
- **Draft edit:** `note-draft-editor.js` → `regenerateVariantFromMarkdown()`
- **Publish:** `note-publish.js` → `publishCanonicalVariant()` → archive siblings + `status = published`

### 4.3 Read pipeline

```
note.html?topic={id}&lang={lang}  OR  ?variant={id}
  → resolveVariantContext() [language fallback chain]
  → loadVariantBundle() [variant + blocks + topic links]
  → note-renderer.js [representation tabs]
  → anchor-student-reader.js [semantic anchors]
  → note-backlinks.js [Referenced In panel]
```

Language fallback: `buildLanguageFallbackChain()` — preferred language first, then `malayalam` → `english`.

### 4.4 Linking

- **Wiki links:** `[[Topic Name]]` — resolved at storage time; topics auto-created if missing; rendered as navigable links
- **Semantic anchors:** `[[anchor]]` syntax — resolved through anchor subsystem; governance in draft preview; publish review modal (advisory, non-blocking)
- **Backlinks:** Reverse lookup via `note_topic_links` — "Referenced In" panel on reader

**Gap:** `linked_from_block_id` is always inserted as `null` in `buildTopicLinkRows()` — block-level provenance for wiki links is not wired.

**Gap:** `ENTITY_INDEX` is parsed and counted for validation but **never persisted** to `note_entities` table despite full RLS and schema.

---

## 5. Frontend Surfaces

### 5.1 Pages & URL patterns

| Page | Boot module | Roles | Purpose |
|------|-------------|-------|---------|
| `note.html` | `note-reader.js` | teacher, admin, student | Read published; teachers edit drafts |
| `notes-import.html` | `note-import-boot.js` | teacher, admin | Paste/upload MSMDF → save variant |
| `topic-note.html` | `topic-note.js` | teacher, admin | Legacy contenteditable editor |
| `index.html` (section) | `note-home.js` via `teacher-home.js` | teacher | Topic notes list |
| `student-dashboard.html` (section) | `note-home.js` | student | Published notes only |

**URL patterns:**

```
note.html?topic={uuid}&lang={english|malayalam}   # resolve published variant
note.html?variant={uuid}                          # direct variant
note.html?variant={uuid}&mode=draft               # teacher draft workspace
notes-import.html?id={topic_uuid}
topic-note.html?id={topic_uuid}                   # legacy
```

### 5.2 Module inventory (`js/notes/` — 19 source + 4 test files)

| Module | Role | Approx. complexity |
|--------|------|-------------------|
| `note-renderer.js` | Representation tabs + HTML rendering | Large (~900+ lines) |
| `note-storage.js` | Write pipeline | Large |
| `map-parser.js` | MSMDF parser | Large |
| `note-draft-editor.js` | Draft toolbar, source edit, preview, save, publish | Medium |
| `note-reader.js` | Page orchestrator (published vs draft routing) | Medium |
| `note-selectors.js` | Supabase read queries + bundle loader | Medium |
| `note-representations.js` | MSMDF section registry | Medium |
| `note-home.js` | Dashboard topic notes list | Medium |
| `note-import.js` | Import workflow logic | Medium |
| `note-publish.js` | Publish + archive siblings | Small |
| `note-topic-links.js` | Wiki link resolution + persistence | Small |
| `note-backlinks.js` | Reverse topic references | Small |
| `note-variants.js` | Language/status constants | Small |
| `semantic-hierarchy.js` | Heading levels, collapse rules | Small |
| `reading-ergonomics.js` | Reading flow, scroll restore, density | Small |
| `quote-highlight.js` | `>` prefix quotes in [QUOTES] | Small |
| `note-import-boot.js` | Import page boot + drag/drop | Small |
| `note-import-file.js` | Client-side `.md` file read | Small |
| `note-import-params.js` | URL param parsing | Small |

### 5.3 Editor technology

| System | Editor | Format |
|--------|--------|--------|
| Canonical | `<textarea id="semanticSourceEditor">` | MSMDF v1.2 markdown (not WYSIWYG) |
| Legacy | `contenteditable` `#noteEditor` | HTML via `document.execCommand` toolbar |
| Anchor notes | Modal `<textarea>` in `anchor-note-editor.js` | Short cognition snippets (50–250 words) |

### 5.4 State management

No centralized store. Patterns:
- Closure state in `initDraftWorkspace()` (`viewMode`, `activeTab`, `previewParsed`)
- Module-level Maps (`structuralSessionState`, `pendingReadingRestore`)
- DOM as state (toolbar classes, tab buttons, textarea value)
- Direct async Supabase queries

### 5.5 Rendering features (canonical reader)

| Feature | Status |
|---------|--------|
| Multi-representation tabs (Narrative, Structural, Revision, Timeline, Interpretations, Quotes) | Implemented |
| Language variant tabs with fallback | Implemented |
| Structural collapse tree | Implemented |
| Timeline/chronology rendering | Implemented |
| Quote highlighting (`>` in QUOTES) | Implemented |
| Reading ergonomics (density, scroll restore) | Implemented |
| Semantic anchor inspector (student read-only) | Implemented |
| Backlinks ("Referenced In") | Implemented |
| Draft source edit → live preview | Implemented |
| Pre-publish semantic review modal | Implemented (advisory) |

---

## 6. User Flows

### 6.1 Create (canonical)

1. Question Bank → topic → **Import canonical note** → `notes-import.html?id={topic}`
2. Paste/upload MSMDF markdown → Parse → review detected sections/links
3. Save as draft or publish immediately
4. Redirect to `note.html?variant={id}&mode=draft` or published reader

### 6.2 Create (legacy — still reachable)

1. Question Bank → **Master Note** → `topic-note.html?id={topic}`
2. Type in contenteditable → auto-save to `topics` after 800ms debounce

### 6.3 Edit (canonical draft)

1. Teacher home or published reader → "View draft" / open draft variant
2. `note.html?variant={id}&mode=draft`
3. Edit Source → modify textarea → Preview → Save Draft → Publish Language Variant
4. Publish opens semantic review modal → confirms → archives prior published (14 days) → redirects to published reader

### 6.4 Read (student)

1. Student dashboard → Topic Notes list → **Read**
2. `note.html?topic={id}&lang={lang}`
3. Representation tabs, semantic anchors (read-only inspector), backlinks

### 6.5 Delete / archive

- **No explicit delete UI** for teachers
- Publishing archives previous published variant (`scheduled_delete_at` + 14-day auto-delete via cron)
- Failed variant creation rolls back with `.delete()` on `note_variants`
- **No UI to browse, restore, or manually purge archived variants**

### 6.6 Search / organize

- Dashboard lists grouped by canonical note (topic name) → language variant rows
- Query: `updated_at DESC`, limit 30
- **No search, filter, sort, notebook, or folder UI**

---

## 7. Integration with Other PrepOS Features

| Feature | Integration | Detail |
|---------|-------------|--------|
| **Question Bank** | Partial | "Import canonical note" → `notes-import.html`; **"Master Note" still routes to legacy editor** |
| **Teacher home** | Yes | Topic notes card via `loadTopicNotesSection()` |
| **Student dashboard** | Yes | Published notes card; `scrollToTopicNotes()` helper |
| **Teacher inspector** | Yes | "Open canonical note" from anchor inspector |
| **Semantic anchors** | Deep | Reader, draft preview, publish review, governance |
| **Topics** | Yes | 1:1 canonical note per topic; wiki links create/resolve topics |
| **Lexicon** | None | No cross-link from lexicon entries to notes |
| **Practice** | **None** | No link from wrong answers to topic notes |
| **Exams** | **None** | No in-exam note access or post-exam note recommendations |
| **Flashcards** | **None** | Zero references in codebase |
| **Batches / Courses** | Cosmetic only | CSS class reuse (`topic-note-row`) in batch UI |
| **Analytics / Intelligence** | Indirect | Via anchors only; no note-specific analytics |
| **Global navigation** | Weak | `NAV_PRESETS.studentHome` has only "Practice" — no Notes link |

---

## 8. Feature Matrix

### 8.1 Implemented

- MSMDF v1.2 import (paste, file upload, drag-drop)
- Multi-representation reader with custom renderer
- Language variants (English, Malayalam) with fallback
- Draft / published / archived lifecycle
- Draft workspace (edit source → preview → save → publish)
- Wiki topic links `[[...]]` with auto-topic creation
- Backlinks panel
- Semantic anchors + governance (teacher) + read-only inspector (student)
- Quote highlighting, structural collapse, timeline rendering
- Reading ergonomics (density, scroll restore)
- Dashboard note lists (teacher + student)
- Create draft revision from published variant
- Pre-publish semantic review (advisory, non-blocking)
- Unit tests on parser, representations, quotes, import file

### 8.2 Partially implemented

| Feature | Gap |
|---------|-----|
| Rich text editing | Only in legacy `topic-note.html` |
| Topic linking in editor | Legacy has live autocomplete; canonical requires typing `[[...]]` in markdown |
| Bilingual language | Allowed in DB constraint and `normalizeLanguage()` but excluded from `SUPPORTED_LANGUAGES` UI |
| Entity index | Parsed but not persisted to `note_entities` |
| QB note access | Import works; no "Open canonical note" button; Master Note goes to legacy |

### 8.3 Not implemented

| Feature | Notes |
|---------|-------|
| Note search | No search UI or query anywhere |
| Tags / labels | No tag model or UI |
| Notebook / sidebar / folders | Flat grouped lists only |
| Delete note UI | Archive-on-publish only |
| Flashcard integration | No code references |
| Course integration | Notes tie to topics, not courses |
| Browse archived variants | Archived variants excluded from home list and reader |
| Global nav to notes | Students must scroll dashboard |
| In-exam / in-practice note links | No integration |
| Generated TypeScript types | JSDoc only; no `database.types.ts` |
| E2E / integration tests | Parser unit tests only |
| Server-side note API | All client-direct Supabase |
| Version diff / history | No revision comparison UI |
| Collaborative editing | No real-time or locking |
| Offline / PWA | None |
| Export | No download-as-markdown UI |

---

## 9. Testing

### 9.1 Existing unit tests

| File | Coverage |
|------|----------|
| `js/notes/map-parser.test.js` | Section parsing, block extraction, entity index detection |
| `js/notes/note-representations.test.js` | Registry mapping, section keys |
| `js/notes/quote-highlight.test.js` | Quote rendering |
| `js/notes/note-import-file.test.js` | Client file read |

### 9.2 Gaps

- No tests for `note-storage.js`, `note-publish.js`, `note-selectors.js`
- No tests for `note-renderer.js` HTML output
- No tests for RLS behavior
- No frontend integration or E2E tests for note pages
- No tests for variant lifecycle (draft → publish → archive)

---

## 10. Technical Debt & Inconsistencies

### 10.1 Critical

1. **Dual note systems coexist** — QB "Master Note" opens legacy editor; canonical system is separate. Teachers may maintain two unrelated note bodies per topic.
2. **Legacy `topics` columns not in migrations** — `note_html`, `note_title`, `note_updated_at` are invisible to local schema versioning.
3. **Unused DB tables** — `note_entities` and `note_relationships` have full RLS but zero application usage.

### 10.2 High

4. **No note search** — As content volume grows, discovery depends on scrolling dashboard lists.
5. **No canonical note entry from QB** — Only import + legacy master note; no "Read/Open canonical note" shortcut.
6. **`bilingual` language orphaned** — DB allows it; UI and import flows don't.
7. **Client-only publish/archive** — Duplicated with DB trigger (good defense-in-depth) but client archive can fail before publish attempt.

### 10.3 Medium

8. **`linked_from_block_id` always null** — Wiki link provenance not tracked.
9. **Anchor/topic link insert failures swallowed** — Partial consistency possible on save.
10. **`note.html` inline CSS** (~190 lines) duplicates/overrides `style.css`.
11. **Student anchor inspector reuses teacher modal chrome** (`teacher-inspector.js`).
12. **`topic-note.js` duplicate event handlers** — `[data-color]` click handlers registered twice (lines ~332–367).
13. **RLS policy overlap** on `note_variants` SELECT — two policies instead of one.
14. **No generated Supabase types** — Informal JSDoc only increases drift risk.

### 10.4 Low

15. **pg_cron dependency** for cleanup — logs notice if unavailable; archived variants may accumulate.
16. **`note_sources.immutable` semantics** — Defaults `true` but drafts explicitly allow UPDATE; comment says "pedagogical, not append-only".
17. **Home list limit 30** — No pagination for teachers with many notes.
18. **Naming collision** — `anchor_notes` vs canonical `notes` confuses exploration.

---

## 11. Recommendations

### Priority 1 — Unify note systems

| Action | Rationale |
|--------|-----------|
| Replace QB "Master Note" with "Open canonical note" → `note.html?topic={id}` | Eliminates dual-system confusion |
| Deprecate `topic-note.html` with redirect or migration tool | Single source of truth per topic |
| Add migration script: legacy `topics.note_html` → MSMDF draft variant | Preserve existing teacher content |
| Track legacy columns in migrations or drop them | Schema/version control alignment |

### Priority 2 — Discovery & navigation

| Action | Rationale |
|--------|-----------|
| Add "Notes" to `NAV_PRESETS.studentHome` and teacher presets | Surface notes in global nav |
| Add note search (full-text on `note_blocks.content` or `note_sources.raw_markdown`) | Scale with content volume |
| Add "Open canonical note" button in QB topic row | Reduce friction for teachers |

### Priority 3 — Lifecycle management

| Action | Rationale |
|--------|-----------|
| Build archived variants browser for teachers | 14-day retention is invisible today |
| Add explicit "Discard draft" action | Teachers need controlled deletion |
| Surface publish history (who/when) | Audit and accountability |

### Priority 4 — Schema cleanup

| Action | Rationale |
|--------|-----------|
| Either persist `ENTITY_INDEX` to `note_entities` or drop unused tables | Reduce schema noise |
| Wire `linked_from_block_id` in `buildTopicLinkRows()` | Enable block-level backlink precision |
| Consolidate `note_variants` SELECT into single RLS policy | Easier security reasoning |
| Generate `database.types.ts` from Supabase | Type safety |

### Priority 5 — Cross-feature integration

| Action | Rationale |
|--------|-----------|
| Link practice wrong answers → topic note reader | Close the learning loop |
| Post-exam weak-topic recommendations → notes | Student experience audit gap |
| Consider flashcard generation from `[RECALL]` blocks | Leverage existing MSMDF section |

### Priority 6 — Testing & reliability

| Action | Rationale |
|--------|-----------|
| Add integration tests for `note-storage.js` publish flow | Catch regressions in write pipeline |
| Add renderer snapshot tests | Stabilize representation HTML |
| Fail save on topic/anchor link insert errors (or retry) | Prevent partial consistency |

---

## 12. File Index

### Migrations
- `supabase/migrations/20260601000000_notes_canonical_infrastructure.sql`
- `supabase/migrations/20260605000000_note_sources_draft_update.sql`
- `supabase/migrations/20260607000000_note_variants_architecture.sql`
- `supabase/migrations/20260608000000_variant_lifecycle_cleanup.sql`
- `supabase/migrations/20260609000000_fix_note_variant_staff_rls.sql`
- `supabase/migrations/20260610000000_fix_note_variants_insert_rls.sql`
- `supabase/migrations/20260611000000_anchor_system_foundation.sql`

### HTML pages
- `note.html` — canonical reader/draft workspace
- `notes-import.html` — MSMDF import
- `topic-note.html` — legacy WYSIWYG editor

### Core modules (`js/notes/`)
- **Write:** `note-storage.js`, `note-publish.js`
- **Read:** `note-selectors.js`, `note-renderer.js`, `note-reader.js`
- **Import:** `note-import.js`, `note-import-boot.js`, `note-import-file.js`, `note-import-params.js`
- **Format:** `map-parser.js`, `note-representations.js`, `note-variants.js`
- **Links:** `note-topic-links.js`, `note-backlinks.js`
- **UX:** `note-draft-editor.js`, `note-home.js`, `semantic-hierarchy.js`, `reading-ergonomics.js`, `quote-highlight.js`
- **Tests:** `map-parser.test.js`, `note-representations.test.js`, `quote-highlight.test.js`, `note-import-file.test.js`

### Legacy
- `js/topic-note.js`

### Integration touchpoints
- `js/qb-manager.js` — Master Note + Import canonical note buttons
- `js/teacher-home.js`, `js/student-dashboard.js` — dashboard note lists
- `js/ui/teacher-inspector.js` — anchor inspector → canonical note link
- `js/ui/app-nav.js` — navigation presets
- `js/anchors/*` — semantic anchor subsystem (15 files)

### Related documentation
- `docs/protocols/PrepOS_Anchor_System_Guide.md` — anchor architecture
- `docs/student-experience/PrepOS_Student_Experience_Audit_Report.md` — student notes UX context
- Various renderer/stabilization audits in `docs/rendering/` (representation rendering, semantic click authority)

### Styles
- `css/style.css` — `.note-editor`, `.canonical-*`, `.semantic-*`, `.topic-note-row`
- `note.html` — inline CSS (flagged as drift)

---

## 13. Conclusion

The PrepOS canonical note system is a **well-architected semantic knowledge pipeline** with a clear data model (topic → note → language variants → structured blocks), robust representation rendering, and deep anchor integration. The MSMDF parser/registry/renderer chain is the strongest part of the stack.

The primary risks are **product-level, not technical**: two parallel note systems, weak discoverability, no search, no cross-linking to practice/exams, and schema tables that exist but go unused. Addressing the dual-system split and QB routing should be the first move; everything else builds on having a single canonical path per topic.

---

*Report generated from codebase audit of `prepOS-v1` as of June 11, 2026.*
