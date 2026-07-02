-- Fold apostrophe variants in anchor identity + merge duplicate anchors created before this fix.

-- ---------------------------------------------------------------------------
-- 1) Shared normalization (mirrors js/anchors/anchor-normalization.js)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_anchor_name(input text)
returns text
language sql
immutable
as $$
  select trim(
    lower(
      regexp_replace(
        regexp_replace(
          coalesce(input, ''),
          '[''’‚‛＇´′ʻʼʽˈˊ]',
          '''',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) Merge anchors that collapse to the same normalized identity
-- ---------------------------------------------------------------------------
do $$
declare
  rec record;
  winner_variant_id uuid;
  loser_variant_id uuid;
  winner_note_id uuid;
  loser_note_id uuid;
begin
  for rec in
    with scored as (
      select
        a.id,
        public.normalize_anchor_name(a.normalized_name) as canonical_normalized,
        a.normalized_name as legacy_normalized,
        a.anchor_type,
        a.created_at,
        count(distinct an.id) filter (
          where an.status = 'active'
            and btrim(an.note_content) <> ''
        ) as note_count
      from public.anchors a
      left join public.anchor_variants av
        on av.anchor_id = a.id
        and av.status = 'active'
      left join public.anchor_notes an
        on an.anchor_variant_id = av.id
      group by a.id, a.normalized_name, a.anchor_type, a.created_at
    ),
    ranked as (
      select
        scored.*,
        row_number() over (
          partition by canonical_normalized
          order by
            note_count desc,
            case when anchor_type = 'canonical' then 0 else 1 end,
            created_at asc
        ) as rn
      from scored
    ),
    winners as (
      select canonical_normalized, id as winner_id
      from ranked
      where rn = 1
    )
    select
      ranked.id as loser_id,
      winners.winner_id,
      ranked.canonical_normalized,
      ranked.legacy_normalized
    from ranked
    join winners
      on winners.canonical_normalized = ranked.canonical_normalized
    where ranked.rn > 1
  loop
    for loser_variant_id, winner_variant_id in
      select lv.id, wv.id
      from public.anchor_variants lv
      left join public.anchor_variants wv
        on wv.anchor_id = rec.winner_id
        and wv.language = lv.language
        and wv.status = 'active'
      where lv.anchor_id = rec.loser_id
        and lv.status = 'active'
    loop
      if winner_variant_id is null then
        update public.anchor_variants
        set anchor_id = rec.winner_id
        where id = loser_variant_id;
      else
        select id
        into winner_note_id
        from public.anchor_notes
        where anchor_variant_id = winner_variant_id
          and status = 'active'
          and btrim(note_content) <> ''
        order by updated_at desc
        limit 1;

        select id
        into loser_note_id
        from public.anchor_notes
        where anchor_variant_id = loser_variant_id
          and status = 'active'
          and btrim(note_content) <> ''
        order by updated_at desc
        limit 1;

        if winner_note_id is null and loser_note_id is not null then
          update public.anchor_notes
          set anchor_variant_id = winner_variant_id
          where id = loser_note_id;
        elsif loser_note_id is not null then
          update public.anchor_notes
          set status = 'archived'
          where id = loser_note_id;
        end if;

        delete from public.anchor_variants
        where id = loser_variant_id;
      end if;
    end loop;

    update public.note_anchor_links
    set anchor_id = rec.winner_id
    where anchor_id = rec.loser_id;

    insert into public.anchor_aliases (anchor_id, alias, normalized_alias, language)
    select
      rec.winner_id,
      rec.legacy_normalized,
      public.normalize_anchor_name(rec.legacy_normalized),
      'english'
    where not exists (
      select 1
      from public.anchor_aliases aa
      where aa.anchor_id = rec.winner_id
        and aa.normalized_alias = public.normalize_anchor_name(rec.legacy_normalized)
        and aa.language = 'english'
    );

    update public.anchor_aliases
    set anchor_id = rec.winner_id
    where anchor_id = rec.loser_id;

    update public.anchor_relationships
    set source_anchor_id = rec.winner_id
    where source_anchor_id = rec.loser_id;

    update public.anchor_relationships
    set target_anchor_id = rec.winner_id
    where target_anchor_id = rec.loser_id;

    delete from public.anchors
    where id = rec.loser_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Renormalize stored identity fields
-- ---------------------------------------------------------------------------
update public.anchors
set normalized_name = public.normalize_anchor_name(normalized_name)
where normalized_name <> public.normalize_anchor_name(normalized_name);

update public.anchor_variants
set normalized_name = public.normalize_anchor_name(normalized_name)
where normalized_name <> public.normalize_anchor_name(normalized_name);

update public.anchor_aliases
set normalized_alias = public.normalize_anchor_name(normalized_alias)
where normalized_alias <> public.normalize_anchor_name(normalized_alias);

-- ---------------------------------------------------------------------------
-- 4) Deduplicate note_anchor_links after anchor merges
-- ---------------------------------------------------------------------------
delete from public.note_anchor_links a
using public.note_anchor_links b
where a.id < b.id
  and a.variant_id = b.variant_id
  and a.anchor_id = b.anchor_id
  and a.source_text = b.source_text
  and coalesce(a.block_key, '') = coalesce(b.block_key, '');

-- ---------------------------------------------------------------------------
-- 5) Known orthographic alias: Bishop Wars -> Bishops' Wars
-- ---------------------------------------------------------------------------
insert into public.anchor_aliases (anchor_id, alias, normalized_alias, language)
select
  a.id,
  'Bishop Wars',
  public.normalize_anchor_name('Bishop Wars'),
  'english'
from public.anchors a
where public.normalize_anchor_name(a.normalized_name) = public.normalize_anchor_name('Bishops'' Wars')
  and not exists (
    select 1
    from public.anchor_aliases aa
    where aa.anchor_id = a.id
      and aa.normalized_alias = public.normalize_anchor_name('Bishop Wars')
      and aa.language = 'english'
  );

-- Repoint any orphan "bishop wars" anchor into the canonical Bishops' Wars record.
with winner as (
  select id
  from public.anchors
  where normalized_name = public.normalize_anchor_name('Bishops'' Wars')
  limit 1
),
loser as (
  select id
  from public.anchors
  where normalized_name = public.normalize_anchor_name('Bishop Wars')
    and id <> (select id from winner)
  limit 1
)
update public.note_anchor_links
set anchor_id = (select id from winner)
where anchor_id = (select id from loser)
  and exists (select 1 from winner)
  and exists (select 1 from loser);

delete from public.anchors
where normalized_name = public.normalize_anchor_name('Bishop Wars')
  and exists (
    select 1
    from public.anchors
    where normalized_name = public.normalize_anchor_name('Bishops'' Wars')
  );
