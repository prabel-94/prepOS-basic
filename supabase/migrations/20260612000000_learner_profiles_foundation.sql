-- PrepOS canonical learner identity layer (additive).
-- Does NOT modify auth.users, public.users roles, or exam tables.

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
create table if not exists public.learner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  display_name text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_profiles_display_name_not_empty
    check (char_length(trim(display_name)) > 0)
);

create index if not exists learner_profiles_created_by_idx
  on public.learner_profiles (created_by);

-- ---------------------------------------------------------------------------
-- 2) updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_learner_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists learner_profiles_set_updated_at on public.learner_profiles;

create trigger learner_profiles_set_updated_at
  before update on public.learner_profiles
  for each row
  execute function public.set_learner_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.learner_profiles enable row level security;

drop policy if exists learner_profiles_select on public.learner_profiles;
create policy learner_profiles_select
  on public.learner_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (
      public.is_teacher_or_admin()
      and created_by = auth.uid()
    )
  );

drop policy if exists learner_profiles_insert_teacher_or_admin on public.learner_profiles;
create policy learner_profiles_insert_teacher_or_admin
  on public.learner_profiles
  for insert
  to authenticated
  with check (
    public.is_teacher_or_admin()
    and created_by = auth.uid()
    and exists (
      select 1
      from public.users u
      where u.id = user_id
        and u.role = 'student'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Helpers (RPC)
-- ---------------------------------------------------------------------------
create or replace function public.get_learner_profile(p_user_id uuid)
returns public.learner_profiles
language sql
security definer
set search_path = public
stable
as $$
  select lp.*
  from public.learner_profiles lp
  where lp.user_id = p_user_id
    and (
      lp.user_id = auth.uid()
      or public.is_admin()
      or (
        public.is_teacher_or_admin()
        and lp.created_by = auth.uid()
      )
    )
  limit 1;
$$;

create or replace function public.create_learner_profile(
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
  v_actor_role text;
  v_target_role text;
  v_name text;
begin
  v_actor_role := public.current_user_role();

  if v_actor_role not in ('teacher', 'admin') then
    raise exception 'Only teachers and admins can create learner profiles';
  end if;

  v_name := nullif(trim(p_display_name), '');

  if v_name is null then
    raise exception 'display_name is required';
  end if;

  select u.role
  into v_target_role
  from public.users u
  where u.id = p_user_id;

  if v_target_role is null then
    raise exception 'User not found';
  end if;

  if v_target_role <> 'student' then
    raise exception 'Learner profiles can only be created for student users';
  end if;

  insert into public.learner_profiles (user_id, display_name, created_by)
  values (p_user_id, v_name, auth.uid())
  returning * into v_profile;

  return v_profile;
exception
  when unique_violation then
    raise exception 'A learner profile already exists for this user';
end;
$$;

grant select on table public.learner_profiles to authenticated;
grant execute on function public.get_learner_profile(uuid) to authenticated;
grant execute on function public.create_learner_profile(uuid, text) to authenticated;
