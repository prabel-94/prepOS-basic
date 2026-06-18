-- Custom section definitions per language variant (Phase 2).
alter table public.note_variants
  add column if not exists section_extensions jsonb not null default '[]'::jsonb;

comment on column public.note_variants.section_extensions is
  'Array of SectionDefinition objects (source=custom) for this variant. Builtin MSMDF sections are not duplicated here.';
