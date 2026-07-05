-- PrepOS User Preferences — lightweight JSONB store per user.
-- Single row per user; schema-flexible blob avoids migrations for new prefs.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users read own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "Users insert own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users update own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Upsert helper (merge new keys into existing blob)
create or replace function public.upsert_user_preferences(
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  insert into public.user_preferences (user_id, preferences, updated_at)
  values (auth.uid(), p_preferences, now())
  on conflict (user_id) do update
    set preferences = public.user_preferences.preferences || excluded.preferences,
        updated_at = now()
  returning preferences into result;

  return result;
end;
$$;
