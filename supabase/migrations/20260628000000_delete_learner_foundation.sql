-- Delete learner: impact preview RPC + shared ownership helper.

create or replace function public.get_managed_learner_profile(p_user_id uuid)
returns public.learner_profiles
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  select lp.*
  into v_profile
  from public.learner_profiles lp
  where lp.user_id = p_user_id
    and (
      public.is_admin()
      or lp.created_by = auth.uid()
    )
  limit 1;

  if v_profile.id is null then
    raise exception 'Learner not found or access denied';
  end if;

  return v_profile;
end;
$$;

create or replace function public.get_learner_deletion_impact(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
  v_role text;
  v_email text;
  v_assigned integer;
  v_attempted integer;
  v_practice integer;
  v_question_stats integer;
  v_batches jsonb;
  v_is_linked boolean;
  v_link_teacher uuid;
  v_warnings jsonb := '[]'::jsonb;
begin
  v_profile := public.get_managed_learner_profile(target_user_id);

  select u.role
  into v_role
  from public.users u
  where u.id = target_user_id;

  if v_role is null then
    raise exception 'User not found';
  end if;

  if v_role <> 'student' then
    raise exception 'Only student accounts can be deleted';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot delete your own account here';
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
  into v_practice
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  select count(*)::integer
  into v_question_stats
  from public.user_question_stats uqs
  where uqs.user_id = target_user_id;

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

  v_is_linked := false;
  v_link_teacher := null;

  select
    true,
    tll.teacher_user_id
  into v_is_linked, v_link_teacher
  from public.teacher_learner_links tll
  where tll.student_user_id = target_user_id
    and tll.is_active = true
  limit 1;

  if coalesce(v_is_linked, false) then
    v_warnings := v_warnings || jsonb_build_array(
      'This is a linked learning account. You can create a new one from Teacher Home after deletion.'
    );
  end if;

  v_warnings := v_warnings || jsonb_build_array(
    'This permanently removes login access and all learning data for this student.'
  );

  return jsonb_build_object(
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'email', v_email,
    'isLinkedLearner', coalesce(v_is_linked, false),
    'linkedTeacherUserId', v_link_teacher,
    'examAssignments', v_assigned,
    'examAttempts', v_attempted,
    'practiceAttempts', v_practice,
    'questionStats', v_question_stats,
    'batchMemberships', v_batches,
    'warnings', v_warnings
  );
end;
$$;

grant execute on function public.get_managed_learner_profile(uuid) to authenticated;
grant execute on function public.get_learner_deletion_impact(uuid) to authenticated;
