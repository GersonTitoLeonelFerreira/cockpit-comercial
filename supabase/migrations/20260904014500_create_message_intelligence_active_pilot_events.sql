-- Message Intelligence Engine V1
-- Telemetria durável da ativação seller-facing controlada.
--
-- Esta tabela NÃO armazena:
-- - conteúdo da conversa;
-- - seller intent;
-- - conversation_key;
-- - mensagem legacy;
-- - mensagem produzida pelo MIE.
--
-- Serve exclusivamente para provar quando o MIE foi exposto,
-- quando caiu para o gerador atual e quando houve falha técnica.

create table
  public.message_intelligence_active_pilot_events (
    id uuid
      primary key
      default gen_random_uuid(),

    company_id uuid
      not null,

    seller_user_id uuid
      not null,

    cycle_id uuid
      not null,

    event_type text
      not null,

    duration_ms integer
      not null,

    final_status text,

    would_surface_message boolean,

    selected_overall_score numeric,

    hard_gate_status text,

    selected_critic_status text,

    automatic_send boolean
      not null
      default false,

    automatic_crm_write boolean
      not null
      default false,

    automatic_agenda_write boolean
      not null
      default false,

    created_at timestamp with time zone
      not null
      default clock_timestamp(),

    constraint
      message_intelligence_active_pilot_event_type_check
      check (
        event_type in (
          'active_selected',
          'active_fallback_no_message',
          'active_execution_failed'
        )
      ),

    constraint
      message_intelligence_active_pilot_duration_check
      check (
        duration_ms >= 0
      ),

    constraint
      message_intelligence_active_pilot_final_status_check
      check (
        final_status is null
        or final_status in (
          'selected',
          'no_acceptable_message',
          'no_eligible_candidates',
          'blocked',
          'approval_required',
          'inconsistent_input'
        )
      ),

    constraint
      message_intelligence_active_pilot_hard_gate_check
      check (
        hard_gate_status is null
        or hard_gate_status in (
          'all_passed',
          'partially_passed',
          'all_failed',
          'blocked',
          'approval_required'
        )
      ),

    constraint
      message_intelligence_active_pilot_critic_check
      check (
        selected_critic_status is null
        or selected_critic_status in (
          'recommended',
          'acceptable'
        )
      ),

    constraint
      message_intelligence_active_pilot_score_check
      check (
        selected_overall_score is null
        or (
          selected_overall_score >= 0
          and selected_overall_score <= 100
        )
      ),

    constraint
      message_intelligence_active_pilot_event_payload_check
      check (
        (
          event_type =
            'active_selected'
          and final_status =
            'selected'
          and would_surface_message =
            true
        )
        or
        (
          event_type =
            'active_fallback_no_message'
          and final_status is not null
        )
        or
        (
          event_type =
            'active_execution_failed'
          and final_status is null
          and would_surface_message is null
        )
      ),

    -- Segurança física:
    -- este domínio nunca pode registrar intenção
    -- de execução automática.
    constraint
      message_intelligence_active_pilot_no_auto_action_check
      check (
        automatic_send = false
        and automatic_crm_write = false
        and automatic_agenda_write = false
      ),

    constraint
      message_intelligence_active_pilot_cycle_fkey
      foreign key (
        company_id,
        cycle_id
      )
      references public.sales_cycles (
        company_id,
        id
      )
      on delete restrict
  );

create index
  message_intelligence_active_pilot_company_time_idx
on public.message_intelligence_active_pilot_events (
  company_id,
  created_at desc
);

create index
  message_intelligence_active_pilot_event_time_idx
on public.message_intelligence_active_pilot_events (
  event_type,
  created_at desc
);

alter table
  public.message_intelligence_active_pilot_events
enable row level security;

alter table
  public.message_intelligence_active_pilot_events
force row level security;

create policy
  message_intelligence_active_pilot_client_denied
on public.message_intelligence_active_pilot_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table
  public.message_intelligence_active_pilot_events
from public, anon, authenticated, service_role;

grant
  select,
  insert
on table
  public.message_intelligence_active_pilot_events
to service_role;
