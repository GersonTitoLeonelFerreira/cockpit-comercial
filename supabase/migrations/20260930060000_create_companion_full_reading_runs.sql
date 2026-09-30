-- Leitura completa (full reading) — execuções em modo de teste
--
-- Domínio próprio da leitura completa da conversa por um modelo com
-- raciocínio (Claude). NADA aqui é seller-facing e NADA aqui é lido pelo
-- pipeline atual (diagnóstico, estado comercial, AGORA, MENSAGEM). Uma
-- execução lê a conversa inteira do ledger, escreve a análise e grava o
-- resultado para comparação com o gabarito.
--
-- Minimização: esta tabela NÃO guarda cópia da conversa. O ledger
-- (conversation_messages) continua a fonte canônica; cycle_id +
-- conversation_key + reference_time bastam para reconstruir a entrada.
--
-- Isolamento: a tabela é nova e independente; nenhuma tabela existente
-- muda. Acesso somente pelo servidor (service_role).

create table
  public.companion_full_reading_runs (
    run_id uuid
      primary key,

    company_id uuid
      not null,

    cycle_id uuid
      not null,

    conversation_key text
      not null,

    reference_time timestamp with time zone
      not null,

    trigger_source text
      not null,

    vercel_env text,

    deployment_sha text,

    prompt_version text
      not null,

    model text
      not null,

    effort text,

    status text
      not null
      default 'queued',

    failure_code text,

    failure_detail text,

    transcript_message_count integer,

    input_tokens integer,

    output_tokens integer,

    duration_ms integer,

    analysis_markdown text,

    decision jsonb,

    created_at timestamp with time zone
      not null
      default clock_timestamp(),

    started_at timestamp with time zone,

    completed_at timestamp with time zone,

    constraint
      companion_full_reading_runs_status_check
      check (
        status in (
          'queued',
          'running',
          'succeeded',
          'failed'
        )
      ),

    constraint
      companion_full_reading_runs_trigger_source_check
      check (
        trigger_source in (
          'manual_preview',
          'analysis_job'
        )
      ),

    constraint
      companion_full_reading_runs_counts_check
      check (
        (transcript_message_count is null or transcript_message_count >= 0)
        and (input_tokens is null or input_tokens >= 0)
        and (output_tokens is null or output_tokens >= 0)
        and (duration_ms is null or duration_ms >= 0)
      ),

    constraint
      companion_full_reading_runs_cycle_fkey
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
  companion_full_reading_runs_scope_time_idx
on public.companion_full_reading_runs (
  company_id,
  conversation_key,
  created_at desc
);

create index
  companion_full_reading_runs_status_idx
on public.companion_full_reading_runs (
  status,
  created_at desc
);

alter table
  public.companion_full_reading_runs
enable row level security;

alter table
  public.companion_full_reading_runs
force row level security;

-- Nenhum acesso client-side, em nenhuma direção.
create policy
  companion_full_reading_runs_client_denied
on public.companion_full_reading_runs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table
  public.companion_full_reading_runs
from public, anon, authenticated, service_role;

grant
  select,
  insert,
  update
on table
  public.companion_full_reading_runs
to service_role;
