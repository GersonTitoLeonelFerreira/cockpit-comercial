-- Yolen Companion V2 - Fase 4 / ordenação causal entre dispositivos
-- Substitui a precedência baseada apenas em observed_at por controle otimista
-- usando a versão canônica que cada dispositivo realmente confirmou.

alter table public.conversation_message_reconciliation_state
  add column causal_version bigint;

update public.conversation_message_reconciliation_state
  as reconciliation
set causal_version =
  greatest(message.version::bigint, 1)
from public.conversation_messages message
where message.id = reconciliation.current_message_id
  and message.company_id = reconciliation.company_id
  and message.conversation_key =
    reconciliation.conversation_key
  and message.message_key =
    reconciliation.message_key;

alter table public.conversation_message_reconciliation_state
  alter column causal_version
  set default 1;

alter table public.conversation_message_reconciliation_state
  alter column causal_version
  set not null;

alter table public.conversation_message_reconciliation_state
  add constraint cmrs_causal_version_check
  check (causal_version > 0);

comment on column
  public.conversation_message_reconciliation_state.causal_version
is
  'Versão causal do conteúdo canônico. Avança somente quando o estado da mensagem muda.';

create table public.conversation_message_device_state (
  company_id uuid not null,
  conversation_key text not null,
  message_key text not null,
  device_key text not null,
  confirmed_causal_version bigint not null,
  confirmed_message_id bigint not null,
  created_at timestamp with time zone
    default now() not null,
  updated_at timestamp with time zone
    default now() not null,

  constraint conversation_message_device_state_pkey
    primary key (
      company_id,
      conversation_key,
      message_key,
      device_key
    ),

  constraint cmds_confirmed_message_fkey
    foreign key (confirmed_message_id)
    references public.conversation_messages (id)
    on delete cascade,

  constraint cmds_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key)
        between 1 and 500
    ),

  constraint cmds_message_key_check
    check (
      message_key = btrim(message_key)
      and char_length(message_key)
        between 1 and 500
    ),

  constraint cmds_device_key_check
    check (
      device_key ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),

  constraint cmds_confirmed_causal_version_check
    check (confirmed_causal_version > 0)
);

create index
  conversation_message_device_state_message_idx
on public.conversation_message_device_state (
  confirmed_message_id
);

insert into public.conversation_message_device_state (
  company_id,
  conversation_key,
  message_key,
  device_key,
  confirmed_causal_version,
  confirmed_message_id,
  created_at,
  updated_at
)
select
  reconciliation.company_id,
  reconciliation.conversation_key,
  reconciliation.message_key,
  reconciliation.last_device_key,
  reconciliation.causal_version,
  reconciliation.current_message_id,
  clock_timestamp(),
  clock_timestamp()
from public.conversation_message_reconciliation_state
  reconciliation
where reconciliation.last_device_key is not null
on conflict (
  company_id,
  conversation_key,
  message_key,
  device_key
)
do nothing;

alter table
  public.conversation_message_device_state
  enable row level security;

alter table
  public.conversation_message_device_state
  force row level security;

create policy
  conversation_message_device_state_client_access_denied
  on public.conversation_message_device_state
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all
on table public.conversation_message_device_state
from public, anon, authenticated, service_role;

grant select, insert, update
on table public.conversation_message_device_state
to service_role;

comment on table
  public.conversation_message_device_state
is
  'Versão causal que cada instalação confirmou para cada mensagem.';

drop function public.rpc_ingest_companion_messages(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
);

create function public.rpc_ingest_companion_messages(
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
  conflict_count integer,
  last_observed_message_id bigint,
  state_version bigint,
  message_results jsonb
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
  v_observed_at_text text;
  v_observed_at timestamp with time zone;
  v_base_version_text text;
  v_base_version bigint;
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
  v_latest_observed_at timestamp with time zone;
  v_current_causal_version bigint;
  v_device_confirmed_version bigint;
  v_state_matches boolean;

  v_next_version integer;
  v_persisted_message_id bigint;
  v_candidate_observed_id bigint;
  v_capture_recorded_at timestamp with time zone;

  v_synced boolean;
  v_conflict_reason text;
  v_result_causal_version bigint;

  v_inserted_count integer := 0;
  v_unchanged_count integer := 0;
  v_conflict_count integer := 0;
  v_result_observed_id bigint;
  v_result_state_version bigint;
  v_message_results jsonb := '[]'::jsonb;
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

  v_conversation_key :=
    btrim(coalesce(p_conversation_key, ''));

  v_device_key :=
    lower(btrim(coalesce(p_device_key, '')));

  if nullif(v_conversation_key, '') is null then
    raise exception 'conversation_key é obrigatória';
  end if;

  if char_length(v_conversation_key) > 500 then
    raise exception
      'conversation_key ultrapassa 500 caracteres';
  end if;

  if nullif(v_device_key, '') is null then
    raise exception 'device_key é obrigatória';
  end if;

  if char_length(v_device_key) > 200 then
    raise exception
      'device_key ultrapassa 200 caracteres';
  end if;

  if v_device_key !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception
      'device_key deve possuir um UUID válido';
  end if;

  if
    p_messages is null
    or jsonb_typeof(p_messages) <> 'array'
  then
    raise exception
      'messages deve ser uma lista JSON';
  end if;

  if jsonb_array_length(p_messages) = 0 then
    raise exception
      'O lote precisa possuir pelo menos uma mensagem';
  end if;

  if jsonb_array_length(p_messages) > 200 then
    raise exception
      'O lote pode possuir no máximo 200 mensagens';
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
    and v_cycle_owner_id
      is distinct from p_captured_by
  then
    raise exception
      'Vendedor não pode capturar mensagens de um ciclo pertencente a outro usuário';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_company_id::text
        || ':'
        || v_conversation_key,
      0
    )
  );

  for v_item in
    select item.value
    from jsonb_array_elements(p_messages)
      as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception
        'Cada item de messages deve ser um objeto';
    end if;

    if
      jsonb_typeof(v_item -> 'message_key')
      is distinct from 'string'
    then
      raise exception
        'Toda mensagem precisa de uma message_key em texto';
    end if;

    v_message_key :=
      btrim(v_item ->> 'message_key');

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
      array_append(
        v_seen_message_keys,
        v_message_key
      );

    if
      jsonb_typeof(v_item -> 'direction')
      is distinct from 'string'
    then
      raise exception
        'Toda mensagem precisa de uma direction em texto';
    end if;

    v_direction := v_item ->> 'direction';

    if
      v_direction not in (
        'incoming',
        'outgoing'
      )
    then
      raise exception
        'direction deve ser incoming ou outgoing';
    end if;

    if
      jsonb_typeof(v_item -> 'occurred_at')
      is distinct from 'string'
    then
      raise exception
        'Toda mensagem precisa de occurred_at em texto';
    end if;

    v_occurred_at_text :=
      btrim(v_item ->> 'occurred_at');

    if nullif(v_occurred_at_text, '') is null then
      raise exception
        'occurred_at não pode ficar vazio';
    end if;

    if
      lower(v_occurred_at_text)
      in ('infinity', '-infinity')
    then
      raise exception
        'occurred_at contém uma data inválida';
    end if;

    begin
      v_occurred_at :=
        v_occurred_at_text::
          timestamp with time zone;
    exception
      when others then
        raise exception
          'occurred_at contém uma data inválida';
    end;

    if
      jsonb_typeof(v_item -> 'observed_at')
      is distinct from 'string'
    then
      raise exception
        'Toda mensagem precisa de observed_at em texto';
    end if;

    v_observed_at_text :=
      btrim(v_item ->> 'observed_at');

    if nullif(v_observed_at_text, '') is null then
      raise exception
        'observed_at não pode ficar vazio';
    end if;

    if
      lower(v_observed_at_text)
      in ('infinity', '-infinity')
    then
      raise exception
        'observed_at contém uma data inválida';
    end if;

    begin
      v_observed_at :=
        v_observed_at_text::
          timestamp with time zone;
    exception
      when others then
        raise exception
          'observed_at contém uma data inválida';
    end;

    if
      v_observed_at >
      clock_timestamp() + interval '5 minutes'
    then
      raise exception
        'observed_at não pode estar mais de cinco minutos no futuro';
    end if;

    if
      not (v_item ? 'base_version')
      or v_item -> 'base_version' =
        'null'::jsonb
    then
      v_base_version := null;
    else
      if
        jsonb_typeof(v_item -> 'base_version')
        is distinct from 'string'
      then
        raise exception
          'base_version deve ser null ou um inteiro positivo em texto';
      end if;

      v_base_version_text :=
        btrim(v_item ->> 'base_version');

      if
        v_base_version_text
        !~ '^[1-9][0-9]*$'
      then
        raise exception
          'base_version deve ser null ou um inteiro positivo em texto';
      end if;

      begin
        v_base_version :=
          v_base_version_text::bigint;
      exception
        when others then
          raise exception
            'base_version deve ser null ou um inteiro positivo em texto';
      end;
    end if;

    if
      jsonb_typeof(v_item -> 'content_type')
      is distinct from 'string'
    then
      raise exception
        'Toda mensagem precisa de content_type em texto';
    end if;

    v_content_type :=
      v_item ->> 'content_type';

    if
      v_content_type not in (
        'text',
        'audio'
      )
    then
      raise exception
        'content_type deve ser text ou audio';
    end if;

    if
      jsonb_typeof(v_item -> 'is_deleted')
      is distinct from 'boolean'
    then
      raise exception
        'Toda mensagem precisa de is_deleted booleano';
    end if;

    v_is_deleted :=
      (v_item ->> 'is_deleted')::boolean;

    if
      not (v_item ? 'text_content')
      or v_item -> 'text_content' =
        'null'::jsonb
    then
      v_text_content := null;
    else
      if
        jsonb_typeof(v_item -> 'text_content')
        is distinct from 'string'
      then
        raise exception
          'text_content deve ser um texto ou null';
      end if;

      v_text_content :=
        nullif(
          btrim(v_item ->> 'text_content'),
          ''
        );
    end if;

    if
      not (v_item ? 'audio_transcription')
      or v_item -> 'audio_transcription' =
        'null'::jsonb
    then
      v_audio_transcription := null;
    else
      if
        jsonb_typeof(
          v_item -> 'audio_transcription'
        )
        is distinct from 'string'
      then
        raise exception
          'audio_transcription deve ser um texto ou null';
      end if;

      v_audio_transcription :=
        nullif(
          btrim(
            v_item ->> 'audio_transcription'
          ),
          ''
        );
    end if;

    if
      v_text_content is not null
      and char_length(v_text_content) >
        100000
    then
      raise exception
        'text_content ultrapassa 100000 caracteres';
    end if;

    if
      v_audio_transcription is not null
      and char_length(
        v_audio_transcription
      ) > 200000
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
        and v_audio_transcription
          is not null
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
    v_latest_observed_at := null;
    v_current_causal_version := null;
    v_device_confirmed_version := null;
    v_state_matches := false;
    v_synced := false;
    v_conflict_reason := null;
    v_result_causal_version := null;
    v_persisted_message_id := null;

    select
      message.id,
      message.version,
      message.direction,
      message.occurred_at,
      message.content_type,
      message.text_content,
      message.audio_transcription,
      message.is_deleted,
      reconciliation.last_observed_at,
      reconciliation.causal_version
    into
      v_latest_id,
      v_latest_version,
      v_latest_direction,
      v_latest_occurred_at,
      v_latest_content_type,
      v_latest_text_content,
      v_latest_audio_transcription,
      v_latest_is_deleted,
      v_latest_observed_at,
      v_current_causal_version
    from public.conversation_message_reconciliation_state
      reconciliation
    join public.conversation_messages message
      on message.id =
        reconciliation.current_message_id
      and message.company_id =
        reconciliation.company_id
      and message.conversation_key =
        reconciliation.conversation_key
      and message.message_key =
        reconciliation.message_key
    where reconciliation.company_id =
        p_company_id
      and reconciliation.conversation_key =
        v_conversation_key
      and reconciliation.message_key =
        v_message_key
    for update of reconciliation;

    if not found then
      select
        message.id,
        message.version,
        message.direction,
        message.occurred_at,
        message.content_type,
        message.text_content,
        message.audio_transcription,
        message.is_deleted,
        message.observed_at
      into
        v_latest_id,
        v_latest_version,
        v_latest_direction,
        v_latest_occurred_at,
        v_latest_content_type,
        v_latest_text_content,
        v_latest_audio_transcription,
        v_latest_is_deleted,
        v_latest_observed_at
      from public.conversation_messages message
      where message.company_id =
          p_company_id
        and message.conversation_key =
          v_conversation_key
        and message.message_key =
          v_message_key
      order by
        message.version desc,
        message.id desc
      limit 1;

      if found then
        v_current_causal_version :=
          greatest(
            v_latest_version::bigint,
            1
          );

        insert into
          public.conversation_message_reconciliation_state (
            company_id,
            conversation_key,
            message_key,
            current_message_id,
            last_observed_at,
            last_device_key,
            state_version,
            causal_version,
            created_at,
            updated_at
          )
        values (
          p_company_id,
          v_conversation_key,
          v_message_key,
          v_latest_id,
          v_latest_observed_at,
          null,
          1,
          v_current_causal_version,
          clock_timestamp(),
          clock_timestamp()
        );
      end if;
    end if;

    select
      device_state.confirmed_causal_version
    into
      v_device_confirmed_version
    from public.conversation_message_device_state
      device_state
    where device_state.company_id =
        p_company_id
      and device_state.conversation_key =
        v_conversation_key
      and device_state.message_key =
        v_message_key
      and device_state.device_key =
        v_device_key
    for update;

    v_state_matches := (
      v_latest_id is not null
      and v_latest_direction =
        v_direction
      and v_latest_occurred_at =
        v_occurred_at
      and v_latest_content_type =
        v_content_type
      and v_latest_text_content
        is not distinct from
          v_text_content
      and v_latest_audio_transcription
        is not distinct from
          v_audio_transcription
      and v_latest_is_deleted =
        v_is_deleted
    );

    if v_latest_id is null then
      if v_base_version is not null then
        raise exception
          'base_version não pode ser informada quando a mensagem ainda não possui estado canônico';
      end if;

      v_next_version := 1;

      insert into public.conversation_messages (
        company_id,
        cycle_id,
        conversation_key,
        message_key,
        version,
        direction,
        occurred_at,
        observed_at,
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
        v_observed_at,
        v_content_type,
        v_text_content,
        v_audio_transcription,
        v_is_deleted,
        p_captured_by
      )
      returning id
      into v_persisted_message_id;

      v_result_causal_version := 1;
      v_synced := true;

      insert into
        public.conversation_message_reconciliation_state (
          company_id,
          conversation_key,
          message_key,
          current_message_id,
          last_observed_at,
          last_device_key,
          state_version,
          causal_version,
          created_at,
          updated_at
        )
      values (
        p_company_id,
        v_conversation_key,
        v_message_key,
        v_persisted_message_id,
        v_observed_at,
        v_device_key,
        1,
        v_result_causal_version,
        clock_timestamp(),
        clock_timestamp()
      );

      v_inserted_count :=
        v_inserted_count + 1;

    elsif v_state_matches then
      v_persisted_message_id :=
        v_latest_id;

      v_result_causal_version :=
        v_current_causal_version;

      v_synced := true;

      v_unchanged_count :=
        v_unchanged_count + 1;

      if
        v_observed_at >
        v_latest_observed_at
      then
        update
          public.conversation_message_reconciliation_state
            as reconciliation_state
        set
          last_observed_at =
            v_observed_at,
          last_device_key =
            v_device_key,
          state_version =
            reconciliation_state.state_version
              + 1,
          updated_at =
            clock_timestamp()
        where reconciliation_state.company_id =
            p_company_id
          and reconciliation_state.conversation_key =
            v_conversation_key
          and reconciliation_state.message_key =
            v_message_key;
      end if;

    elsif
      v_base_version is not null
      and v_base_version =
        v_current_causal_version
      and v_device_confirmed_version =
        v_current_causal_version
    then
      v_next_version :=
        coalesce(v_latest_version, 0) + 1;

      insert into public.conversation_messages (
        company_id,
        cycle_id,
        conversation_key,
        message_key,
        version,
        direction,
        occurred_at,
        observed_at,
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
        v_observed_at,
        v_content_type,
        v_text_content,
        v_audio_transcription,
        v_is_deleted,
        p_captured_by
      )
      returning id
      into v_persisted_message_id;

      v_result_causal_version :=
        v_current_causal_version + 1;

      v_synced := true;

      update
        public.conversation_message_reconciliation_state
          as reconciliation_state
      set
        current_message_id =
          v_persisted_message_id,
        last_observed_at =
          greatest(
            reconciliation_state.last_observed_at,
            v_observed_at
          ),
        last_device_key =
          v_device_key,
        state_version =
          reconciliation_state.state_version
            + 1,
        causal_version =
          v_result_causal_version,
        updated_at =
          clock_timestamp()
      where reconciliation_state.company_id =
          p_company_id
        and reconciliation_state.conversation_key =
          v_conversation_key
        and reconciliation_state.message_key =
          v_message_key;

      v_inserted_count :=
        v_inserted_count + 1;

    else
      v_persisted_message_id :=
        v_latest_id;

      v_result_causal_version :=
        v_current_causal_version;

      v_synced := false;
      v_conflict_reason :=
        'VERSION_CONFLICT';

      v_unchanged_count :=
        v_unchanged_count + 1;

      v_conflict_count :=
        v_conflict_count + 1;
    end if;

    if v_synced then
      insert into
        public.conversation_message_device_state
          as device_state (
            company_id,
            conversation_key,
            message_key,
            device_key,
            confirmed_causal_version,
            confirmed_message_id,
            created_at,
            updated_at
          )
      values (
        p_company_id,
        v_conversation_key,
        v_message_key,
        v_device_key,
        v_result_causal_version,
        v_persisted_message_id,
        clock_timestamp(),
        clock_timestamp()
      )
      on conflict (
        company_id,
        conversation_key,
        message_key,
        device_key
      )
      do update set
        confirmed_causal_version =
          excluded.confirmed_causal_version,
        confirmed_message_id =
          excluded.confirmed_message_id,
        updated_at =
          excluded.updated_at;
    end if;

    v_message_results :=
      v_message_results ||
      jsonb_build_array(
        jsonb_build_object(
          'message_key',
          v_message_key,
          'synced',
          v_synced,
          'canonical_version',
          v_result_causal_version::text,
          'reason',
          v_conflict_reason
        )
      );

    if
      v_candidate_observed_id is null
      or v_persisted_message_id >
        v_candidate_observed_id
    then
      v_candidate_observed_id :=
        v_persisted_message_id;
    end if;
  end loop;

  if v_candidate_observed_id is null then
    raise exception
      'Nenhuma mensagem válida foi persistida ou localizada';
  end if;

  v_capture_recorded_at :=
    clock_timestamp();

  insert into public.conversation_capture_state
    as current_state (
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
    v_capture_recorded_at,
    v_capture_recorded_at
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
    current_state.last_observed_message_id
      is null
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
    from public.conversation_capture_state
      capture_state
    where capture_state.company_id =
        p_company_id
      and capture_state.conversation_key =
        v_conversation_key
      and capture_state.device_key =
        v_device_key;
  end if;

  return query
  select
    v_inserted_count,
    v_unchanged_count,
    v_conflict_count,
    v_result_observed_id,
    v_result_state_version,
    v_message_results;
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

comment on function
  public.rpc_ingest_companion_messages(
    uuid,
    uuid,
    uuid,
    text,
    text,
    jsonb
  )
is
  'Ingere versões com controle causal por mensagem e por dispositivo, preservando o ledger append-only.';
