-- Yolen Companion V2 - Fase 4 / hardening final
-- Reaplica a RPC com bloqueio explícito de ciclos comerciais encerrados.
--
-- Esta migration preserva o contrato transacional da ingestão e adiciona
-- defesa no banco contra gravações em ciclos ganhos, perdidos ou cancelados.

create or replace function public.rpc_ingest_companion_messages(
  p_company_id uuid,
  p_cycle_id uuid,
  p_captured_by uuid,
  p_conversation_key text,
  p_device_key text,
  p_messages jsonb
)
returns table (
  inserted_count integer,
  unchanged_count integer,
  last_observed_message_id bigint,
  state_version bigint
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_conversation_key text;
  v_device_key text;
  v_membership_role text;
  v_cycle_owner_id uuid;
  v_cycle_status text;

  v_item jsonb;
  v_seen_message_keys text[] := '{}'::text[];

  v_message_key text;
  v_direction text;
  v_occurred_at_text text;
  v_occurred_at timestamp with time zone;
  v_content_type text;
  v_text_content text;
  v_audio_transcription text;
  v_is_deleted boolean;

  v_latest_id bigint;
  v_latest_version integer;
  v_latest_direction text;
  v_latest_occurred_at timestamp with time zone;
  v_latest_content_type text;
  v_latest_text_content text;
  v_latest_audio_transcription text;
  v_latest_is_deleted boolean;

  v_next_version integer;
  v_persisted_message_id bigint;
  v_candidate_observed_id bigint;
  v_observed_at timestamp with time zone;

  v_inserted_count integer := 0;
  v_unchanged_count integer := 0;
  v_result_observed_id bigint;
  v_result_state_version bigint;
begin
  if p_company_id is null then
    raise exception 'company_id é obrigatório';
  end if;

  if p_cycle_id is null then
    raise exception 'cycle_id é obrigatório';
  end if;

  if p_captured_by is null then
    raise exception 'captured_by é obrigatório';
  end if;

  v_conversation_key := btrim(coalesce(p_conversation_key, ''));
  v_device_key := lower(btrim(coalesce(p_device_key, '')));

  if nullif(v_conversation_key, '') is null then
    raise exception 'conversation_key é obrigatória';
  end if;

  if char_length(v_conversation_key) > 500 then
    raise exception 'conversation_key ultrapassa 500 caracteres';
  end if;

  if nullif(v_device_key, '') is null then
    raise exception 'device_key é obrigatória';
  end if;

  if char_length(v_device_key) > 200 then
    raise exception 'device_key ultrapassa 200 caracteres';
  end if;

  if v_device_key !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'device_key deve possuir um UUID válido';
  end if;

  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    raise exception 'messages deve ser uma lista JSON';
  end if;

  if jsonb_array_length(p_messages) = 0 then
    raise exception 'O lote precisa possuir pelo menos uma mensagem';
  end if;

  if jsonb_array_length(p_messages) > 200 then
    raise exception 'O lote pode possuir no máximo 200 mensagens';
  end if;

  select membership.role
  into v_membership_role
  from public.company_memberships membership
  join public.profiles profile
    on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and membership.user_id = p_captured_by
    and membership.is_active = true
    and profile.is_active_global = true;

  if not found then
    raise exception
      'Usuário sem vínculo ativo com a empresa informada';
  end if;

  select
    cycle.owner_user_id,
    lower(
      btrim(
        coalesce(
          cycle.status::text,
          ''
        )
      )
    )
  into
    v_cycle_owner_id,
    v_cycle_status
  from public.sales_cycles cycle
  where cycle.company_id = p_company_id
    and cycle.id = p_cycle_id
  for share;

  if not found then
    raise exception
      'Ciclo comercial não encontrado na empresa informada';
  end if;

  if
    v_cycle_status in (
      'ganho',
      'perdido',
      'cancelado'
    )
  then
    raise exception
      'Ciclo comercial encerrado não aceita captura de mensagens';
  end if;

  if
    v_membership_role = 'member'
    and v_cycle_owner_id is distinct from p_captured_by
  then
    raise exception
      'Vendedor não pode capturar mensagens de um ciclo pertencente a outro usuário';
  end if;

  -- A trava é por empresa e conversa, e não por dispositivo.
  -- Assim, duas instalações não conseguem calcular a mesma próxima versão
  -- simultaneamente.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_company_id::text || ':' || v_conversation_key,
      0
    )
  );

  for v_item in
    select item.value
    from jsonb_array_elements(p_messages) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception
        'Cada item de messages deve ser um objeto';
    end if;

    if jsonb_typeof(v_item -> 'message_key') is distinct from 'string' then
      raise exception
        'Toda mensagem precisa de uma message_key em texto';
    end if;

    v_message_key := btrim(v_item ->> 'message_key');

    if nullif(v_message_key, '') is null then
      raise exception
        'message_key não pode ficar vazia';
    end if;

    if char_length(v_message_key) > 500 then
      raise exception
        'message_key ultrapassa 500 caracteres';
    end if;

    if v_message_key = any(v_seen_message_keys) then
      raise exception
        'A message_key % apareceu mais de uma vez no mesmo lote',
        v_message_key;
    end if;

    v_seen_message_keys :=
      array_append(v_seen_message_keys, v_message_key);

    if jsonb_typeof(v_item -> 'direction') is distinct from 'string' then
      raise exception
        'Toda mensagem precisa de uma direction em texto';
    end if;

    v_direction := v_item ->> 'direction';

    if v_direction not in ('incoming', 'outgoing') then
      raise exception
        'direction deve ser incoming ou outgoing';
    end if;

    if jsonb_typeof(v_item -> 'occurred_at') is distinct from 'string' then
      raise exception
        'Toda mensagem precisa de occurred_at em texto';
    end if;

    v_occurred_at_text := btrim(v_item ->> 'occurred_at');

    if nullif(v_occurred_at_text, '') is null then
      raise exception
        'occurred_at não pode ficar vazio';
    end if;

    if lower(v_occurred_at_text) in ('infinity', '-infinity') then
      raise exception
        'occurred_at contém uma data inválida';
    end if;

    begin
      v_occurred_at := v_occurred_at_text::timestamp with time zone;
    exception
      when others then
        raise exception
          'occurred_at contém uma data inválida';
    end;

    if jsonb_typeof(v_item -> 'content_type') is distinct from 'string' then
      raise exception
        'Toda mensagem precisa de content_type em texto';
    end if;

    v_content_type := v_item ->> 'content_type';

    if v_content_type not in ('text', 'audio') then
      raise exception
        'content_type deve ser text ou audio';
    end if;

    if jsonb_typeof(v_item -> 'is_deleted') is distinct from 'boolean' then
      raise exception
        'Toda mensagem precisa de is_deleted booleano';
    end if;

    v_is_deleted := (v_item ->> 'is_deleted')::boolean;

    if
      not (v_item ? 'text_content')
      or v_item -> 'text_content' = 'null'::jsonb
    then
      v_text_content := null;
    else
      if jsonb_typeof(v_item -> 'text_content') is distinct from 'string' then
        raise exception
          'text_content deve ser um texto ou null';
      end if;

      v_text_content :=
        nullif(btrim(v_item ->> 'text_content'), '');
    end if;

    if
      not (v_item ? 'audio_transcription')
      or v_item -> 'audio_transcription' = 'null'::jsonb
    then
      v_audio_transcription := null;
    else
      if
        jsonb_typeof(v_item -> 'audio_transcription')
        is distinct from 'string'
      then
        raise exception
          'audio_transcription deve ser um texto ou null';
      end if;

      v_audio_transcription :=
        nullif(btrim(v_item ->> 'audio_transcription'), '');
    end if;

    if
      v_text_content is not null
      and char_length(v_text_content) > 100000
    then
      raise exception
        'text_content ultrapassa 100000 caracteres';
    end if;

    if
      v_audio_transcription is not null
      and char_length(v_audio_transcription) > 200000
    then
      raise exception
        'audio_transcription ultrapassa 200000 caracteres';
    end if;

    if v_is_deleted then
      v_text_content := null;
      v_audio_transcription := null;
    else
      if
        v_content_type = 'text'
        and v_text_content is null
      then
        raise exception
          'Mensagem de texto ativa precisa possuir conteúdo';
      end if;

      if
        v_content_type = 'text'
        and v_audio_transcription is not null
      then
        raise exception
          'Mensagem de texto não pode possuir transcrição de áudio';
      end if;
    end if;

    v_latest_id := null;
    v_latest_version := null;
    v_latest_direction := null;
    v_latest_occurred_at := null;
    v_latest_content_type := null;
    v_latest_text_content := null;
    v_latest_audio_transcription := null;
    v_latest_is_deleted := null;

    select
      message.id,
      message.version,
      message.direction,
      message.occurred_at,
      message.content_type,
      message.text_content,
      message.audio_transcription,
      message.is_deleted
    into
      v_latest_id,
      v_latest_version,
      v_latest_direction,
      v_latest_occurred_at,
      v_latest_content_type,
      v_latest_text_content,
      v_latest_audio_transcription,
      v_latest_is_deleted
    from public.conversation_messages message
    where message.company_id = p_company_id
      and message.conversation_key = v_conversation_key
      and message.message_key = v_message_key
    order by message.version desc
    limit 1;

    if
      v_latest_id is not null
      and v_latest_direction = v_direction
      and v_latest_occurred_at = v_occurred_at
      and v_latest_content_type = v_content_type
      and v_latest_text_content is not distinct from v_text_content
      and v_latest_audio_transcription
        is not distinct from v_audio_transcription
      and v_latest_is_deleted = v_is_deleted
    then
      v_unchanged_count := v_unchanged_count + 1;
      v_persisted_message_id := v_latest_id;
    else
      v_next_version := coalesce(v_latest_version, 0) + 1;

      insert into public.conversation_messages (
        company_id,
        cycle_id,
        conversation_key,
        message_key,
        version,
        direction,
        occurred_at,
        content_type,
        text_content,
        audio_transcription,
        is_deleted,
        captured_by
      )
      values (
        p_company_id,
        p_cycle_id,
        v_conversation_key,
        v_message_key,
        v_next_version,
        v_direction,
        v_occurred_at,
        v_content_type,
        v_text_content,
        v_audio_transcription,
        v_is_deleted,
        p_captured_by
      )
      returning id
      into v_persisted_message_id;

      v_inserted_count := v_inserted_count + 1;
    end if;

    if
      v_candidate_observed_id is null
      or v_persisted_message_id > v_candidate_observed_id
    then
      v_candidate_observed_id := v_persisted_message_id;
    end if;
  end loop;

  if v_candidate_observed_id is null then
    raise exception
      'Nenhuma mensagem válida foi persistida ou localizada';
  end if;

  v_observed_at := clock_timestamp();

  insert into public.conversation_capture_state as current_state (
    company_id,
    conversation_key,
    device_key,
    last_observed_message_id,
    last_observed_at,
    updated_at
  )
  values (
    p_company_id,
    v_conversation_key,
    v_device_key,
    v_candidate_observed_id,
    v_observed_at,
    v_observed_at
  )
  on conflict (
    company_id,
    conversation_key,
    device_key
  )
  do update set
    last_observed_message_id =
      excluded.last_observed_message_id,
    last_observed_at =
      excluded.last_observed_at,
    state_version =
      current_state.state_version + 1,
    updated_at =
      excluded.updated_at
  where
    current_state.last_observed_message_id is null
    or current_state.last_observed_message_id
      < excluded.last_observed_message_id
  returning
    current_state.last_observed_message_id,
    current_state.state_version
  into
    v_result_observed_id,
    v_result_state_version;

  if not found then
    select
      capture_state.last_observed_message_id,
      capture_state.state_version
    into
      v_result_observed_id,
      v_result_state_version
    from public.conversation_capture_state capture_state
    where capture_state.company_id = p_company_id
      and capture_state.conversation_key = v_conversation_key
      and capture_state.device_key = v_device_key;
  end if;

  return query
  select
    v_inserted_count,
    v_unchanged_count,
    v_result_observed_id,
    v_result_state_version;
end;
$$;

revoke all
on function public.rpc_ingest_companion_messages(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.rpc_ingest_companion_messages(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
)
to service_role;

comment on function public.rpc_ingest_companion_messages(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) is
  'Ingere versões de mensagens do Companion e avança atomicamente o cursor observado.';
