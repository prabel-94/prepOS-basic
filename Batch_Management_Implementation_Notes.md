# Batch Management — Implementation Notes

**Date:** 31 May 2026  
**Migration:** `20260617000000_student_batches_foundation.sql`

---

## Database Changes

### Tables

| Table | Purpose |
|-------|---------|
| `public.student_batches` | Teacher-owned batch containers (`name`, `description`, `created_by`) |
| `public.student_batch_members` | Junction: batch ↔ `learner_profiles.id` |

### Indexes

- `student_batches_created_by_idx` — teacher batch list
- `student_batches_created_by_name_idx` — UNIQUE per teacher on `lower(trim(name))`
- `student_batch_members_batch_id_idx` — members by batch
- `student_batch_members_profile_id_idx` — batches by profile
- `UNIQUE (batch_id, profile_id)` — no duplicate membership in same batch

### Constraints

- `student_batches_name_not_empty` — trimmed name required
- FK cascades: delete batch → delete memberships; delete profile → delete memberships
- Delete batch does **not** delete `learner_profiles` or auth accounts

### RLS Policies

**`student_batches`**

| Policy | Operation | Rule |
|--------|-----------|------|
| `student_batches_select` | SELECT | Admin OR (`is_teacher_or_admin()` AND `created_by = auth.uid()`) |
| `student_batches_insert` | INSERT | Teacher/admin AND `created_by = auth.uid()` |
| `student_batches_update` | UPDATE | Admin OR owner |
| `student_batches_delete` | DELETE | Admin OR owner |

**`student_batch_members`**

| Policy | Operation | Rule |
|--------|-----------|------|
| `student_batch_members_select` | SELECT | Admin OR batch owner |
| `student_batch_members_insert` | INSERT | Admin OR batch owner |
| `student_batch_members_delete` | DELETE | Admin OR batch owner |

Direct table UPDATE on members is not exposed — membership is add/remove only.

### Helper Functions

| Function | Purpose |
|----------|---------|
| `can_manage_batch(uuid)` | Returns true if caller is admin or batch owner |
| `can_manage_learner_profile(uuid)` | Returns true if caller is admin or profile owner |

Reuses existing: `is_admin()`, `is_teacher_or_admin()`, `current_user_role()`, `auth.uid()`.

---

## RPCs Created

| RPC | Purpose |
|-----|---------|
| `create_batch(p_name, p_description)` | Create teacher-owned batch |
| `list_batches()` | JSON array with member counts |
| `get_batch_details(p_batch_id)` | Batch metadata + members (display name, email) |
| `update_batch(p_batch_id, p_name, p_description)` | Edit name/description |
| `delete_batch(p_batch_id)` | Delete batch (cascades memberships) |
| `add_batch_members(p_batch_id, p_profile_ids[])` | Bulk add with ownership validation; skips duplicates |
| `remove_batch_member(p_batch_id, p_profile_id)` | Remove membership only |
| `list_managed_learner_profiles()` | Managed profiles for Add Students picker |

### RPC Modified

| RPC | Change |
|-----|--------|
| `get_learner_details(target_user_id)` | Adds read-only `batchMemberships` array |

All RPCs are `SECURITY DEFINER` with `search_path = public`, matching `learner_profiles` style.

---

## Files Added

| File | Purpose |
|------|---------|
| `supabase/migrations/20260617000000_student_batches_foundation.sql` | Schema, RLS, RPCs |
| `js/core/batch-management.js` | Client RPC wrappers |
| `js/teacher/batch-management.js` | Batch UI (list, modals, membership) |
| `Batch_Management_Implementation_Notes.md` | This document |

---

## Files Modified

| File | Change |
|------|--------|
| `index.html` | Students/Batches tabs, batch panel, batch modals |
| `js/teacher/student-management.js` | Tab wiring, batch init, refresh hooks |
| `js/teacher/learner-details.js` | Read-only batch membership in learner modal |
| `css/style.css` | Tab, batch list, add-members styles |

---

## Ownership Verification

### Teacher isolation

1. **`student_batches.created_by`** — teachers only see/edit/delete own batches (RLS + RPC checks).
2. **`add_batch_members`** — calls `can_manage_learner_profile()`; raises if profile `created_by ≠ auth.uid()` (unless admin).
3. **`get_batch_details` / `list_batches`** — filtered by batch ownership.
4. **`get_learner_details` batchMemberships** — only batches owned by caller (or all for admin).

### Admin access

- `is_admin()` bypass on all batch and profile ownership checks.
- Admins can manage any batch and add any managed profile they can see.

### Membership validation

- `UNIQUE (batch_id, profile_id)` prevents duplicate membership in same batch.
- `add_batch_members` uses `ON CONFLICT DO NOTHING` + row count for idempotent adds.
- Multi-batch allowed: same profile in "Beta Testers" and "KAS 2027".
- Remove member: deletes junction row only — no impact on profile, assignments, analytics.

### Manual verification checklist

After applying migration to Supabase:

1. Teacher A creates batch "Beta Testers" — success.
2. Teacher A adds own learners — success.
3. Teacher A attempts add of Teacher B's profile — RPC error "Cannot add a learner you do not manage".
4. Teacher B cannot view Teacher A's batch — RPC error "Batch not found or access denied".
5. Admin can view/manage Teacher A's batch.
6. Delete batch — memberships gone; profiles and `exam_assignments` unchanged.
7. Learner detail modal shows "Member Of" list read-only.

---

## First Batch: Beta Testers

After migration is applied:

1. Unlock Student Management (existing 5-click nav kicker toggle — unchanged).
2. Open **Batches** tab → **Create Batch**.
3. Name: `Beta Testers`
4. **Add Students** → select all current tester profiles.
5. Confirm learner detail modals show "Member Of • Beta Testers".

No additional schema changes required.

---

## Screenshots

Static UI previews (refined hierarchy) are in:

- `docs/batch-ui-preview.html` — open via local server to capture live screenshots
- Apply migration `20260617000001_batch_details_creator_display.sql` for Created By resolution in production

### Refined layout reference

**Batch list (with description):**
```
Beta Testers
12 Members
Students actively testing new PrepOS features.
```

**Batch list (no description):**
```
KAS 2027
4 Members
```

**Batch detail:**
```
Beta Testers
Students actively testing new PrepOS features.
12 Members
Created By → Prabe
Created → 31 May 2026, 10:42 AM
```

Capture after deploy:

| Screen | Location |
|--------|----------|
| Batch List | Student Management → Batches tab |
| Batch Detail | View on a batch row |
| Batch without description | KAS 2027 or any batch with empty description |
| Mobile | Same URLs at ≤390px viewport |

---

## Out of Scope (Not Implemented)

- Batch exam assignment
- Batch analytics
- Batch notes/practice/messaging
- Student-facing batch views
- Batch archive/status
- Membership management from learner detail modal

---

## Apply Migration

```bash
supabase db push
```

Or apply `20260617000000_student_batches_foundation.sql` via Supabase SQL editor / MCP `apply_migration`.
