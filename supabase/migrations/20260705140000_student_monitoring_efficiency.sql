-- Monitoring efficiency: indexes, profile cache, batch writes, rewritten aggregations, merged panel RPC.

-- ---------------------------------------------------------------------------
-- 1) Indexes
-- ---------------------------------------------------------------------------
create index if not exists exam_attempts_student_submitted_idx
  on public.exam_attempts (student_id, submitted_at desc);

create index if not exists student_activity_events_occurred_idx
  on public.student_activity_events (occurred_at);

-- ---------------------------------------------------------------------------
-- 2) Cached monitoring columns on learner_profiles
-- ---------------------------------------------------------------------------
alter table public.learner_profiles
  add column if not exists monitoring_last_seen_at timestamptz,
  add column if not exists monitoring_last_event_type text,
  add column if not exists monitoring_last_event_at timestamptz;

create index if not exists learner_profiles_monitoring_last_seen_idx
  on public.learner_profiles (monitoring_last_seen_at desc nulls last);

-- ---------------------------------------------------------------------------
-- 3) Cache bump helper (called from write triggers)
-- ---------------------------------------------------------------------------
create or replace function public.bump_learner_monitoring_cache(
  p_user_id uuid,
  p_seen_at timestamptz,
  p_event_type text default null,
  p_event_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_seen_at is null then
    return;
  end if;

  update public.learner_profiles lp
  set
    monitoring_last_seen_at = greatest(
      coalesce(lp.monitoring_last_seen_at, '-infinity'::timestamptz),
      p_seen_at
    ),
    monitoring_last_event_type = case
      when p_event_type is not null
        and p_event_at is not null
        and p_event_at >= coalesce(lp.monitoring_last_event_at, '-infinity'::timestamptz)
      then p_event_type
      else lp.monitoring_last_event_type
    end,
    monitoring_last_event_at = case
      when p_event_at is not null
        and p_event_at >= coalesce(lp.monitoring_last_event_at, '-infinity'::timestamptz)
      then p_event_at
      else lp.monitoring_last_event_at
    end
  where lp.user_id = p_user_id;
end;
$$;

create or replace function public.trg_bump_monitoring_from_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_learner_monitoring_cache(
    new.user_id,
    new.occurred_at,
    new.event_type,
    new.occurred_at
  );
  return new;
end;
$$;

create or replace function public.trg_bump_monitoring_from_exam_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_learner_monitoring_cache(
    new.student_id,
    new.submitted_at
  );
  return new;
end;
$$;

create or replace function public.trg_bump_monitoring_from_practice_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_learner_monitoring_cache(
    new.student_id,
    new.submitted_at
  );
  return new;
end;
$$;

drop trigger if exists student_activity_events_bump_monitoring_cache
  on public.student_activity_events;
create trigger student_activity_events_bump_monitoring_cache
  after insert on public.student_activity_events
  for each row
  execute function public.trg_bump_monitoring_from_activity_event();

drop trigger if exists exam_attempts_bump_monitoring_cache
  on public.exam_attempts;
create trigger exam_attempts_bump_monitoring_cache
  after insert on public.exam_attempts
  for each row
  execute function public.trg_bump_monitoring_from_exam_attempt();

drop trigger if exists practice_attempts_bump_monitoring_cache
  on public.practice_attempts;
create trigger practice_attempts_bump_monitoring_cache
  after insert on public.practice_attempts
  for each row
  execute function public.trg_bump_monitoring_from_practice_attempt();

-- Backfill cache from existing data
update public.learner_profiles lp
set
  monitoring_last_seen_at = stats.last_seen_at,
  monitoring_last_event_at = stats.last_event_at,
  monitoring_last_event_type = stats.last_event_type
from (
  select
    lp2.user_id,
    greatest(
      ea.max_submitted,
      pa.max_submitted,
      ev.max_occurred
    ) as last_seen_at,
    ev.max_occurred as last_event_at,
    ev.last_event_type
  from public.learner_profiles lp2
  left join lateral (
    select max(ea.submitted_at) as max_submitted
    from public.exam_attempts ea
    where ea.student_id = lp2.user_id
  ) ea on true
  left join lateral (
    select max(pa.submitted_at) as max_submitted
    from public.practice_attempts pa
    where pa.student_id = lp2.user_id
  ) pa on true
  left join lateral (
    select
      max(sae.occurred_at) as max_occurred,
      (array_agg(sae.event_type order by sae.occurred_at desc))[1] as last_event_type
    from public.student_activity_events sae
    where sae.user_id = lp2.user_id
  ) ev on true
) stats
where lp.user_id = stats.user_id;

-- ---------------------------------------------------------------------------
-- 4) Batch activity write RPC
-- ---------------------------------------------------------------------------
create or replace function public.log_student_activity_batch(
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_inserted integer := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    return 0;
  end if;

  v_user_id := public.effective_student_id();

  if v_user_id is null and public.current_user_role() = 'student' then
    v_user_id := auth.uid();
  end if;

  if v_user_id is null then
    return 0;
  end if;

  insert into public.student_activity_events (
    user_id,
    event_type,
    resource_type,
    resource_id,
    metadata,
    page_path,
    device_id,
    occurred_at
  )
  select
    v_user_id,
    btrim(elem->>'eventType'),
    nullif(btrim(coalesce(elem->>'resourceType', '')), ''),
    nullif(elem->>'resourceId', '')::uuid,
    coalesce(elem->'metadata', '{}'::jsonb),
    nullif(btrim(coalesce(elem->>'pagePath', '')), ''),
    nullif(btrim(coalesce(elem->>'deviceId', '')), ''),
    coalesce((elem->>'occurredAt')::timestamptz, now())
  from jsonb_array_elements(p_events) as elem
  where btrim(coalesce(elem->>'eventType', '')) <> '';

  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

-- Update single-event RPC to bump cache (trigger also fires; bump is idempotent via greatest())
create or replace function public.log_student_activity(
  p_event_type text,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_page_path text default null,
  p_device_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_event_id uuid;
  v_occurred_at timestamptz := now();
begin
  if p_event_type is null or btrim(p_event_type) = '' then
    raise exception 'event_type is required';
  end if;

  v_user_id := public.effective_student_id();

  if v_user_id is null and public.current_user_role() = 'student' then
    v_user_id := auth.uid();
  end if;

  if v_user_id is null then
    return null;
  end if;

  insert into public.student_activity_events (
    user_id,
    event_type,
    resource_type,
    resource_id,
    metadata,
    page_path,
    device_id,
    occurred_at
  )
  values (
    v_user_id,
    btrim(p_event_type),
    nullif(btrim(p_resource_type), ''),
    p_resource_id,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(btrim(p_page_path), ''),
    nullif(btrim(p_device_id), ''),
    v_occurred_at
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Efficient teacher monitoring overview (grouped aggregates, cached last seen)
-- ---------------------------------------------------------------------------
create or replace function public.get_teacher_monitoring_overview(
  p_batch_id uuid default null,
  p_include_linked boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  if p_batch_id is not null and not public.can_manage_batch(p_batch_id) then
    raise exception 'Batch not found or access denied';
  end if;

  return coalesce(
    (
      with filtered_learners as (
        select
          lp.id as profile_id,
          lp.user_id,
          lp.display_name,
          lp.monitoring_last_seen_at,
          lp.monitoring_last_event_type,
          lp.monitoring_last_event_at,
          au.email,
          exists (
            select 1
            from public.teacher_learner_links tll
            where tll.student_user_id = lp.user_id
              and tll.teacher_user_id = auth.uid()
          ) as is_linked
        from public.learner_profiles lp
        join auth.users au on au.id = lp.user_id
        where (
          public.is_admin()
          or lp.created_by = auth.uid()
        )
        and (
          p_batch_id is null
          or exists (
            select 1
            from public.student_batch_members sbm
            join public.student_batches sb on sb.id = sbm.batch_id
            where sbm.profile_id = lp.id
              and sbm.batch_id = p_batch_id
              and (
                public.is_admin()
                or sb.created_by = auth.uid()
              )
          )
        )
        and (
          p_include_linked
          or not exists (
            select 1
            from public.teacher_learner_links tll
            where tll.student_user_id = lp.user_id
              and tll.teacher_user_id = auth.uid()
              and tll.exclude_from_class_analytics = true
          )
        )
      ),
      exam_agg as (
        select
          ea.student_id,
          count(*) filter (
            where ea.submitted_at >= now() - interval '7 days'
          )::integer as count_7d
        from public.exam_attempts ea
        inner join filtered_learners fl on fl.user_id = ea.student_id
        group by ea.student_id
      ),
      practice_agg as (
        select
          pa.student_id,
          count(*) filter (
            where pa.submitted_at >= now() - interval '7 days'
          )::integer as count_7d
        from public.practice_attempts pa
        inner join filtered_learners fl on fl.user_id = pa.student_id
        group by pa.student_id
      ),
      event_agg as (
        select
          sae.user_id,
          count(*) filter (
            where sae.occurred_at >= now() - interval '7 days'
          )::integer as count_7d
        from public.student_activity_events sae
        inner join filtered_learners fl on fl.user_id = sae.user_id
        group by sae.user_id
      )
      select jsonb_agg(row order by (row->>'lastActivityAt') desc nulls last)
      from (
        select jsonb_build_object(
          'userId', fl.user_id,
          'displayName', fl.display_name,
          'email', fl.email,
          'isLinkedLearner', fl.is_linked,
          'lastActivityAt', fl.monitoring_last_seen_at,
          'lastEventType', fl.monitoring_last_event_type,
          'lastEventAt', fl.monitoring_last_event_at,
          'eventsLast7Days', coalesce(ev.count_7d, 0),
          'practiceSessions7Days', coalesce(pa.count_7d, 0),
          'examAttempts7Days', coalesce(ea.count_7d, 0)
        ) as row
        from filtered_learners fl
        left join exam_agg ea on ea.student_id = fl.user_id
        left join practice_agg pa on pa.student_id = fl.user_id
        left join event_agg ev on ev.user_id = fl.user_id
      ) learners
    ),
    '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Efficient batch summary (uses cached last seen)
-- ---------------------------------------------------------------------------
create or replace function public.get_batch_monitoring_summary(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_batch public.student_batches;
  v_member_count integer;
  v_active_today integer;
  v_active_week integer;
  v_inactive integer;
begin
  if p_batch_id is null then
    raise exception 'p_batch_id is required';
  end if;

  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  if not public.can_manage_batch(p_batch_id) then
    raise exception 'Batch not found or access denied';
  end if;

  select sb.*
  into v_batch
  from public.student_batches sb
  where sb.id = p_batch_id;

  select count(*)::integer
  into v_member_count
  from public.student_batch_members sbm
  where sbm.batch_id = p_batch_id;

  with members as (
    select lp.monitoring_last_seen_at as last_activity_at
    from public.student_batch_members sbm
    join public.learner_profiles lp on lp.id = sbm.profile_id
    where sbm.batch_id = p_batch_id
      and (
        public.is_admin()
        or lp.created_by = auth.uid()
      )
      and not exists (
        select 1
        from public.teacher_learner_links tll
        where tll.student_user_id = lp.user_id
          and tll.teacher_user_id = auth.uid()
          and tll.exclude_from_class_analytics = true
      )
  )
  select
    count(*) filter (
      where last_activity_at >= date_trunc('day', now())
    )::integer,
    count(*) filter (
      where last_activity_at >= now() - interval '7 days'
        and last_activity_at < date_trunc('day', now())
    )::integer,
    count(*) filter (
      where last_activity_at is null
        or last_activity_at < now() - interval '7 days'
    )::integer
  into v_active_today, v_active_week, v_inactive
  from members;

  return jsonb_build_object(
    'batchId', v_batch.id,
    'batchName', v_batch.name,
    'memberCount', v_member_count,
    'activeToday', v_active_today,
    'activeThisWeek', v_active_week,
    'inactive', v_inactive
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Merged learner monitoring panel (one round trip for modal)
-- ---------------------------------------------------------------------------
create or replace function public.get_learner_monitoring_panel(
  target_user_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
  v_email text;
  v_assigned integer;
  v_attempted integer;
  v_practice_sessions integer;
  v_batches jsonb;
  v_activity jsonb;
  v_intelligence jsonb;
  v_limit integer;
  v_exam_stats jsonb;
  v_practice_stats jsonb;
  v_top_topics jsonb;
  v_events_7d integer;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  select lp.*
  into v_profile
  from public.learner_profiles lp
  where lp.user_id = target_user_id
    and (
      public.is_admin()
      or lp.created_by = auth.uid()
    )
  limit 1;

  if v_profile.id is null then
    raise exception 'Learner not found or access denied';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));

  select au.email into v_email
  from auth.users au
  where au.id = target_user_id;

  select count(*)::integer into v_assigned
  from public.exam_assignments ea
  where ea.student_id = target_user_id;

  select count(*)::integer into v_attempted
  from public.exam_attempts ea
  where ea.student_id = target_user_id;

  select count(*)::integer into v_practice_sessions
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', sb.id, 'name', sb.name)
      order by sb.name
    ),
    '[]'::jsonb
  )
  into v_batches
  from public.student_batch_members sbm
  join public.student_batches sb on sb.id = sbm.batch_id
  where sbm.profile_id = v_profile.id
    and (
      public.is_admin()
      or sb.created_by = auth.uid()
    );

  select coalesce(
    (
      select jsonb_agg(row order by row->>'occurredAt' desc)
      from (
        select jsonb_build_object(
          'id', sae.id,
          'eventType', sae.event_type,
          'resourceType', sae.resource_type,
          'resourceId', sae.resource_id,
          'metadata', sae.metadata,
          'pagePath', sae.page_path,
          'occurredAt', sae.occurred_at
        ) as row
        from public.student_activity_events sae
        where sae.user_id = target_user_id
        order by sae.occurred_at desc
        limit v_limit
      ) events
    ),
    '[]'::jsonb
  )
  into v_activity;

  select jsonb_build_object(
    'total', count(*)::integer,
    'avgScore', round(avg(ea.score)::numeric, 1),
    'recent', coalesce(
      (
        select jsonb_agg(row order by row->>'submittedAt' desc)
        from (
          select jsonb_build_object(
            'examId', ea.exam_id,
            'score', ea.score,
            'questionCount', ea.question_count,
            'timeTaken', ea.time_taken,
            'submittedAt', ea.submitted_at
          ) as row
          from public.exam_attempts ea
          where ea.student_id = target_user_id
          order by ea.submitted_at desc
          limit 5
        ) recent_exams
      ),
      '[]'::jsonb
    )
  )
  into v_exam_stats
  from public.exam_attempts ea
  where ea.student_id = target_user_id;

  if v_exam_stats is null then
    v_exam_stats := jsonb_build_object('total', 0, 'avgScore', null, 'recent', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'total', count(*)::integer,
    'avgScore', round(avg(pa.score)::numeric, 1),
    'recent', coalesce(
      (
        select jsonb_agg(row order by row->>'submittedAt' desc)
        from (
          select jsonb_build_object(
            'topicId', pa.topic_id,
            'topicName', pa.topic_name,
            'score', pa.score,
            'questionCount', pa.question_count,
            'timeTaken', pa.time_taken,
            'submittedAt', pa.submitted_at
          ) as row
          from public.practice_attempts pa
          where pa.student_id = target_user_id
          order by pa.submitted_at desc
          limit 5
        ) recent_practice
      ),
      '[]'::jsonb
    )
  )
  into v_practice_stats
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  if v_practice_stats is null then
    v_practice_stats := jsonb_build_object('total', 0, 'avgScore', null, 'recent', '[]'::jsonb);
  end if;

  select coalesce(
    (
      select jsonb_agg(row order by (row->>'sessionCount')::integer desc)
      from (
        select jsonb_build_object(
          'topicName', coalesce(pa.topic_name, 'Unknown topic'),
          'sessionCount', count(*)::integer,
          'avgScore', round(avg(pa.score)::numeric, 1)
        ) as row
        from public.practice_attempts pa
        where pa.student_id = target_user_id
        group by coalesce(pa.topic_name, 'Unknown topic')
        order by count(*) desc
        limit 5
      ) topics
    ),
    '[]'::jsonb
  )
  into v_top_topics;

  select count(*)::integer
  into v_events_7d
  from public.student_activity_events sae
  where sae.user_id = target_user_id
    and sae.occurred_at >= now() - interval '7 days';

  v_intelligence := jsonb_build_object(
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'isLinkedLearner', exists (
      select 1
      from public.teacher_learner_links tll
      where tll.student_user_id = target_user_id
        and tll.teacher_user_id = auth.uid()
    ),
    'examStats', v_exam_stats,
    'practiceStats', v_practice_stats,
    'topPracticeTopics', v_top_topics,
    'eventsLast7Days', v_events_7d
  );

  return jsonb_build_object(
    'details', jsonb_build_object(
      'id', v_profile.id,
      'userId', v_profile.user_id,
      'displayName', v_profile.display_name,
      'email', v_email,
      'createdAt', v_profile.created_at,
      'examsAssigned', v_assigned,
      'examsAttempted', v_attempted,
      'practiceSessions', v_practice_sessions,
      'lastActivityAt', v_profile.monitoring_last_seen_at,
      'batchMemberships', v_batches
    ),
    'activityFeed', v_activity,
    'intelligence', v_intelligence
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) get_learner_details uses cached last seen
-- ---------------------------------------------------------------------------
create or replace function public.get_learner_details(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
  v_email text;
  v_assigned integer;
  v_attempted integer;
  v_practice_sessions integer;
  v_batches jsonb;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  select lp.*
  into v_profile
  from public.learner_profiles lp
  where lp.user_id = target_user_id
    and (
      public.is_admin()
      or lp.created_by = auth.uid()
    )
  limit 1;

  if v_profile.id is null then
    raise exception 'Learner not found or access denied';
  end if;

  select au.email into v_email
  from auth.users au
  where au.id = target_user_id;

  select count(*)::integer into v_assigned
  from public.exam_assignments ea
  where ea.student_id = target_user_id;

  select count(*)::integer into v_attempted
  from public.exam_attempts ea
  where ea.student_id = target_user_id;

  select count(*)::integer into v_practice_sessions
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', sb.id, 'name', sb.name)
      order by sb.name
    ),
    '[]'::jsonb
  )
  into v_batches
  from public.student_batch_members sbm
  join public.student_batches sb on sb.id = sbm.batch_id
  where sbm.profile_id = v_profile.id
    and (
      public.is_admin()
      or sb.created_by = auth.uid()
    );

  return jsonb_build_object(
    'id', v_profile.id,
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'email', v_email,
    'createdAt', v_profile.created_at,
    'examsAssigned', v_assigned,
    'examsAttempted', v_attempted,
    'practiceSessions', v_practice_sessions,
    'lastActivityAt', v_profile.monitoring_last_seen_at,
    'batchMemberships', v_batches
  );
end;
$$;

grant execute on function public.log_student_activity_batch(jsonb) to authenticated;
grant execute on function public.get_learner_monitoring_panel(uuid, integer) to authenticated;
