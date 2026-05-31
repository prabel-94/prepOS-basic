# PrepOS Batch Management System — Architecture Proposal

**Date:** 31 May 2026  
**Scope:** Architecture and product design only — no migrations, SQL, or code  
**Context:** Builds on `learner_profiles` as the canonical student entity; Student Management exists; Batch Management does not

---

## Executive Summary

Batch Management adds a **teacher-owned grouping layer** on top of the existing student roster. Batches are organizational labels — not identity, not auth, not exam ownership. Members attach to **`learner_profiles.id`**, inherit ownership from the same `created_by` model used today, and integrate with exam assignment by **expanding batch membership into existing `exam_assignments` rows**.

**MVP recommendation:** Multi-batch membership (a student may belong to several batches). Junction-table design supports this at no meaningful complexity cost and matches real teacher workflows.

---

# Section 1 — Problem Definition

## Current state

Today, a teacher's world looks like a **flat roster**:

```
Teacher
 ├ Student
 ├ Student
 ├ Student
```

Every student is managed individually. `learner_profiles.created_by` defines who "owns" each student. Exam assignment, listing, and detail views operate on one student at a time (or multi-select without semantic grouping).

## Target state

Teachers need **named cohorts** that mirror how they already think about classes:

```
Teacher
 ├ Student                    ← flat roster still exists
 ├ Student
 ├ Student
 │
 ├ Batch: Beta Testers
 │   ├ Student
 │   ├ Student
 │
 └ Batch: KAS 2027
     ├ Student
     ├ Student
```

A student may appear in the flat roster **and** in one or more batches. Batches do not replace the roster — they organize it.

## Why Batch Management is needed

### Organization benefits

- Teachers run multiple cohorts (pilot groups, exam-year classes, remedial sets) without mentally tracking UUIDs or email lists.
- Batch names ("KAS 2027", "Beta Testers") become stable handles for day-to-day work.
- Reduces friction as roster size grows beyond a handful of learners.

### Assignment benefits

- Assign an exam to **12 students in one action** instead of 12 individual picks.
- Reduces errors when the same group receives repeated assignments.
- Aligns with existing `assign-exam` flow — batch becomes a **selection shortcut**, not a new assignment model.

### Analytics benefits (future)

- Batch ID becomes a **filter dimension** over existing attempt data (`exam_attempts.student_id` resolved via profile membership).
- Enables "how is KAS 2027 doing?" without redesigning analytics storage.
- Classroom intelligence today aggregates by teacher's exams; batches add a teacher-defined slice on top.

### Future scalability

- Notes, practice sets, revision campaigns, and messaging can target `batch_id` using the same membership table.
- V1 keeps batches lightweight; later features attach to batch membership without schema rewrites.

---

# Section 2 — Existing Architecture Alignment

## Where batches sit

```
auth.users
    │  credentials, email
    ▼
public.users
    │  role (student | teacher | admin)
    ▼
learner_profiles
    │  display_name, created_by (teacher ownership)
    │
    ├── exam_assignments.student_id  (= user_id / auth uuid)
    ├── exam_attempts.student_id
    │
    └── student_batch_members.profile_id   ← NEW (MVP)
            │
            ▼
        student_batches
            created_by (teacher ownership)
```

Batches are **siblings to exam tables**, not replacements. They reference profiles; exams continue to reference auth UUIDs via `student_id`.

## Why attach to `learner_profiles.id`

| Anchor | Verdict | Reason |
|--------|---------|--------|
| **`learner_profiles.id`** | **Recommended** | Batches are a teacher-management / display-layer concept. Profiles are the canonical student entity for all teacher features. `created_by` on profiles already defines which students a teacher manages. |
| `public.users.id` | Avoid as primary FK | Authorization row only — no display name, no teacher ownership, includes non-students if mis-keyed. |
| `auth.users.id` | Avoid as primary FK | Auth layer — students can exist in auth without a profile (legacy paths). Batch membership should imply a managed learner identity. |

**Practical rule:** Only students with a `learner_profiles` row may be batch members. This matches the create-learner guarantee (success = profile exists) and keeps batch semantics aligned with Student Management.

**Denormalization option (later, not MVP):** Store `user_id` on `student_batch_members` as a read-only copy of `learner_profiles.user_id` for join performance. Not required for MVP scale.

---

# Section 3 — Proposed Database Schema

Architecture only — no migration SQL.

## 3.1 `student_batches`

| Column | Type (conceptual) | Purpose |
|--------|-------------------|---------|
| `id` | uuid, PK | Batch identifier |
| `name` | text, NOT NULL | Teacher-visible label (e.g. "KAS 2027") |
| `description` | text, nullable | Optional notes (purpose, schedule, exam target) |
| `created_by` | uuid, FK → `public.users.id` | Owning teacher (same pattern as `learner_profiles.created_by`) |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last metadata edit |

**Relationships**

- `created_by` → `public.users` (teacher or admin who created the batch)
- One batch → many `student_batch_members`
- Deleting a batch cascades to its membership rows (MVP)

**Recommended constraints**

- `name` trimmed non-empty (mirror `learner_profiles.display_name` check)
- Index on `created_by` for teacher roster queries
- Optional: `UNIQUE (created_by, lower(trim(name)))` to prevent duplicate batch names per teacher (product decision — recommend **yes** for MVP clarity)

**Not in MVP schema:** `status`, `archived_at`, `color`, `sort_order`, parent batch hierarchy.

---

## 3.2 `student_batch_members`

| Column | Type (conceptual) | Purpose |
|--------|-------------------|---------|
| `id` | uuid, PK | Membership row identifier (or use composite PK — uuid PK is simpler for RPCs) |
| `batch_id` | uuid, FK → `student_batches.id` ON DELETE CASCADE | Which batch |
| `profile_id` | uuid, FK → `learner_profiles.id` ON DELETE CASCADE | Which student (canonical) |
| `added_by` | uuid, FK → `public.users.id` | Teacher who added the member |
| `added_at` | timestamptz | When joined |

**Relationships**

- `batch_id` → `student_batches`
- `profile_id` → `learner_profiles`
- Resolving auth UUID for exams: `learner_profiles.user_id` (join at assignment time)

**Recommended constraints**

- `UNIQUE (batch_id, profile_id)` — one membership row per student per batch
- Index on `profile_id` — "which batches is this student in?"
- Index on `batch_id` — "who is in this batch?"

**MVP removal strategy:** Hard `DELETE` on membership row. Soft-remove via `removed_at` is a V2 enhancement if audit history matters.

**Not in MVP:** role within batch (lead, monitor), membership expiry, invitation tokens.

---

# Section 4 — Ownership Model

## Current ownership

```
learner_profiles.created_by = Teacher A
```

Teacher A can list, view details, and edit display names for profiles they created. Admins bypass ownership. This is enforced in RLS and RPCs (`get_learner_details`, `list-students` with `managedOnly`).

## How batches inherit ownership

```
student_batches.created_by = Teacher A
```

Teacher A owns the batch container. Membership operations should require:

1. Caller owns the batch (`student_batches.created_by = auth.uid()`), **or** caller is admin.
2. Caller owns each profile being added (`learner_profiles.created_by = auth.uid()`), **or** caller is admin.

**Principle:** A teacher cannot add another teacher's students to their batch. A teacher cannot edit another teacher's batch.

## Questions answered

| Question | Recommendation |
|----------|----------------|
| Can teachers see only their own batches? | **Yes.** RLS: `created_by = auth.uid()` OR `is_admin()`. |
| Can admins see all batches? | **Yes.** Same admin bypass as profiles. |
| Can teachers add students they do not own? | **No (MVP).** Enforced at insert time by checking `learner_profiles.created_by`. Prevents cross-teacher roster leakage. |

## Cross-teacher scenarios (out of scope for MVP)

- Shared batches (co-teaching) — future `batch_collaborators` table
- School-wide batches created by admin — admin could create batch and add any profile (admin bypass already exists for profiles)

---

# Section 5 — MVP Teacher Workflow

## 5.1 Create Batch

1. Teacher opens **Student Management → Batches**
2. Clicks **Create Batch**
3. Enters:
   - **Batch Name** (required) — e.g. "Beta Testers"
   - **Description** (optional) — e.g. "Pilot group for new exam format"
4. Saves → batch appears in batch list

No students required at creation time.

## 5.2 Add Students

1. Teacher opens **Batch Detail** (or **Add Students** from batch list)
2. Sees searchable list of **their managed learners** (same pool as Student Management — `learner_profiles` where `created_by = teacher`)
3. Multi-selects students
4. Clicks **Add to Batch**
5. Membership rows created; students already in batch are skipped (idempotent)

Students not yet in the teacher's roster must be created via existing **Create Learner** flow first.

## 5.3 Remove Students

1. From **Batch Detail**, teacher selects member(s)
2. Clicks **Remove from Batch**
3. Membership row deleted — student remains in flat roster and retains exam assignments

Removing from a batch does **not** unassign exams or delete the profile.

## 5.4 View Batch

**Batch Detail** shows:

- Batch name and description
- Member count
- Member list: display name, email (from auth join), date added
- Actions: Add Students, Remove, Edit Batch Name/Description, Delete Batch

**Batch List** shows:

- All teacher's batches with member counts
- Create Batch action

---

# Section 6 — Teacher UI Proposal

Extend existing Student Management area on Teacher Home. No code — wireframe-level structure only.

## Navigation

```
Student Management
├ Students          ← existing (create, list, detail modal)
└ Batches           ← NEW tab or sub-nav
```

Recommend **tab switcher** inside `#studentManagementSection` to avoid a new top-level page for MVP.

---

## Batch List Screen

```
┌─────────────────────────────────────────────────────────┐
│  Student Management                          [Students|Batches] │
├─────────────────────────────────────────────────────────┤
│  Batches                              [ + Create Batch ] │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Beta Testers                          4 members │   │
│  │  Pilot group for new exam format                 │   │
│  │                              [ View ] [ Delete ] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  KAS 2027                              12 members│   │
│  │  Kerala Administrative Service 2027 cohort       │   │
│  │                              [ View ] [ Delete ] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  (empty state: No batches yet. Create your first batch.)│
└─────────────────────────────────────────────────────────┘
```

---

## Create Batch Modal

```
┌──────────────────────────────────────┐
│  Create Batch                    [×] │
├──────────────────────────────────────┤
│  Batch Name *                        │
│  [ KAS 2027                        ] │
│                                      │
│  Description                         │
│  [ Optional notes about this cohort ]│
│  [                                  ]│
│                                      │
│         [ Cancel ]  [ Create Batch ] │
└──────────────────────────────────────┘
```

---

## Batch Detail Screen

Modal or inline panel (consistent with learner detail modal pattern).

```
┌─────────────────────────────────────────────────────────┐
│  KAS 2027                                            [×] │
│  Kerala Administrative Service 2027 cohort               │
│  12 members · Created 12 May 2026                        │
├─────────────────────────────────────────────────────────┤
│  [ Edit Batch ]  [ Add Students ]  [ Delete Batch ]      │
│                                                         │
│  Members                                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ☑  Kenway          kenway@example.com    [Remove]│  │
│  │ ☐  Kichi           kichi@example.com     [Remove]│  │
│  │ ☐  ...                                           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  (link: View student detail → existing learner modal)   │
└─────────────────────────────────────────────────────────┘
```

---

## Add Students Modal

```
┌──────────────────────────────────────┐
│  Add Students to KAS 2027        [×] │
├──────────────────────────────────────┤
│  Search  [________________] 🔍       │
│                                      │
│  ☐  Kenway        kenway@...         │
│  ☐  Kichi         kichi@...          │
│  ☑  Arjun         arjun@...   (in batch) ← disabled/hidden
│                                      │
│  2 selected                          │
│         [ Cancel ]  [ Add to Batch ] │
└──────────────────────────────────────┘
```

Reuses the same managed-learner pool as `list-students` with `managedOnly: true`.

---

# Section 7 — Student Management Integration

## Should students belong to multiple batches?

**Yes — recommended for PrepOS MVP.**

## Should batch membership be exclusive?

**No — not for MVP.**

## Reasoning

| Approach | Pros | Cons |
|----------|------|------|
| **Multi-batch** | Matches real usage (pilot + exam-year + remedial overlap); junction table supports it naturally; no migration pain when teachers ask for overlap; student detail can show "Member of: Beta Testers, KAS 2027" | Slightly richer UI (list batches on student detail); assign-exam must dedupe if student selected individually and via batch |
| **Single-batch (exclusive)** | Simpler "this student belongs to one class" mental model | Artificial limit — moving student = remove + add; breaks overlapping cohorts; requires schema or app rule changes to expand later |

PrepOS already treats the **flat roster as source of truth** (`learner_profiles.created_by`). Batches are **tags on top**, not containers that own students. Multi-batch fits that model.

### Student detail integration (MVP-light)

On existing learner detail modal, add read-only section:

```
Batches: Beta Testers, KAS 2027
```

Editing membership from student detail is **optional V1.1** — batch detail screen is sufficient for MVP.

### Students without batches

Expected and fine. Batch membership is optional organization; flat roster unchanged.

---

# Section 8 — Exam Assignment Integration

## Current flow

```
Assign Exam Modal
    → search/list students (list-students)
    → select individual studentIds (auth UUIDs)
    → assign-exam edge fn
    → exam_assignments rows (exam_id, student_id, assigned_by)
```

## Future flow

```
Assign Exam Modal
    → tab or section: [ Students | Batches ]
    → select batch(es) and/or individual students
    → resolve batch → member profile_ids → user_ids
    → dedupe student IDs
    → assign-exam (unchanged insert into exam_assignments)
```

## Recommended architecture

**Do not add `batch_id` to `exam_assignments` for MVP.**

| Decision | Rationale |
|----------|-----------|
| Reuse `exam_assignments` as-is | Canonical exam ownership already works; analytics keyed on `student_id` |
| Batch = selection resolver | Batch assign is a **UI + API convenience** that expands to individual assignments |
| Dedupe before insert | Same student via batch + individual select → one assignment row |
| Validate ownership | Each resolved profile must be `created_by = teacher` (or admin); exam must be `created_by = teacher` (existing rule) |

## Recommended workflow (post-MVP integration step)

1. Teacher opens assign modal for published exam
2. Switches to **Batches** tab, selects "KAS 2027"
3. Client (or edge fn) calls `resolve-batch-members(batchId)` → returns `user_id[]`
4. Merges with any individually selected students
5. Calls existing `assign-exam` with deduped `studentIds`
6. Success message: "Exam assigned to 12 students (KAS 2027)"

**Optional enhancement:** Show which batch was used in assignment audit — store in client toast only for MVP; `assignment_source` column on `exam_assignments` is V2 if needed.

---

# Section 9 — Analytics Integration

Future only — architecture should enable, not implement.

## How batch schema supports future analytics

Analytics today: client aggregates `exam_attempts` by `student_id` for teacher's exams. Batches add a **membership filter**:

```
Batch Performance
    batch_id → student_batch_members.profile_id
            → learner_profiles.user_id
            → exam_attempts WHERE student_id IN (...)
            → aggregate scores, mastery, weak topics
```

## Batch Performance

Filter attempt rows to batch member `user_id` set. Compare aggregate scores across batches for the same exam.

## Batch Progress

Track assignment completion rate: `exam_assignments` for batch members vs `exam_attempts` submitted.

## Batch Intelligence

Extend teacher intelligence pipeline with optional `batchId` parameter — same classroom algorithms, narrower student population.

**Design constraint for V1:** Store membership in normalized junction table so analytics can JOIN or pre-resolve member lists without denormalized batch snapshots on attempt rows.

---

# Section 10 — RLS Strategy

Mirror `learner_profiles` patterns. Use existing helpers: `is_admin()`, `is_teacher_or_admin()`, `auth.uid()`.

## `student_batches`

| Operation | Who |
|-----------|-----|
| **SELECT** | Owner (`created_by = auth.uid()`) OR admin |
| **INSERT** | Teacher or admin; `created_by = auth.uid()` on insert |
| **UPDATE** | Owner OR admin |
| **DELETE** | Owner OR admin |

## `student_batch_members`

| Operation | Who |
|-----------|-----|
| **SELECT** | Member of visible batch (via batch ownership) OR admin |
| **INSERT** | Batch owner OR admin; **and** profile owner must match (`learner_profiles.created_by = auth.uid()`) OR admin |
| **DELETE** | Batch owner OR admin |

## RPC / edge function layer

Recommend security-definer RPCs for atomic operations (same style as `create_learner_profile`, `get_learner_details`):

| RPC (proposed) | Purpose |
|----------------|---------|
| `create_student_batch(name, description)` | Create batch |
| `list_teacher_batches()` | Batches for current teacher with member counts |
| `get_batch_details(batch_id)` | Batch metadata + members |
| `add_batch_members(batch_id, profile_ids[])` | Bulk add with ownership checks |
| `remove_batch_member(batch_id, profile_id)` | Remove one |
| `delete_student_batch(batch_id)` | Delete batch + members (cascade) |

Edge functions optional for MVP if RPCs cover all operations; align with existing `create-learner` / `list-students` split.

## Students

Students **do not** need batch visibility in MVP. They see assigned exams via existing `exam_assignments` RLS — unchanged.

---

# Section 11 — MVP Scope

## Included in V1

| Feature | Notes |
|---------|-------|
| Create batch | Name + optional description |
| Edit batch | Name + description only |
| Delete batch | Cascades memberships; does not delete profiles or assignments |
| Add student(s) to batch | From teacher's managed profiles only |
| Remove student from batch | Hard delete membership row |
| View batch list | With member counts |
| View batch detail | Member list with display name + email |
| RLS + ownership | Teacher owns batch; admin sees all |
| Multi-batch membership | Same student in multiple batches |

## Not included in V1

| Feature | Defer reason |
|---------|--------------|
| Batch analytics | Requires analytics pipeline batch filter — Section 9 |
| Assign exam by batch | Integrate after batch CRUD stable — Section 8 |
| Batch invitations / self-enroll | Auth complexity |
| Batch hierarchy (parent/child) | Over-engineering for MVP |
| Batch-level permissions / co-teachers | Ownership model expansion |
| Batch messaging / announcements | Separate product surface |
| Batch status (active/archived) | Can use delete for MVP |
| Soft-remove membership audit | V2 |
| Student-facing batch UI | Students don't need to "see" their batch |
| Batch assignment history on `exam_assignments` | V2 audit |

---

# Section 12 — Future Expansion

V1 architecture supports growth without redesign:

| Future feature | How V1 supports it |
|----------------|-------------------|
| **Assign exam to batch** | Resolve members → existing `exam_assignments` |
| **Assign notes to batch** | Target `batch_id` → resolve `profile_id` → note visibility rules (new, but membership reusable) |
| **Assign practice to batch** | Same resolver pattern |
| **Batch analytics** | JOIN membership → `user_id` → attempts |
| **Revision campaigns** | Campaign targets `batch_id`; scheduler resolves members |
| **Archived batches** | Add `archived_at` to `student_batches` — memberships preserved |
| **Co-teaching** | `batch_collaborators(batch_id, user_id, role)` |
| **Admin school batches** | Admin bypass on profile ownership already exists |

```
student_batches
    ↓
student_batch_members → learner_profiles
    ↓
    ├── exam_assignments (via user_id)     ← V1.5
    ├── note_assignments (future)          ← V2+
    ├── practice_assignments (future)      ← V2+
    └── analytics filters (future)         ← V2+
```

---

# Section 13 — Risk Analysis

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Profile coverage gap** | Legacy students without `learner_profiles` cannot join batches | MVP rule: only profiled students eligible; align with create-learner as sole creation path; optional backfill job |
| **Ownership confusion** | Teachers expect to batch students they don't own | Clear UI copy; enforce `created_by` on add; show only managed learners in picker |
| **Duplicate assignments** | Batch + individual assign double-selects same student | Dedupe `student_id` before `exam_assignments` insert |
| **Orphan memberships** | Profile deleted → membership should cascade | FK `profile_id` ON DELETE CASCADE |
| **Cross-teacher leakage** | RLS bug exposes another teacher's batch | Mirror tested `learner_profiles` policy patterns; add integration tests |
| **Scale: large batches** | 200+ members in assign-exam expand | MVP limit (e.g. 100 members per batch assign); paginate member list UI |
| **Name collision** | Two "KAS 2027" batches for same teacher | UNIQUE per `(created_by, normalized name)` |
| **Hidden Student Management UI** | Batch UI behind same secret toggle | Unhide Student Management when shipping batches, or ship batches visibility together |
| **Analytics fragmentation** | Attempts keyed on `student_name` snapshot | Batch analytics must key on `student_id`; existing direction already favors UUID |

---

# Section 14 — Final Recommendation

## Recommended MVP Design

```
learner_profiles (existing, canonical student)
        ↑ profile_id
student_batch_members (NEW junction, multi-batch)
        ↑ batch_id
student_batches (NEW, created_by ownership)

Exam assignment: unchanged exam_assignments table;
                 batch assign = member resolution + dedupe (V1.5)

Membership: multi-batch, non-exclusive
Ownership: batch.created_by + profile.created_by must align
API: Postgres RPCs + minimal client wrappers (match learner-profile.js style)
UI: tabs under Student Management (Students | Batches)
```

## Recommended Implementation Order

| Step | Work | Reasoning |
|------|------|-----------|
| **1** | `student_batches` + `student_batch_members` schema + RLS | Foundation; no UI without data model |
| **2** | RPCs: create, list, detail, add/remove members, delete batch | Server authority before client; test ownership rules |
| **3** | Client module `js/core/batch-management.js` (or similar) | Thin RPC wrappers — mirrors `learner-profile.js` |
| **4** | Batch UI (list, create modal, detail, add/remove) | Teacher-facing value; depends on RPCs |
| **5** | Learner detail modal: show batch memberships (read-only) | Low-cost integration with Student Management |
| **6** | Assign-exam modal: batch tab + member resolution | Highest workflow impact; defer until batch CRUD proven |
| **7** | `list-students` optional `batchId` filter | Convenience for assign modal and roster filtering |

Do **not** block batch CRUD on exam integration — teachers get organizational value immediately from steps 1–4.

---

# Appendix — Single-Batch vs Multi-Batch Membership

**If building from scratch on today's PrepOS profile architecture, choose multi-batch membership for MVP.**

### Single-batch (exclusive)

- Each student appears in at most one batch at a time.
- **Pros:** Simplest UI ("Student's batch: KAS 2027"); no dedupe across batches when assigning; easy card sorting.
- **Cons:** Conflicts with overlapping real cohorts; moving a student requires explicit transfer; the prompt's model (flat roster + multiple named groups) implies overlap; retrofitting to multi-batch later requires data migration and UI rewrites.

### Multi-batch (recommended)

- Each student may appear in many batches simultaneously.
- **Pros:** Matches teacher mental model (pilot group ∩ exam-year class); junction table is the natural model; flat roster stays authoritative; exclusive membership can be added later as an optional product rule without schema change; batch assign dedupe is a solved one-liner.
- **Cons:** Batch detail and student detail must show a list, not a single field; assign-exam must dedupe when combining batch + individual selections.

### Verdict for PrepOS MVP

**Multi-batch.** `learner_profiles` already owns the student relationship; batches are optional organizational tags. The incremental UI cost is small; the flexibility cost of choosing exclusive upfront is large. Implement `UNIQUE (batch_id, profile_id)` to prevent duplicate membership in the *same* batch, but do not restrict a profile to one batch globally.

---

*Proposal based on existing PrepOS profile architecture (`Profile_System_Status_Report.md`), `learner_profiles` migrations, Student Management modules, and `assign-exam` edge function. No implementation performed.*
