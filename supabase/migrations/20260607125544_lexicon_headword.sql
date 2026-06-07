-- Lexicon headword: one primary (most widely known) word per group.

alter table public.lexicon_entries
  add column if not exists is_headword boolean not null default false;

-- Backfill: earliest row per group becomes headword.
update public.lexicon_entries e
set is_headword = true
from (
  select distinct on (group_id) id
  from public.lexicon_entries
  where group_id is not null
  order by group_id, id asc
) h
where e.id = h.id;

create unique index if not exists lexicon_entries_one_headword_per_group
  on public.lexicon_entries (group_id)
  where is_headword = true;
