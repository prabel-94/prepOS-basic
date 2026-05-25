-- Variant-aware lifecycle: published → archived → scheduled auto-delete (14 days)
-- One published variant per language per canonical note; multiple drafts/archived allowed.

-- ---------------------------------------------------------------------------
-- 1. Status + indexes (drop one-row-per-language constraint)
-- ---------------------------------------------------------------------------

alter table public.note_variants drop constraint if exists note_variants_status_check;

alter table public.note_variants
  add constraint note_variants_status_check
  check (status in ('draft', 'published', 'archived'));

-- Allow multiple variants per language (draft revisions + archived history)
drop index if exists public.note_variants_note_language_uidx;

-- scheduled_delete_at already on note_variants; index for cleanup job
create index if not exists note_variants_scheduled_delete_idx
  on public.note_variants (scheduled_delete_at)
  where status = 'archived' and scheduled_delete_at is not null;

-- One active published variant per language per canonical note
drop index if exists public.note_variants_one_published_per_language_uidx;

create unique index if not exists note_variants_one_published_per_language_uidx
  on public.note_variants (note_id, language)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- 2. Archive siblings when a variant is published (DB enforcement)
-- ---------------------------------------------------------------------------

create or replace function public.archive_published_variant_siblings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' then
    update public.note_variants
    set
      status = 'archived',
      scheduled_delete_at = now() + interval '14 days'
    where note_id = new.note_id
      and language = new.language
      and status = 'published'
      and id is distinct from new.id;

    new.scheduled_delete_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists note_variants_archive_siblings_on_publish on public.note_variants;

create trigger note_variants_archive_siblings_on_publish
before insert or update of status on public.note_variants
for each row
when (new.status = 'published')
execute function public.archive_published_variant_siblings();

-- ---------------------------------------------------------------------------
-- 3. Cleanup archived variants past retention (cascade deletes children)
-- ---------------------------------------------------------------------------

create or replace function public.cleanup_archived_note_variants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.note_variants
  where status = 'archived'
    and scheduled_delete_at is not null
    and scheduled_delete_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_archived_note_variants() from public;
grant execute on function public.cleanup_archived_note_variants() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4. Daily cleanup schedule (pg_cron — enable in Supabase Dashboard if needed)
-- ---------------------------------------------------------------------------

do $outer$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron extension not available: %', sqlerrm;
end;
$outer$;

do $outer$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-archived-note-variants';

    perform cron.schedule(
      'cleanup-archived-note-variants',
      '0 4 * * *',
      $$select public.cleanup_archived_note_variants();$$
    );
  else
    raise notice 'cron schema missing; schedule cleanup_archived_note_variants() manually';
  end if;
exception
  when others then
    raise notice 'Could not schedule note variant cleanup: %', sqlerrm;
end;
$outer$;

-- ---------------------------------------------------------------------------
-- 5. Student visibility: only published variants (not draft/archived)
-- ---------------------------------------------------------------------------

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
        or (public.is_teacher_or_admin() and n.created_by = auth.uid())
        or (public.current_user_role() = 'student' and nv.status = 'published')
      )
  )
$$;
