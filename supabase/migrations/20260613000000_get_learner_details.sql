-- Phase 3.5 — learner detail view RPC (teacher/admin, lightweight counts)

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

  return jsonb_build_object(
    'id', v_profile.id,
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'email', v_email,
    'createdAt', v_profile.created_at,
    'examsAssigned', v_assigned,
    'examsAttempted', v_attempted
  );
end;
$$;

grant execute on function public.get_learner_details(uuid) to authenticated;
