-- One-time backfill: populate user_question_stats from historical practice_attempts.
-- Bank practice answers live in practice_attempts before Phase 3 incremental upserts.
-- Safe to re-run: keeps higher existing counts when live upserts already exceed history.

do $$
begin
  if to_regclass('public.practice_attempts') is null
     or to_regclass('public.user_question_stats') is null then
    raise notice 'Skipping user_question_stats backfill: required tables are missing.';
    return;
  end if;

  with expanded as (
    select
      pa.student_id as user_id,
      nullif(answer->>'question_id', '')::uuid as question_id,
      pa.submitted_at,
      case
        when lower(coalesce(answer->>'is_correct', '')) in ('true', 't', '1') then true
        when lower(coalesce(answer->>'is_correct', '')) in ('false', 'f', '0') then false
        when coalesce(answer->>'chosen', '') <> ''
          and coalesce(answer->>'correct', '') <> '' then
          answer->>'chosen' = answer->>'correct'
        else false
      end as is_correct
    from public.practice_attempts pa
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(pa.answers) = 'array' then pa.answers
        else '[]'::jsonb
      end
    ) as answer
  ),
  filtered as (
    select *
    from expanded
    where question_id is not null
  ),
  aggregated as (
    select
      user_id,
      question_id,
      count(*)::integer as seen_count,
      count(*) filter (where is_correct)::integer as correct_count,
      max(submitted_at) as last_seen_at
    from filtered
    group by user_id, question_id
  ),
  latest as (
    select distinct on (user_id, question_id)
      user_id,
      question_id,
      is_correct as last_correct,
      submitted_at as last_seen_at
    from filtered
    order by user_id, question_id, submitted_at desc
  )
  insert into public.user_question_stats (
    user_id,
    question_id,
    seen_count,
    correct_count,
    last_correct,
    last_seen_at,
    updated_at
  )
  select
    a.user_id,
    a.question_id,
    a.seen_count,
    a.correct_count,
    l.last_correct,
    l.last_seen_at,
    now()
  from aggregated a
  join latest l using (user_id, question_id)
  join public.questions q on q.id = a.question_id
  on conflict (user_id, question_id) do update
  set
    seen_count = case
      when public.user_question_stats.seen_count > excluded.seen_count
        then public.user_question_stats.seen_count
      else excluded.seen_count
    end,
    correct_count = case
      when public.user_question_stats.seen_count > excluded.seen_count
        then public.user_question_stats.correct_count
      else excluded.correct_count
    end,
    last_correct = case
      when excluded.last_seen_at >= public.user_question_stats.last_seen_at
        then excluded.last_correct
      else public.user_question_stats.last_correct
    end,
    last_seen_at = greatest(
      public.user_question_stats.last_seen_at,
      excluded.last_seen_at
    ),
    updated_at = now();

  raise notice 'user_question_stats backfill from practice_attempts complete.';
end $$;
