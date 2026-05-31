-- Batch detail: resolve created_by to human-readable display name.

create or replace function public.resolve_user_display_name(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text;
  v_meta_name text;
  v_profile_name text;
begin
  if p_user_id is null then
    return 'Teacher';
  end if;

  select nullif(trim(lp.display_name), '')
  into v_profile_name
  from public.learner_profiles lp
  where lp.user_id = p_user_id
  limit 1;

  if v_profile_name is not null then
    return v_profile_name;
  end if;

  select
    au.email,
    coalesce(
      nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(au.raw_user_meta_data->>'name'), '')
    )
  into v_email, v_meta_name
  from auth.users au
  where au.id = p_user_id;

  return coalesce(v_meta_name, v_email, 'Teacher');
end;
$$;

create or replace function public.get_batch_details(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_batch public.student_batches;
  v_members jsonb;
  v_member_count integer;
  v_created_by_display text;
begin
  if p_batch_id is null then
    raise exception 'batch_id is required';
  end if;

  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  select sb.*
  into v_batch
  from public.student_batches sb
  where sb.id = p_batch_id
    and (
      public.is_admin()
      or sb.created_by = auth.uid()
    )
  limit 1;

  if v_batch.id is null then
    raise exception 'Batch not found or access denied';
  end if;

  v_created_by_display := public.resolve_user_display_name(v_batch.created_by);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'membershipId', sbm.id,
        'profileId', lp.id,
        'userId', lp.user_id,
        'displayName', lp.display_name,
        'email', au.email,
        'addedAt', sbm.added_at
      )
      order by lp.display_name
    ),
    '[]'::jsonb
  )
  into v_members
  from public.student_batch_members sbm
  join public.learner_profiles lp on lp.id = sbm.profile_id
  left join auth.users au on au.id = lp.user_id
  where sbm.batch_id = p_batch_id;

  select count(*)::integer
  into v_member_count
  from public.student_batch_members sbm
  where sbm.batch_id = p_batch_id;

  return jsonb_build_object(
    'id', v_batch.id,
    'name', v_batch.name,
    'description', v_batch.description,
    'createdBy', v_batch.created_by,
    'createdByDisplay', v_created_by_display,
    'createdAt', v_batch.created_at,
    'updatedAt', v_batch.updated_at,
    'memberCount', v_member_count,
    'members', v_members
  );
end;
$$;

grant execute on function public.resolve_user_display_name(uuid) to authenticated;
