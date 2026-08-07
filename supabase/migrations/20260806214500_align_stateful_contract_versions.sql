-- Yolen Companion V2 - Fase 5.1
-- Alinhamento canônico dos contratos da persistência stateful.
--
-- Esta migration é aditiva e corrige os identificadores aceitos pelo banco.
-- Ela não ativa o motor V2, não altera rotas, não atualiza CRM ou Agenda
-- e não substitui o Companion V1.

begin;

lock table
  public.companion_commercial_states
in access exclusive mode;

lock table
  public.companion_commercial_state_events
in access exclusive mode;

do $migration$
begin
  if to_regclass(
    'public.companion_commercial_states'
  ) is null then
    raise exception
      'Tabela companion_commercial_states não encontrada';
  end if;

  if to_regclass(
    'public.companion_commercial_state_events'
  ) is null then
    raise exception
      'Tabela companion_commercial_state_events não encontrada';
  end if;

  if exists (
    select 1
    from public.companion_commercial_states
    where state_contract_version not in (
      'stateful-commercial-state-v1',
      'phase-5.1-commercial-state-v1'
    )
  ) then
    raise exception
      'Existe estado persistido com contrato desconhecido';
  end if;

  if exists (
    select 1
    from public.companion_commercial_states
    where state_snapshot ->> 'contract_version'
      not in (
        'stateful-commercial-state-v1',
        'phase-5.1-commercial-state-v1'
      )
  ) then
    raise exception
      'Existe fotografia de estado com contrato desconhecido';
  end if;

  if exists (
    select 1
    from public.companion_commercial_state_events
    where state_contract_version not in (
      'stateful-commercial-state-v1',
      'phase-5.1-commercial-state-v1'
    )
  ) then
    raise exception
      'Existe evento stateful com contrato de estado desconhecido';
  end if;

  if exists (
    select 1
    from public.companion_commercial_state_events
    where output_contract_version not in (
      'stateful-copilot-v2',
      'phase-5.1-stateful-copilot-v2'
    )
  ) then
    raise exception
      'Existe evento stateful com contrato de saída desconhecido';
  end if;
end;
$migration$;

alter table public.companion_commercial_states
  drop constraint
    companion_commercial_states_contract_check;

alter table public.companion_commercial_state_events
  drop constraint
    companion_commercial_state_events_contract_check;

update public.companion_commercial_states
set
  state_contract_version =
    'phase-5.1-commercial-state-v1',

  state_snapshot =
    jsonb_set(
      state_snapshot,
      '{contract_version}',
      to_jsonb(
        'phase-5.1-commercial-state-v1'::text
      ),
      false
    )
where
  state_contract_version =
    'stateful-commercial-state-v1'
  or
  state_snapshot ->> 'contract_version' =
    'stateful-commercial-state-v1';

update public.companion_commercial_state_events
set
  state_contract_version =
    'phase-5.1-commercial-state-v1',

  output_contract_version =
    'phase-5.1-stateful-copilot-v2',

  state_snapshot =
    jsonb_set(
      state_snapshot,
      '{contract_version}',
      to_jsonb(
        'phase-5.1-commercial-state-v1'::text
      ),
      false
    ),

  normalized_output =
    jsonb_set(
      normalized_output,
      '{contract_version}',
      to_jsonb(
        'phase-5.1-stateful-copilot-v2'::text
      ),
      false
    )
where
  state_contract_version =
    'stateful-commercial-state-v1'
  or
  output_contract_version =
    'stateful-copilot-v2'
  or
  state_snapshot ->> 'contract_version' =
    'stateful-commercial-state-v1'
  or
  normalized_output ->> 'contract_version' =
    'stateful-copilot-v2';

alter table public.companion_commercial_states
  alter column state_contract_version
  set default
    'phase-5.1-commercial-state-v1';

alter table public.companion_commercial_states
  add constraint
    companion_commercial_states_contract_check
  check (
    state_contract_version =
      'phase-5.1-commercial-state-v1'
  )
  not valid;

alter table public.companion_commercial_state_events
  add constraint
    companion_commercial_state_events_contract_check
  check (
    state_contract_version =
      'phase-5.1-commercial-state-v1'
    and output_contract_version =
      'phase-5.1-stateful-copilot-v2'
  )
  not valid;

alter table public.companion_commercial_states
  validate constraint
    companion_commercial_states_contract_check;

alter table public.companion_commercial_state_events
  validate constraint
    companion_commercial_state_events_contract_check;

do $migration$
declare
  v_signature regprocedure;

  v_definition text;

  v_old_state_contract text :=
    'stateful-commercial-state-v1';

  v_new_state_contract text :=
    'phase-5.1-commercial-state-v1';

  v_old_output_contract text :=
    'stateful-copilot-v2';

  v_new_output_contract text :=
    'phase-5.1-stateful-copilot-v2';

  v_state_occurrences integer;
  v_output_occurrences integer;
begin
  v_signature :=
    to_regprocedure(
      'public.rpc_persist_stateful_copilot_state(
        text,
        uuid,
        uuid,
        text,
        integer,
        timestamp with time zone,
        integer,
        jsonb,
        jsonb
      )'
    );

  if v_signature is null then
    raise exception
      'RPC rpc_persist_stateful_copilot_state não encontrada';
  end if;

  select
    pg_get_functiondef(
      v_signature
    )
  into v_definition;

  v_state_occurrences :=
    (
      char_length(v_definition)
      -
      char_length(
        replace(
          v_definition,
          v_old_state_contract,
          ''
        )
      )
    )
    /
    char_length(
      v_old_state_contract
    );

  v_output_occurrences :=
    (
      char_length(v_definition)
      -
      char_length(
        replace(
          v_definition,
          v_old_output_contract,
          ''
        )
      )
    )
    /
    char_length(
      v_old_output_contract
    );

  if v_state_occurrences <> 1 then
    raise exception
      'A RPC possui % ocorrência(s) inesperada(s) do contrato antigo de estado',
      v_state_occurrences;
  end if;

  if v_output_occurrences <> 1 then
    raise exception
      'A RPC possui % ocorrência(s) inesperada(s) do contrato antigo de saída',
      v_output_occurrences;
  end if;

  v_definition :=
    replace(
      v_definition,
      v_old_state_contract,
      v_new_state_contract
    );

  v_definition :=
    replace(
      v_definition,
      v_old_output_contract,
      v_new_output_contract
    );

  execute v_definition;
end;
$migration$;

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
  'Persiste estado e auditoria stateful usando os contratos canônicos da Fase 5.1.';

do $migration$
declare
  v_definition text;
begin
  if exists (
    select 1
    from public.companion_commercial_states
    where state_contract_version <>
      'phase-5.1-commercial-state-v1'
      or state_snapshot ->> 'contract_version' <>
        'phase-5.1-commercial-state-v1'
  ) then
    raise exception
      'O alinhamento do contrato dos estados não foi concluído';
  end if;

  if exists (
    select 1
    from public.companion_commercial_state_events
    where state_contract_version <>
      'phase-5.1-commercial-state-v1'
      or output_contract_version <>
        'phase-5.1-stateful-copilot-v2'
      or state_snapshot ->> 'contract_version' <>
        'phase-5.1-commercial-state-v1'
      or normalized_output ->> 'contract_version' <>
        'phase-5.1-stateful-copilot-v2'
  ) then
    raise exception
      'O alinhamento do contrato dos eventos não foi concluído';
  end if;

  select
    pg_get_functiondef(
      'public.rpc_persist_stateful_copilot_state(
        text,
        uuid,
        uuid,
        text,
        integer,
        timestamp with time zone,
        integer,
        jsonb,
        jsonb
      )'::regprocedure
    )
  into v_definition;

  if position(
    'phase-5.1-commercial-state-v1'
    in v_definition
  ) = 0 then
    raise exception
      'A RPC não recebeu o contrato canônico de estado';
  end if;

  if position(
    'phase-5.1-stateful-copilot-v2'
    in v_definition
  ) = 0 then
    raise exception
      'A RPC não recebeu o contrato canônico de saída';
  end if;

  if position(
    'stateful-commercial-state-v1'
    in v_definition
  ) > 0 then
    raise exception
      'A RPC ainda contém o contrato antigo de estado';
  end if;

  if position(
    quote_literal(
      'stateful-copilot-v2'
    )
    in v_definition
  ) > 0 then
    raise exception
      'A RPC ainda contém o contrato antigo de saída';
  end if;
end;
$migration$;

commit;
