-- Yolen Companion V2 - Fase 5.1
-- Persistência versionada da memória comercial stateful.
--
-- Esta migration cria a fundação de dados e uma operação atômica.
-- Ela não ativa o motor V2, não altera rotas, não atualiza CRM ou Agenda
-- e não substitui o Companion V1.

create table public.companion_commercial_states (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  cycle_id uuid not null,
  conversation_key text not null,
  state_version integer not null,
  state_contract_version text not null
    default 'stateful-commercial-state-v1',
  state_updated_at timestamp with time zone not null,
  state_snapshot jsonb not null,
  created_at timestamp with time zone
    default clock_timestamp() not null,
  persisted_at timestamp with time zone
    default clock_timestamp() not null,

  constraint companion_commercial_states_cycle_fkey
    foreign key (
      company_id,
      cycle_id
    )
    references public.sales_cycles (
      company_id,
      id
    )
    on delete cascade,

  constraint companion_commercial_states_company_id_id_unique
    unique (
      company_id,
      id
    ),

  constraint companion_commercial_states_scope_unique
    unique (
      company_id,
      cycle_id,
      conversation_key
    ),

  constraint companion_commercial_states_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key)
        between 1 and 500
    ),

  constraint companion_commercial_states_version_check
    check (
      state_version > 0
    ),

  constraint companion_commercial_states_contract_check
    check (
      state_contract_version =
        'stateful-commercial-state-v1'
    ),

  constraint companion_commercial_states_snapshot_object_check
    check (
      jsonb_typeof(state_snapshot) = 'object'
    ),

  constraint companion_commercial_states_snapshot_fields_check
    check (
      state_snapshot ?& array[
        'contract_version',
        'cycle_id',
        'version',
        'updated_at'
      ]
    ),

  constraint companion_commercial_states_snapshot_contract_check
    check (
      state_snapshot ->> 'contract_version' =
        state_contract_version
    ),

  constraint companion_commercial_states_snapshot_cycle_check
    check (
      state_snapshot ->> 'cycle_id' =
        cycle_id::text
    ),

  constraint companion_commercial_states_snapshot_version_check
    check (
      (
        state_snapshot ->> 'version'
      )::integer =
        state_version
    ),

  constraint companion_commercial_states_snapshot_time_check
    check (
      (
        state_snapshot ->> 'updated_at'
      )::timestamp with time zone =
        state_updated_at
    ),

  constraint companion_commercial_states_persisted_time_check
    check (
      persisted_at >= created_at
      and state_updated_at <=
        persisted_at + interval '5 minutes'
    )
);

create index companion_commercial_states_cycle_version_idx
  on public.companion_commercial_states (
    company_id,
    cycle_id,
    state_version desc
  );

create table public.companion_commercial_state_events (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null,
  state_record_id uuid not null,
  company_id uuid not null,
  cycle_id uuid not null,
  conversation_key text not null,
  previous_state_version integer,
  candidate_state_version integer not null,
  state_contract_version text not null,
  output_contract_version text not null,
  state_snapshot jsonb not null,
  normalized_output jsonb not null,
  execution jsonb not null,
  analyzed_message_ids text[] not null,
  evidence_message_ids text[] not null,
  memory_ids text[] not null,
  automatic_crm_write boolean default false not null,
  automatic_agenda_write boolean default false not null,
  generated_at timestamp with time zone not null,
  persisted_at timestamp with time zone
    default clock_timestamp() not null,

  constraint companion_commercial_state_events_operation_unique
    unique (
      operation_key
    ),

  constraint companion_commercial_state_events_cycle_fkey
    foreign key (
      company_id,
      cycle_id
    )
    references public.sales_cycles (
      company_id,
      id
    )
    on delete restrict,

  constraint companion_commercial_state_events_state_fkey
    foreign key (
      company_id,
      state_record_id
    )
    references public.companion_commercial_states (
      company_id,
      id
    )
    on delete restrict,

  constraint companion_commercial_state_events_operation_key_check
    check (
      operation_key = btrim(operation_key)
      and char_length(operation_key)
        between 1 and 500
    ),

  constraint companion_commercial_state_events_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key)
        between 1 and 500
    ),

  constraint companion_commercial_state_events_version_check
    check (
      candidate_state_version > 0
      and (
        previous_state_version is null
        or previous_state_version > 0
      )
      and candidate_state_version =
        coalesce(
          previous_state_version,
          0
        ) + 1
    ),

  constraint companion_commercial_state_events_contract_check
    check (
      state_contract_version =
        'stateful-commercial-state-v1'
      and output_contract_version =
        'stateful-copilot-v2'
    ),

  constraint companion_commercial_state_events_snapshot_check
    check (
      jsonb_typeof(state_snapshot) = 'object'
      and state_snapshot ->> 'contract_version' =
        state_contract_version
      and state_snapshot ->> 'cycle_id' =
        cycle_id::text
      and (
        state_snapshot ->> 'version'
      )::integer =
        candidate_state_version
    ),

  constraint companion_commercial_state_events_output_check
    check (
      jsonb_typeof(normalized_output) = 'object'
      and normalized_output ->> 'contract_version' =
        output_contract_version
    ),

  constraint companion_commercial_state_events_execution_check
    check (
      jsonb_typeof(execution) = 'object'
    ),

  constraint companion_commercial_state_events_analyzed_check
    check (
      cardinality(analyzed_message_ids) > 0
    ),

  constraint companion_commercial_state_events_evidence_check
    check (
      evidence_message_ids <@
        analyzed_message_ids
    ),

  constraint companion_commercial_state_events_no_auto_write_check
    check (
      automatic_crm_write = false
      and automatic_agenda_write = false
    ),

  constraint companion_commercial_state_events_time_check
    check (
      persisted_at >= generated_at
    )
);

create index companion_commercial_state_events_scope_version_idx
  on public.companion_commercial_state_events (
    company_id,
    cycle_id,
    candidate_state_version desc
  );

create index companion_commercial_state_events_generated_idx
  on public.companion_commercial_state_events (
    company_id,
    generated_at desc
  );

alter table public.companion_commercial_states
  enable row level security;

alter table public.companion_commercial_states
  force row level security;

alter table public.companion_commercial_state_events
  enable row level security;

alter table public.companion_commercial_state_events
  force row level security;

create policy companion_commercial_states_client_access_denied
  on public.companion_commercial_states
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy companion_commercial_state_events_client_access_denied
  on public.companion_commercial_state_events
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all
on table public.companion_commercial_states
from public, anon, authenticated, service_role;

revoke all
on table public.companion_commercial_state_events
from public, anon, authenticated, service_role;

grant select
on table public.companion_commercial_states
to service_role;

grant select
on table public.companion_commercial_state_events
to service_role;

create or replace function
  public.rpc_persist_stateful_copilot_state(
    p_operation_key text,
    p_company_id uuid,
    p_cycle_id uuid,
    p_conversation_key text,
    p_expected_previous_state_version integer,
    p_expected_previous_state_updated_at
      timestamp with time zone,
    p_candidate_state_version integer,
    p_state_snapshot jsonb,
    p_audit_event jsonb
  )
returns table (
  status text,
  state_record_id uuid,
  audit_event_id uuid,
  persisted_state_version integer,
  persisted_at timestamp with time zone,
  current_state_version integer,
  current_state_updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_operation_key text;
  v_conversation_key text;

  v_state_contract_version text;
  v_output_contract_version text;

  v_state_updated_at
    timestamp with time zone;

  v_generated_at
    timestamp with time zone;

  v_persisted_at
    timestamp with time zone;

  v_state_record_id uuid;
  v_audit_event_id uuid;

  v_current_state_version integer;
  v_current_state_updated_at
    timestamp with time zone;

  v_existing_event_id uuid;
  v_existing_state_record_id uuid;
  v_existing_company_id uuid;
  v_existing_cycle_id uuid;
  v_existing_conversation_key text;
  v_existing_candidate_version integer;
  v_existing_persisted_at
    timestamp with time zone;

  v_analyzed_message_ids text[];
  v_evidence_message_ids text[];
  v_memory_ids text[];
begin
  if p_company_id is null then
    raise exception
      'company_id é obrigatório';
  end if;

  if p_cycle_id is null then
    raise exception
      'cycle_id é obrigatório';
  end if;

  v_operation_key :=
    btrim(
      coalesce(
        p_operation_key,
        ''
      )
    );

  v_conversation_key :=
    btrim(
      coalesce(
        p_conversation_key,
        ''
      )
    );

  if nullif(v_operation_key, '') is null then
    raise exception
      'operation_key é obrigatória';
  end if;

  if char_length(v_operation_key) > 500 then
    raise exception
      'operation_key ultrapassa 500 caracteres';
  end if;

  if nullif(v_conversation_key, '') is null then
    raise exception
      'conversation_key é obrigatória';
  end if;

  if char_length(v_conversation_key) > 500 then
    raise exception
      'conversation_key ultrapassa 500 caracteres';
  end if;

  if
    p_candidate_state_version is null
    or p_candidate_state_version <= 0
  then
    raise exception
      'candidate_state_version precisa ser positiva';
  end if;

  if p_expected_previous_state_version is null then
    if
      p_expected_previous_state_updated_at
      is not null
    then
      raise exception
        'Estado inicial não pode declarar horário anterior';
    end if;

    if p_candidate_state_version <> 1 then
      raise exception
        'O primeiro estado precisa possuir versão 1';
    end if;
  else
    if p_expected_previous_state_version <= 0 then
      raise exception
        'previous_state_version precisa ser positiva';
    end if;

    if
      p_expected_previous_state_updated_at
      is null
    then
      raise exception
        'Continuação precisa declarar o horário anterior';
    end if;

    if
      p_candidate_state_version <>
      p_expected_previous_state_version + 1
    then
      raise exception
        'A versão candidata precisa ser a próxima versão';
    end if;
  end if;

  if
    p_state_snapshot is null
    or jsonb_typeof(p_state_snapshot) <> 'object'
  then
    raise exception
      'state_snapshot precisa ser um objeto JSON';
  end if;

  if
    p_audit_event is null
    or jsonb_typeof(p_audit_event) <> 'object'
  then
    raise exception
      'audit_event precisa ser um objeto JSON';
  end if;

  v_state_contract_version :=
    p_state_snapshot ->> 'contract_version';

  if
    v_state_contract_version <>
      'stateful-commercial-state-v1'
  then
    raise exception
      'Contrato do estado comercial incompatível';
  end if;

  if
    p_state_snapshot ->> 'cycle_id' <>
      p_cycle_id::text
  then
    raise exception
      'O estado candidato pertence a outro ciclo';
  end if;

  begin
    if
      (
        p_state_snapshot ->> 'version'
      )::integer <>
        p_candidate_state_version
    then
      raise exception
        'A versão do estado candidato é incompatível';
    end if;

    v_state_updated_at :=
      (
        p_state_snapshot ->> 'updated_at'
      )::timestamp with time zone;
  exception
    when invalid_text_representation
      or datetime_field_overflow
    then
      raise exception
        'O estado candidato possui versão ou horário inválido';
  end;

  if
    v_state_updated_at >
      clock_timestamp() + interval '5 minutes'
  then
    raise exception
      'O horário do estado não pode estar no futuro';
  end if;

  if
    p_audit_event ->> 'event_type' <>
      'stateful_copilot_analysis_completed'
  then
    raise exception
      'Tipo de auditoria incompatível';
  end if;

  if
    p_audit_event ->> 'company_id' <>
      p_company_id::text
  then
    raise exception
      'A auditoria pertence a outra empresa';
  end if;

  if
    p_audit_event ->> 'cycle_id' <>
      p_cycle_id::text
  then
    raise exception
      'A auditoria pertence a outro ciclo';
  end if;

  if
    p_audit_event ->> 'conversation_key' <>
      v_conversation_key
  then
    raise exception
      'A auditoria pertence a outra conversa';
  end if;

  if p_expected_previous_state_version is null then
    if
      p_audit_event -> 'previous_state_version'
      is distinct from 'null'::jsonb
    then
      raise exception
        'A auditoria declarou uma versão anterior indevida';
    end if;
  else
    begin
      if
        (
          p_audit_event ->>
            'previous_state_version'
        )::integer <>
          p_expected_previous_state_version
      then
        raise exception
          'A versão anterior da auditoria é incompatível';
      end if;
    exception
      when invalid_text_representation
      then
        raise exception
          'A versão anterior da auditoria é inválida';
    end;
  end if;

  begin
    if
      (
        p_audit_event ->>
          'candidate_state_version'
      )::integer <>
        p_candidate_state_version
    then
      raise exception
        'A versão candidata da auditoria é incompatível';
    end if;

    v_generated_at :=
      (
        p_audit_event ->> 'generated_at'
      )::timestamp with time zone;
  exception
    when invalid_text_representation
      or datetime_field_overflow
    then
      raise exception
        'A auditoria possui versão ou horário inválido';
  end;

  if
    v_generated_at >
      clock_timestamp() + interval '5 minutes'
  then
    raise exception
      'A auditoria não pode estar no futuro';
  end if;

  if
    p_audit_event -> 'automatic_crm_write'
      is distinct from 'false'::jsonb
    or
    p_audit_event -> 'automatic_agenda_write'
      is distinct from 'false'::jsonb
  then
    raise exception
      'A persistência stateful não pode alterar CRM ou Agenda';
  end if;

  if
    jsonb_typeof(
      p_audit_event -> 'normalized_output'
    ) <> 'object'
  then
    raise exception
      'normalized_output precisa ser um objeto';
  end if;

  v_output_contract_version :=
    p_audit_event
      -> 'normalized_output'
      ->> 'contract_version';

  if
    v_output_contract_version <>
      'stateful-copilot-v2'
  then
    raise exception
      'Contrato da análise normalizada incompatível';
  end if;

  if
    jsonb_typeof(
      p_audit_event -> 'execution'
    ) <> 'object'
  then
    raise exception
      'execution precisa ser um objeto';
  end if;

  if
    jsonb_typeof(
      p_audit_event -> 'analyzed_message_ids'
    ) <> 'array'
    or
    jsonb_typeof(
      p_audit_event -> 'evidence_message_ids'
    ) <> 'array'
    or
    jsonb_typeof(
      p_audit_event -> 'memory_ids'
    ) <> 'array'
  then
    raise exception
      'Os identificadores da auditoria precisam ser listas';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      p_audit_event -> 'analyzed_message_ids'
    ) item
    where jsonb_typeof(item) <> 'string'
  ) then
    raise exception
      'analyzed_message_ids aceita somente textos';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      p_audit_event -> 'evidence_message_ids'
    ) item
    where jsonb_typeof(item) <> 'string'
  ) then
    raise exception
      'evidence_message_ids aceita somente textos';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      p_audit_event -> 'memory_ids'
    ) item
    where jsonb_typeof(item) <> 'string'
  ) then
    raise exception
      'memory_ids aceita somente textos';
  end if;

  select
    coalesce(
      array_agg(
        item.value
        order by item.ordinality
      ),
      '{}'::text[]
    )
  into v_analyzed_message_ids
  from jsonb_array_elements_text(
    p_audit_event -> 'analyzed_message_ids'
  )
  with ordinality
    as item(value, ordinality);

  select
    coalesce(
      array_agg(
        item.value
        order by item.ordinality
      ),
      '{}'::text[]
    )
  into v_evidence_message_ids
  from jsonb_array_elements_text(
    p_audit_event -> 'evidence_message_ids'
  )
  with ordinality
    as item(value, ordinality);

  select
    coalesce(
      array_agg(
        item.value
        order by item.ordinality
      ),
      '{}'::text[]
    )
  into v_memory_ids
  from jsonb_array_elements_text(
    p_audit_event -> 'memory_ids'
  )
  with ordinality
    as item(value, ordinality);

  if cardinality(v_analyzed_message_ids) = 0 then
    raise exception
      'A auditoria precisa declarar mensagens analisadas';
  end if;

  if not (
    v_evidence_message_ids <@
      v_analyzed_message_ids
  ) then
    raise exception
      'Toda evidência precisa pertencer às mensagens analisadas';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_operation_key,
      0
    )
  );

  select
    event.id,
    event.state_record_id,
    event.company_id,
    event.cycle_id,
    event.conversation_key,
    event.candidate_state_version,
    event.persisted_at
  into
    v_existing_event_id,
    v_existing_state_record_id,
    v_existing_company_id,
    v_existing_cycle_id,
    v_existing_conversation_key,
    v_existing_candidate_version,
    v_existing_persisted_at
  from public.companion_commercial_state_events
    event
  where event.operation_key =
    v_operation_key;

  if found then
    if
      v_existing_company_id <>
        p_company_id
      or
      v_existing_cycle_id <>
        p_cycle_id
      or
      v_existing_conversation_key <>
        v_conversation_key
      or
      v_existing_candidate_version <>
        p_candidate_state_version
    then
      raise exception
        'operation_key já foi utilizada por outra gravação';
    end if;

    return query
    select
      'persisted'::text,
      v_existing_state_record_id,
      v_existing_event_id,
      v_existing_candidate_version,
      v_existing_persisted_at,
      null::integer,
      null::timestamp with time zone;

    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_company_id::text
      || ':'
      || p_cycle_id::text
      || ':'
      || v_conversation_key,
      0
    )
  );

  perform 1
  from public.sales_cycles cycle
  where cycle.company_id =
      p_company_id
    and cycle.id =
      p_cycle_id
  for share;

  if not found then
    raise exception
      'Ciclo comercial não encontrado na empresa informada';
  end if;

  select
    state.id,
    state.state_version,
    state.state_updated_at
  into
    v_state_record_id,
    v_current_state_version,
    v_current_state_updated_at
  from public.companion_commercial_states
    state
  where state.company_id =
      p_company_id
    and state.cycle_id =
      p_cycle_id
    and state.conversation_key =
      v_conversation_key
  for update;

  if p_expected_previous_state_version is null then
    if found then
      return query
      select
        'conflict'::text,
        null::uuid,
        null::uuid,
        null::integer,
        null::timestamp with time zone,
        v_current_state_version,
        v_current_state_updated_at;

      return;
    end if;
  else
    if not found then
      return query
      select
        'conflict'::text,
        null::uuid,
        null::uuid,
        null::integer,
        null::timestamp with time zone,
        null::integer,
        null::timestamp with time zone;

      return;
    end if;

    if
      v_current_state_version <>
        p_expected_previous_state_version
      or
      v_current_state_updated_at
        is distinct from
          p_expected_previous_state_updated_at
    then
      return query
      select
        'conflict'::text,
        null::uuid,
        null::uuid,
        null::integer,
        null::timestamp with time zone,
        v_current_state_version,
        v_current_state_updated_at;

      return;
    end if;
  end if;

  v_persisted_at :=
    clock_timestamp();

  if p_expected_previous_state_version is null then
    insert into
      public.companion_commercial_states (
        company_id,
        cycle_id,
        conversation_key,
        state_version,
        state_contract_version,
        state_updated_at,
        state_snapshot,
        created_at,
        persisted_at
      )
    values (
      p_company_id,
      p_cycle_id,
      v_conversation_key,
      p_candidate_state_version,
      v_state_contract_version,
      v_state_updated_at,
      p_state_snapshot,
      v_persisted_at,
      v_persisted_at
    )
    returning id
    into v_state_record_id;
  else
    update public.companion_commercial_states
    set
      state_version =
        p_candidate_state_version,
      state_contract_version =
        v_state_contract_version,
      state_updated_at =
        v_state_updated_at,
      state_snapshot =
        p_state_snapshot,
      persisted_at =
        v_persisted_at
    where id =
      v_state_record_id;
  end if;

  insert into
    public.companion_commercial_state_events (
      operation_key,
      state_record_id,
      company_id,
      cycle_id,
      conversation_key,
      previous_state_version,
      candidate_state_version,
      state_contract_version,
      output_contract_version,
      state_snapshot,
      normalized_output,
      execution,
      analyzed_message_ids,
      evidence_message_ids,
      memory_ids,
      automatic_crm_write,
      automatic_agenda_write,
      generated_at,
      persisted_at
    )
  values (
    v_operation_key,
    v_state_record_id,
    p_company_id,
    p_cycle_id,
    v_conversation_key,
    p_expected_previous_state_version,
    p_candidate_state_version,
    v_state_contract_version,
    v_output_contract_version,
    p_state_snapshot,
    p_audit_event -> 'normalized_output',
    p_audit_event -> 'execution',
    v_analyzed_message_ids,
    v_evidence_message_ids,
    v_memory_ids,
    false,
    false,
    v_generated_at,
    v_persisted_at
  )
  returning id
  into v_audit_event_id;

  return query
  select
    'persisted'::text,
    v_state_record_id,
    v_audit_event_id,
    p_candidate_state_version,
    v_persisted_at,
    null::integer,
    null::timestamp with time zone;
end;
$$;

revoke all
on function public.rpc_persist_stateful_copilot_state(
  text,
  uuid,
  uuid,
  text,
  integer,
  timestamp with time zone,
  integer,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute
on function public.rpc_persist_stateful_copilot_state(
  text,
  uuid,
  uuid,
  text,
  integer,
  timestamp with time zone,
  integer,
  jsonb,
  jsonb
)
to service_role;

comment on table public.companion_commercial_states is
  'Fotografia atual e versionada da memória comercial do Companion stateful.';

comment on table public.companion_commercial_state_events is
  'Histórico append-only das análises e estados persistidos pelo Companion stateful.';

comment on function public.rpc_persist_stateful_copilot_state(
  text,
  uuid,
  uuid,
  text,
  integer,
  timestamp with time zone,
  integer,
  jsonb,
  jsonb
) is
  'Persiste estado e auditoria de forma atômica, idempotente e protegida por versão.';
