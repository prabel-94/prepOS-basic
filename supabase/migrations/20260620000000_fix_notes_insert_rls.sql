-- Fix 403 on notes INSERT (create canonical note on first import).
-- Align with note_variants_insert_staff: direct public.users.role check.
-- Prior notes_insert_staff_owned used is_teacher_or_admin() + created_by ownership,
-- which can fail at the PostgREST JWT boundary on INSERT ... RETURNING.

drop policy if exists "notes_insert_staff_owned" on public.notes;

create policy "notes_insert_staff"
on public.notes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  )
);

-- Staff can read all canonical notes (matches note_variants_select_staff).
-- Ensures INSERT ... RETURNING + nested topics() embed succeed for teachers.
drop policy if exists "notes_select_staff" on public.notes;

create policy "notes_select_staff"
on public.notes
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  )
);
