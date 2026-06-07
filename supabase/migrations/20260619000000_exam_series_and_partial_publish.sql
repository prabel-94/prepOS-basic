-- Exam series metadata for split / partial publish and sequential unlocking.

alter table public.exam_sessions
  add column if not exists source_draft_id uuid references public.draft_exams(id) on delete set null,
  add column if not exists series_id uuid,
  add column if not exists part_index integer,
  add column if not exists part_count integer,
  add column if not exists require_sequential_parts boolean not null default false;

create index if not exists exam_sessions_source_draft_idx
  on public.exam_sessions(source_draft_id);

create index if not exists exam_sessions_series_part_idx
  on public.exam_sessions(series_id, part_index);

alter table public.draft_exams
  add column if not exists publish_series_id uuid,
  add column if not exists published_question_ids jsonb not null default '[]'::jsonb;
