-- Bank practice sessions feed student knowledge intelligence.
-- Canonical exam learning remains in exam_attempts; practice bank remediation lives here.

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references auth.users(id)
    on delete cascade,
  attempt_id uuid not null default gen_random_uuid(),
  device_id text,
  topic_id uuid
    references public.topics(id)
    on delete set null,
  topic_name text,
  answers jsonb not null default '[]'::jsonb,
  score numeric default 0,
  question_count integer default 0,
  time_taken integer,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists practice_attempts_student_idx
  on public.practice_attempts(student_id);

create index if not exists practice_attempts_submitted_idx
  on public.practice_attempts(submitted_at desc);

alter table public.practice_attempts
  enable row level security;

drop policy if exists practice_attempts_insert_own on public.practice_attempts;
create policy practice_attempts_insert_own
  on public.practice_attempts
  for insert
  to authenticated
  with check (student_id = auth.uid());

drop policy if exists practice_attempts_select_own on public.practice_attempts;
create policy practice_attempts_select_own
  on public.practice_attempts
  for select
  to authenticated
  using (
    public.is_admin()
    or student_id = auth.uid()
  );

grant insert, select on table public.practice_attempts to authenticated;
