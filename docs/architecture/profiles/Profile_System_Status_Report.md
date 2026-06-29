# PrepOS Profile System — Status & Student Management Readiness Report

**Date:** 31 May 2026  
**Scope:** Architecture audit only — no migrations, schema changes, or code modifications  
**Goal:** Document the existing profile layer so Student Management and Batch Management build on it rather than parallel systems

---

## Executive Summary

PrepOS now operates a **three-layer identity model**:

```
auth.users          (credentials, email, user_metadata)
        ↓  ON INSERT → handle_new_user()
public.users        (authorization: role only)
        ↓  user_id FK (student role, 1:1)
public.learner_profiles  (canonical student display identity + teacher ownership)
        ↓  same UUID as student_id everywhere else
exam_assignments / exam_attempts / user_lexicon_word_stats / analytics (client-computed)
```

The **Student Profile Layer** is implemented as `public.learner_profiles`. It is additive — it does not replace `auth.users`, `public.users`, or exam tables. Display identity is still partially fragmented across `learner_profiles.display_name`, `auth.users.user_metadata`, `localStorage.studentName`, and denormalized `exam_attempts.student_name`.

**Student Management UI exists** on Teacher Home (create learner, list managed learners, detail modal with name edit) but is **hidden behind a client-side secret toggle** (5 clicks on the PrepOS nav kicker). Backend APIs (`create-learner`, `list-students`, RPCs) are live regardless of UI visibility.

**Batch tables do not exist.** No `student_batches` or `student_batch_members` migrations or code references were found.

---

# Section 1 — Existing Profile Architecture

## Search results summary

| Search term | Result |
|-------------|--------|
| `profile` / `profiles` | No dedicated `profiles` table. Concept split across `public.users` (auth) and `public.learner_profiles` (student display). Comments in migrations refer to `public.users` rows as "profiles" colloquially. |
| `learner_profile` / `learner_profiles` | **Canonical student profile table** — `public.learner_profiles` |
| `student_profile` | **Not found** as a table name |
| `teacher_profile` | **Not found** — teachers identified solely by `public.users.role = 'teacher'` |
| `user_profile` | **Not found** as a table name |

---

## 1.1 `auth.users` (Supabase Auth schema)

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Authentication identity — credentials, sessions, JWT |
| **Primary key** | `id` (uuid) |
| **Foreign keys** | None inbound; parent of `public.users` |
| **Important columns** | `email`, `encrypted_password`, `user_metadata` (optional `full_name`, `name`), auth timestamps |
| **Relationships** | Referenced as `student_id`, `assigned_by`, `created_by`, `user_id` across app tables |
| **Created in migrations** | No — managed by Supabase Auth |

**Trigger:** `on_auth_user_created` → `public.handle_new_user()` (`20260523190008_auth_user_provisioning.sql`)

---

## 1.2 `public.users`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | PrepOS **authorization layer** — role gate for RLS, routing, edge functions. Not a display profile. |
| **Primary key** | `id` (uuid) |
| **Foreign keys** | `id` → `auth.users(id)` ON DELETE CASCADE |
| **Important columns** | `role` text CHECK (`student`, `teacher`, `admin`), default `'student'`; `created_at` timestamp |
| **Relationships** | Parent of `learner_profiles.user_id`; referenced by all role checks |
| **Created in** | `20260523190008_auth_user_provisioning.sql` |

**Does not store:** email, display name, status, batch, or teacher–student ownership.

---

## 1.3 `public.learner_profiles` *(canonical student profile layer)*

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Canonical **student display identity** and **teacher ownership** for managed learners |
| **Primary key** | `id` (uuid), default `gen_random_uuid()` |
| **Foreign keys** | `user_id` → `public.users(id)` ON DELETE CASCADE, UNIQUE; `created_by` → `public.users(id)` ON DELETE SET NULL |
| **Important columns** | `user_id`, `display_name` (NOT NULL, trimmed non-empty CHECK), `created_by`, `created_at`, `updated_at` |
| **Relationships** | 1:1 with student `public.users` row; owned by creating teacher via `created_by` |
| **Created in** | `20260612000000_learner_profiles_foundation.sql` |
| **Extended by** | `get_learner_details`, `update_learner_display_name`, backfill migration |

**Indexes:** `learner_profiles_created_by_idx` on `created_by`

**RLS policies:**
- `learner_profiles_select` — student sees own row; teacher sees rows where `created_by = auth.uid()`; admin sees all
- `learner_profiles_insert_teacher_or_admin` — teacher/admin insert with `created_by = auth.uid()` and target must have `role = 'student'`
- **No direct UPDATE/DELETE table policies** — updates go through `update_learner_display_name()` RPC (security definer)

**RPC functions (security definer):**

| Function | Purpose |
|----------|---------|
| `get_learner_profile(p_user_id)` | Single profile lookup with ownership rules |
| `create_learner_profile(p_user_id, p_display_name)` | Create profile for existing student user |
| `get_learner_details(target_user_id)` | Teacher/admin JSON detail: profile + email + exam counts + last activity |
| `update_learner_display_name(p_user_id, p_display_name)` | Update display name only |

---

## 1.4 Identity-adjacent tables (not profile tables)

These tables use auth UUIDs but are **not** part of the profile layer:

| Table | User column | Purpose |
|-------|-------------|---------|
| `exam_assignments` | `student_id`, `assigned_by` | Links students to published exams |
| `exam_attempts` | `student_id`, `student_name` | Canonical exam submissions; `student_name` is denormalized snapshot |
| `public_exam_attempts` | `guest_name` | Anonymous attempts — no `student_id` |
| `user_lexicon_word_stats` | `user_id` | Practice lexicon stats |
| `draft_exams`, `exam_sessions`, question bank, notes, anchors | `created_by` | Staff content ownership |

---

## 1.5 Tables searched but NOT found

| Term | Status |
|------|--------|
| `profiles` | No table |
| `student_profile` / `teacher_profile` / `user_profile` | No tables |
| `student_batches` / `student_batch_members` | No tables |
| `analytics` / `mastery` | No tables — computed in `js/analytics/*` |

---

# Section 2 — Auth → Profile Mapping

## Exact architecture

```
auth.users
  │  id (uuid)
  │  email
  │  user_metadata.full_name / .name (optional, user-editable)
  │
  │  AFTER INSERT → handle_new_user()
  ▼
public.users
  │  id (= auth.users.id)
  │  role: 'student' | 'teacher' | 'admin'
  │  created_at
  │
  │  (students only, 1:1, manual or edge-provisioned)
  ▼
public.learner_profiles
  │  id (profile uuid)
  │  user_id → public.users.id
  │  display_name
  │  created_by → teacher/admin public.users.id
  │  created_at, updated_at
  │
  ├── exam_assignments.student_id  (= user_id / auth uuid)
  ├── exam_attempts.student_id
  └── user_lexicon_word_stats.user_id
```

## Field mapping

| Concept | Canonical source | Notes |
|---------|------------------|-------|
| **user_id** | `auth.users.id` = `public.users.id` = `learner_profiles.user_id` | Stable join key across the system |
| **role** | `public.users.role` | Never JWT metadata; fetched post-auth via DB lookup |
| **display_name** | `learner_profiles.display_name` | Canonical when profile exists; fallbacks elsewhere |
| **email** | `auth.users.email` | Not stored in `public.users` or `learner_profiles`; joined at read time in edge/RPC |
| **full_name** | Not a first-class column | Only `auth.users.user_metadata.full_name` (legacy fallback) |
| **teacher identity** | `public.users.role = 'teacher'` | No teacher profile table |

## Role resolution paths

| Layer | Mechanism |
|-------|-----------|
| **Browser login** | `login.html` → `users.select('role')` → `redirectToRoleHome(role)` |
| **Page boot** | `js/core/runtime.js` → `fetchUserRole(sb, userId)` from `public.users` |
| **Edge functions** | `authenticateTeacherRequest()` → service-role `users.select('role')` |
| **Postgres RLS** | `current_user_role()`, `is_teacher_or_admin()`, `is_admin()` |

---

# Section 3 — Profile Data Fields

Active profile table: **`public.learner_profiles`**

| Field | Status | Location / notes |
|-------|--------|------------------|
| `id` | **Existing** | Profile UUID (`learner_profiles.id`) |
| `user_id` | **Existing** | FK to `public.users.id`; same as auth UUID |
| `display_name` | **Existing** | Canonical student display name |
| `full_name` | **Missing** | No column; legacy data may exist in `auth.users.user_metadata.full_name` |
| `email` | **Missing from profile table** | Lives on `auth.users`; exposed via `get_learner_details` and `list-students` edge fn |
| `role` | **Not on profile table** | On `public.users.role` (by design — separation of concerns) |
| `status` | **Missing** | No active/archived/suspended field; `archiveLearner()` stub throws |
| `created_at` | **Existing** | Profile creation timestamp |
| `updated_at` | **Existing** | Auto-maintained by trigger |
| `created_by` | **Existing** | Teacher ownership — drives RLS and `managedOnly` filtering |

### Deprecated / legacy identity fields (still in use as fallbacks)

| Field | Status | Usage |
|-------|--------|-------|
| `auth.users.user_metadata.full_name` | **Deprecated for canonical identity** | Fallback in `list-students`, `exam.js` name resolution |
| `localStorage.studentName` | **Deprecated** | Client cache; still read/written in `exam.js` |
| `exam_attempts.student_name` | **Denormalized snapshot** | Written at submit time; used by teacher results and classroom analytics grouping |

---

# Section 4 — Current Student Identity Flow

## End-to-end trace

```
Student Login (login.html)
    ↓
Supabase Auth — signInWithPassword()
    ↓
public.users role lookup — users.select('role').eq('id', userId)
    ↓  (NO learner_profiles lookup at login)
Role-based redirect — student-dashboard.html | index.html
    ↓
Dashboard (student-dashboard.js)
    ↓  bootPage → bootRuntime → fetchUserRole
    ↓  loadStudentIntelligence() — auth.getUser().id as student_id
    ↓  exam_assignments + exam_attempts keyed by student_id
Exam Attempt (exam.js)
    ↓  resolveStudentName() → getLearnerProfile(user.id) FIRST
    ↓  fallback: localStorage → user_metadata → email prefix → "Student"
    ↓  submit: exam_attempts.student_id = user.id, student_name = resolved name
Analytics (js/analytics/*, student/teacher intelligence)
    ↓  Group/filter by student_id (preferred) or student_name (fallback)
    ↓  No learner_profiles join in analytics pipelines today
```

## Code paths and services

| Step | File(s) | Key function / query |
|------|---------|----------------------|
| Login | `login.html` | `sb.auth.signInWithPassword()` → `routeUser()` |
| Role fetch | `js/core/access.js` | `fetchUserRole(sb, userId)` → `from("users").select("role")` |
| Page auth | `js/core/runtime.js`, `js/core/page-boot.js` | `bootRuntime()` / `bootPage()` |
| Student dashboard | `js/student-dashboard.js` | `loadStudentIntelligence()` |
| Intelligence data | `js/student/student-intelligence.js` | `fetchStudentExamAssignments`, `fetchCanonicalAttempts` — filter by `student_id = user.id` |
| Exam name | `js/exam.js` | `resolveStudentName()` → `getLearnerProfile()` via RPC |
| Exam submit | `js/exam.js` | `exam_attempts.insert({ student_id: user.id, student_name })` |
| Analytics | `js/analytics/knowledge-analytics.js`, `js/student/student-intelligence.js`, `js/teacher/teacher-intelligence.js` | Client aggregation from attempt rows |

**Important:** Login and dashboard flows identify students by **`auth.users.id` + `public.users.role`**, not by `learner_profiles`. A student without a `learner_profiles` row can still log in, receive assignments, submit exams, and see analytics — they just lack a canonical display name until a profile is created.

---

# Section 5 — Existing Student Creation Workflow

## 1. How are students currently created?

**Primary path (teacher-initiated):**

1. Teacher opens hidden Student Management section on Teacher Home (`index.html`)
2. Submits create form → `js/teacher/student-management.js` → `createLearner()`
3. Calls edge function `create-learner` with `{ email, password, displayName }`
4. Edge function provisions full stack (see below)

**Legacy / alternate paths:**

- **Supabase Auth signup** (if enabled outside the app): creates `auth.users` + `public.users` via trigger, but **does not** create `learner_profiles`
- **Manual RPC:** `create_learner_profile(p_user_id, p_display_name)` for an existing student user — exposed in `js/core/learner-profile.js` but **not wired to any UI**
- **One-time backfill:** `20260615000000_backfill_legacy_learner_profiles.sql` for two legacy accounts

## 2. Is `admin.createUser` used?

**Yes.** In `supabase/functions/create-learner/index.ts`:

```typescript
await adminClient.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
```

Uses service-role client after `authenticateTeacherRequest()` validates teacher/admin session.

## 3. Is profile creation automatic?

| Event | `public.users` | `learner_profiles` |
|-------|----------------|-------------------|
| Auth user insert (any path) | **Automatic** via `handle_new_user()` trigger | **No** |
| Teacher `create-learner` edge fn | Automatic (trigger) + polled | **Automatic** (insert after auth user) |
| Student login | No | No |

## 4. Is profile creation manual?

**For the teacher workflow:** No — profile insert is part of the `create-learner` edge function atomically (with rollback: deletes auth user if profile insert fails).

**For self-signup or legacy accounts:** Yes — requires teacher action or manual RPC/backfill.

## 5. Is profile creation triggered by login?

**No.** Login only reads `public.users.role`. No hook creates or backfills `learner_profiles` on first login.

## Relevant files

| File | Role |
|------|------|
| `supabase/functions/create-learner/index.ts` | Auth user + learner profile provisioning |
| `supabase/functions/create-learner/types.ts` | Request/response types |
| `supabase/functions/list-students/index.ts` | List/enrich students for teachers |
| `supabase/functions/_shared/edge-auth.ts` | Teacher/admin authentication |
| `supabase/migrations/20260523190008_auth_user_provisioning.sql` | `public.users` + auth trigger |
| `supabase/migrations/20260612000000_learner_profiles_foundation.sql` | Table, RLS, base RPCs |
| `supabase/migrations/20260613000000_get_learner_details.sql` | Detail RPC |
| `supabase/migrations/20260614000000_learner_details_last_activity.sql` | Last activity in detail RPC |
| `supabase/migrations/20260616000000_update_learner_display_name.sql` | Name update RPC |
| `supabase/migrations/20260615000000_backfill_legacy_learner_profiles.sql` | Legacy backfill |
| `js/core/learner-profile.js` | Client RPC wrappers |
| `js/teacher/student-management.js` | Create + list UI logic |
| `js/teacher/learner-details.js` | Detail modal + name edit |
| `js/teacher/student-management-visibility.js` | Secret UI toggle |
| `js/core/edge-invoke.js` | Edge function invocation |
| `index.html` | Student Management form + learner detail modal |
| `js/teacher-home.js` | Wires student management init |

---

# Section 6 — Teacher Visibility Audit

Ownership model: teachers see learners where `learner_profiles.created_by = auth.uid()` (admins see all). This applies to RLS, `get_learner_details`, and `list-students` with `managedOnly: true`.

| Data | Can teachers view? | Where | Gap |
|------|-------------------|-------|-----|
| **Student Name** | **Yes** | `list-students` (profile `display_name` + fallbacks); learner detail modal; `teacher-results.html` (`exam_attempts.student_name`); assign-exam modal | Results/analytics use attempt snapshot name, not always synced with profile |
| **Email** | **Yes** | `list-students`; `get_learner_details` RPC; student management list | Requires service-role auth admin lookup in edge fn |
| **Profile** | **Partial** | Learner detail modal: display name, email, created date, assigned/attempted counts, last activity | No full_name, status, batch, or notes |
| **Exam History** | **Partial** | `get_learner_details`: counts only; `teacher-results.html`: per-exam attempt list by `student_name` | No per-learner attempt drill-down from student management; no profile-linked attempt list RPC |
| **Analytics** | **Partial (classroom-level)** | `teacher-intelligence.html` — aggregates by `student_id` / `student_name` from attempts on teacher's exams | Not linked to `learner_profiles`; no per-student analytics page from roster; at-risk cards use anonymous `studentKey` not display names |

### UI visibility caveat

Student Management section (`#studentManagementSection`) is **`hidden` by default**. Teachers must unlock it via 5 rapid clicks on the PrepOS nav kicker (`js/teacher/student-management-visibility.js`). This is **client UI only** — APIs remain authorized for all teachers/admins.

---

# Section 7 — Profile Usage Map

| Area | File(s) | Purpose | Fields used |
|------|---------|---------|-------------|
| **Student creation** | `supabase/functions/create-learner/index.ts`, `js/teacher/student-management.js` | Provision auth + profile | `user_id`, `display_name`, `created_by` |
| **Student listing** | `supabase/functions/list-students/index.ts`, `js/teacher/student-management.js` | Teacher roster + assign-exam picker | `user_id`, `display_name`, `created_by`; email from auth |
| **Student detail** | `js/teacher/learner-details.js`, `get_learner_details` RPC | Modal detail view | `id`, `user_id`, `display_name`, `created_at`; email from auth; exam counts |
| **Name editing** | `js/teacher/learner-details.js`, `js/core/learner-profile.js`, `update_learner_display_name` RPC | Teacher edits display name | `display_name` |
| **Exam submit name** | `js/exam.js` | Resolve name before attempt insert | `display_name` via `getLearnerProfile()` |
| **Assign exam modal** | `js/ui/assign-exam-modal.js` | Student picker when assigning exams | Enriched `name` from `list-students` (profile-aware) |
| **Dashboard (student)** | `js/student-dashboard.js`, `js/student/student-intelligence.js` | Learning intelligence | **Does not use learner_profiles** — uses `student_id` from auth |
| **Exam system** | `js/exam.js` | Take + submit exams | Profile for name only; `student_id` for ownership |
| **Analytics (student)** | `js/student/student-intelligence.js`, `js/analytics/*` | Portfolio analytics | `student_id`; no profile join |
| **Analytics (teacher)** | `js/teacher/teacher-intelligence.js`, `js/teacher/teacher-selectors.js` | Classroom aggregation | `student_id`, `student_name` from attempts |
| **Results** | `js/teacher-results.js` | Per-exam results view | `student_name` from attempts (not profile) |
| **Practice** | Practice modules | Lexicon stats | `user_id` — no profile |
| **Notes** | Notes modules | Content access by role | Role from `public.users`; no profile |
| **Navigation / auth** | `login.html`, `js/core/runtime.js`, `js/core/access.js` | Login + routing | `public.users.role` only |
| **Legacy RPC (unused in UI)** | `js/core/learner-profile.js` | `createLearnerProfile()` for existing users | Full profile row |

---

# Section 8 — Batch Readiness Assessment

## Current state

**No batch tables or batch-related code exist** in migrations or application code (only forward-looking mentions in `docs/architecture/profiles/Student_Profile_Layer_Audit.md`).

## Recommended relationship

```
student_batches
    ↓  batch_id
student_batch_members
    ↓  profile_id (FK → learner_profiles.id)  OR  user_id (FK → learner_profiles.user_id)
learner_profiles
    ↓  user_id
public.users / auth.users
```

## Questions answered

### 1. Can batches attach directly to profiles?

**Yes — recommended.** `learner_profiles` is the organizational student entity with stable `id` and teacher ownership via `created_by`. Batch membership should reference **`learner_profiles.id`** (profile UUID) to keep cohorts in the display/organization layer without touching auth.

Alternatively, `user_id` works since the relationship is 1:1 for students, but `profile_id` is clearer if profiles can ever be archived independently of auth accounts.

### 2. Should batches attach to `auth.users` instead?

**Not recommended as primary.** Batches are a teacher-management concept aligned with `created_by` ownership on profiles. Attaching to `auth.users` bypasses the ownership model and includes users without profiles (legacy/self-signup students).

Use `auth.users.id` only as a denormalized convenience column if query performance requires it.

### 3. Architectural concerns

| Concern | Detail |
|---------|--------|
| **Ownership alignment** | `student_batches.created_by` should match the same teacher-ownership pattern as `learner_profiles.created_by` |
| **RLS consistency** | Batch visibility must follow profile ownership rules (teacher sees own batches/members; admin sees all) |
| **Legacy students without profiles** | Students existing before profile layer may lack `learner_profiles` rows — batch assignment requires profile existence or a backfill strategy |
| **Assign-exam integration** | `list-students` and assign modal would need batch filter — noted as future work in prior docs, not implemented |
| **No status field** | Archiving/removing batch members may need profile `status` or batch membership `removed_at` |

---

# Section 9 — Student Management Readiness

## Student List — Name, Email, Status

| Capability | Verdict | Notes |
|------------|---------|-------|
| **Name** | **Ready** | `list-students` returns `name` from `learner_profiles.display_name` with fallbacks |
| **Email** | **Ready** | `list-students` joins auth admin user list |
| **Status** | **Requires schema change** | No `status` column on `learner_profiles` or `public.users` |
| **List UI** | **Ready (hidden)** | `js/teacher/student-management.js` renders roster; gated by secret toggle |
| **Search** | **Ready (API)** | `list-students` accepts `search` param; not exposed in management list UI (only in assign modal) |

## Student Detail View — Profile, Attempts, Analytics

| Capability | Verdict | Notes |
|------------|---------|-------|
| **Profile** | **Ready** | `get_learner_details` + learner detail modal |
| **Attempts** | **Requires API work** | RPC returns `examsAttempted` count only — no attempt list, scores, or links |
| **Analytics** | **Requires API work** | No per-student analytics endpoint or UI from roster; classroom analytics exist separately |

## Student Editing — Display Name, Full Name, Status

| Capability | Verdict | Notes |
|------------|---------|-------|
| **Display Name** | **Ready** | `update_learner_display_name` RPC + modal edit UI |
| **Full Name** | **Requires schema change** | No column; would need `learner_profiles.full_name` or formal deprecation of metadata |
| **Status** | **Requires schema change** | `archiveLearner()` is an explicit stub throwing "not implemented" |

---

# Section 10 — Missing Pieces

Only items **not present today** that block or limit Student Management and Batches:

| Missing piece | Impact |
|---------------|--------|
| **`status` field** on profiles (active/archived/suspended) | Cannot filter roster by status; archive stub unimplemented |
| **`full_name` field** (if distinct from display name) | Cannot edit legal/full name in profile layer |
| **Auto-profile on all student accounts** | Legacy/self-signup students lack profiles until manual action |
| **First-login profile backfill** | Gap between auth provisioning and profile layer |
| **Per-student attempt list API** | Detail view shows counts only |
| **Per-student analytics view** from roster | Analytics remain classroom-level or results-by-name |
| **Student Management UI always visible** | Currently secret-toggle gated (product decision, not auth) |
| **Status/search in management list UI** | API supports search; management list does not expose it |
| **`student_batches` + `student_batch_members` tables** | Batch management impossible without schema |
| **Batch filter in assign-exam flow** | Not implemented |
| **Profile-aware teacher results** | Results still group by `student_name` snapshot |
| **Email update / password reset admin APIs** | Not part of profile layer today |
| **DELETE / archive RPC for profiles** | No soft-delete or deactivation path |

---

# Section 11 — Recommended Student Management Architecture

Build on the existing three-layer model. Do **not** introduce parallel profile tables.

## Student Management

```
Teacher Home / Student Management (always-visible when product-ready)
    │
    ├── List: list-students edge fn (managedOnly, search, status filter*)
    │         └── joins learner_profiles + auth.users.email
    │
    ├── Create: create-learner edge fn (unchanged)
    │         └── auth.admin.createUser → learner_profiles insert
    │
    ├── Detail: get_learner_details RPC (extend with attempt summary*)
    │         └── optional: get_learner_attempts(target_user_id) RPC
    │
    └── Edit: update_learner_display_name RPC (extend with status*, full_name*)

* = requires schema/API extension
```

**Ownership:** Keep `learner_profiles.created_by` as the teacher–student relationship until batches provide finer grouping. Admins bypass ownership in all RPCs (already implemented).

**Identity key for exams/analytics:** Continue using `student_id` (= `user_id` = auth UUID). Profile layer enriches display; it does not replace attempt FKs.

## Batch Management

```
student_batches
  id, name, description, created_by, created_at, updated_at

student_batch_members
  batch_id  → student_batches.id
  profile_id → learner_profiles.id   (preferred)
  joined_at, removed_at (soft membership)

RLS: created_by on batches matches profile ownership rules
```

**Assign flow extension:** `list-students` gains optional `batchId` filter → resolve member `profile_id`s → return enriched student rows.

**Do not duplicate:** Avoid a separate `teacher_students` junction — `created_by` on profiles already models direct ownership; batches add grouping on top.

## Future Assignment System

```
exam_sessions (published exam)
    ↓
exam_assignments (existing — student_id = auth uuid)
    ↑ assigned by teacher
Assignment targets (future):
    • individual profile (user_id)
    • whole batch (expand batch members → exam_assignments rows)
    • managed roster (created_by filter — already implicit)
```

Batch assignment is a **bulk insert into `exam_assignments`** using `student_id` from `learner_profiles.user_id` — no change to attempt or analytics FK model.

---

# Section 12 — Final Verdict

## Profile System Maturity: **B**

Solid foundational architecture with clear separation (auth / role / display profile), working RPCs, edge functions, and partial UI. Not yet **A** because: no status lifecycle, incomplete student detail (attempts/analytics), hidden management UI, legacy students without profiles, and name fragmentation with attempt snapshots.

---

## Answers

### 1. Is the profile system production-ready?

**Partially.** Core table, RLS, RPCs, and teacher create/list/edit-name flows are implemented and coherent. Gaps for production hardening: status lifecycle, profile coverage for all students, visible management UI, and consistent name usage in results/analytics.

### 2. Can Student Management be built immediately?

**Mostly yes.** List, create, profile detail, and display-name edit already exist. Immediate work is **product/UI** (visibility, search in list) and **API extensions** (attempt list, status) — not a new profile architecture.

### 3. Can Batch Management be built immediately?

**No.** Requires new schema (`student_batches`, `student_batch_members`) and RLS policies. Profile layer is ready to serve as the member anchor once tables exist.

### 4. Are schema changes required?

**For full Student Management:** Yes — at minimum `status` (and optionally `full_name`) on `learner_profiles`, plus optional attempt-list RPC.

**For Batch Management:** Yes — batch tables and membership junction.

**For basic roster (name + email + create + edit display name):** No further schema required.

### 5. What should be implemented next?

1. **Add `status` to `learner_profiles`** + `archiveLearner` / reactivate RPC (unblocks roster filtering and lifecycle)
2. **Make Student Management UI visible** (or role-gated without secret toggle)
3. **Backfill profiles** for student `public.users` rows missing `learner_profiles` (migration or login hook)
4. **Extend `get_learner_details`** with recent attempt rows (or dedicated RPC)
5. **Wire profile display names into teacher-results** (join or resolve via profile lookup)
6. **Implement batch tables** anchored to `learner_profiles.id`
7. **Add batch filter to `list-students` and assign-exam modal**

---

*Report generated from repository migrations, edge functions, and client code. No database or schema modifications were made during this audit.*
