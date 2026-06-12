-- Update Malayalam assistance metadata on an existing bank question (no English fork).

create or replace function public.update_question_assistance_malayalam(
  p_actor_id uuid,
  p_question_id uuid,
  p_malayalam jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  has_content boolean := false;
  assistance_value jsonb;
begin
  select role
  into actor_role
  from public.users
  where id = p_actor_id;

  if actor_role not in ('teacher', 'admin') then
    raise exception 'Only teachers and admins can update question assistance';
  end if;

  if p_question_id is null then
    raise exception 'Question id is required';
  end if;

  if not exists (
    select 1
    from public.questions
    where id = p_question_id
  ) then
    raise exception 'Question not found';
  end if;

  if p_malayalam is not null and p_malayalam <> 'null'::jsonb then
    has_content :=
      coalesce(nullif(trim(p_malayalam->>'text'), ''), '') <> ''
      or coalesce(nullif(trim(p_malayalam->>'explanation'), ''), '') <> ''
      or coalesce(nullif(trim(p_malayalam->'options'->>'A'), ''), '') <> ''
      or coalesce(nullif(trim(p_malayalam->'options'->>'B'), ''), '') <> ''
      or coalesce(nullif(trim(p_malayalam->'options'->>'C'), ''), '') <> ''
      or coalesce(nullif(trim(p_malayalam->'options'->>'D'), ''), '') <> '';
  end if;

  if has_content then
    assistance_value := jsonb_build_object(
      'text', coalesce(p_malayalam->>'text', ''),
      'options', jsonb_build_object(
        'A', coalesce(p_malayalam->'options'->>'A', ''),
        'B', coalesce(p_malayalam->'options'->>'B', ''),
        'C', coalesce(p_malayalam->'options'->>'C', ''),
        'D', coalesce(p_malayalam->'options'->>'D', '')
      ),
      'explanation', coalesce(p_malayalam->>'explanation', '')
    );

    insert into public.question_metadata (question_id, key, value)
    values (p_question_id, 'assistance_malayalam', assistance_value)
    on conflict (question_id, key)
    do update set value = excluded.value;
  else
    delete from public.question_metadata
    where question_id = p_question_id
      and key = 'assistance_malayalam';
  end if;

  return jsonb_build_object(
    'success', true,
    'questionId', p_question_id
  );
end;
$$;
