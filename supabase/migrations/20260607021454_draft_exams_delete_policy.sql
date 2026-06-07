-- Allow teachers/admins to delete drafts they own (client-side draft cleanup).
-- Bulk "clear memory" still filters status <> 'question_set' in application code.

drop policy if exists "draft_exams_delete_owned_by_staff" on public.draft_exams;

create policy "draft_exams_delete_owned_by_staff"
on public.draft_exams
for delete
to authenticated
using (
  public.is_admin()
  or (public.is_teacher_or_admin() and created_by = auth.uid())
);
