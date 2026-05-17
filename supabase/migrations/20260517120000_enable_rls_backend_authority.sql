-- Enable source-controlled RLS for PrepOS core tables.
-- This migration intentionally keeps destructive draft deletes out of the
-- browser path; those operations are handled by Edge Functions with service
-- role plus explicit authorization checks.

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.users
  where id = auth.uid()
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.is_teacher_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('teacher', 'admin'), false)
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'draft_exams',
    'exam_sessions',
    'exam_assignments',
    'exam_attempts',
    'questions',
    'question_topics',
    'question_metadata',
    'topics',
    'topic_patterns',
    'metadata_definitions',
    'lexicon_groups',
    'lexicon_entries',
    'lexicon_group_relations',
    'user_lexicon_word_stats'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end $$;

alter table if exists public.draft_exams
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

alter table if exists public.exam_sessions
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

alter table if exists public.exam_assignments
  add column if not exists assigned_by uuid references auth.users(id) default auth.uid();

alter table if exists public.questions
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

alter table if exists public.topics
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

alter table if exists public.lexicon_groups
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

alter table if exists public.lexicon_entries
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

alter table if exists public.metadata_definitions
  add column if not exists created_by uuid references auth.users(id) default auth.uid();

drop policy if exists "users_select_own_or_staff" on public.users;
create policy "users_select_own_or_staff"
on public.users
for select
to authenticated
using (id = auth.uid() or public.is_teacher_or_admin());

drop policy if exists "draft_exams_select_owned_or_question_sets" on public.draft_exams;
create policy "draft_exams_select_owned_or_question_sets"
on public.draft_exams
for select
to authenticated
using (
  created_by = auth.uid()
  or public.is_admin()
  or (public.is_teacher_or_admin() and status = 'question_set')
);

drop policy if exists "draft_exams_insert_owned_by_staff" on public.draft_exams;
create policy "draft_exams_insert_owned_by_staff"
on public.draft_exams
for insert
to authenticated
with check (
  public.is_teacher_or_admin()
  and coalesce(created_by, auth.uid()) = auth.uid()
);

drop policy if exists "draft_exams_update_owned_by_staff" on public.draft_exams;
create policy "draft_exams_update_owned_by_staff"
on public.draft_exams
for update
to authenticated
using (public.is_admin() or (public.is_teacher_or_admin() and created_by = auth.uid()))
with check (public.is_admin() or (public.is_teacher_or_admin() and created_by = auth.uid()));

drop policy if exists "exam_sessions_select_visible" on public.exam_sessions;
create policy "exam_sessions_select_visible"
on public.exam_sessions
for select
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.exam_assignments ea
    where ea.exam_id = exam_sessions.id
      and ea.student_id = auth.uid()
  )
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
  or exists (
    select 1
    from public.exam_sessions es
    where es.id = exam_assignments.exam_id
      and es.created_by = auth.uid()
  )
);

drop policy if exists "exam_attempts_select_own_or_exam_owner" on public.exam_attempts;
create policy "exam_attempts_select_own_or_exam_owner"
on public.exam_attempts
for select
to authenticated
using (
  public.is_admin()
  or student_id = auth.uid()
  or exists (
    select 1
    from public.exam_sessions es
    where es.id = exam_attempts.exam_id
      and es.created_by = auth.uid()
  )
);

drop policy if exists "exam_attempts_insert_assigned_student" on public.exam_attempts;
create policy "exam_attempts_insert_assigned_student"
on public.exam_attempts
for insert
to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1
    from public.exam_assignments ea
    where ea.exam_id = exam_attempts.exam_id
      and ea.student_id = auth.uid()
  )
);

drop policy if exists "questions_read_authenticated" on public.questions;
create policy "questions_read_authenticated"
on public.questions
for select
to authenticated
using (true);

drop policy if exists "questions_write_staff" on public.questions;
create policy "questions_write_staff"
on public.questions
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "question_topics_read_authenticated" on public.question_topics;
create policy "question_topics_read_authenticated"
on public.question_topics
for select
to authenticated
using (true);

drop policy if exists "question_topics_write_staff" on public.question_topics;
create policy "question_topics_write_staff"
on public.question_topics
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "question_metadata_read_authenticated" on public.question_metadata;
create policy "question_metadata_read_authenticated"
on public.question_metadata
for select
to authenticated
using (true);

drop policy if exists "question_metadata_write_staff" on public.question_metadata;
create policy "question_metadata_write_staff"
on public.question_metadata
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "topics_read_authenticated" on public.topics;
create policy "topics_read_authenticated"
on public.topics
for select
to authenticated
using (true);

drop policy if exists "topics_write_staff" on public.topics;
create policy "topics_write_staff"
on public.topics
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "topic_patterns_read_authenticated" on public.topic_patterns;
create policy "topic_patterns_read_authenticated"
on public.topic_patterns
for select
to authenticated
using (true);

drop policy if exists "topic_patterns_write_staff" on public.topic_patterns;
create policy "topic_patterns_write_staff"
on public.topic_patterns
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "metadata_definitions_read_authenticated" on public.metadata_definitions;
create policy "metadata_definitions_read_authenticated"
on public.metadata_definitions
for select
to authenticated
using (true);

drop policy if exists "metadata_definitions_write_staff" on public.metadata_definitions;
create policy "metadata_definitions_write_staff"
on public.metadata_definitions
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "lexicon_groups_read_authenticated" on public.lexicon_groups;
create policy "lexicon_groups_read_authenticated"
on public.lexicon_groups
for select
to authenticated
using (true);

drop policy if exists "lexicon_groups_write_staff" on public.lexicon_groups;
create policy "lexicon_groups_write_staff"
on public.lexicon_groups
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "lexicon_entries_read_authenticated" on public.lexicon_entries;
create policy "lexicon_entries_read_authenticated"
on public.lexicon_entries
for select
to authenticated
using (true);

drop policy if exists "lexicon_entries_write_staff" on public.lexicon_entries;
create policy "lexicon_entries_write_staff"
on public.lexicon_entries
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "lexicon_group_relations_read_authenticated" on public.lexicon_group_relations;
create policy "lexicon_group_relations_read_authenticated"
on public.lexicon_group_relations
for select
to authenticated
using (true);

drop policy if exists "lexicon_group_relations_write_staff" on public.lexicon_group_relations;
create policy "lexicon_group_relations_write_staff"
on public.lexicon_group_relations
for all
to authenticated
using (public.is_teacher_or_admin())
with check (public.is_teacher_or_admin());

drop policy if exists "user_lexicon_word_stats_select_own" on public.user_lexicon_word_stats;
create policy "user_lexicon_word_stats_select_own"
on public.user_lexicon_word_stats
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_lexicon_word_stats_insert_own" on public.user_lexicon_word_stats;
create policy "user_lexicon_word_stats_insert_own"
on public.user_lexicon_word_stats
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_lexicon_word_stats_update_own" on public.user_lexicon_word_stats;
create policy "user_lexicon_word_stats_update_own"
on public.user_lexicon_word_stats
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
