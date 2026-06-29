-- Phase 2: teacher ↔ linked shadow student (delegated student mode).
-- One teacher login can act as a provisioned student UUID when student_mode_active.

-- ---------------------------------------------------------------------------
-- 1) Link table
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_learner_links (
  teacher_user_id uuid primary key
    references public.users (id) on delete cascade,
  student_user_id uuid not null unique
    references public.users (id) on delete cascade,
  display_name text not null default 'My learning',
  student_mode_active boolean not null default false,
  is_active boolean not null default true,
  exclude_from_class_analytics boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_learner_links_display_name_not_empty
    check (char_length(trim(display_name)) > 0)
);

create index if not exists teacher_learner_links_student_idx
  on public.teacher_learner_links (student_user_id);

create or replace function public.set_teacher_learner_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_learner_links_set_updated_at on public.teacher_learner_links;

create trigger teacher_learner_links_set_updated_at
  before update on public.teacher_learner_links
  for each row
  execute function public.set_teacher_learner_links_updated_at();

alter table public.teacher_learner_links enable row level security;

drop policy if exists teacher_learner_links_select on public.teacher_learner_links;
create policy teacher_learner_links_select
  on public.teacher_learner_links
  for select
  to authenticated
  using (
    teacher_user_id = auth.uid()
    or public.is_admin()
  );

grant select on table public.teacher_learner_links to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Delegation helpers
-- ---------------------------------------------------------------------------
create or replace function public.linked_student_id(p_teacher_id uuid default auth.uid())
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select tll.student_user_id
  from public.teacher_learner_links tll
  join public.users u on u.id = tll.student_user_id
  where tll.teacher_user_id = p_teacher_id
    and tll.is_active = true
    and u.role = 'student'
  limit 1;
$$;

create or replace function public.teacher_in_student_mode()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.teacher_learner_links tll
      where tll.teacher_user_id = auth.uid()
        and tll.is_active = true
        and tll.student_mode_active = true
    ),
    false
  );
$$;

create or replace function public.effective_student_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.current_user_role() = 'student' then auth.uid()
    when public.teacher_in_student_mode() then public.linked_student_id(auth.uid())
    else null
  end;
$$;

create or replace function public.can_act_as_student()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.effective_student_id() is not null;
$$;

grant execute on function public.linked_student_id(uuid) to authenticated;
grant execute on function public.teacher_in_student_mode() to authenticated;
grant execute on function public.effective_student_id() to authenticated;
grant execute on function public.can_act_as_student() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Assignment helper (exam_sessions RLS)
-- ---------------------------------------------------------------------------
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
      and ea.student_id = public.effective_student_id()
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) RPC: read link context
-- ---------------------------------------------------------------------------
create or replace function public.get_teacher_learner_context()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
  v_link public.teacher_learner_links;
  v_profile public.learner_profiles;
begin
  v_role := public.current_user_role();

  if v_role not in ('teacher', 'admin') then
    return jsonb_build_object(
      'hasLink', false,
      'studentModeActive', false,
      'role', v_role
    );
  end if;

  select *
  into v_link
  from public.teacher_learner_links tll
  where tll.teacher_user_id = auth.uid()
    and tll.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'hasLink', false,
      'studentModeActive', false,
      'role', v_role
    );
  end if;

  select lp.*
  into v_profile
  from public.learner_profiles lp
  where lp.user_id = v_link.student_user_id
  limit 1;

  return jsonb_build_object(
    'hasLink', true,
    'teacherUserId', v_link.teacher_user_id,
    'studentUserId', v_link.student_user_id,
    'displayName', coalesce(v_profile.display_name, v_link.display_name),
    'studentModeActive', v_link.student_mode_active,
    'isActive', v_link.is_active,
    'excludeFromClassAnalytics', v_link.exclude_from_class_analytics,
    'role', v_role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC: toggle student mode (DB flag for RLS)
-- ---------------------------------------------------------------------------
create or replace function public.set_teacher_student_mode(p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_link public.teacher_learner_links;
begin
  v_role := public.current_user_role();

  if v_role not in ('teacher', 'admin') then
    raise exception 'Only teachers and admins can change student mode';
  end if;

  update public.teacher_learner_links
  set student_mode_active = coalesce(p_active, false)
  where teacher_user_id = auth.uid()
    and is_active = true
  returning * into v_link;

  if not found then
    raise exception 'No linked learner account. Provision one first.';
  end if;

  return jsonb_build_object(
    'hasLink', true,
    'studentUserId', v_link.student_user_id,
    'studentModeActive', v_link.student_mode_active
  );
end;
$$;

grant execute on function public.get_teacher_learner_context() to authenticated;
grant execute on function public.set_teacher_student_mode(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Student-surface RLS (delegated identity)
-- ---------------------------------------------------------------------------
drop policy if exists "exam_assignments_select_visible" on public.exam_assignments;
create policy "exam_assignments_select_visible"
  on public.exam_assignments
  for select
  to authenticated
  using (
    public.is_admin()
    or student_id = public.effective_student_id()
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
    or student_id = public.effective_student_id()
    or public.user_owns_exam_session(exam_id)
  );

drop policy if exists "exam_attempts_insert_assigned_student" on public.exam_attempts;
create policy "exam_attempts_insert_assigned_student"
  on public.exam_attempts
  for insert
  to authenticated
  with check (
    student_id = public.effective_student_id()
    and public.effective_student_id() is not null
    and exists (
      select 1
      from public.exam_assignments ea
      where ea.exam_id = exam_attempts.exam_id
        and ea.student_id = public.effective_student_id()
    )
  );

drop policy if exists practice_attempts_insert_own on public.practice_attempts;
create policy practice_attempts_insert_own
  on public.practice_attempts
  for insert
  to authenticated
  with check (
    student_id = public.effective_student_id()
    and public.effective_student_id() is not null
  );

drop policy if exists practice_attempts_select_own on public.practice_attempts;
create policy practice_attempts_select_own
  on public.practice_attempts
  for select
  to authenticated
  using (
    public.is_admin()
    or student_id = public.effective_student_id()
  );

drop policy if exists "questions_read_student_practice" on public.questions;
create policy "questions_read_student_practice"
  on public.questions
  for select
  to authenticated
  using (public.can_act_as_student());

drop policy if exists "question_topics_read_student_practice" on public.question_topics;
create policy "question_topics_read_student_practice"
  on public.question_topics
  for select
  to authenticated
  using (public.can_act_as_student());

drop policy if exists "topics_read_student_practice" on public.topics;
create policy "topics_read_student_practice"
  on public.topics
  for select
  to authenticated
  using (public.can_act_as_student());

drop policy if exists user_question_stats_select_own on public.user_question_stats;
create policy user_question_stats_select_own
  on public.user_question_stats
  for select
  to authenticated
  using (
    user_id = public.effective_student_id()
    or public.is_admin()
  );

drop policy if exists user_question_stats_insert_own on public.user_question_stats;
create policy user_question_stats_insert_own
  on public.user_question_stats
  for insert
  to authenticated
  with check (
    user_id = public.effective_student_id()
    and public.effective_student_id() is not null
  );

drop policy if exists user_question_stats_update_own on public.user_question_stats;
create policy user_question_stats_update_own
  on public.user_question_stats
  for update
  to authenticated
  using (
    user_id = public.effective_student_id()
    and public.effective_student_id() is not null
  )
  with check (
    user_id = public.effective_student_id()
    and public.effective_student_id() is not null
  );

-- Notes: teachers in student mode read published variants like students.
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
        or (
          nv.status = 'published'
          and (
            public.current_user_role() = 'student'
            or public.teacher_in_student_mode()
          )
        )
      )
  )
$$;

drop policy if exists "question_metadata_read_student_assistance" on public.question_metadata;

create policy "question_metadata_read_student_assistance"
  on public.question_metadata
  for select
  to authenticated
  using (
    public.can_act_as_student()
    and key = 'assistance_malayalam'
  );
