-- Allow authenticated students to read question bank data for practice mode.
-- Teachers/admins already have staff read policies on these tables.

drop policy if exists "questions_read_student_practice" on public.questions;
create policy "questions_read_student_practice"
on public.questions
for select
to authenticated
using (public.current_user_role() = 'student');

drop policy if exists "question_topics_read_student_practice" on public.question_topics;
create policy "question_topics_read_student_practice"
on public.question_topics
for select
to authenticated
using (public.current_user_role() = 'student');

drop policy if exists "topics_read_student_practice" on public.topics;
create policy "topics_read_student_practice"
on public.topics
for select
to authenticated
using (public.current_user_role() = 'student');
