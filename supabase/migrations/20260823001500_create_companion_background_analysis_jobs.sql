-- Yolen Companion — FASE 12A
-- Jobs duráveis da análise profunda executada fora do caminho síncrono.
--
-- Não armazena conteúdo da conversa.
-- Não autoriza escrita automática em CRM ou Agenda.
-- Isolamento obrigatório por empresa, ciclo, conversa e watermark.

create table
  public.companion_background_analysis_jobs (
    analysis_job_id text
      primary key,

    company_id uuid
      not null,

    cycle_id uuid
      not null,

    conversation_key text
      not null,

    message_watermark text
      not null,

    status text
      not null,

    requested_at timestamp with time zone
      not null,

    started_at timestamp with time zone,

    completed_at timestamp with time zone,

    runtime_mode text,

    response_source text,

    candidate_state_version integer,

    failure_code text,

    failure_path text,

    failure_invariant text,

    communication_attempts smallint,

    automatic_crm_write boolean
      default false
      not null,

    automatic_agenda_write boolean
      default false
      not null,

    created_at timestamp with time zone
      default clock_timestamp()
      not null,

    updated_at timestamp with time zone
      default clock_timestamp()
      not null,

    constraint
      companion_background_analysis_jobs_id_check
      check (
        analysis_job_id ~
          '^[a-f0-9]{64}$'
      ),

    constraint
      companion_background_analysis_jobs_conversation_check
      check (
        char_length(
          btrim(
            conversation_key
          )
        )
          between 1 and 500
      ),

    constraint
      companion_background_analysis_jobs_watermark_check
      check (
        char_length(
          btrim(
            message_watermark
          )
        )
          between 1 and 200
      ),

    constraint
      companion_background_analysis_jobs_status_check
      check (
        status in (
          'queued',
          'running',
          'succeeded',
          'failed'
        )
      ),

    constraint
      companion_background_analysis_jobs_attempts_check
      check (
        communication_attempts is null
        or communication_attempts in (
          1,
          2
        )
      ),

    constraint
      companion_background_analysis_jobs_timestamps_check
      check (
        (
          status = 'queued'
          and started_at is null
          and completed_at is null
        )
        or
        (
          status = 'running'
          and started_at is not null
          and completed_at is null
        )
        or
        (
          status in (
            'succeeded',
            'failed'
          )
          and started_at is not null
          and completed_at is not null
        )
      ),

    constraint
      companion_background_analysis_jobs_no_auto_write_check
      check (
        automatic_crm_write = false
        and automatic_agenda_write = false
      ),

    constraint
      companion_background_analysis_jobs_scope_unique
      unique (
        company_id,
        cycle_id,
        conversation_key,
        message_watermark
      ),

    constraint
      companion_background_analysis_jobs_cycle_fkey
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
  companion_background_analysis_jobs_scope_time_idx
on public.companion_background_analysis_jobs (
  company_id,
  cycle_id,
  conversation_key,
  requested_at desc
);

create index
  companion_background_analysis_jobs_status_idx
on public.companion_background_analysis_jobs (
  company_id,
  status,
  requested_at desc
);

alter table
  public.companion_background_analysis_jobs
enable row level security;

alter table
  public.companion_background_analysis_jobs
force row level security;

create policy
  companion_background_analysis_jobs_client_denied
on public.companion_background_analysis_jobs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table
  public.companion_background_analysis_jobs
from public, anon, authenticated, service_role;

grant
  select,
  insert,
  update
on table
  public.companion_background_analysis_jobs
to service_role;
