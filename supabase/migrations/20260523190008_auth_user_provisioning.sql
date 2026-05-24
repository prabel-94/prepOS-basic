-- PrepOS auth → public.users automatic provisioning
-- Canonical authorization remains public.users.role (not JWT metadata).

-- ---------------------------------------------------------------------------
-- 1) Ensure public.users exists with expected constraints
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key,
  role text check (role in ('student', 'teacher', 'admin')),
  created_at timestamp without time zone default now()
);

alter table public.users
  alter column role set default 'student';

-- ---------------------------------------------------------------------------
-- 2) FK to auth.users (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
exception
  when others then
    raise notice 'users_id_fkey not added: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Provisioning trigger function (exact implementation)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, role)
  values (new.id, 'student')
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Trigger on auth.users (idempotent)
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5) Auth admin can execute trigger function
-- ---------------------------------------------------------------------------
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 6) Admin role promotion (RLS UPDATE; SELECT policy already exists)
-- ---------------------------------------------------------------------------
drop policy if exists "users_update_admin" on public.users;

create policy "users_update_admin"
on public.users
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7) Backfill auth users missing public.users profiles
-- ---------------------------------------------------------------------------
insert into public.users (id, role)
select au.id, 'student'
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8) Preserve existing admin roles (never downgrade on replay)
-- ---------------------------------------------------------------------------
update public.users u
set role = 'admin'
from auth.users au
where u.id = au.id
  and au.email = 'prabelsurendran@gmail.com'
  and u.role is distinct from 'admin';
