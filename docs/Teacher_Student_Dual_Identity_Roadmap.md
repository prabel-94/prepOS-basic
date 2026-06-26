# PrepOS Teacher ↔ Student Dual Identity — Phased Roadmap

**Status:** Planning  
**Owner:** Solo founder (admin + teacher + student dogfooding)  
**Last updated:** 2026-06-26

---

## Goals

1. **Teachers (free):** Preview how students see their content — without a second account.
2. **Teachers (premium):** One login, linked shadow student identity — full learning loop (assignments, attempts, practice, dashboard).
3. **Founder:** Dogfood both paths while teaching real students and preparing for your own exams.

## Principles

- **One codebase** — no separate admin student-mode fork.
- **Teacher-first validation** — admin provisions and debugs; real constraints tested on `role = teacher`.
- **Preview ≠ premium** — preview is read-only/sandboxed; linked student is persistent identity.
- **RLS is authoritative** — never trust client-supplied `student_id` without Postgres verification.
- **Ship vertically** — complete one thin slice end-to-end before widening scope.

## Architecture target (end state)

```
auth.uid()                    → logged-in teacher (JWT, unchanged)
effectiveStudentId            → linked shadow student UUID (premium, student mode only)
appMode                       → "teacher" | "student"
teacher_learner_links         → teacher_user_id ↔ student_user_id (1:1 MVP)
teacher_entitlements          → premium flag (Phase 3)
```

---

## Phase 0 — Founder unblock (Week 1)

**Objective:** Real exam prep and teaching continue while product work starts. Zero schema required.

### Recommended account layout (solo founder)

| Account | Role | Email example | Use for |
|---------|------|---------------|---------|
| **Main** | `admin` or `teacher` | `you@domain.com` | Teaching, authoring, dev |
| **Prep** | `student` (auto) | `you+prep@domain.com` | Your exam prep only |
| **Dev** (optional) | `admin` | same as main | Supabase SQL, role changes |

You need **two logins minimum**: one that can teach, one with `role = student` for canonical learning flows.

### Tasks

- [ ] **0.1** Create a dedicated **student auth account** for your own exam prep (e.g. `you+prep@domain.com`).
- [ ] **0.2** From your teacher account, assign exams to that student via normal `assign-exam` flow.
- [ ] **0.3** Use student account for: dashboard, canonical exams, bank practice, intelligence.
- [ ] **0.4** Use teacher account for: create/publish, roster, results, intelligence.
- [ ] **0.5** Use **exam inspect** (`exam.html?id={id}&mode=inspect`) for quick authoring checks.
- [ ] **0.6** (Optional) Switch daily driver from `admin` → `teacher` so you hit real teacher gates while building. Keep admin for migrations/support.

### Execution runbook

#### Step 0.1 — Create your prep student (Teacher Home)

1. Log in to PrepOS with your **teaching** account (`admin` or `teacher`).
2. Open **Teacher Home** (`index.html`).
3. **Unlock Student Management:** click the app nav kicker text **5 times within 2 seconds** (session-only; section starts hidden).
4. In **Create Learner**, fill in:
   - **Display name:** e.g. `Prab (prep)` — appears on attempts and roster.
   - **Email:** `you+prep@yourdomain.com` (or any unique email).
   - **Password:** strong password — store in a password manager.
5. Click **Create Learner**. This calls the `create-learner` edge function (auth user + `learner_profiles` + `role = student`).
6. Confirm the learner appears under **Your Learners**.

**If create fails:** check Supabase edge function logs for `create-learner`; ensure you are logged in as `teacher` or `admin`.

#### Step 0.2 — Assign exams to yourself (prep account)

1. Stay on teaching account.
2. Open **Published Exams** (`published-exams.html`).
3. For each exam you want to take as a student, click **Assign**.
4. Select your prep learner (`Prab (prep)`), then confirm.
5. Optional: create a batch **My prep** and add only this learner for bulk assign later.

**Note:** `assign-exam` requires `role = student` on the target user — your prep account qualifies; your admin/teacher UUID does not.

#### Step 0.3 — Daily prep workflow (student account)

1. Log **out** from teaching account (or use a separate browser profile).
2. Log in with **prep student** email/password → redirects to `student-dashboard.html`.
3. Use:
   - **Available Exams** → `exam.html?id=…` → submit for real scores.
   - **Practice** → bank mode persists `practice_attempts` and intelligence.
   - **Topic Notes** → published notes as students see them.
4. Bookmark: `student-dashboard.html`, `practice.html`.

#### Step 0.4 — Daily teaching workflow (teacher account)

1. Log in with teaching account → `index.html`.
2. Create/publish exams, manage roster, view **Results** and **Intelligence**.
3. Do **not** use the broken **Go to Student Dashboard** button for real prep — use prep account (fixed in Phase 1).

#### Step 0.5 — Authoring preview (no second login)

While logged in as teacher, open any exam you own:

```text
exam.html?id={EXAM_UUID}&mode=inspect
```

Or use **Inspect** on Published Exams. Walk questions without timer or DB submit.

#### Step 0.6 — Optional: teacher role for realistic dogfooding

If your main account is `admin`, you bypass many teacher constraints. Options:

**A. Keep admin for now** — fastest; accept that Phase 1–2 need a `teacher` test account later.

**B. Add a dedicated teacher login** — create auth user, set role in Supabase SQL:

```sql
-- After creating auth user (via dashboard or create-learner + manual role change)
update public.users set role = 'teacher' where id = '<auth-user-uuid>';
```

**C. Demote main account to teacher** (only if you can promote back via SQL/service role):

```sql
update public.users set role = 'teacher' where id = auth.uid();
-- Keep a second admin email bootstrapped in migrations for recovery
```

### Phase 0 verification checklist

Run through once and tick when done:

- [ ] Prep student exists in **Your Learners** on teacher home.
- [ ] At least one published exam is assigned to prep student.
- [ ] Prep login lands on student dashboard; assigned exam appears.
- [ ] Completed exam attempt shows under teacher **Results**.
- [ ] Bank practice session on prep account completes without errors.
- [ ] `mode=inspect` works on teacher account for same exam.

### Acceptance criteria

- You can take assigned exams and accumulate practice stats on the student account.
- You can teach and view class results on the teacher account.
- No PrepOS code changes required.

### Exit

Move to Phase 1 when the verification checklist above is complete.

---

## Phase 1 — Free teacher preview pack (Weeks 2–3)

**Status:** Implemented (2026-06-26)

**Objective:** Normal teachers can see how students experience **their own** content. No linked accounts, no billing, no RLS delegation.

### 1.1 Fix broken “Student Mode” entry point

| Item | Detail |
|------|--------|
| **Problem** | `goToStudent()` → `student-dashboard.html` → unauthorized for teachers |
| **Files** | `index.html`, `js/teacher-home.js`, new `teacher-student-preview.html` + boot script |
| **Tasks** | |
| - [ ] | Rename card copy: **“Preview student experience”** (not “Student Mode”) |
| - [ ] | Route to new preview hub instead of `student-dashboard.html` |
| - [ ] | Preview hub lists teacher-owned surfaces: exams, published notes, sample dashboard mock |

### 1.2 Exam preview (extend existing inspect)

| Item | Detail |
|------|--------|
| **Exists** | `exam.html?id={id}&mode=inspect` — no timer, no submit |
| **Files** | `js/exam.js`, `js/published-exams.js`, `js/draft.js` |
| **Tasks** | |
| - [ ] | Add visible **“Preview as student”** label / banner (clarify vs live exam) |
| - [ ] | (Optional) Allow selecting answers locally; show **mock results** without DB insert |
| - [ ] | Link from preview hub and published-exams UI consistently |
| - [ ] | Restrict preview to exams where `created_by = auth.uid()` (teachers) or admin |

### 1.3 Note preview (student-faithful reader)

| Item | Detail |
|------|--------|
| **Problem** | Teachers on `note.html` see drafts, governance, teacher anchor inspector |
| **Files** | `js/notes/note-reader.js`, `note.html`, preview hub |
| **Tasks** | |
| - [ ] | Support `?preview=student` (or dedicated `note-preview.html`) |
| - [ ] | Force **published-only** variant resolution |
| - [ ] | Use student anchor inspector (`studentMode: true`) and hide draft toolbar |
| - [ ] | Entry from preview hub: only notes teacher can access (owned / published) |

### 1.4 Dashboard preview (mock / read-only)

| Item | Detail |
|------|--------|
| **Files** | New `js/teacher/student-preview-hub.js`, renderer module |
| **Tasks** | |
| - [ ] | Show static or semi-live mock of: Available Exams cards, Practice link, Topic Notes section |
| - [ ] | Pull **your published exams** for card titles (read-only; no assignments) |
| - [ ] | Clear disclaimer: *“Preview only — progress is not saved”* |
| - [ ] | CTA placeholder for premium: *“Learn and track progress with your learner account”* |

### 1.5 Page access

| Item | Detail |
|------|--------|
| **Files** | `js/core/access.js`, preview boot scripts |
| **Tasks** | |
| - [ ] | Preview pages boot with `roles: ["teacher", "admin"]` only |
| - [ ] | Do **not** open real `student-dashboard.html` to teachers in this phase |

### Phase 1 acceptance criteria

- [ ] Teacher clicks preview from home → never lands on `unauthorized.html`.
- [ ] Teacher can preview **own** exam (inspect) and **published** note as student would read it.
- [ ] No new database tables.
- [ ] No writes to `exam_attempts`, `practice_attempts`, or `exam_assignments` from preview paths.

### Phase 1 exit

Teachers have honest preview. Founder still uses Phase 0 student account for real prep.

---

## Phase 2 — Linked student MVP (Weeks 4–6)

**Status:** Implemented (2026-06-26) — requires migration + `provision-linked-learner` edge deploy

**Objective:** Premium core — one teacher login + shadow `student` user. **Dogfood on your own teacher account first.**

### 2.1 Database schema

| Item | Detail |
|------|--------|
| **Migration** | `supabase/migrations/YYYYMMDD_teacher_learner_links.sql` |
| **Tasks** | |
| - [ ] | Create `teacher_learner_links` (`teacher_user_id`, `student_user_id` UNIQUE, `is_active`, timestamps) |
| - [ ] | FK both IDs → `public.users`; enforce `student` role on `student_user_id` |
| - [ ] | Create `teacher_student_mode` (or column on links): `active_student_mode boolean` per teacher session — *see 2.3* |
| - [ ] | RLS: only teacher owner + admin can read/update their link row |

### 2.2 Postgres helpers + RLS delegation

| Item | Detail |
|------|--------|
| **Tasks** | |
| - [ ] | `linked_student_id(p_teacher_id uuid)` — returns `student_user_id` if link active |
| - [ ] | `effective_student_id()` — `auth.uid()` if `role=student`; else linked id if teacher in student mode |
| - [ ] | `teacher_in_student_mode()` — reads mode flag (DB or session table) |
| - [ ] | Update student policies (minimum set): |
| | `exam_assignments` SELECT |
| | `exam_attempts` INSERT + SELECT |
| | `practice_attempts` INSERT + SELECT |
| | `questions` / `question_topics` / `topics` student practice read |
| | `user_question_stats` |
| - [ ] | **Rule:** delegated access only when `student_id = linked_student_id(auth.uid())` — never arbitrary UUID |

### 2.3 Student mode state

| Item | Detail |
|------|--------|
| **Options** | (A) DB flag on link row — RLS-friendly; (B) JWT custom claim — harder |
| **Recommendation** | **DB flag** `teacher_learner_links.student_mode_active` toggled via RPC |
| **Tasks** | |
| - [ ] | RPC `set_teacher_student_mode(active boolean)` — teacher only, own link |
| - [ ] | RPC `get_teacher_learner_context()` — returns link, student profile, mode |
| - [ ] | Client: call RPC on mode toggle; refresh runtime |

### 2.4 Provision shadow student (edge function)

| Item | Detail |
|------|--------|
| **Function** | `supabase/functions/provision-linked-learner/index.ts` |
| **Tasks** | |
| - [ ] | Auth: teacher (own link) or admin (any teacher) |
| - [ ] | Create `auth.users` with internal email (`linked+{teacher_uuid}@…`) — no shared password |
| - [ ] | Trigger creates `public.users` with `role = student` |
| - [ ] | Insert `learner_profiles` (`created_by = teacher`, display name from input) |
| - [ ] | Insert `teacher_learner_links` |
| - [ ] | Idempotent: return existing link if already provisioned |
| - [ ] | **Dogfood:** provision link for your teacher account |

### 2.5 Client runtime

| Item | Detail |
|------|--------|
| **Files** | `js/core/runtime.js`, `js/core/access.js`, new `js/core/learner-context.js` |
| **Tasks** | |
| - [ ] | Extend runtime: `authUserId`, `effectiveStudentId`, `appMode`, `hasLinkedLearner` |
| - [ ] | `resolveActingStudentId()` used by all student data loaders |
| - [ ] | Mode toggle UI on teacher home (Teacher ⟷ My learning) |
| - [ ] | Student-mode pages boot when `hasLinkedLearner && appMode === 'student'` |

### 2.6 Wire student surfaces (premium path)

| File / area | Change |
|-------------|--------|
| `js/student-dashboard.js` | Allow teacher + linked student mode; use `effectiveStudentId` |
| `js/student/student-intelligence.js` | Query by `effectiveStudentId` |
| `js/exam.js` | Submit + assignment check use `effectiveStudentId` in student mode |
| `js/practice.js` | Persistence uses `effectiveStudentId` when teacher in student mode |
| `js/analytics/analytics-submission.js` | Practice/exam submit IDs |
| `js/practice/topic-progress-service.js` | Progress queries |

### 2.7 Teacher workflows

| Item | Detail |
|------|--------|
| **Tasks** | |
| - [ ] | Linked student appears in **your roster** (`learner_profiles.created_by = you`) |
| - [ ] | Self-assign exams to linked student via existing assign-exam modal |
| - [ ] | (Recommended) Exclude or tag linked-student attempts in **teacher intelligence** aggregates |
| - [ ] | `list-students` unchanged — linked student is a normal `role=student` row |

### 2.8 Feature flag

| Item | Detail |
|------|--------|
| **Tasks** | |
| - [ ] | `window.PREPOS_LINKED_LEARNER_ENABLED` or DB allowlist during MVP |
| - [ ] | Only provisioned teachers see mode toggle |
| - [ ] | Preview hub CTA activates when link exists |

### Phase 2 acceptance criteria

- [ ] You sign in as **teacher**, toggle **My learning**, see student dashboard with real data.
- [ ] Assign exam to linked student → take exam → submit → attempt visible in results.
- [ ] Bank practice session persists to `practice_attempts` under linked student id.
- [ ] Another teacher **without** link cannot access your linked student (RLS verified).
- [ ] Client cannot pass a random `student_id` to bypass link check.
- [ ] Phase 0 alias account can be retired or kept as regression test user.

### Phase 2 exit

Linked student works end-to-end for founder. Ready to gate behind premium.

---

## Phase 3 — Premium packaging (Weeks 7–8+)

**Objective:** Monetize linked learner; keep preview free for all teachers.

### 3.1 Entitlements

| Item | Detail |
|------|--------|
| **Tasks** | |
| - [ ] | Table `teacher_entitlements` (`teacher_user_id`, `feature`, `active_until`, source) |
| - [ ] | `provision-linked-learner` checks entitlement (admin bypass for support) |
| - [ ] | Deactivate: disable link + student mode; retain historical data |

### 3.2 Billing (when ready)

| Item | Detail |
|------|--------|
| **Tasks** | |
| - [ ] | Stripe (or manual) webhook → grant/revoke entitlement |
| - [ ] | Upgrade UI from preview hub + teacher home |
| - [ ] | Onboarding copy: what linked learner includes |

### 3.3 Polish

| Item | Detail |
|------|--------|
| **Tasks** | |
| - [ ] | Onboarding wizard: display name for linked learner |
| - [ ] | Student mode indicator in app nav (persistent banner) |
| - [ ] | Docs for teachers: preview vs premium |
| - [ ] | (Optional) Allow linked student to “claim” account with real email later |

### Phase 3 acceptance criteria

- [ ] New paying teacher: pay → provision → student mode works without admin intervention.
- [ ] Free teacher: preview only; clear upgrade path.
- [ ] Founder account: complimentary entitlement (or admin provision).

---

## Phase 4 — Hardening & scale (ongoing)

**Objective:** Production quality after MVP works for you.

- [ ] E2E tests: preview paths (no writes); linked student assign → attempt → practice
- [ ] Audit logging: mode toggles, provision events
- [ ] Rate limits on provision edge function
- [ ] Analytics exclusion policy documented for self-attempts
- [ ] Support runbook: reset link, merge accounts, deactivate premium
- [ ] Consider multi-linked-student tier (post-MVP; 1:1 is enough initially)

---

## File touch list (reference)

| Phase | Primary files |
|-------|----------------|
| 1 | `index.html`, `js/teacher-home.js`, new preview hub, `js/exam.js`, `js/notes/note-reader.js` |
| 2 | new migration, `provision-linked-learner`, `js/core/runtime.js`, `js/core/learner-context.js`, student + exam + practice loaders |
| 3 | entitlements migration, billing webhook, upgrade UI |

---

## Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Admin-first rollout? | **No** | Admin already bypasses student gates; poor teacher proxy |
| Multi-role on `users.role`? | **No** | Linked shadow student fits existing `student_id` FKs |
| Preview vs premium | **Split** | Different engineering cost and product value |
| Student mode state | **DB flag + RPC** | RLS can enforce; sessionStorage alone is insufficient |
| Linked student login | **Shadow account, no password** | Single teacher login UX |
| MVP link cardinality | **1 teacher : 1 student** | Simplest; enough for founder + premium v1 |

---

## Success metrics

| Metric | Phase |
|--------|-------|
| Teachers reach preview without 403 | 1 |
| Preview generates zero `exam_attempts` rows | 1 |
| Founder completes full learn loop on linked student | 2 |
| Zero cross-teacher link leakage in RLS tests | 2 |
| First external paying teacher provisioned without manual SQL | 3 |

---

## Suggested order of execution (checklist)

```
□ Phase 0  — student alias account live for your prep
□ Phase 1.1 — fix preview entry point
□ Phase 1.2 — exam preview polish
□ Phase 1.3 — note student preview
□ Phase 1.4 — dashboard preview mock
□ Phase 1   — acceptance sign-off
□ Phase 2.1 — migration (links table)
□ Phase 2.2 — RLS helpers
□ Phase 2.3 — mode RPC
□ Phase 2.4 — provision edge function
□ Phase 2.5 — client runtime + toggle
□ Phase 2.6 — wire student surfaces
□ Phase 2.7 — self-assign + intelligence tagging
□ Phase 2   — founder dogfood sign-off
□ Phase 3   — entitlements + billing when needed
□ Phase 4   — tests + hardening
```

---

## Related docs

- `docs/Student_Profile_Layer_Audit.md` — identity and role model
- `Profile_System_Status_Report.md` — `learner_profiles` layer
- `Batch_System_Architecture_Proposal.md` — roster / batch semantics
