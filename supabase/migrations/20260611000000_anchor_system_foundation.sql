-- PrepOS Anchor System — Phase 1 semantic foundation (infrastructure only).
-- Additive: does not modify note_topic_links, parser, or renderer behavior.

-- ---------------------------------------------------------------------------
-- Normalization (shared with JS anchor-normalization.js)
-- ---------------------------------------------------------------------------

create or replace function public.normalize_anchor_name(input text)
returns text
language sql
immutable
as $$
  select trim(lower(regexp_replace(coalesce(input, ''), '\s+', ' ', 'g')));
$$;

-- ---------------------------------------------------------------------------
-- 1. anchors — global semantic identity
-- ---------------------------------------------------------------------------

create table if not exists public.anchors (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  anchor_type text not null
    check (anchor_type in ('micro', 'canonical')),
  canonical_topic_id uuid
    references public.topics(id)
    on delete set null,
  created_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anchors_normalized_idx on public.anchors(normalized_name);
create index if not exists anchors_topic_idx on public.anchors(canonical_topic_id);

-- ---------------------------------------------------------------------------
-- 2. anchor_variants — language-specific display layer
-- ---------------------------------------------------------------------------

create table if not exists public.anchor_variants (
  id uuid primary key default gen_random_uuid(),
  anchor_id uuid not null
    references public.anchors(id)
    on delete cascade,
  language text not null,
  display_name text not null,
  normalized_name text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  unique (anchor_id, language)
);

create index if not exists anchor_variants_language_idx on public.anchor_variants(language);
create index if not exists anchor_variants_name_idx on public.anchor_variants(normalized_name);

-- ---------------------------------------------------------------------------
-- 3. anchor_notes — inspector cognition payload
-- ---------------------------------------------------------------------------

create table if not exists public.anchor_notes (
  id uuid primary key default gen_random_uuid(),
  anchor_variant_id uuid not null
    references public.anchor_variants(id)
    on delete cascade,
  note_content text not null,
  note_format text not null default 'markdown',
  version integer not null default 1,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anchor_notes_variant_idx on public.anchor_notes(anchor_variant_id);

-- ---------------------------------------------------------------------------
-- 4. anchor_aliases — semantic resolution aliases
-- ---------------------------------------------------------------------------

create table if not exists public.anchor_aliases (
  id uuid primary key default gen_random_uuid(),
  anchor_id uuid not null
    references public.anchors(id)
    on delete cascade,
  alias text not null,
  normalized_alias text not null,
  language text not null,
  created_at timestamptz not null default now()
);

create index if not exists anchor_aliases_lookup_idx on public.anchor_aliases(normalized_alias);
create index if not exists anchor_aliases_anchor_idx on public.anchor_aliases(anchor_id);

-- ---------------------------------------------------------------------------
-- 5. note_anchor_links — anchor usage inside note variants
-- ---------------------------------------------------------------------------

create table if not exists public.note_anchor_links (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null
    references public.note_variants(id)
    on delete cascade,
  anchor_id uuid not null
    references public.anchors(id)
    on delete cascade,
  state text not null
    check (state in ('candidate', 'active', 'dormant')),
  source_text text not null,
  block_key text,
  created_at timestamptz not null default now()
);

create index if not exists note_anchor_links_variant_idx on public.note_anchor_links(variant_id);
create index if not exists note_anchor_links_anchor_idx on public.note_anchor_links(anchor_id);
create index if not exists note_anchor_links_state_idx on public.note_anchor_links(state);

-- ---------------------------------------------------------------------------
-- 6. anchor_relationships — semantic graph (minimal)
-- ---------------------------------------------------------------------------

create table if not exists public.anchor_relationships (
  id uuid primary key default gen_random_uuid(),
  source_anchor_id uuid not null
    references public.anchors(id)
    on delete cascade,
  relationship_type text not null,
  target_anchor_id uuid not null
    references public.anchors(id)
    on delete cascade,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_anchor_id <> target_anchor_id)
);

create index if not exists anchor_relationships_source_idx
  on public.anchor_relationships(source_anchor_id);
create index if not exists anchor_relationships_target_idx
  on public.anchor_relationships(target_anchor_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_anchor_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists anchors_set_updated_at on public.anchors;
create trigger anchors_set_updated_at
before update on public.anchors
for each row
execute function public.set_anchor_row_updated_at();

drop trigger if exists anchor_notes_set_updated_at on public.anchor_notes;
create trigger anchor_notes_set_updated_at
before update on public.anchor_notes
for each row
execute function public.set_anchor_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_read_anchor(p_anchor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.anchors a
    where a.id = p_anchor_id
      and (
        public.is_admin()
        or public.is_teacher_or_admin()
        or public.current_user_role() = 'student'
      )
  )
$$;

create or replace function public.can_write_anchor(p_anchor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.anchors a
    where a.id = p_anchor_id
      and (public.is_admin() or public.is_teacher_or_admin())
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.anchors enable row level security;
alter table public.anchor_variants enable row level security;
alter table public.anchor_notes enable row level security;
alter table public.anchor_aliases enable row level security;
alter table public.note_anchor_links enable row level security;
alter table public.anchor_relationships enable row level security;

-- anchors
drop policy if exists "anchors_select" on public.anchors;
create policy "anchors_select"
on public.anchors
for select
to authenticated
using (
  public.is_admin()
  or public.is_teacher_or_admin()
  or public.current_user_role() = 'student'
);

drop policy if exists "anchors_insert_staff" on public.anchors;
create policy "anchors_insert_staff"
on public.anchors
for insert
to authenticated
with check (public.is_admin() or public.is_teacher_or_admin());

drop policy if exists "anchors_update_staff" on public.anchors;
create policy "anchors_update_staff"
on public.anchors
for update
to authenticated
using (public.is_admin() or public.is_teacher_or_admin())
with check (public.is_admin() or public.is_teacher_or_admin());

drop policy if exists "anchors_delete_staff" on public.anchors;
create policy "anchors_delete_staff"
on public.anchors
for delete
to authenticated
using (public.is_admin() or public.is_teacher_or_admin());

-- anchor_variants
drop policy if exists "anchor_variants_select" on public.anchor_variants;
create policy "anchor_variants_select"
on public.anchor_variants
for select
to authenticated
using (
  public.can_read_anchor(anchor_id)
  and (
    public.is_teacher_or_admin()
    or public.is_admin()
    or status = 'active'
  )
);

drop policy if exists "anchor_variants_write_staff" on public.anchor_variants;
create policy "anchor_variants_write_staff"
on public.anchor_variants
for all
to authenticated
using (public.can_write_anchor(anchor_id))
with check (public.can_write_anchor(anchor_id));

-- anchor_notes
drop policy if exists "anchor_notes_select" on public.anchor_notes;
create policy "anchor_notes_select"
on public.anchor_notes
for select
to authenticated
using (
  exists (
    select 1
    from public.anchor_variants av
    where av.id = anchor_variant_id
      and public.can_read_anchor(av.anchor_id)
      and (
        public.is_teacher_or_admin()
        or public.is_admin()
        or anchor_notes.status = 'active'
      )
  )
);

drop policy if exists "anchor_notes_write_staff" on public.anchor_notes;
create policy "anchor_notes_write_staff"
on public.anchor_notes
for all
to authenticated
using (
  exists (
    select 1
    from public.anchor_variants av
    where av.id = anchor_variant_id
      and public.can_write_anchor(av.anchor_id)
  )
)
with check (
  exists (
    select 1
    from public.anchor_variants av
    where av.id = anchor_variant_id
      and public.can_write_anchor(av.anchor_id)
  )
);

-- anchor_aliases
drop policy if exists "anchor_aliases_select" on public.anchor_aliases;
create policy "anchor_aliases_select"
on public.anchor_aliases
for select
to authenticated
using (public.can_read_anchor(anchor_id));

drop policy if exists "anchor_aliases_write_staff" on public.anchor_aliases;
create policy "anchor_aliases_write_staff"
on public.anchor_aliases
for all
to authenticated
using (public.can_write_anchor(anchor_id))
with check (public.can_write_anchor(anchor_id));

-- note_anchor_links (variant-scoped, mirrors note_topic_links)
drop policy if exists "note_anchor_links_select_via_variant" on public.note_anchor_links;
create policy "note_anchor_links_select_via_variant"
on public.note_anchor_links
for select
to authenticated
using (public.can_read_variant(variant_id));

drop policy if exists "note_anchor_links_write_via_variant" on public.note_anchor_links;
create policy "note_anchor_links_write_via_variant"
on public.note_anchor_links
for all
to authenticated
using (public.can_write_variant(variant_id))
with check (public.can_write_variant(variant_id));

-- anchor_relationships
drop policy if exists "anchor_relationships_select" on public.anchor_relationships;
create policy "anchor_relationships_select"
on public.anchor_relationships
for select
to authenticated
using (
  public.can_read_anchor(source_anchor_id)
  and public.can_read_anchor(target_anchor_id)
);

drop policy if exists "anchor_relationships_write_staff" on public.anchor_relationships;
create policy "anchor_relationships_write_staff"
on public.anchor_relationships
for all
to authenticated
using (public.can_write_anchor(source_anchor_id))
with check (public.can_write_anchor(source_anchor_id));
