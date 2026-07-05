-- Student activity monitoring — append-only event log for beta teacher visibility.
-- Teachers read via security-definer RPCs; students insert via log_student_activity().

create table if not exists public.student_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  page_path text,
  device_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists student_activity_events_user_occurred_idx
  on public.student_activity_events(user_id, occurred_at desc);

create index if not exists student_activity_events_type_idx
  on public.student_activity_events(event_type);

alter table public.student_activity_events enable row level security;

-- No direct client access — all writes go through log_student_activity().
revoke all on table public.student_activity_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- log_student_activity — student / linked-teacher student-mode writes
-- ---------------------------------------------------------------------------
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
    device_id
  )
  values (
    v_user_id,
    btrim(p_event_type),
    nullif(btrim(p_resource_type), ''),
    p_resource_id,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(btrim(p_page_path), ''),
    nullif(btrim(p_device_id), '')
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_learner_activity_feed — per-student timeline for teachers
-- ---------------------------------------------------------------------------
create or replace function public.get_learner_activity_feed(
  target_user_id uuid,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
  v_limit integer;
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

  v_limit := greatest(1, least(coalesce(p_limit, 30), 100));

  return coalesce(
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
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_teacher_monitoring_overview — roster activity summary for beta
-- ---------------------------------------------------------------------------
create or replace function public.get_teacher_monitoring_overview()
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

  return coalesce(
    (
      select jsonb_agg(row order by (row->>'lastActivityAt') desc nulls last)
      from (
        select jsonb_build_object(
          'userId', lp.user_id,
          'displayName', lp.display_name,
          'email', au.email,
          'lastActivityAt', greatest(
            (select max(ea.submitted_at)
             from public.exam_attempts ea
             where ea.student_id = lp.user_id),
            (select max(pa.submitted_at)
             from public.practice_attempts pa
             where pa.student_id = lp.user_id),
            (select max(sae.occurred_at)
             from public.student_activity_events sae
             where sae.user_id = lp.user_id)
          ),
          'lastEventType', (
            select sae.event_type
            from public.student_activity_events sae
            where sae.user_id = lp.user_id
            order by sae.occurred_at desc
            limit 1
          ),
          'lastEventAt', (
            select sae.occurred_at
            from public.student_activity_events sae
            where sae.user_id = lp.user_id
            order by sae.occurred_at desc
            limit 1
          ),
          'eventsLast7Days', (
            select count(*)::integer
            from public.student_activity_events sae
            where sae.user_id = lp.user_id
              and sae.occurred_at >= now() - interval '7 days'
          ),
          'practiceSessions7Days', (
            select count(*)::integer
            from public.practice_attempts pa
            where pa.student_id = lp.user_id
              and pa.submitted_at >= now() - interval '7 days'
          ),
          'examAttempts7Days', (
            select count(*)::integer
            from public.exam_attempts ea
            where ea.student_id = lp.user_id
              and ea.submitted_at >= now() - interval '7 days'
          )
        ) as row
        from public.learner_profiles lp
        join auth.users au on au.id = lp.user_id
        where public.is_admin()
          or lp.created_by = auth.uid()
      ) learners
    ),
    '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend get_learner_details — practice counts + true lastActivityAt
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
  v_last_activity timestamptz;
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

  select au.email
  into v_email
  from auth.users au
  where au.id = target_user_id;

  select count(*)::integer
  into v_assigned
  from public.exam_assignments ea
  where ea.student_id = target_user_id;

  select count(*)::integer
  into v_attempted
  from public.exam_attempts ea
  where ea.student_id = target_user_id;

  select count(*)::integer
  into v_practice_sessions
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  select greatest(
    (select max(ea.submitted_at)
     from public.exam_attempts ea
     where ea.student_id = target_user_id),
    (select max(pa.submitted_at)
     from public.practice_attempts pa
     where pa.student_id = target_user_id),
    (select max(sae.occurred_at)
     from public.student_activity_events sae
     where sae.user_id = target_user_id)
  )
  into v_last_activity;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sb.id,
        'name', sb.name
      )
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
    'lastActivityAt', v_last_activity,
    'batchMemberships', v_batches
  );
end;
$$;

grant execute on function public.log_student_activity(text, text, uuid, jsonb, text, text) to authenticated;
grant execute on function public.get_learner_activity_feed(uuid, integer) to authenticated;
grant execute on function public.get_teacher_monitoring_overview() to authenticated;
grant execute on function public.get_learner_details(uuid) to authenticated;
