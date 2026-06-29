-- Richer practice analytics in learner deletion impact preview.
-- practice_attempts rows are completed bank *sessions*, not per-question counts.

create or replace function public.get_learner_deletion_impact(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile public.learner_profiles;
  v_role text;
  v_email text;
  v_assigned integer;
  v_attempted integer;
  v_practice_sessions integer;
  v_practice_questions_in_sessions integer;
  v_bank_questions_tracked integer;
  v_bank_question_answers integer;
  v_lexicon_words_tracked integer;
  v_batches jsonb;
  v_is_linked boolean;
  v_link_teacher uuid;
  v_warnings jsonb := '[]'::jsonb;
begin
  v_profile := public.get_managed_learner_profile(target_user_id);

  select u.role
  into v_role
  from public.users u
  where u.id = target_user_id;

  if v_role is null then
    raise exception 'User not found';
  end if;

  if v_role <> 'student' then
    raise exception 'Only student accounts can be deleted';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot delete your own account here';
  end if;

  select au.email
  into v_email
  from auth.users au
  where au.id = target_user_id;

  select count(*)::integer
  into v_assigned
  from public.exam_assignments ea
  where ea.student_id = target_user_id;

  select count(*)::integer
  into v_attempted
  from public.exam_attempts ea
  where ea.student_id = target_user_id;

  select count(*)::integer
  into v_practice_sessions
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  select coalesce(sum(pa.question_count), 0)::integer
  into v_practice_questions_in_sessions
  from public.practice_attempts pa
  where pa.student_id = target_user_id;

  select count(*)::integer
  into v_bank_questions_tracked
  from public.user_question_stats uqs
  where uqs.user_id = target_user_id;

  select coalesce(sum(uqs.seen_count), 0)::integer
  into v_bank_question_answers
  from public.user_question_stats uqs
  where uqs.user_id = target_user_id;

  if to_regclass('public.user_lexicon_word_stats') is not null then
    select count(*)::integer
    into v_lexicon_words_tracked
    from public.user_lexicon_word_stats ulws
    where ulws.user_id = target_user_id;
  else
    v_lexicon_words_tracked := 0;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sb.id,
        'name', sb.name
      )
      order by sb.name
    ),
    '[]'::jsonb
  )
  into v_batches
  from public.student_batch_members sbm
  join public.student_batches sb on sb.id = sbm.batch_id
  where sbm.profile_id = v_profile.id
    and (
      public.is_admin()
      or sb.created_by = auth.uid()
    );

  v_is_linked := false;
  v_link_teacher := null;

  select
    true,
    tll.teacher_user_id
  into v_is_linked, v_link_teacher
  from public.teacher_learner_links tll
  where tll.student_user_id = target_user_id
    and tll.is_active = true
  limit 1;

  if coalesce(v_is_linked, false) then
    v_warnings := v_warnings || jsonb_build_array(
      'This is a linked learning account. You can create a new one from Teacher Home after deletion.'
    );
  end if;

  if v_practice_sessions = 0
     and v_bank_questions_tracked = 0
     and v_lexicon_words_tracked = 0 then
    v_warnings := v_warnings || jsonb_build_array(
      'No server-side practice data found. Practice done while logged in as teacher/admin (without My Learning mode) is not saved to student accounts.'
    );
  elsif v_practice_sessions = 0 and v_bank_questions_tracked > 0 then
    v_warnings := v_warnings || jsonb_build_array(
      'Bank question progress exists but no completed bank sessions were saved (sessions are recorded when you finish a full Question Bank run).'
    );
  end if;

  v_warnings := v_warnings || jsonb_build_array(
    'This permanently removes login access and all learning data for this student.'
  );

  return jsonb_build_object(
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'email', v_email,
    'isLinkedLearner', coalesce(v_is_linked, false),
    'linkedTeacherUserId', v_link_teacher,
    'examAssignments', v_assigned,
    'examAttempts', v_attempted,
    'practiceAttempts', v_practice_sessions,
    'practiceSessions', v_practice_sessions,
    'practiceQuestionsInSessions', v_practice_questions_in_sessions,
    'bankQuestionsTracked', v_bank_questions_tracked,
    'bankQuestionAnswers', v_bank_question_answers,
    'lexiconWordsTracked', v_lexicon_words_tracked,
    'questionStats', v_bank_questions_tracked,
    'batchMemberships', v_batches,
    'warnings', v_warnings
  );
end;
$$;
