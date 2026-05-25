-- Fix 403 on note_variants insert: staff can manage variants on any canonical note.
-- Prior helpers required notes.created_by = auth.uid(), which fails for migrated
-- notes (null created_by) and multi-teacher topic workflows.

create or replace function public.can_read_canonical_note(p_note_id uuid)
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
        or (
          public.current_user_role() = 'student'
          and exists (
            select 1
            from public.note_variants nv
            where nv.note_id = n.id
              and nv.status = 'published'
          )
        )
      )
  )
$$;

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

create or replace function public.can_read_variant(p_variant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.note_variants nv
    join public.notes n on n.id = nv.note_id
    where nv.id = p_variant_id
      and (
        public.is_admin()
        or public.is_teacher_or_admin()
        or (public.current_user_role() = 'student' and nv.status = 'published')
      )
  )
$$;

create or replace function public.can_write_variant(p_variant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.note_variants nv
    join public.notes n on n.id = nv.note_id
    where nv.id = p_variant_id
      and (
        public.is_admin()
        or public.is_teacher_or_admin()
      )
  )
$$;
