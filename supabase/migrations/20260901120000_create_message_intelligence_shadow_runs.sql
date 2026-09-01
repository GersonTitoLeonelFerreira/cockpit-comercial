-- Message Intelligence Engine V1 — Shadow Validation
--
-- Domínio de persistência dedicado ao shadow: NADA aqui é seller-facing
-- e NADA aqui é lido pelo gerador atual. Uma run compara o resultado do
-- gerador legacy (o único que o vendedor vê) com o resultado do MIE V1,
-- para coleta de evidência de readiness — nunca para execução.
--
-- Minimização: esta tabela NÃO guarda cópia da conversa. O ledger
-- (conversation_messages) continua a fonte canônica; cycle_id +
-- conversation_key + reference_time bastam para recuperar o contexto
-- quando necessário para auditoria.
--
-- Safety fixa: automatic_send, automatic_crm_write e
-- automatic_agenda_write são sempre false, e um constraint de banco
-- impede fisicamente qualquer valor diferente de false nas três
-- colunas — nenhuma ação automática pode nascer deste domínio.

create table
  public.message_intelligence_shadow_runs (
    shadow_run_id uuid
      primary key,

    company_id uuid
      not null,

    seller_user_id uuid
      not null,

    cycle_id uuid
      not null,

    conversation_key text
      not null,

    reference_time timestamp with time zone
      not null,

    seller_intent text
      not null,

    legacy_generation_status text
      not null,

    legacy_message text,

    execution_status text
      not null
      default 'queued',

    failure_code text,

    failure_detail text,

    mie_final_status text,

    mie_selected_candidate_id text,

    mie_message text,

    hard_gate_status text,

    candidate_count integer,

    hard_gate_pass_count integer,

    critic_evaluated_count integer,

    selected_critic_status text,

    selected_overall_score numeric,

    would_surface_message boolean,

    automatic_send boolean
      not null
      default false,

    automatic_crm_write boolean
      not null
      default false,

    automatic_agenda_write boolean
      not null
      default false,

    shadow_evaluation jsonb,

    contract_versions jsonb,

    created_at timestamp with time zone
      not null
      default clock_timestamp(),

    completed_at timestamp with time zone,

    constraint
      message_intelligence_shadow_runs_legacy_status_check
      check (
        legacy_generation_status in (
          'ready',
          'error'
        )
      ),

    constraint
      message_intelligence_shadow_runs_execution_status_check
      check (
        execution_status in (
          'queued',
          'running',
          'succeeded',
          'failed'
        )
      ),

    constraint
      message_intelligence_shadow_runs_final_status_check
      check (
        mie_final_status is null
        or mie_final_status in (
          'selected',
          'no_acceptable_message',
          'no_eligible_candidates',
          'blocked',
          'approval_required',
          'inconsistent_input'
        )
      ),

    constraint
      message_intelligence_shadow_runs_hard_gate_status_check
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
      message_intelligence_shadow_runs_critic_status_check
      check (
        selected_critic_status is null
        or selected_critic_status in (
          'recommended',
          'acceptable'
        )
      ),

    constraint
      message_intelligence_shadow_runs_candidate_count_check
      check (
        candidate_count is null
        or candidate_count >= 0
      ),

    constraint
      message_intelligence_shadow_runs_hard_gate_pass_count_check
      check (
        hard_gate_pass_count is null
        or hard_gate_pass_count >= 0
      ),

    constraint
      message_intelligence_shadow_runs_critic_evaluated_count_check
      check (
        critic_evaluated_count is null
        or critic_evaluated_count >= 0
      ),

    -- Safety fixa: nenhuma run de shadow pode, sob nenhuma condição,
    -- persistir intenção de ação automática.
    constraint
      message_intelligence_shadow_runs_no_auto_action_check
      check (
        automatic_send = false
        and automatic_crm_write = false
        and automatic_agenda_write = false
      ),

    constraint
      message_intelligence_shadow_runs_cycle_fkey
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
  message_intelligence_shadow_runs_scope_time_idx
on public.message_intelligence_shadow_runs (
  company_id,
  cycle_id,
  conversation_key,
  created_at desc
);

create index
  message_intelligence_shadow_runs_execution_status_idx
on public.message_intelligence_shadow_runs (
  execution_status,
  created_at desc
);

create index
  message_intelligence_shadow_runs_final_status_idx
on public.message_intelligence_shadow_runs (
  mie_final_status,
  created_at desc
);

alter table
  public.message_intelligence_shadow_runs
enable row level security;

alter table
  public.message_intelligence_shadow_runs
force row level security;

-- Nenhum acesso client-side, em nenhuma direção. Esta é uma tabela de
-- evidência interna lida somente pelo Controle Mestre via banco durante
-- o piloto shadow — não por nenhuma rota pública nem pela extensão.
create policy
  message_intelligence_shadow_runs_client_denied
on public.message_intelligence_shadow_runs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table
  public.message_intelligence_shadow_runs
from public, anon, authenticated, service_role;

grant
  select,
  insert,
  update
on table
  public.message_intelligence_shadow_runs
to service_role;
