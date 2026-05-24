-- PrepOS Notes — Canonical Knowledge Infrastructure (Phase 1)
-- Semantic markdown → canonical objects → structured storage → representation renderer

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  title text not null,
  language text not null default 'english',
  map_version text,
  canonical_version text,
  status text not null default 'draft',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_status_check check (status in ('draft', 'published'))
);

create table if not exists public.note_sources (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  source_type text not null,
  raw_markdown text not null,
  raw_html text,
  immutable boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.note_blocks (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  representation_type text not null,
  block_type text not null,
  heading text,
  content text,
  hierarchy_level integer,
  sequence_order integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.note_entities (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  entity_name text not null,
  entity_type text not null,
  aliases text[] default '{}',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.note_relationships (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  source_entity text not null,
  relationship_type text not null,
  target_entity text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.note_topic_links (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  linked_topic_id uuid references public.topics(id),
  linked_topic_name text not null,
  linked_from_block_id uuid references public.note_blocks(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists notes_topic_idx on public.notes(topic_id);
create index if not exists notes_created_by_idx on public.notes(created_by);
create index if not exists notes_status_idx on public.notes(status);
create index if not exists note_blocks_note_idx on public.note_blocks(note_id);
create index if not exists note_entities_note_idx on public.note_entities(note_id);
create index if not exists note_relationships_note_idx on public.note_relationships(note_id);
create index if not exists note_topic_links_note_idx on public.note_topic_links(note_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.set_notes_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.notes enable row level security;
alter table public.note_sources enable row level security;
alter table public.note_blocks enable row level security;
alter table public.note_entities enable row level security;
alter table public.note_relationships enable row level security;
alter table public.note_topic_links enable row level security;

-- Helper: can the current user read this note row?
create or replace function public.can_read_note(p_note_id uuid)
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
        or (
          public.is_teacher_or_admin()
          and n.created_by = auth.uid()
        )
        or (
          public.current_user_role() = 'student'
          and n.status = 'published'
        )
      )
  )
$$;

-- Helper: can the current user write this note row (teachers own, admins all)?
create or replace function public.can_write_note(p_note_id uuid)
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
        or (
          public.is_teacher_or_admin()
          and n.created_by = auth.uid()
        )
      )
  )
$$;

-- notes
drop policy if exists "notes_select_visible" on public.notes;
create policy "notes_select_visible"
on public.notes
for select
to authenticated
using (
  public.is_admin()
  or (public.is_teacher_or_admin() and created_by = auth.uid())
  or (public.current_user_role() = 'student' and status = 'published')
);

drop policy if exists "notes_insert_staff_owned" on public.notes;
create policy "notes_insert_staff_owned"
on public.notes
for insert
to authenticated
with check (
  public.is_teacher_or_admin()
  and coalesce(created_by, auth.uid()) = auth.uid()
);

drop policy if exists "notes_update_owned_staff" on public.notes;
create policy "notes_update_owned_staff"
on public.notes
for update
to authenticated
using (public.is_admin() or (public.is_teacher_or_admin() and created_by = auth.uid()))
with check (public.is_admin() or (public.is_teacher_or_admin() and created_by = auth.uid()));

drop policy if exists "notes_delete_owned_staff" on public.notes;
create policy "notes_delete_owned_staff"
on public.notes
for delete
to authenticated
using (public.is_admin() or (public.is_teacher_or_admin() and created_by = auth.uid()));

-- note_sources (immutable: insert + select only)
drop policy if exists "note_sources_select_via_note" on public.note_sources;
create policy "note_sources_select_via_note"
on public.note_sources
for select
to authenticated
using (public.can_read_note(note_id));

drop policy if exists "note_sources_insert_via_note" on public.note_sources;
create policy "note_sources_insert_via_note"
on public.note_sources
for insert
to authenticated
with check (public.can_write_note(note_id));

-- note_blocks
drop policy if exists "note_blocks_select_via_note" on public.note_blocks;
create policy "note_blocks_select_via_note"
on public.note_blocks
for select
to authenticated
using (public.can_read_note(note_id));

drop policy if exists "note_blocks_insert_via_note" on public.note_blocks;
create policy "note_blocks_insert_via_note"
on public.note_blocks
for insert
to authenticated
with check (public.can_write_note(note_id));

drop policy if exists "note_blocks_update_via_note" on public.note_blocks;
create policy "note_blocks_update_via_note"
on public.note_blocks
for update
to authenticated
using (public.can_write_note(note_id))
with check (public.can_write_note(note_id));

drop policy if exists "note_blocks_delete_via_note" on public.note_blocks;
create policy "note_blocks_delete_via_note"
on public.note_blocks
for delete
to authenticated
using (public.can_write_note(note_id));

-- note_entities
drop policy if exists "note_entities_select_via_note" on public.note_entities;
create policy "note_entities_select_via_note"
on public.note_entities
for select
to authenticated
using (public.can_read_note(note_id));

drop policy if exists "note_entities_write_via_note" on public.note_entities;
create policy "note_entities_write_via_note"
on public.note_entities
for all
to authenticated
using (public.can_write_note(note_id))
with check (public.can_write_note(note_id));

-- note_relationships
drop policy if exists "note_relationships_select_via_note" on public.note_relationships;
create policy "note_relationships_select_via_note"
on public.note_relationships
for select
to authenticated
using (public.can_read_note(note_id));

drop policy if exists "note_relationships_write_via_note" on public.note_relationships;
create policy "note_relationships_write_via_note"
on public.note_relationships
for all
to authenticated
using (public.can_write_note(note_id))
with check (public.can_write_note(note_id));

-- note_topic_links
drop policy if exists "note_topic_links_select_via_note" on public.note_topic_links;
create policy "note_topic_links_select_via_note"
on public.note_topic_links
for select
to authenticated
using (public.can_read_note(note_id));

drop policy if exists "note_topic_links_write_via_note" on public.note_topic_links;
create policy "note_topic_links_write_via_note"
on public.note_topic_links
for all
to authenticated
using (public.can_write_note(note_id))
with check (public.can_write_note(note_id));
