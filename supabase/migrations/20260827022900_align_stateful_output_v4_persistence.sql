-- Yolen Companion V2 - Frente EVIDÊNCIA + ESTADO + COERÊNCIA
-- Alinha a persistência stateful ao output contract V4.
--
-- Eventos históricos V2 e V3 permanecem V2 e V3.
-- A tabela aceita V2, V3 históricos e V4 novo.
-- A RPC passa a exigir V4 para novas persistências.
-- Nenhum dado histórico é reescrito.

begin;

lock table
  public.companion_commercial_state_events
in access exclusive mode;

do $migration$
declare
  v_constraint_definition text;
begin
  if to_regclass(
    'public.companion_commercial_state_events'
  ) is null then
    raise exception
      'Tabela companion_commercial_state_events não encontrada';
  end if;

  if exists (
    select 1
    from public.companion_commercial_state_events
    where
      state_contract_version <>
        'phase-5.1-commercial-state-v1'
      or output_contract_version not in (
        'phase-5.1-stateful-copilot-v2',
        'phase-5.2-stateful-copilot-v3'
      )
      or state_snapshot ->> 'contract_version' <>
        'phase-5.1-commercial-state-v1'
      or normalized_output ->> 'contract_version'
        not in (
          'phase-5.1-stateful-copilot-v2',
          'phase-5.2-stateful-copilot-v3'
        )
  ) then
    raise exception
      'Existe evento stateful com contrato desconhecido';
  end if;

  select
    pg_get_constraintdef(
      oid
    )
  into v_constraint_definition
  from pg_constraint
  where conrelid =
      'public.companion_commercial_state_events'::regclass
    and conname =
      'companion_commercial_state_events_contract_check';

  if v_constraint_definition is null then
    raise exception
      'Constraint de contrato dos eventos não encontrada';
  end if;

  if position(
    'phase-5.2-stateful-copilot-v3'
    in v_constraint_definition
  ) = 0 then
    raise exception
      'Constraint atual não reconhece o contrato V3 esperado';
  end if;
end;
$migration$;

alter table
  public.companion_commercial_state_events
drop constraint
  companion_commercial_state_events_contract_check;

alter table
  public.companion_commercial_state_events
add constraint
  companion_commercial_state_events_contract_check
check (
  state_contract_version =
    'phase-5.1-commercial-state-v1'
  and output_contract_version in (
    'phase-5.1-stateful-copilot-v2',
    'phase-5.2-stateful-copilot-v3',
    'phase-5.2-stateful-copilot-v4'
  )
)
not valid;

alter table
  public.companion_commercial_state_events
validate constraint
  companion_commercial_state_events_contract_check;

do $migration$
declare
  v_signature regprocedure;
  v_definition text;

  v_old_output_contract text :=
    'phase-5.2-stateful-copilot-v3';

  v_new_output_contract text :=
    'phase-5.2-stateful-copilot-v4';

  v_occurrences integer;
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

  v_occurrences :=
    (
      char_length(
        v_definition
      )
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

  if v_occurrences <> 1 then
    raise exception
      'A RPC possui % ocorrência(s) inesperada(s) do contrato V3',
      v_occurrences;
  end if;

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
on function
  public.rpc_persist_stateful_copilot_state(
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
from
  public,
  anon,
  authenticated,
  service_role;

grant execute
on function
  public.rpc_persist_stateful_copilot_state(
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

comment on function
  public.rpc_persist_stateful_copilot_state(
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
is
  'Persiste novas análises stateful V4 preservando eventos históricos V2 e V3.';

do $migration$
declare
  v_definition text;
  v_constraint_definition text;
begin
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
    'phase-5.2-stateful-copilot-v4'
    in v_definition
  ) = 0 then
    raise exception
      'RPC não foi atualizada para o output contract V4';
  end if;

  if position(
    quote_literal(
      'phase-5.2-stateful-copilot-v3'
    )
    in v_definition
  ) > 0 then
    raise exception
      'RPC ainda aceita o output contract V3 para novas gravações';
  end if;

  if position(
    quote_literal(
      'phase-5.1-stateful-copilot-v2'
    )
    in v_definition
  ) > 0 then
    raise exception
      'RPC ainda aceita o output contract V2 para novas gravações';
  end if;

  select
    pg_get_constraintdef(
      oid
    )
  into v_constraint_definition
  from pg_constraint
  where conrelid =
      'public.companion_commercial_state_events'::regclass
    and conname =
      'companion_commercial_state_events_contract_check';

  if position(
    'phase-5.1-stateful-copilot-v2'
    in v_constraint_definition
  ) = 0 then
    raise exception
      'Constraint deixou de aceitar histórico V2';
  end if;

  if position(
    'phase-5.2-stateful-copilot-v3'
    in v_constraint_definition
  ) = 0 then
    raise exception
      'Constraint deixou de aceitar histórico V3';
  end if;

  if position(
    'phase-5.2-stateful-copilot-v4'
    in v_constraint_definition
  ) = 0 then
    raise exception
      'Constraint não aceita novos eventos V4';
  end if;

  if exists (
    select 1
    from public.companion_commercial_state_events
    where
      output_contract_version not in (
        'phase-5.1-stateful-copilot-v2',
        'phase-5.2-stateful-copilot-v3',
        'phase-5.2-stateful-copilot-v4'
      )
      or normalized_output ->> 'contract_version'
        not in (
          'phase-5.1-stateful-copilot-v2',
          'phase-5.2-stateful-copilot-v3',
          'phase-5.2-stateful-copilot-v4'
        )
  ) then
    raise exception
      'Histórico contém contrato de saída incompatível';
  end if;
end;
$migration$;

commit;
