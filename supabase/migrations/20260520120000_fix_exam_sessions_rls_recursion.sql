-- Break exam_sessions <-> exam_assignments RLS recursion (42P17).
-- exam_sessions_select_visible referenced exam_assignments, whose policy
-- referenced exam_sessions again. Use SECURITY DEFINER helpers instead.

create or replace function public.user_owns_exam_session(p_exam_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.exam_sessions es
    where es.id = p_exam_id
      and es.created_by = auth.uid()
  );
$$;

create or replace function public.user_assigned_to_exam(p_exam_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.exam_assignments ea
    where ea.exam_id = p_exam_id
      and ea.student_id = auth.uid()
  );
$$;

drop policy if exists "exam_sessions_select_visible" on public.exam_sessions;
create policy "exam_sessions_select_visible"
on public.exam_sessions
for select
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or public.user_assigned_to_exam(id)
);

drop policy if exists "exam_assignments_select_visible" on public.exam_assignments;
create policy "exam_assignments_select_visible"
on public.exam_assignments
for select
to authenticated
using (
  public.is_admin()
  or student_id = auth.uid()
  or assigned_by = auth.uid()
  or public.user_owns_exam_session(exam_id)
);

drop policy if exists "exam_attempts_select_own_or_exam_owner" on public.exam_attempts;
create policy "exam_attempts_select_own_or_exam_owner"
on public.exam_attempts
for select
to authenticated
using (
  public.is_admin()
  or student_id = auth.uid()
  or public.user_owns_exam_session(exam_id)
);
