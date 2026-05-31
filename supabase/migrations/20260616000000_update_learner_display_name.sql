-- Allow teachers/admins to update learner_profiles.display_name only.
-- Ownership rules match get_learner_profile / create_learner_profile.

create or replace function public.update_learner_display_name(
  p_user_id uuid,
  p_display_name text
)
returns public.learner_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.learner_profiles;
  v_name text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  v_name := nullif(trim(p_display_name), '');

  if v_name is null then
    raise exception 'display_name is required';
  end if;

  update public.learner_profiles lp
  set display_name = v_name
  where lp.user_id = p_user_id
    and (
      public.is_admin()
      or lp.created_by = auth.uid()
    )
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Learner not found or access denied';
  end if;

  return v_profile;
end;
$$;

grant execute on function public.update_learner_display_name(uuid, text) to authenticated;
