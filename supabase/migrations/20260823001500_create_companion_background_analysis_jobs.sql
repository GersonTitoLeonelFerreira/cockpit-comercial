-- Yolen Companion — FASE 12A
-- Jobs duráveis da análise profunda fora do request seller-facing.
--
-- Queue transporta somente identidade/escopo do job.
-- Conteúdo da conversa continua no ledger canônico.
-- CRM e Agenda permanecem fail-closed.

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

    attempt_count smallint
      default 0
      not null,

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
      companion_background_analysis_jobs_status_check
      check (
        status in (
          'queued',
          'running',
          'succeeded',
          'failed',
          'superseded'
        )
      ),

    constraint
      companion_background_analysis_jobs_attempt_count_check
      check (
        attempt_count
          between 0 and 100
      ),

    constraint
      companion_background_analysis_jobs_communication_attempts_check
      check (
        communication_attempts is null
        or communication_attempts in (
          1,
          2
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
