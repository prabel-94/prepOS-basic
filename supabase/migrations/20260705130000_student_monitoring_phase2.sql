-- Phase 2: batch-scoped monitoring, linked-learner exclusion, learner intelligence, retention.

-- Drop zero-arg overload so clients use the parameterized version.
drop function if exists public.get_teacher_monitoring_overview();

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
      select jsonb_agg(row order by (row->>'lastActivityAt') desc nulls last)
      from (
        select jsonb_build_object(
          'userId', lp.user_id,
          'displayName', lp.display_name,
          'email', au.email,
          'isLinkedLearner', exists (
            select 1
            from public.teacher_learner_links tll
            where tll.student_user_id = lp.user_id
              and tll.teacher_user_id = auth.uid()
          ),
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
      ) learners
    ),
    '[]'::jsonb
  );
end;
$$;

-- Batch-level monitoring summary cards.
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
    select lp.user_id
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
  ),
  activity as (
    select
      m.user_id,
      greatest(
        (select max(ea.submitted_at) from public.exam_attempts ea where ea.student_id = m.user_id),
        (select max(pa.submitted_at) from public.practice_attempts pa where pa.student_id = m.user_id),
        (select max(sae.occurred_at) from public.student_activity_events sae where sae.user_id = m.user_id)
      ) as last_activity_at
    from members m
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
  from activity;

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

-- Per-learner intelligence summary for teacher monitoring modal.
create or replace function public.get_learner_monitoring_intelligence(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
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

  return jsonb_build_object(
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
end;
$$;

-- Admin retention helper for activity events (default 90 days).
create or replace function public.purge_old_student_activity_events(
  p_retention_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
  v_days integer;
begin
  if not public.is_admin() then
    raise exception 'Access denied';
  end if;

  v_days := greatest(coalesce(p_retention_days, 90), 7);

  delete from public.student_activity_events
  where occurred_at < now() - make_interval(days => v_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.get_teacher_monitoring_overview(uuid, boolean) to authenticated;
grant execute on function public.get_batch_monitoring_summary(uuid) to authenticated;
grant execute on function public.get_learner_monitoring_intelligence(uuid) to authenticated;
grant execute on function public.purge_old_student_activity_events(integer) to authenticated;
