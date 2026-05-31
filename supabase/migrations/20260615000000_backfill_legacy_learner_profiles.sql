-- One-time backfill: legacy student accounts predating learner_profiles.
-- Does NOT modify auth.users, public.users, roles, or exam tables.

insert into public.learner_profiles (user_id, display_name, created_by)
values
  (
    '146f3ada-6997-40d7-b15f-d040b393ddd3'::uuid,
    'Kenway',
    'cf11149c-01bf-4cf2-b36e-4a1df8bc1716'::uuid
  ),
  (
    '9154578d-372b-4b00-8448-18e871107c0e'::uuid,
    'Kichi',
    'cf11149c-01bf-4cf2-b36e-4a1df8bc1716'::uuid
  )
on conflict (user_id) do nothing;
