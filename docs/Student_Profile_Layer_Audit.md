# PrepOS Student Profile Layer — Pre-Implementation Audit

**Date:** 30 May 2026  
**Scope:** Architecture audit only — no migrations, SQL, UI, or code changes  
**Goal:** Understand how PrepOS currently represents student identity before introducing a Student Profile Layer

---

## Executive Summary

PrepOS uses a **two-layer identity model**:

```
auth.users (Supabase Auth — email, password, user_metadata)
        ↓  ON INSERT trigger: handle_new_user()
public.users (PrepOS authorization — id, role, created_at)
        ↓  same UUID used as student_id everywhere
exam_assignments / exam_attempts / user_lexicon_word_stats
```

There is **no dedicated profile table**. Display identity is fragmented across:

- `auth.users.user_metadata.full_name` (optional, user-editable)
- `localStorage.studentName` (client-only)
- `exam_attempts.student_name` (denormalized snapshot at submit time)
- `public_exam_attempts.guest_name` (anonymous path)

**Student provisioning is out-of-band** — no in-app student creation UI or edge function. Teachers list existing auth accounts and assign exams.

**Analytics are client-computed** from `exam_attempts` rows keyed by `student_id` (= auth UUID). No `student_profiles`, `analytics`, or `mastery` tables exist.

---

# Section 1 — Current User Architecture

## Schema baseline note

`supabase/migrations/20260516180544_remote_schema.sql` is a **comment-only anchor**, not a full dump. Core exam/QB tables (`exam_sessions`, `exam_assignments`, `exam_attempts`, `draft_exams`, `user_lexicon_word_stats`, question bank tables) pre-exist from remote schema and are **modified by migrations** (RLS, FK columns, policies) but their original `CREATE TABLE` DDL is not in this repo. Column lists below are inferred from migrations + application usage.

---

## 1.1 `auth.users` (Supabase Auth schema)

| Field | Detail |
|-------|--------|
| **Purpose** | Canonical authentication identity (credentials, sessions, JWT) |
| **Primary key** | `id` (uuid) |
| **Important columns** | `email`, `encrypted_password`, `user_metadata` (JSON — e.g. `full_name`, `name`), auth timestamps |
| **Relationships** | Parent of `public.users` via FK; referenced by `created_by`, `assigned_by`, `student_id` columns across app tables |
| **Created in migrations** | No — managed by Supabase Auth |

**Trigger:** `on_auth_user_created` → `public.handle_new_user()` (`20260523190008_auth_user_provisioning.sql`)

---

## 1.2 `public.users`

| Field | Detail |
|-------|--------|
| **Purpose** | PrepOS **authorization profile** — role gate for RLS, routing, and edge functions. Comments refer to this as "profiles" conceptually, but the table is named `users` and stores **no display name or email**. |
| **Primary key** | `id` (uuid) |
| **Important columns** | `role` text CHECK (`student`, `teacher`, `admin`), default `'student'`; `created_at` timestamp |
| **Relationships** | `id` → FK → `auth.users(id)` ON DELETE CASCADE |
| **Created in** | `20260523190008_auth_user_provisioning.sql` |

**No columns for:** email, name, batch, teacher ownership, or profile metadata.

---

## 1.3 Tables that reference user identity (not profile tables)

### `public.exam_assignments` *(pre-existing)*

| Field | Detail |
|-------|--------|
| **Purpose** | Links students to published exams; **required** for canonical attempt submission |
| **Primary key** | `id` (uuid) — inferred |
| **Important columns** | `exam_id`, `student_id`, `assigned_by` (added in RLS migration) |
| **Relationships** | `exam_id` → `exam_sessions(id)`; `student_id` / `assigned_by` → auth user UUID |

### `public.exam_attempts` *(pre-existing)*

| Field | Detail |
|-------|--------|
| **Purpose** | **Canonical** student exam submissions; feeds student/teacher intelligence |
| **Primary key** | `id` (uuid) — inferred |
| **Important columns** | `exam_id`, `student_id`, `student_name`, `device_id`, `attempt_id`, `answers` (jsonb), `score`, `question_count`, `time_taken`, `submitted_at` |
| **Relationships** | `exam_id` → `exam_sessions(id)`; `student_id` → auth user UUID |

### `public.public_exam_attempts`

| Field | Detail |
|-------|--------|
| **Purpose** | Guest/open exam attempts; **excluded** from mastery intelligence |
| **Primary key** | `id` (uuid) |
| **Important columns** | `exam_id`, `attempt_id`, `guest_name`, `device_id`, `answers`, `score`, `question_count`, `time_taken`, `submitted_at`, `created_at` |
| **Relationships** | `exam_id` → `exam_sessions(id)` ON DELETE CASCADE |
| **Created in** | `20260522120000_create_public_exam_attempts.sql` |
| **Note** | No `student_id` column — anonymous by design |

### `public.user_lexicon_word_stats` *(pre-existing)*

| Field | Detail |
|-------|--------|
| **Purpose** | Per-user lexicon practice stats (adaptive generator in practice mode) |
| **Primary key** | Composite unique `(user_id, word_id)` — inferred from upsert usage |
| **Important columns** | `user_id`, `word_id`, `seen_count`, `wrong_count` |
| **Relationships** | `user_id` → auth UUID; `word_id` → `lexicon_entries(id)` |

### Staff-owned content tables (user FK via `created_by`)

| Table | User column | Purpose |
|-------|-------------|---------|
| `draft_exams` | `created_by` | Teacher draft exams |
| `exam_sessions` | `created_by` | Published exams |
| `questions`, `topics`, `lexicon_*`, `metadata_definitions` | `created_by` | Question bank / lexicon ownership |
| `notes`, `note_variants`, `anchors`, etc. | `created_by` | Knowledge layer (student reads published content only) |

---

## 1.4 Tables searched but NOT found

| Search term | Status |
|-------------|--------|
| `profiles` | **No table** — concept mapped to `public.users` + `auth.users` |
| `roles` | **No table** — enum-like CHECK on `public.users.role` |
| `members` | **Not found** |
| `accounts` | **Not found** |
| `student` (as table name) | **Not found** — `student_id` is a column FK, not a separate entity |
| `analytics` | **No table** — computed in JS (`js/analytics/*`) |
| `mastery` | **No table** — derived from attempts + question topics in client |

---

# Section 2 — Supabase Auth Mapping

## Identity chain

```
auth.users
  │  id (uuid)
  │  email
  │  user_metadata.full_name (optional)
  │
  │  AFTER INSERT → handle_new_user()
  ▼
public.users
  │  id (= auth.users.id)
  │  role: 'student' | 'teacher' | 'admin'
  │  created_at
  │
  ├── exam_assignments.student_id
  ├── exam_attempts.student_id
  └── user_lexicon_word_stats.user_id
```

## Questions answered

### 1. How are teachers identified?

- `public.users.role = 'teacher'`
- Client: `isTeacher()` in `js/auth.js` — true for `teacher` or `admin`
- Edge: `authenticateTeacherRequest()` in `supabase/functions/_shared/edge-auth.ts` — requires `role IN ('teacher', 'admin')`
- Postgres RLS: `is_teacher_or_admin()` reads `public.users.role`

### 2. How are students identified?

- `public.users.role = 'student'`
- Client: `isStudent()` — true for `student` or `admin`
- Exam ownership: `exam_assignments.student_id = auth.uid()` and `exam_attempts.student_id = auth.uid()`
- Edge `assign-exam`: validates selected UUIDs have `public.users.role = 'student'`

### 3. How are admins identified?

- `public.users.role = 'admin'`
- One bootstrap email preserved in migration: `prabelsurendran@gmail.com`
- Admin passes both teacher and student role gates in client routing
- RLS: `is_admin()` helper

### 4. Where is role information stored?

**Canonical store:** `public.users.role` — **not** JWT metadata.

Documented explicitly in `login.html`:

> *"Profiles are auto-created in public.users on auth signup (default role: student). Admins promote teachers via public.users.role (not JWT metadata)."*

Role is always fetched via a **second DB lookup** after JWT authentication:

- Browser: `fetchUserRole(sb, userId)` → `users.select('role')`
- Edge: service-role client → `users.select('role')`
- Postgres: `current_user_role()` → `SELECT role FROM public.users WHERE id = auth.uid()`

**Not used for roles:** `app_metadata`, JWT custom claims, `user_metadata`.

### 5. Is there already a profile table?

**No dedicated profile table.**

`public.users` is a minimal authorization row (id + role + created_at). Email and display name live in **`auth.users`** only and are accessed via:

- Client `auth.getUser()` for the logged-in user
- Edge `auth.admin.listUsers()` for teacher student lists (`list-students`)

---

# Section 3 — Current Student Identity Sources

## Codebase search results

| Field | Found? | Primary source | Used for |
|-------|--------|----------------|----------|
| `email` | Yes | `auth.users.email` | Login; `list-students`; assign modal labels; exam name fallback |
| `user_id` | Yes | `user_lexicon_word_stats.user_id` | Practice lexicon stats (= `auth.uid()`) — **not** exam identity |
| `student_id` | Yes | `exam_assignments.student_id`, `exam_attempts.student_id` | FK to auth UUID; RLS; analytics grouping |
| `name` | Yes | API response shape in `list-students` | Derived from `user_metadata.full_name` |
| `student_name` | Yes | `exam_attempts.student_name` | Denormalized snapshot; teacher results; intelligence |
| `attempt_name` | **No** | — | Zero matches in repo |
| `display_name` | Yes | Anchor system only (`anchor_variants.display_name`) | Notes/anchors — **not** student profile |
| `full_name` | Yes | `auth.users.user_metadata.full_name` | `list-students`, `exam.js` name resolution |
| `guest_name` | Yes | `public_exam_attempts.guest_name` | Anonymous exam path |
| `attempt_id` | Yes | UUID on attempt rows | Attempt correlation — not a person identifier |

## How PrepOS currently knows who a student is

**At login:** Supabase Auth session → `auth.users.id` + query `public.users.role`.

**At exam assignment:** Teacher selects `student.id` (auth UUID) from `list-students` edge function → stored in `exam_assignments.student_id`.

**At exam submit (canonical):**

```javascript
// js/exam.js
student_id: user.id,           // auth UUID
student_name: studentName,     // resolved at submit time
```

**Name resolution priority** (`resolveStudentName()` in `js/exam.js`):

1. Manual `#studentName` input (guests only — hidden when logged in)
2. `localStorage.studentName`
3. `user.user_metadata.full_name`
4. `user.user_metadata.name`
5. Email local-part before `@`
6. Literal `"Student"`

**At analytics:** Grouping key is `student_id` (preferred) with fallback to `student_name` in teacher intelligence when `student_id` is missing from query results.

**Identity fragmentation:** There is no single canonical display name. Auth metadata, localStorage, and attempt snapshots can disagree.

---

# Section 4 — Exam Ownership Audit

## 4.1 `exam_assignments`

### Schema (inferred)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `exam_id` | uuid | FK → `exam_sessions(id)` |
| `student_id` | uuid | FK → auth user / `public.users.id` |
| `assigned_by` | uuid | FK → auth user (teacher who assigned) |

### Ownership fields

- **Student ownership:** `student_id` = assigned student's auth UUID
- **Teacher ownership:** `assigned_by` + exam owner via `exam_sessions.created_by`

### Relationships

```
exam_sessions (published exam)
    ↑ exam_id
exam_assignments
    student_id → auth.users.id (role must be 'student')
    assigned_by → auth.users.id (teacher/admin)
```

### Write path

- **No client INSERT policy** — assignments created only via `assign-exam` edge function (service role)
- Validates each `student_id` exists in `public.users` with `role = 'student'`

---

## 4.2 `exam_attempts`

### Schema (inferred)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `exam_id` | uuid | FK → `exam_sessions(id)` |
| `student_id` | uuid | Canonical student identity (= auth UUID) |
| `student_name` | text | Denormalized display name at submit |
| `device_id` | text | Device fingerprint |
| `attempt_id` | uuid | Attempt correlation ID |
| `answers` | jsonb | Response payload |
| `score` | numeric | Score |
| `question_count` | integer | Question count |
| `time_taken` | integer | Duration |
| `submitted_at` | timestamptz | Submit timestamp |

### Ownership fields

- **Student ownership:** `student_id = auth.uid()` enforced on INSERT by RLS
- **Teacher visibility:** exam owner (`exam_sessions.created_by`) can SELECT attempts

---

## 4.3 Questions answered

### 1. Are attempts linked to `user_id`?

**No column named `user_id` on exam tables.** Canonical attempts use **`student_id`**, which equals `auth.users.id` / `auth.uid()`.

### 2. Are attempts linked to email?

**No.** Email is never stored on `exam_attempts` or `exam_assignments`.

### 3. Are attempts linked to `student_name`?

**Yes — as denormalized text**, not as the primary identity key. Written at submit from `resolveStudentName()`. Used for display in teacher results and intelligence when grouping.

### 4. Are anonymous exam attempts supported?

**Yes — via a separate table and path.**

| Path | Table | Identity |
|------|-------|----------|
| **Canonical** | `exam_attempts` | Requires login + prior `exam_assignment`; sets `student_id` |
| **Public/open** | `public_exam_attempts` | No login required; sets `guest_name`; no `student_id` |

Public path: anon can read `exam_sessions` (UUID as capability token) and insert into `public_exam_attempts`. Public attempts are **excluded from mastery intelligence** (`analytics-scope.js`).

### Examples

**Canonical submit** (`js/exam.js`):

```javascript
.from("exam_attempts").insert([{
  exam_id: examId,
  student_id: user.id,
  student_name: studentName,
  ...
}])
```

**Public submit** (`js/exam.js`):

```javascript
.from("public_exam_attempts").insert([{
  exam_id: examId,
  guest_name: studentName,
  // no student_id
  ...
}])
```

**RLS gate for canonical** (`exam_attempts_insert_assigned_student`):

```sql
student_id = auth.uid()
AND EXISTS (
  SELECT 1 FROM exam_assignments ea
  WHERE ea.exam_id = exam_attempts.exam_id
    AND ea.student_id = auth.uid()
)
```

---

# Section 5 — Analytics Dependency Audit

## 5.1 Architecture overview

Analytics are **client-computed** — no analytics tables in Postgres. Pipeline:

```
exam_attempts / public_exam_attempts (DB)
        ↓
student-intelligence.js / teacher-intelligence.js (loaders)
        ↓
analytics-submission.js → buildAttemptRecord
        ↓
attempt-analytics.js / knowledge-analytics.js (pure engines)
        ↓
student-selectors.js / teacher-selectors.js (UI shaping)
```

## 5.2 Tables queried for analytics

| Table | Queried from | Identity columns used |
|-------|--------------|----------------------|
| `exam_attempts` | `student-intelligence.js`, `teacher-intelligence.js`, `analytics-submission.js`, `teacher-results.js` | `student_id`, `student_name` |
| `public_exam_attempts` | `analytics-submission.js`, `teacher-intelligence.js` (count only) | `guest_name` → mapped to `student_name`; `student_id: null` |
| `exam_assignments` | `student-intelligence.js`, `exam.js`, `assign-exam-modal.js` | `student_id` |
| `exam_sessions` | `teacher-intelligence.js`, `teacher-results.js` | `created_by` (teacher scope) |
| `questions` + `question_topics` + `topics` | Intelligence loaders | None (content linkage) |
| `users` | `teacher-intelligence.js` | `role` only |

**Not queried by exam analytics:** `user_lexicon_word_stats` (separate practice domain).

## 5.3 Functions/selectors depending on identity fields

### `student_id`

| Module | Usage |
|--------|-------|
| `analytics-submission.js` | `buildAttemptRecord`, `fetchPriorExamAttempts` |
| `attempt-analytics.js` | `normalizeAttempt`, `buildStudentStats`, `filterAttemptsByStudent` |
| `student-intelligence.js` | `.eq("student_id", userId)` on assignments and attempts |
| `teacher-intelligence.js` | `groupAttemptsByStudent`, `uniqueStudents`, distribution aggregates |
| `exam.js` | Insert + `canSubmitCanonicalAttempt` |
| `assign-exam-modal.js` | Assignment targets |

### `student_name`

| Module | Usage |
|--------|-------|
| `analytics-submission.js` | Denormalized on attempt record; public → `guest_name` mapping |
| `attempt-analytics.js` | Display + grouping fallback |
| `teacher-intelligence.js` | Fallback key: `student_id \|\| student_name \|\| row.id` |
| `teacher-results.js` | **Groups entirely by `student_name`** — ignores `student_id` |
| `exam.js` | Required at submit (from localStorage / metadata) |

### `email`

| Module | Usage |
|--------|-------|
| `analytics-observability.js` | Debug snapshot only |
| `analytics-debug.js` | Debug panel only |
| `assign-exam-modal.js` | Student list label (`name \|\| email`) |
| `exam.js` | Display name fallback only — not stored in analytics |

## 5.4 Known gaps today

1. **`fetchCanonicalAttempts`** selects `student_name` but **omits `student_id`**, so downstream `toAttemptRecords` often gets `studentId: null` despite DB rows having it.
2. **Dual grouping keys** in teacher intelligence — duplicate "students" if names change or public/canonical mix.
3. **`teacher-results.js`** groups by name only — fragile for name collisions.
4. **No persisted mastery** — introducing profiles does not require migrating analytics tables (none exist), but loaders and grouping keys must stay consistent.

## 5.5 If Student Profiles are introduced

### Would need updating

| Area | Reason |
|------|--------|
| Schema / RLS | Policies key on `student_id = auth.uid()`; may need `profile_id` or profile join |
| `exam.js` | Resolve canonical name from profile; reduce localStorage dependence |
| `analytics-submission.js` | Attempt record shape; prior-attempt fetch columns |
| `student-intelligence.js` | Load by profile; fix `student_id` in SELECT |
| `teacher-intelligence.js` | Single canonical grouping key |
| `attempt-analytics.js` | Accept profile-aware identity fields |
| `teacher-results.js` | Prefer stable ID over name |
| `list-students` / `assign-exam` | Profile-enriched student list; optional batch filter |
| Edge functions | Student creation / profile management (new) |
| Backfill job | Map historical `student_id` (auth UUID) → profile records |

### Would continue working unchanged

| Component | Reason |
|-----------|--------|
| `analytics-core.js`, `knowledge-analytics.js`, `difficulty-engine.js` | Pure computation on normalized attempt objects |
| `analytics-scope.js` | Canonical vs public classification unchanged |
| `analytics-events.js` pipeline | Same if attempt record contract preserved |
| Replay/simulation/observability modules | No DB identity dependency (except debug email) |
| Question/topic fetches | Unaffected |
| Student/teacher selectors & renderers | Unchanged if intelligence layer preserves state shape |
| Public exam path | Still anonymous; no profile required |

---

# Section 6 — Existing Name Storage

## Search results

| Field | Location | Student? | Teacher? |
|-------|----------|----------|----------|
| `full_name` | `auth.users.user_metadata.full_name` | Yes (optional) | Yes (optional) |
| `name` | `auth.users.user_metadata.name` | Fallback in `exam.js` | — |
| `student_name` | `exam_attempts.student_name` | Yes — per-attempt snapshot | Visible to teachers |
| `guest_name` | `public_exam_attempts.guest_name` | Anonymous attempts | Visible to exam owners |
| `display_name` | Anchor/notes system only | No | Staff content |
| `first_name` | **Not found** | — | — |
| `last_name` | **Not found** | — | — |

## Questions answered

### 1. Is student name already stored somewhere?

**Partially — in three places, none canonical:**

1. `auth.users.user_metadata.full_name` (optional, user-editable, not in `public.users`)
2. `localStorage.studentName` (client-only, persists across sessions)
3. `exam_attempts.student_name` (denormalized per attempt — can drift from auth metadata)

### 2. Is teacher name already stored somewhere?

**Same as any auth user:** optional `auth.users.user_metadata.full_name`. No teacher-specific name table. Teacher identity in UI is typically email or role-based routing.

### 3. Is there duplicate name storage already?

**Yes — by design today:**

| Store | Scope | Problem for profile layer |
|-------|-------|---------------------------|
| Auth metadata | Global per user | User-editable; not validated by teachers |
| localStorage | Per browser | Not shared across devices |
| `exam_attempts.student_name` | Per attempt | Historical snapshots; may not match current name |

---

# Section 7 — Role Management Audit

## Current role system

| Role | DB value | Client access | Edge access | RLS helpers |
|------|----------|---------------|-------------|-------------|
| Student | `student` | Student dashboard, practice, notes (published) | — | `current_user_role() = 'student'` |
| Teacher | `teacher` | Teacher home, creator, results, intelligence | `authenticateTeacherRequest` | `is_teacher_or_admin()` |
| Admin | `admin` | All student + teacher surfaces | Same as teacher | `is_admin()` |

**Constants** (`js/core/access.js`):

```javascript
TEACHER_ROLES = ["teacher", "admin"]
STUDENT_ROLES = ["student", "admin"]
ALL_APP_ROLES = ["teacher", "admin", "student"]
```

## Questions answered

### 1. Where are roles stored?

**Single column:** `public.users.role` with CHECK constraint. Default `'student'` on provisioning trigger.

### 2. How are permissions enforced?

| Layer | Mechanism |
|-------|-----------|
| **Page boot** | `bootPage()` / `bootRuntime()` → `fetchUserRole()` → `roleAllowed()` |
| **Edge functions** | JWT auth + service-role lookup of `public.users.role` |
| **Postgres RLS** | `current_user_role()`, `is_admin()`, `is_teacher_or_admin()` + per-table policies |
| **Role mutation** | Admin-only UPDATE on `public.users` (`users_update_admin` policy); no in-app UI |

### 3. Would Student Profiles interfere with role management?

**No — if profiles are additive.**

Recommended separation:

- **`public.users.role`** remains the authorization gate (unchanged)
- **`student_profiles`** holds display/organizational data (name, batch, teacher link)
- Profile table should **not** store role — avoids dual source of truth

Risk if done wrong: storing role on profile table or using `user_metadata` for authorization (Supabase security anti-pattern).

---

# Section 8 — RLS Policy Audit

## Policies on user-related tables

### `public.users`

| Policy | Command | Rule |
|--------|---------|------|
| `users_select_own_or_admin` | SELECT | `id = auth.uid() OR is_admin()` |
| `users_update_admin` | UPDATE | `is_admin()` |

**Gap:** No client INSERT — rows created by trigger only.

### `public.exam_assignments`

| Policy | Command | Rule |
|--------|---------|------|
| `exam_assignments_select_visible` | SELECT | Admin, assigned student, assigner, or exam owner |

**Gap:** No client INSERT/UPDATE/DELETE — edge function only.

### `public.exam_attempts`

| Policy | Command | Rule |
|--------|---------|------|
| `exam_attempts_select_own_or_exam_owner` | SELECT | Admin, `student_id = auth.uid()`, or exam owner |
| `exam_attempts_insert_assigned_student` | INSERT | `student_id = auth.uid()` + assignment exists |

**Gap:** No client UPDATE/DELETE.

### `public.public_exam_attempts`

| Policy | Command | Rule |
|--------|---------|------|
| `public_exam_attempts_insert` | INSERT | Open to anon + authenticated |
| `public_exam_attempts_select` | SELECT | Admin or exam owner |

## Would a new `student_profiles` table require policy changes?

| Scenario | Policy work |
|----------|-------------|
| **New `student_profiles` table** | **New policies required** — SELECT/INSERT/UPDATE scoped to: student reads own profile; teacher reads profiles of their students; admin reads all |
| **Existing `exam_attempts` / `exam_assignments`** | **Policy updates likely** if `profile_id` added as FK; can keep `student_id = auth.uid()` during transition |
| **Existing `public.users`** | **No changes** if role remains authoritative |
| **Analytics (no tables)** | **No RLS changes** |

## Helper functions (SECURITY DEFINER)

Used to avoid RLS recursion:

- `current_user_role()`, `is_admin()`, `is_teacher_or_admin()`
- `user_owns_exam_session(exam_id)`, `user_assigned_to_exam(exam_id)`

A profile layer may need similar helpers, e.g. `teacher_owns_student_profile(profile_id)`.

---

# Section 9 — Teacher Workflow Audit

## Stated process vs actual implementation

**Stated:**

```
Teacher manually creates email
Teacher manually creates password
Student logs in
```

**Verified — partially accurate, with important gaps:**

### What exists

| Step | Implementation |
|------|----------------|
| Student logs in | `login.html` → `signInWithPassword` → route by `public.users.role` |
| Auto-provisioning | DB trigger creates `public.users(id, role='student')` on auth signup |
| Teacher lists students | `assign-exam-modal.js` → `list-students` edge function |
| Teacher assigns exam | Modal checkboxes → `assign-exam` edge function → `exam_assignments` rows |

### What does NOT exist

| Expected | Actual |
|----------|--------|
| Teacher creates student email/password in PrepOS | **No UI, no edge function** |
| Signup page in app | **Only login page** — no `signUp` in client code |
| Admin API student provisioning from teacher UI | **Not implemented** |
| Hidden profile creation flow | **Not found** |

### Account creation paths (out-of-band)

1. **Supabase Dashboard** — manual user creation
2. **Supabase Auth Admin API** — external tooling
3. **Public signup** — `supabase/config.toml` has `enable_signup = true` for email, but no app signup page exposes it

### Edge functions inventory (user-related)

| Function | Purpose |
|----------|---------|
| `list-students` | Teacher/admin lists students: `public.users` (role=student) + Auth Admin API for email/name |
| `assign-exam` | Assign exam to existing student UUIDs |

**No** `create-student`, `provision-user`, or similar functions exist.

### `list-students` implementation summary

1. Query `public.users` where `role = 'student'` (max 200 IDs)
2. Paginate `auth.admin.listUsers()` to resolve email + `user_metadata.full_name`
3. Return `{ id, email, name }` — max 20 after search filter

### Questions answered

1. **Where is this implemented?** Provisioning: DB trigger. Listing/assigning: edge functions + `assign-exam-modal.js`. **Not** teacher-home or any student management page.
2. **Is admin API used?** Yes — `auth.admin.listUsers()` in `list-students` only. **Not** used for creation.
3. **Is there existing student creation UI?** **No.**
4. **Is there already a hidden profile creation flow?** **No.**

---

# Section 10 — Future Batch Compatibility

## Recommended structures

Based on current architecture (auth UUID as stable key, teacher-owned exams, no batch concept today):

```
student_profiles
student_batches
student_batch_members
```

### Reasoning

| Table | Purpose | Why needed |
|-------|---------|------------|
| **`student_profiles`** | Canonical student display + organizational metadata | Replaces fragmented name storage; 1:1 with auth user for students |
| **`student_batches`** | Named cohorts (e.g. "Class 10A — 2026") | Teachers need grouping beyond flat student list |
| **`student_batch_members`** | Many-to-many: profiles ↔ batches | Students can belong to multiple batches over time |

### Recommended columns (conceptual — not DDL)

**`student_profiles`**

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `user_id` | uuid UNIQUE FK → `auth.users(id)` — same as today's `student_id` |
| `display_name` | Canonical name for UI + attempt snapshots |
| `created_by` | Teacher/admin who provisioned (nullable for backfill) |
| `created_at`, `updated_at` | Audit |

**`student_batches`**

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `name` | Batch label |
| `created_by` | FK → auth user (teacher) |
| `created_at` | Audit |

**`student_batch_members`**

| Column | Notes |
|--------|-------|
| `batch_id` | FK → `student_batches` |
| `profile_id` | FK → `student_profiles` |
| `joined_at` | Audit |
| PK | `(batch_id, profile_id)` |

### Alternatives considered

| Alternative | Verdict |
|-------------|---------|
| Extend `public.users` with name/batch columns | Mixes authorization + profile; name collision with table purpose |
| Store profiles only in `auth.users.user_metadata` | User-editable; unsafe for teacher-managed names; hard to query/RLS |
| `teacher_students` junction (no batches) | Simpler MVP but doesn't scale to cohort assignment |
| Replace `student_id` with `profile_id` on all tables immediately | High migration risk — prefer additive phase |

### Relationship to existing tables

```
auth.users
    ↓ 1:1
student_profiles
    ↓ M:N
student_batch_members → student_batches
    ↓
exam_assignments.student_id  (keep auth UUID during transition, or add profile_id)
exam_attempts.student_id
```

---

# Section 11 — Recommended Student Profile Architecture

## Recommended Tables

| Table | Priority | Relationship |
|-------|----------|--------------|
| `student_profiles` | **Phase 1 — required** | 1:1 with `auth.users.id` for role=student |
| `student_batches` | Phase 2 | Owned by teacher (`created_by`) |
| `student_batch_members` | Phase 2 | Links profiles to batches |

**Do not duplicate role** on profile tables. Keep `public.users.role` as sole authorization source.

## Recommended Relationships

```
auth.users (id)
    │
    ├── public.users (id, role)          ← authorization unchanged
    │
    └── student_profiles (user_id)       ← display + teacher ownership
            │
            └── student_batch_members → student_batches
                    │
exam_assignments.student_id ──────────────→ auth.users.id (Phase 1)
exam_attempts.student_id ─────────────────→ auth.users.id (Phase 1)
exam_attempts.student_name ───────────────→ synced from profile at submit (Phase 2)
```

**Optional Phase 3:** Add `profile_id` to `exam_assignments` / `exam_attempts` once backfill complete; keep `student_id` for backward compatibility during transition.

## Recommended Migration Strategy

### Phase 0 — Audit complete (this document)

No schema changes.

### Phase 1 — Profile foundation

1. Create `student_profiles` with RLS
2. Backfill: one profile per `public.users` row where `role = 'student'`
   - `display_name` from `auth.users.user_metadata.full_name` or email local-part
3. Add `create-student` edge function (teacher/admin): Auth Admin `createUser` + profile row + trigger handles `public.users`
4. Update `list-students` to read from `student_profiles` joined with auth email
5. Update `exam.js` to resolve name from profile (fallback chain preserved)

### Phase 2 — Batch layer

1. Create `student_batches` + `student_batch_members`
2. Extend assign-exam modal with batch filter
3. Optional: batch-scoped assignment defaults

### Phase 3 — Identity consolidation

1. Fix `fetchCanonicalAttempts` to include `student_id`
2. Migrate `teacher-results.js` to ID-based grouping
3. Optional: add `profile_id` FK to attempts/assignments
4. Deprecate localStorage as name source of truth

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dual identity keys during transition | Medium | Keep `student_id = auth.uid()` authoritative; add `profile_id` additively |
| RLS gaps on new tables | High | Follow existing helper pattern; test student/teacher/admin paths |
| Name drift between profile and attempt snapshots | Low | Sync `student_name` from profile at submit; historical rows unchanged |
| `list-students` Auth Admin pagination at scale | Medium | Move to profile-table search; limit Admin API usage |
| Teacher creates student without profile row | Medium | Atomic edge function: auth user + profile in one transaction |
| Breaking analytics engines | Low | Preserve `buildAttemptRecord` contract; change loaders only |
| Using `user_metadata` for authorization | **Critical** | Never — keep role in `public.users` |

## Backward Compatibility Plan

| System | Compatibility approach |
|--------|------------------------|
| Existing `exam_attempts` rows | No change required; `student_id` remains valid auth UUID |
| Existing `exam_assignments` | No change required |
| Analytics engines | Unchanged if attempt record shape preserved |
| RLS on exam tables | Unchanged in Phase 1 (still `student_id = auth.uid()`) |
| Public exam path | Unchanged — no profile needed |
| Practice lexicon stats | Unchanged — uses `user_id = auth.uid()` |
| `list-students` API shape | Preserve `{ id, email, name }` — enrich `name` from profile |

---

# Section 12 — Implementation Readiness Checklist

| # | Question | Answer |
|---|----------|--------|
| 1 | Can `student_profiles` be added without breaking analytics? | **Yes** — analytics are client-computed from attempt rows. Loaders and name resolution need updates; pure engines (`knowledge-analytics.js`, `analytics-core.js`) can remain unchanged if attempt record contract is preserved. |
| 2 | Can `student_profiles` be added without breaking exams? | **Yes** — add profiles additively. Keep `student_id = auth.uid()` on attempts/assignments during Phase 1. Update `resolveStudentName()` to prefer profile display name. |
| 3 | Can `student_profiles` be added without breaking RLS? | **Yes** — new table gets new policies. Existing exam RLS unchanged if `student_id` semantics preserved. Must not store role on profile table. |
| 4 | Are migrations required? | **Yes** — at minimum `student_profiles` table + RLS + backfill. Batch tables optional Phase 2. |
| 5 | Is data backfill required? | **Yes** — one profile row per existing student auth account. Name backfill from auth metadata with email fallback. Historical `exam_attempts.student_name` snapshots remain as-is. |

## Additional pre-implementation work recommended

1. **Schema dump** — run `supabase db dump --schema-only` to capture full DDL for pre-existing tables (`exam_attempts`, `exam_assignments`) not in migration files.
2. **Fix existing bug** — `fetchCanonicalAttempts` should SELECT `student_id` before profile work begins.
3. **Student creation edge function** — required before teacher workflow matches stated process.
4. **Decide profile–auth coupling** — confirm 1:1 `student_profiles.user_id` = `auth.users.id` (recommended) vs separate profile IDs.

---

## Final Recommendation

```
READY TO IMPLEMENT
```

**With conditions:**

PrepOS has a **clean, centralized role model** (`public.users.role`) and a **stable auth UUID** already used as `student_id` everywhere. A `student_profiles` table can be added **additively** without breaking exams, analytics engines, or existing RLS — provided:

1. Profiles do not replace or duplicate role storage
2. Phase 1 keeps `student_id = auth.uid()` on exam tables
3. A teacher-facing `create-student` edge function is built (currently missing)
4. Backfill runs for existing student auth accounts
5. Name resolution moves from localStorage/metadata to profile as source of truth

**Batch tables (`student_batches`, `student_batch_members`)** can follow in Phase 2 once core profiles and student creation are stable.

---

## Key file references

| Area | Path |
|------|------|
| Auth provisioning | `supabase/migrations/20260523190008_auth_user_provisioning.sql` |
| RLS + role helpers | `supabase/migrations/20260517120000_enable_rls_backend_authority.sql` |
| Public attempts | `supabase/migrations/20260522120000_create_public_exam_attempts.sql` |
| Client auth | `js/auth.js`, `js/core/access.js`, `login.html` |
| Exam submit + name | `js/exam.js` |
| Student intelligence | `js/student/student-intelligence.js` |
| Teacher intelligence | `js/teacher/teacher-intelligence.js` |
| Analytics pipeline | `js/analytics/analytics-submission.js`, `attempt-analytics.js`, `knowledge-analytics.js` |
| List/assign students | `supabase/functions/list-students/index.ts`, `assign-exam/index.ts`, `js/ui/assign-exam-modal.js` |
| Edge auth | `supabase/functions/_shared/edge-auth.ts` |

---

*Audit complete. No migrations, SQL, UI, or code were modified during this investigation.*
