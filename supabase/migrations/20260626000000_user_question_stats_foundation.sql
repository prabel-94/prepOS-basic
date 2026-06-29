-- Per-question bank practice stats for fast progress loads and last-attempt tracking.

create table if not exists public.user_question_stats (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  question_id uuid not null
    references public.questions(id)
    on delete cascade,
  seen_count integer not null default 0,
  correct_count integer not null default 0,
  last_correct boolean,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists user_question_stats_user_idx
  on public.user_question_stats(user_id);

create index if not exists user_question_stats_question_idx
  on public.user_question_stats(question_id);

alter table public.user_question_stats
  enable row level security;

drop policy if exists user_question_stats_select_own on public.user_question_stats;
create policy user_question_stats_select_own
  on public.user_question_stats
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_question_stats_insert_own on public.user_question_stats;
create policy user_question_stats_insert_own
  on public.user_question_stats
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_question_stats_update_own on public.user_question_stats;
create policy user_question_stats_update_own
  on public.user_question_stats
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on table public.user_question_stats to authenticated;
