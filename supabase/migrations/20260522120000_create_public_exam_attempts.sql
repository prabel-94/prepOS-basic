-- Public/open exam attempts (guest practice, shareable links).
-- Canonical learning intelligence remains in exam_attempts only.
-- Published exams live in exam_sessions (PrepOS "published exam" surface).

create table if not exists public.public_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null
    references public.exam_sessions(id)
    on delete cascade,
  attempt_id uuid not null default gen_random_uuid(),
  guest_name text,
  device_id text,
  answers jsonb not null default '[]'::jsonb,
  score numeric default 0,
  question_count integer default 0,
  time_taken integer,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists public_exam_attempts_exam_idx
  on public.public_exam_attempts(exam_id);

create index if not exists public_exam_attempts_submitted_idx
  on public.public_exam_attempts(submitted_at desc);

alter table public.public_exam_attempts
  enable row level security;

drop policy if exists public_exam_attempts_insert on public.public_exam_attempts;
create policy public_exam_attempts_insert
  on public.public_exam_attempts
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists public_exam_attempts_select on public.public_exam_attempts;
create policy public_exam_attempts_select
  on public.public_exam_attempts
  for select
  to authenticated
  using (
    public.is_admin()
    or public.user_owns_exam_session(exam_id)
  );

grant insert on table public.public_exam_attempts to anon, authenticated;
grant select on table public.public_exam_attempts to authenticated;
