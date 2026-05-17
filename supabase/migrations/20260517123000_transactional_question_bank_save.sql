-- Transactional question-bank save pipeline.
-- The whole operation runs inside one Postgres function call, so question
-- creation, topic linking, metadata writes, pattern links, and difficulty
-- cache updates commit or fail together.

create extension if not exists pgcrypto;

create unique index if not exists topics_normalized_name_uidx
on public.topics (normalized_name);

create unique index if not exists questions_question_hash_uidx
on public.questions (question_hash)
where question_hash is not null;

create unique index if not exists question_topics_question_topic_uidx
on public.question_topics (question_id, topic_id);

create unique index if not exists question_metadata_question_key_uidx
on public.question_metadata (question_id, key);

create unique index if not exists topic_patterns_topic_pattern_uidx
on public.topic_patterns (topic_id, pattern_key);

create or replace function public.save_question_to_bank(
  p_actor_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  question_text text;
  options jsonb;
  option_texts text[] := array[]::text[];
  option_item jsonb;
  correct_option text;
  explanation text;
  normalized_hash_input text;
  question_hash_value text;
  v_question_id uuid;
  existing_question record;
  topic_item jsonb;
  topic_name text;
  normalized_topic text;
  v_topic_id uuid;
  topic_ids uuid[] := array[]::uuid[];
  meta jsonb;
  v_pattern_key text;
  metadata_rows jsonb := '[]'::jsonb;
  difficulty_score numeric;
  difficulty_label text;
  was_duplicate boolean := false;
begin
  select role
  into actor_role
  from public.users
  where id = p_actor_id;

  if actor_role not in ('teacher', 'admin') then
    raise exception 'Only teachers and admins can save questions';
  end if;

  question_text := nullif(trim(coalesce(
    p_payload->>'text',
    p_payload->>'question',
    p_payload->>'question_text'
  )), '');

  if question_text is null then
    raise exception 'Question text is required';
  end if;

  if jsonb_typeof(p_payload->'topics') <> 'array' or jsonb_array_length(p_payload->'topics') = 0 then
    raise exception 'Question must have at least one topic';
  end if;

  options := coalesce(p_payload->'options', '[]'::jsonb);

  if jsonb_typeof(options) <> 'array' then
    raise exception 'Options must be an array';
  end if;

  for option_item in select value from jsonb_array_elements(options)
  loop
    if jsonb_typeof(option_item) = 'string' then
      option_texts := option_texts || trim(option_item #>> '{}');
    else
      option_texts := option_texts || trim(coalesce(option_item->>'text', ''));
    end if;
  end loop;

  if array_length(option_texts, 1) is null or array_length(option_texts, 1) < 2 then
    raise exception 'At least two options are required';
  end if;

  correct_option := upper(coalesce(p_payload->>'correct', 'A'));

  if correct_option not in ('A', 'B', 'C', 'D') then
    correct_option := 'A';
  end if;

  explanation := coalesce(p_payload->>'explanation', '');
  normalized_hash_input := lower(trim(question_text || array_to_string(option_texts, '')));
  question_hash_value := encode(digest(normalized_hash_input, 'sha256'), 'hex');
  meta := coalesce(p_payload->'meta_structured', '{}'::jsonb);
  v_pattern_key := nullif(trim(coalesce(p_payload->>'primary_pattern', '')), '');
  difficulty_score := nullif(meta->>'difficulty_score', '')::numeric;
  difficulty_label := nullif(meta->>'difficulty_label', '');

  for topic_item in select value from jsonb_array_elements(p_payload->'topics')
  loop
    topic_name := nullif(trim(case
      when jsonb_typeof(topic_item) = 'string' then topic_item #>> '{}'
      else coalesce(topic_item->>'name', topic_item->>'topic', '')
    end), '');

    if topic_name is null then
      continue;
    end if;

    normalized_topic := lower(regexp_replace(topic_name, '\s+', ' ', 'g'));

    insert into public.topics (name, normalized_name, created_by)
    values (initcap(normalized_topic), normalized_topic, p_actor_id)
    on conflict (normalized_name)
    do update set normalized_name = excluded.normalized_name
    returning id into v_topic_id;

    topic_ids := array_append(topic_ids, v_topic_id);
  end loop;

  if array_length(topic_ids, 1) is null then
    raise exception 'No valid topic IDs resolved';
  end if;

  select *
  into existing_question
  from public.questions
  where question_hash = question_hash_value
  limit 1;

  if existing_question.id is not null then
    v_question_id := existing_question.id;
    was_duplicate := true;

    update public.questions
    set
      primary_pattern_key = v_pattern_key,
      difficulty_score_cached = difficulty_score,
      difficulty_label_cached = difficulty_label
    where id = v_question_id;
  else
    insert into public.questions (
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      explanation,
      question_hash,
      primary_pattern_key,
      difficulty_score_cached,
      difficulty_label_cached,
      created_by
    )
    values (
      question_text,
      coalesce(option_texts[1], ''),
      coalesce(option_texts[2], ''),
      coalesce(option_texts[3], ''),
      coalesce(option_texts[4], ''),
      correct_option,
      explanation,
      question_hash_value,
      v_pattern_key,
      difficulty_score,
      difficulty_label,
      p_actor_id
    )
    returning id into v_question_id;
  end if;

  insert into public.question_topics (question_id, topic_id)
  select v_question_id, topic_id
  from (select distinct unnest(topic_ids) as topic_id) unique_topics
  on conflict (question_id, topic_id) do nothing;

  if v_pattern_key is not null then
    insert into public.question_metadata (question_id, key, value)
    values (v_question_id, 'pattern', to_jsonb(v_pattern_key))
    on conflict (question_id, key)
    do update set value = excluded.value;

    insert into public.topic_patterns (topic_id, pattern_key)
    select topic_id, v_pattern_key
    from (select distinct unnest(topic_ids) as topic_id) unique_topics
    on conflict (topic_id, pattern_key) do nothing;
  else
    delete from public.question_metadata
    where question_metadata.question_id = v_question_id
      and key = 'pattern';
  end if;

  if p_payload ? 'generator_tracking' then
    metadata_rows := metadata_rows || jsonb_build_array(jsonb_build_object(
      'key', 'generator_tracking',
      'value', p_payload->'generator_tracking'
    ));
  end if;

  if p_payload ? 'generator_meta' then
    metadata_rows := metadata_rows || jsonb_build_array(jsonb_build_object(
      'key', 'generator_meta',
      'value', p_payload->'generator_meta'
    ));
  end if;

  if p_payload ? 'ca_event' then
    metadata_rows := metadata_rows || jsonb_build_array(
      jsonb_build_object('key', 'ca_event', 'value', p_payload->'ca_event'->'type'),
      jsonb_build_object('key', 'ca_date', 'value', p_payload->'ca_event'->'date')
    );
  end if;

  metadata_rows := metadata_rows || jsonb_build_array(
    jsonb_build_object('key', 'cognitive_level', 'value', meta->'cognitive_level'),
    jsonb_build_object('key', 'complexity_level', 'value', meta->'complexity'),
    jsonb_build_object('key', 'depth_level', 'value', meta->'depth'),
    jsonb_build_object('key', 'difficulty_score', 'value', meta->'difficulty_score'),
    jsonb_build_object('key', 'difficulty_label', 'value', meta->'difficulty_label'),
    jsonb_build_object('key', 'question_type', 'value', to_jsonb(coalesce(meta->>'question_type', 'mcq_single')))
  );

  insert into public.question_metadata (question_id, key, value)
  select
    v_question_id,
    row_data->>'key',
    coalesce(row_data->'value', 'null'::jsonb)
  from jsonb_array_elements(metadata_rows) as metadata_row(row_data)
  where row_data->>'key' is not null
    and row_data ? 'value'
    and row_data->'value' <> 'null'::jsonb
  on conflict (question_id, key)
  do update set value = excluded.value;

  return jsonb_build_object(
    'success', true,
    'questionId', v_question_id,
    'isDuplicate', was_duplicate,
    'questionHash', question_hash_value
  );
end;
$$;
