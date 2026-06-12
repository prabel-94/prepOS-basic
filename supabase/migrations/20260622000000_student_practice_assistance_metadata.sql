-- Students: read Malayalam assistance metadata for question bank practice only.
-- Other question_metadata keys remain staff-only.

drop policy if exists "question_metadata_read_student_assistance" on public.question_metadata;

create policy "question_metadata_read_student_assistance"
on public.question_metadata
for select
to authenticated
using (
  public.current_user_role() = 'student'
  and key = 'assistance_malayalam'
);
