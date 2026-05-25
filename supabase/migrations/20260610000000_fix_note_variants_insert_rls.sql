-- Fix 42501 on note_variants INSERT: reliable staff policies + table grants.
-- Uses direct public.users.role check (works when helper chain fails at JWT boundary).

grant select, insert, update, delete on table public.note_variants to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

-- ---------------------------------------------------------------------------
-- note_variants INSERT — staff with valid canonical note_id
-- ---------------------------------------------------------------------------

drop policy if exists "note_variants_insert_via_note" on public.note_variants;
drop policy if exists "note_variants_insert_staff" on public.note_variants;

create policy "note_variants_insert_staff"
on public.note_variants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  )
  and exists (
    select 1
    from public.notes n
    where n.id = note_id
  )
);

-- ---------------------------------------------------------------------------
-- note_variants SELECT — staff read all variants; students via can_read_variant
-- ---------------------------------------------------------------------------

drop policy if exists "note_variants_select_staff" on public.note_variants;

create policy "note_variants_select_staff"
on public.note_variants
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

-- Keep note_variants_select_visible (can_read_variant) for student published access.

-- ---------------------------------------------------------------------------
-- Re-assert helper functions (idempotent with 20260609000000)
-- ---------------------------------------------------------------------------

create or replace function public.can_write_canonical_note(p_note_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.notes n
    where n.id = p_note_id
      and (
        public.is_admin()
        or public.is_teacher_or_admin()
      )
  )
$$;

grant execute on function public.can_write_canonical_note(uuid) to authenticated;
grant execute on function public.can_read_canonical_note(uuid) to authenticated;
grant execute on function public.can_read_variant(uuid) to authenticated;
grant execute on function public.can_write_variant(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher_or_admin() to authenticated;
grant execute on function public.current_user_role() to authenticated;
