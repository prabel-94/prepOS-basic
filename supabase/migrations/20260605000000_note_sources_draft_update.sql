-- Allow teachers to update note_sources.raw_markdown during draft refinement.
-- Published workflow still regenerates blocks from source; immutability is pedagogical, not append-only.

drop policy if exists "note_sources_update_via_note" on public.note_sources;
create policy "note_sources_update_via_note"
on public.note_sources
for update
to authenticated
using (public.can_write_note(note_id))
with check (public.can_write_note(note_id));
