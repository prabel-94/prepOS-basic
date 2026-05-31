-- Batch-aware exam assignment audit trail + per-student source tracking.

-- ---------------------------------------------------------------------------
-- 1) Track which students were assigned via a batch vs individually
-- ---------------------------------------------------------------------------
alter table public.exam_assignments
  add column if not exists source_batch_id uuid references public.student_batches (id) on delete set null;

create index if not exists exam_assignments_source_batch_id_idx
  on public.exam_assignments (source_batch_id);

-- ---------------------------------------------------------------------------
-- 2) Batch-level assignment records (teacher-visible audit)
-- ---------------------------------------------------------------------------
create table if not exists public.exam_batch_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam_sessions (id) on delete cascade,
  batch_id uuid not null references public.student_batches (id) on delete cascade,
  assigned_by uuid not null references public.users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  constraint exam_batch_assignments_exam_batch_unique
    unique (exam_id, batch_id)
);

create index if not exists exam_batch_assignments_exam_id_idx
  on public.exam_batch_assignments (exam_id);

create index if not exists exam_batch_assignments_batch_id_idx
  on public.exam_batch_assignments (batch_id);

-- ---------------------------------------------------------------------------
-- 3) RLS — exam_batch_assignments
-- ---------------------------------------------------------------------------
alter table public.exam_batch_assignments enable row level security;

drop policy if exists exam_batch_assignments_select on public.exam_batch_assignments;
create policy exam_batch_assignments_select
  on public.exam_batch_assignments
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.exam_sessions es
      where es.id = exam_batch_assignments.exam_id
        and es.created_by = auth.uid()
    )
  );

drop policy if exists exam_batch_assignments_insert on public.exam_batch_assignments;
create policy exam_batch_assignments_insert
  on public.exam_batch_assignments
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      assigned_by = auth.uid()
      and exists (
        select 1
        from public.exam_sessions es
        where es.id = exam_batch_assignments.exam_id
          and es.created_by = auth.uid()
      )
      and exists (
        select 1
        from public.student_batches sb
        where sb.id = exam_batch_assignments.batch_id
          and sb.created_by = auth.uid()
      )
    )
  );

grant select on table public.exam_batch_assignments to authenticated;
