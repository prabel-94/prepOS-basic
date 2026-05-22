-- Allow anonymous students to open shareable exam links (exam.html?id=...).
-- Authenticated access remains governed by exam_sessions_select_visible.
-- UUID acts as the capability token for public take flows.

drop policy if exists "exam_sessions_select_public_take" on public.exam_sessions;
create policy "exam_sessions_select_public_take"
on public.exam_sessions
for select
to anon
using (true);
