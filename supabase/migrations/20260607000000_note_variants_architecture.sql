-- PrepOS canonical notes → language variants architecture
-- One canonical note (topic-centric) → many language variants → derived structures per variant

-- ---------------------------------------------------------------------------
-- 1. note_variants
-- ---------------------------------------------------------------------------

create table if not exists public.note_variants (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  language text not null,
  title text not null,
  status text not null default 'draft',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scheduled_delete_at timestamptz,
  constraint note_variants_status_check check (status in ('draft', 'published')),
  constraint note_variants_language_check check (language in ('english', 'malayalam', 'bilingual'))
);

create index if not exists note_variants_note_idx on public.note_variants(note_id);
create index if not exists note_variants_status_idx on public.note_variants(status);

-- ---------------------------------------------------------------------------
-- 2. Migrate existing notes → variants (one variant per legacy note row)
-- ---------------------------------------------------------------------------

insert into public.note_variants (
  id,
  note_id,
  language,
  title,
  status,
  created_by,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  n.id,
  coalesce(nullif(trim(n.language), ''), 'english'),
  n.title,
  n.status,
  n.created_by,
  n.created_at,
  n.updated_at
from public.notes n
where not exists (
  select 1 from public.note_variants nv where nv.note_id = n.id
);

-- Drop per-language uniqueness before merge (duplicate topics may temporarily share language)
drop index if exists public.note_variants_note_language_uidx;
drop index if exists public.note_variants_one_published_per_language_uidx;

-- Merge duplicate canonical notes per topic (keep oldest note row per topic_id)
do $$
declare
  rec record;
  keeper_id uuid;
begin
  for rec in
    select topic_id
    from public.notes
    group by topic_id
    having count(*) > 1
  loop
    select id into keeper_id
    from public.notes
    where topic_id = rec.topic_id
    order by created_at asc
    limit 1;

    update public.note_variants nv
    set note_id = keeper_id
    from public.notes n
    where nv.note_id = n.id
      and n.topic_id = rec.topic_id
      and n.id <> keeper_id;

    delete from public.notes n
    where n.topic_id = rec.topic_id
      and n.id <> keeper_id;
  end loop;
end $$;

-- Merge may place multiple published rows in the same language stream; keep newest only
delete from public.note_variants nv
using (
  select id,
    row_number() over (
      partition by note_id, language
      order by updated_at desc nulls last, created_at desc nulls last
    ) as rn
  from public.note_variants
  where status = 'published'
) ranked
where nv.id = ranked.id
  and ranked.rn > 1;

-- One published variant per language per canonical note (after merge completes)
create unique index if not exists note_variants_one_published_per_language_uidx
  on public.note_variants (note_id, language)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- 3. Add variant_id to child tables and backfill
-- ---------------------------------------------------------------------------

alter table public.note_sources add column if not exists variant_id uuid references public.note_variants(id) on delete cascade;
alter table public.note_blocks add column if not exists variant_id uuid references public.note_variants(id) on delete cascade;
alter table public.note_entities add column if not exists variant_id uuid references public.note_variants(id) on delete cascade;
alter table public.note_relationships add column if not exists variant_id uuid references public.note_variants(id) on delete cascade;
alter table public.note_topic_links add column if not exists variant_id uuid references public.note_variants(id) on delete cascade;

update public.note_sources ns
set variant_id = nv.id
from public.note_variants nv
where nv.note_id = ns.note_id
  and ns.variant_id is null;

update public.note_blocks nb
set variant_id = nv.id
from public.note_variants nv
where nv.note_id = nb.note_id
  and nb.variant_id is null;

update public.note_entities ne
set variant_id = nv.id
from public.note_variants nv
where nv.note_id = ne.note_id
  and ne.variant_id is null;

update public.note_relationships nr
set variant_id = nv.id
from public.note_variants nv
where nv.note_id = nr.note_id
  and nr.variant_id is null;

update public.note_topic_links ntl
set variant_id = nv.id
from public.note_variants nv
where nv.note_id = ntl.note_id
  and ntl.variant_id is null;

-- ---------------------------------------------------------------------------
-- 4. RLS helpers (variant-centric) — BEFORE policy swap and note_id drop
-- ---------------------------------------------------------------------------

create or replace function public.can_read_canonical_note(p_note_id uuid)
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
        or public.is_teacher_or_admin()
        or (
          public.current_user_role() = 'student'
          and exists (
            select 1
            from public.note_variants nv
            where nv.note_id = n.id
              and nv.status = 'published'
          )
        )
      )
  )
$$;

create or replace function public.can_write_canonical_note(p_note_id uuid)
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
        or public.is_teacher_or_admin()
      )
  )
$$;

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
        or (public.current_user_role() = 'student' and nv.status = 'published')
      )
  )
$$;

create or replace function public.can_write_variant(p_variant_id uuid)
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
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Child-table policy migration (note-centric → variant-centric)
-- Drop *_via_note policies FIRST, then create *_via_variant BEFORE dropping note_id
-- ---------------------------------------------------------------------------

-- note_sources
drop policy if exists "note_sources_select_via_note" on public.note_sources;
drop policy if exists "note_sources_insert_via_note" on public.note_sources;
drop policy if exists "note_sources_update_via_note" on public.note_sources;

drop policy if exists "note_sources_select_via_variant" on public.note_sources;
drop policy if exists "note_sources_insert_via_variant" on public.note_sources;
drop policy if exists "note_sources_update_via_variant" on public.note_sources;

create policy "note_sources_select_via_variant"
on public.note_sources
for select
to authenticated
using (public.can_read_variant(variant_id));

create policy "note_sources_insert_via_variant"
on public.note_sources
for insert
to authenticated
with check (public.can_write_variant(variant_id));

create policy "note_sources_update_via_variant"
on public.note_sources
for update
to authenticated
using (public.can_write_variant(variant_id))
with check (public.can_write_variant(variant_id));

-- note_blocks
drop policy if exists "note_blocks_select_via_note" on public.note_blocks;
drop policy if exists "note_blocks_insert_via_note" on public.note_blocks;
drop policy if exists "note_blocks_update_via_note" on public.note_blocks;
drop policy if exists "note_blocks_delete_via_note" on public.note_blocks;

drop policy if exists "note_blocks_select_via_variant" on public.note_blocks;
drop policy if exists "note_blocks_insert_via_variant" on public.note_blocks;
drop policy if exists "note_blocks_update_via_variant" on public.note_blocks;
drop policy if exists "note_blocks_delete_via_variant" on public.note_blocks;

create policy "note_blocks_select_via_variant"
on public.note_blocks
for select
to authenticated
using (public.can_read_variant(variant_id));

create policy "note_blocks_insert_via_variant"
on public.note_blocks
for insert
to authenticated
with check (public.can_write_variant(variant_id));

create policy "note_blocks_update_via_variant"
on public.note_blocks
for update
to authenticated
using (public.can_write_variant(variant_id))
with check (public.can_write_variant(variant_id));

create policy "note_blocks_delete_via_variant"
on public.note_blocks
for delete
to authenticated
using (public.can_write_variant(variant_id));

-- note_entities
drop policy if exists "note_entities_select_via_note" on public.note_entities;
drop policy if exists "note_entities_write_via_note" on public.note_entities;

drop policy if exists "note_entities_select_via_variant" on public.note_entities;
drop policy if exists "note_entities_write_via_variant" on public.note_entities;

create policy "note_entities_select_via_variant"
on public.note_entities
for select
to authenticated
using (public.can_read_variant(variant_id));

create policy "note_entities_write_via_variant"
on public.note_entities
for all
to authenticated
using (public.can_write_variant(variant_id))
with check (public.can_write_variant(variant_id));

-- note_relationships
drop policy if exists "note_relationships_select_via_note" on public.note_relationships;
drop policy if exists "note_relationships_write_via_note" on public.note_relationships;

drop policy if exists "note_relationships_select_via_variant" on public.note_relationships;
drop policy if exists "note_relationships_write_via_variant" on public.note_relationships;

create policy "note_relationships_select_via_variant"
on public.note_relationships
for select
to authenticated
using (public.can_read_variant(variant_id));

create policy "note_relationships_write_via_variant"
on public.note_relationships
for all
to authenticated
using (public.can_write_variant(variant_id))
with check (public.can_write_variant(variant_id));

-- note_topic_links
drop policy if exists "note_topic_links_select_via_note" on public.note_topic_links;
drop policy if exists "note_topic_links_write_via_note" on public.note_topic_links;

drop policy if exists "note_topic_links_select_via_variant" on public.note_topic_links;
drop policy if exists "note_topic_links_write_via_variant" on public.note_topic_links;

create policy "note_topic_links_select_via_variant"
on public.note_topic_links
for select
to authenticated
using (public.can_read_variant(variant_id));

create policy "note_topic_links_write_via_variant"
on public.note_topic_links
for all
to authenticated
using (public.can_write_variant(variant_id))
with check (public.can_write_variant(variant_id));

-- ---------------------------------------------------------------------------
-- 6. Drop note_id from children; enforce variant_id (only after policies migrated)
-- ---------------------------------------------------------------------------

alter table public.note_sources drop column if exists note_id;
alter table public.note_blocks drop column if exists note_id;
alter table public.note_entities drop column if exists note_id;
alter table public.note_relationships drop column if exists note_id;
alter table public.note_topic_links drop column if exists note_id;

alter table public.note_sources alter column variant_id set not null;
alter table public.note_blocks alter column variant_id set not null;
alter table public.note_entities alter column variant_id set not null;
alter table public.note_relationships alter column variant_id set not null;
alter table public.note_topic_links alter column variant_id set not null;

create index if not exists note_sources_variant_idx on public.note_sources(variant_id);
create index if not exists note_blocks_variant_idx on public.note_blocks(variant_id);
create index if not exists note_entities_variant_idx on public.note_entities(variant_id);
create index if not exists note_relationships_variant_idx on public.note_relationships(variant_id);
create index if not exists note_topic_links_variant_idx on public.note_topic_links(variant_id);

-- ---------------------------------------------------------------------------
-- 7. Note policy migration (notes.status → variant-aware visibility)
-- Drop legacy policies BEFORE removing notes.status / notes.language
-- ---------------------------------------------------------------------------

drop policy if exists "notes_select_visible" on public.notes;
drop policy if exists "notes_insert_staff_owned" on public.notes;
drop policy if exists "notes_update_owned_staff" on public.notes;
drop policy if exists "notes_delete_owned_staff" on public.notes;

create policy "notes_select_visible"
on public.notes
for select
to authenticated
using (public.can_read_canonical_note(id));

create policy "notes_insert_staff_owned"
on public.notes
for insert
to authenticated
with check (
  public.is_teacher_or_admin()
  and coalesce(created_by, auth.uid()) = auth.uid()
);

create policy "notes_update_owned_staff"
on public.notes
for update
to authenticated
using (public.can_write_canonical_note(id))
with check (public.can_write_canonical_note(id));

create policy "notes_delete_owned_staff"
on public.notes
for delete
to authenticated
using (public.can_write_canonical_note(id));

alter table public.note_variants enable row level security;

drop policy if exists "note_variants_select_visible" on public.note_variants;
create policy "note_variants_select_visible"
on public.note_variants
for select
to authenticated
using (public.can_read_variant(id));

drop policy if exists "note_variants_insert_via_note" on public.note_variants;
drop policy if exists "note_variants_insert_staff" on public.note_variants;
create policy "note_variants_insert_staff"
on public.note_variants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  )
  and exists (
    select 1
    from public.notes n
    where n.id = note_id
  )
);

drop policy if exists "note_variants_select_staff" on public.note_variants;
create policy "note_variants_select_staff"
on public.note_variants
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('teacher', 'admin')
  )
);

drop policy if exists "note_variants_update_via_note" on public.note_variants;
create policy "note_variants_update_via_note"
on public.note_variants
for update
to authenticated
using (public.can_write_variant(id))
with check (public.can_write_variant(id));

drop policy if exists "note_variants_delete_via_note" on public.note_variants;
create policy "note_variants_delete_via_note"
on public.note_variants
for delete
to authenticated
using (public.can_write_variant(id));

-- ---------------------------------------------------------------------------
-- 8. notes = canonical container (drop legacy lifecycle columns on notes)
-- ---------------------------------------------------------------------------

alter table public.notes drop constraint if exists notes_status_check;
alter table public.notes drop column if exists language;
alter table public.notes drop column if exists status;
alter table public.notes drop column if exists scheduled_delete_at;

drop index if exists notes_status_idx;

create unique index if not exists notes_topic_uidx on public.notes(topic_id);

-- ---------------------------------------------------------------------------
-- 9. Variant updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_note_variants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists note_variants_set_updated_at on public.note_variants;
create trigger note_variants_set_updated_at
before update on public.note_variants
for each row
execute function public.set_note_variants_updated_at();

-- ---------------------------------------------------------------------------
-- 10. Drop legacy note-level helpers (replaced by variant/canonical helpers)
-- ---------------------------------------------------------------------------

drop function if exists public.can_read_note(uuid);
drop function if exists public.can_write_note(uuid);
