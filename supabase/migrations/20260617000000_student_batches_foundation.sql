-- PrepOS student batch management (teacher organization layer).
-- Builds on learner_profiles; does NOT modify auth, roles, or exam tables.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
create table if not exists public.student_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_batches_name_not_empty
    check (char_length(trim(name)) > 0)
);

create unique index if not exists student_batches_created_by_name_idx
  on public.student_batches (created_by, lower(trim(name)));

create index if not exists student_batches_created_by_idx
  on public.student_batches (created_by);

create table if not exists public.student_batch_members (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.student_batches (id) on delete cascade,
  profile_id uuid not null references public.learner_profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint student_batch_members_batch_profile_unique
    unique (batch_id, profile_id)
);

create index if not exists student_batch_members_batch_id_idx
  on public.student_batch_members (batch_id);

create index if not exists student_batch_members_profile_id_idx
  on public.student_batch_members (profile_id);

-- ---------------------------------------------------------------------------
-- 2) updated_at trigger (student_batches)
-- ---------------------------------------------------------------------------
create or replace function public.set_student_batches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_batches_set_updated_at on public.student_batches;

create trigger student_batches_set_updated_at
  before update on public.student_batches
  for each row
  execute function public.set_student_batches_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.student_batches enable row level security;
alter table public.student_batch_members enable row level security;

drop policy if exists student_batches_select on public.student_batches;
create policy student_batches_select
  on public.student_batches
  for select
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher_or_admin()
      and created_by = auth.uid()
    )
  );

drop policy if exists student_batches_insert on public.student_batches;
create policy student_batches_insert
  on public.student_batches
  for insert
  to authenticated
  with check (
    public.is_teacher_or_admin()
    and created_by = auth.uid()
  );

drop policy if exists student_batches_update on public.student_batches;
create policy student_batches_update
  on public.student_batches
  for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher_or_admin()
      and created_by = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_teacher_or_admin()
      and created_by = auth.uid()
    )
  );

drop policy if exists student_batches_delete on public.student_batches;
create policy student_batches_delete
  on public.student_batches
  for delete
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher_or_admin()
      and created_by = auth.uid()
    )
  );

drop policy if exists student_batch_members_select on public.student_batch_members;
create policy student_batch_members_select
  on public.student_batch_members
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.student_batches sb
      where sb.id = student_batch_members.batch_id
        and sb.created_by = auth.uid()
    )
  );

drop policy if exists student_batch_members_insert on public.student_batch_members;
create policy student_batch_members_insert
  on public.student_batch_members
  for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.student_batches sb
      where sb.id = student_batch_members.batch_id
        and sb.created_by = auth.uid()
    )
  );

drop policy if exists student_batch_members_delete on public.student_batch_members;
create policy student_batch_members_delete
  on public.student_batch_members
  for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.student_batches sb
      where sb.id = student_batch_members.batch_id
        and sb.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_batch(p_batch_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_batches sb
    where sb.id = p_batch_id
      and (
        public.is_admin()
        or sb.created_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_learner_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.learner_profiles lp
    where lp.id = p_profile_id
      and (
        public.is_admin()
        or lp.created_by = auth.uid()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5) RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_batch(
  p_name text,
  p_description text default null
)
returns public.student_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.student_batches;
  v_name text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  v_name := nullif(trim(p_name), '');

  if v_name is null then
    raise exception 'Batch name is required';
  end if;

  insert into public.student_batches (name, description, created_by)
  values (v_name, nullif(trim(p_description), ''), auth.uid())
  returning * into v_batch;

  return v_batch;
exception
  when unique_violation then
    raise exception 'A batch with this name already exists';
end;
$$;

create or replace function public.list_batches()
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
      select jsonb_agg(
        jsonb_build_object(
          'id', sb.id,
          'name', sb.name,
          'description', sb.description,
          'createdBy', sb.created_by,
          'createdAt', sb.created_at,
          'updatedAt', sb.updated_at,
          'memberCount', coalesce(mc.cnt, 0)
        )
        order by sb.created_at desc
      )
      from public.student_batches sb
      left join lateral (
        select count(*)::integer as cnt
        from public.student_batch_members sbm
        where sbm.batch_id = sb.id
      ) mc on true
      where public.is_admin()
        or sb.created_by = auth.uid()
    ),
    '[]'::jsonb
  );
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
    'createdAt', v_batch.created_at,
    'updatedAt', v_batch.updated_at,
    'memberCount', v_member_count,
    'members', v_members
  );
end;
$$;

create or replace function public.update_batch(
  p_batch_id uuid,
  p_name text,
  p_description text default null
)
returns public.student_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.student_batches;
  v_name text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  v_name := nullif(trim(p_name), '');

  if v_name is null then
    raise exception 'Batch name is required';
  end if;

  update public.student_batches sb
  set
    name = v_name,
    description = nullif(trim(p_description), '')
  where sb.id = p_batch_id
    and (
      public.is_admin()
      or sb.created_by = auth.uid()
    )
  returning * into v_batch;

  if v_batch.id is null then
    raise exception 'Batch not found or access denied';
  end if;

  return v_batch;
exception
  when unique_violation then
    raise exception 'A batch with this name already exists';
end;
$$;

create or replace function public.delete_batch(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  delete from public.student_batches sb
  where sb.id = p_batch_id
    and (
      public.is_admin()
      or sb.created_by = auth.uid()
    )
  returning sb.id into v_deleted;

  if v_deleted is null then
    raise exception 'Batch not found or access denied';
  end if;

  return true;
end;
$$;

create or replace function public.add_batch_members(
  p_batch_id uuid,
  p_profile_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_added integer := 0;
  v_skipped integer := 0;
  v_row_count integer;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  if p_batch_id is null then
    raise exception 'batch_id is required';
  end if;

  if p_profile_ids is null or array_length(p_profile_ids, 1) is null then
    raise exception 'At least one profile_id is required';
  end if;

  if not public.can_manage_batch(p_batch_id) then
    raise exception 'Batch not found or access denied';
  end if;

  foreach v_profile_id in array p_profile_ids
  loop
    if not public.can_manage_learner_profile(v_profile_id) then
      raise exception 'Cannot add a learner you do not manage';
    end if;

    insert into public.student_batch_members (batch_id, profile_id)
    values (p_batch_id, v_profile_id)
    on conflict (batch_id, profile_id) do nothing;

    get diagnostics v_row_count = row_count;

    if v_row_count > 0 then
      v_added := v_added + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'added', v_added,
    'skipped', v_skipped
  );
end;
$$;

create or replace function public.remove_batch_member(
  p_batch_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Access denied';
  end if;

  if p_batch_id is null or p_profile_id is null then
    raise exception 'batch_id and profile_id are required';
  end if;

  if not public.can_manage_batch(p_batch_id) then
    raise exception 'Batch not found or access denied';
  end if;

  delete from public.student_batch_members sbm
  where sbm.batch_id = p_batch_id
    and sbm.profile_id = p_profile_id
  returning sbm.id into v_deleted;

  if v_deleted is null then
    raise exception 'Member not found in this batch';
  end if;

  return true;
end;
$$;

create or replace function public.list_managed_learner_profiles()
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
      select jsonb_agg(
        jsonb_build_object(
          'profileId', lp.id,
          'userId', lp.user_id,
          'displayName', lp.display_name,
          'email', au.email
        )
        order by lp.display_name
      )
      from public.learner_profiles lp
      left join auth.users au on au.id = lp.user_id
      where public.is_admin()
        or lp.created_by = auth.uid()
    ),
    '[]'::jsonb
  );
end;
$$;

-- Extend learner details with read-only batch membership
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

  select max(ea.submitted_at)
  into v_last_activity
  from public.exam_attempts ea
  where ea.student_id = target_user_id;

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
    'lastActivityAt', v_last_activity,
    'batchMemberships', v_batches
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------
grant select on table public.student_batches to authenticated;
grant select on table public.student_batch_members to authenticated;

grant execute on function public.can_manage_batch(uuid) to authenticated;
grant execute on function public.can_manage_learner_profile(uuid) to authenticated;
grant execute on function public.create_batch(text, text) to authenticated;
grant execute on function public.list_batches() to authenticated;
grant execute on function public.get_batch_details(uuid) to authenticated;
grant execute on function public.update_batch(uuid, text, text) to authenticated;
grant execute on function public.delete_batch(uuid) to authenticated;
grant execute on function public.add_batch_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_batch_member(uuid, uuid) to authenticated;
grant execute on function public.list_managed_learner_profiles() to authenticated;
