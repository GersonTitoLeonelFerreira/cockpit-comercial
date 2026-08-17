-- Yolen Companion V2 - Fase 5.4
-- Auditoria durável do piloto active.
--
-- Esta estrutura:
-- - não ativa o V2;
-- - não altera CRM;
-- - não altera Agenda;
-- - não armazena conteúdo da conversa;
-- - permanece acessível somente por operações server-side.

create table public.companion_active_pilot_events (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  cycle_id uuid not null,

  event_type text not null,
  health text not null,

  kill_switch_recommended boolean not null,

  duration_ms integer not null,

  fallback_reason text,

  telemetry jsonb not null,

  recorded_at timestamp with time zone
    default clock_timestamp()
    not null,

  constraint companion_active_pilot_events_cycle_fkey
    foreign key (
      company_id,
      cycle_id
    )
    references public.sales_cycles (
      company_id,
      id
    )
    on delete restrict,

  constraint companion_active_pilot_events_event_type_check
    check (
      event_type in (
        'active_success',
        'active_fallback_v1',
        'active_unhandled_fallback_v1'
      )
    ),

  constraint companion_active_pilot_events_health_check
    check (
      health in (
        'healthy',
        'degraded',
        'critical'
      )
    ),

  constraint companion_active_pilot_events_duration_check
    check (
      duration_ms >= 0
    ),

  constraint companion_active_pilot_events_telemetry_object_check
    check (
      jsonb_typeof(telemetry) =
        'object'
    ),

  constraint companion_active_pilot_events_required_fields_check
    check (
      telemetry ?& array[
        'phase',
        'channel',
        'event',
        'company_id',
        'cycle_id',
        'duration_ms',
        'health',
        'kill_switch_recommended'
      ]
    ),

  constraint companion_active_pilot_events_phase_check
    check (
      telemetry ->> 'phase' =
        'phase-5.4'
      and
      telemetry ->> 'channel' =
        'active_pilot'
    ),

  constraint companion_active_pilot_events_scope_check
    check (
      telemetry ->> 'company_id' =
        company_id::text
      and
      telemetry ->> 'cycle_id' =
        cycle_id::text
    ),

  constraint companion_active_pilot_events_payload_check
    check (
      telemetry ->> 'event' =
        event_type
      and
      telemetry ->> 'health' =
        health
      and
      (
        telemetry ->> 'duration_ms'
      )::integer =
        duration_ms
      and
      (
        telemetry ->> 'kill_switch_recommended'
      )::boolean =
        kill_switch_recommended
    ),

  constraint companion_active_pilot_events_no_conversation_content_check
    check (
      not (
        telemetry ?| array[
          'conversation_text',
          'messages',
          'suggested_message'
        ]
      )
    )
);

create index
  companion_active_pilot_events_company_time_idx
on public.companion_active_pilot_events (
  company_id,
  recorded_at desc
);

create index
  companion_active_pilot_events_company_health_idx
on public.companion_active_pilot_events (
  company_id,
  health,
  recorded_at desc
);

alter table
  public.companion_active_pilot_events
enable row level security;

alter table
  public.companion_active_pilot_events
force row level security;

create policy
  companion_active_pilot_events_client_access_denied
on public.companion_active_pilot_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table public.companion_active_pilot_events
from public, anon, authenticated, service_role;

grant select
on table public.companion_active_pilot_events
to service_role;

create or replace function
  public.rpc_record_companion_active_pilot_event(
    p_company_id uuid,
    p_cycle_id uuid,
    p_telemetry jsonb
  )
returns table (
  event_id uuid,
  recorded_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_event_type text;
  v_health text;
  v_fallback_reason text;

  v_kill_switch_recommended boolean;

  v_duration_ms integer;

  v_event_id uuid;
  v_recorded_at timestamp with time zone;
begin
  if p_company_id is null then
    raise exception
      'company_id é obrigatório';
  end if;

  if p_cycle_id is null then
    raise exception
      'cycle_id é obrigatório';
  end if;

  if
    p_telemetry is null
    or jsonb_typeof(p_telemetry) <>
      'object'
  then
    raise exception
      'telemetry precisa ser um objeto JSON';
  end if;

  if
    p_telemetry ->> 'phase' <>
      'phase-5.4'
    or
    p_telemetry ->> 'channel' <>
      'active_pilot'
  then
    raise exception
      'Contrato da telemetria do piloto incompatível';
  end if;

  if
    p_telemetry ->> 'company_id' <>
      p_company_id::text
  then
    raise exception
      'A telemetria pertence a outra empresa';
  end if;

  if
    p_telemetry ->> 'cycle_id' <>
      p_cycle_id::text
  then
    raise exception
      'A telemetria pertence a outro ciclo';
  end if;

  if
    p_telemetry ?|
      array[
        'conversation_text',
        'messages',
        'suggested_message'
      ]
  then
    raise exception
      'A telemetria não pode armazenar conteúdo da conversa';
  end if;

  v_event_type :=
    p_telemetry ->> 'event';

  if
    v_event_type not in (
      'active_success',
      'active_fallback_v1',
      'active_unhandled_fallback_v1'
    )
  then
    raise exception
      'Evento de telemetria active inválido';
  end if;

  v_health :=
    p_telemetry ->> 'health';

  if
    v_health not in (
      'healthy',
      'degraded',
      'critical'
    )
  then
    raise exception
      'Health da telemetria active inválido';
  end if;

  begin
    v_duration_ms :=
      (
        p_telemetry ->> 'duration_ms'
      )::integer;

    v_kill_switch_recommended :=
      (
        p_telemetry ->> 'kill_switch_recommended'
      )::boolean;
  exception
    when invalid_text_representation
    then
      raise exception
        'Campos numéricos ou booleanos da telemetria são inválidos';
  end;

  if
    v_duration_ms is null
    or v_duration_ms < 0
  then
    raise exception
      'duration_ms precisa ser maior ou igual a zero';
  end if;

  v_fallback_reason :=
    nullif(
      btrim(
        coalesce(
          p_telemetry ->> 'fallback_reason',
          ''
        )
      ),
      ''
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

  insert into
    public.companion_active_pilot_events (
      company_id,
      cycle_id,
      event_type,
      health,
      kill_switch_recommended,
      duration_ms,
      fallback_reason,
      telemetry
    )
  values (
    p_company_id,
    p_cycle_id,
    v_event_type,
    v_health,
    v_kill_switch_recommended,
    v_duration_ms,
    v_fallback_reason,
    p_telemetry
  )
  returning
    id,
    companion_active_pilot_events.recorded_at
  into
    v_event_id,
    v_recorded_at;

  return query
  select
    v_event_id,
    v_recorded_at;
end;
$$;

revoke all
on function
  public.rpc_record_companion_active_pilot_event(
    uuid,
    uuid,
    jsonb
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_record_companion_active_pilot_event(
    uuid,
    uuid,
    jsonb
  )
to service_role;
