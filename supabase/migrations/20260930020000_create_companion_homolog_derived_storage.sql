-- R10 — isolamento real entre HOMOLOG (Vercel Preview) e PRODUÇÃO.
--
-- Os dois ambientes usam o MESMO banco. Dados-fonte (mensagens, leads,
-- ciclos, configuração comercial) são compartilhados e só lidos pela
-- análise. Os RESULTADOS DERIVADOS da análise (job, estado comercial,
-- Commercial Reading/eventos, etapa do método) de um ambiente nunca podem
-- ser lidos, reaproveitados, recuperados ou sobrescritos pelo outro.
--
-- A produção continua exatamente nas tabelas canônicas (o código da main
-- lê essas tabelas sem nenhum filtro de ambiente, inclusive por ciclo
-- inteiro na memória do ciclo — por isso uma coluna sozinha não bastaria).
-- O HOMOLOG ganha um armazenamento derivado próprio, com as MESMAS regras
-- (constraints, índices únicos, one-running-per-conversation, RLS) e uma
-- RPC de persistência própria gerada a partir da RPC canônica.
--
-- Registros existentes (legado, sem escopo) são explicitamente produção.
-- Nada nas tabelas canônicas muda de comportamento: só ganham a coluna
-- execution_scope com default 'production' (metadado, sem reescrita).

-- ---------------------------------------------------------------------------
-- 1) Escopo explícito nas tabelas canônicas (legado = produção)
-- ---------------------------------------------------------------------------

alter table public.companion_background_analysis_jobs
  add column if not exists execution_scope text not null default 'production'
  constraint companion_background_analysis_jobs_execution_scope_check
  check (execution_scope = 'production');

alter table public.companion_commercial_states
  add column if not exists execution_scope text not null default 'production'
  constraint companion_commercial_states_execution_scope_check
  check (execution_scope = 'production');

alter table public.companion_commercial_state_events
  add column if not exists execution_scope text not null default 'production'
  constraint companion_commercial_state_events_execution_scope_check
  check (execution_scope = 'production');

alter table public.companion_method_stage_state
  add column if not exists execution_scope text not null default 'production'
  constraint companion_method_stage_state_execution_scope_check
  check (execution_scope = 'production');

-- ---------------------------------------------------------------------------
-- 2) Armazenamento derivado do HOMOLOG (mesmas regras, escopo fixo)
-- ---------------------------------------------------------------------------

create table if not exists public.companion_background_analysis_jobs_homolog
  (like public.companion_background_analysis_jobs including all);

alter table public.companion_background_analysis_jobs_homolog
  alter column execution_scope set default 'homolog',
  drop constraint if exists companion_background_analysis_jobs_execution_scope_check,
  add constraint companion_background_analysis_jobs_homolog_execution_scope_check
    check (execution_scope = 'homolog'),
  add constraint companion_background_analysis_jobs_homolog_cycle_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles (company_id, id)
    on delete restrict;

create table if not exists public.companion_commercial_states_homolog
  (like public.companion_commercial_states including all);

alter table public.companion_commercial_states_homolog
  alter column execution_scope set default 'homolog',
  drop constraint if exists companion_commercial_states_execution_scope_check,
  add constraint companion_commercial_states_homolog_execution_scope_check
    check (execution_scope = 'homolog'),
  add constraint companion_commercial_states_homolog_cycle_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles (company_id, id)
    on delete cascade;

create table if not exists public.companion_commercial_state_events_homolog
  (like public.companion_commercial_state_events including all);

alter table public.companion_commercial_state_events_homolog
  alter column execution_scope set default 'homolog',
  drop constraint if exists companion_commercial_state_events_execution_scope_check,
  add constraint companion_commercial_state_events_homolog_execution_scope_check
    check (execution_scope = 'homolog'),
  add constraint companion_commercial_state_events_homolog_cycle_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles (company_id, id)
    on delete restrict,
  add constraint companion_commercial_state_events_homolog_state_fkey
    foreign key (company_id, state_record_id)
    references public.companion_commercial_states_homolog (company_id, id)
    on delete restrict;

create table if not exists public.companion_method_stage_state_homolog
  (like public.companion_method_stage_state including all);

alter table public.companion_method_stage_state_homolog
  alter column execution_scope set default 'homolog',
  drop constraint if exists companion_method_stage_state_execution_scope_check,
  add constraint companion_method_stage_state_homolog_execution_scope_check
    check (execution_scope = 'homolog'),
  add constraint companion_method_stage_state_homolog_cycle_company_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles (company_id, id)
    on delete cascade,
  add constraint companion_method_stage_state_homolog_config_version_fkey
    foreign key (method_config_version_id)
    references public.company_commercial_config_versions (id)
    on delete cascade;

-- Mesmos privilégios das tabelas canônicas: cliente (anon/authenticated)
-- nunca acessa; o service role só lê o estado/eventos (escrita apenas pela
-- RPC SECURITY DEFINER) e lê/grava jobs e etapa do método.
revoke all on table public.companion_background_analysis_jobs_homolog from public, anon, authenticated, service_role;
revoke all on table public.companion_commercial_states_homolog from public, anon, authenticated, service_role;
revoke all on table public.companion_commercial_state_events_homolog from public, anon, authenticated, service_role;
revoke all on table public.companion_method_stage_state_homolog from public, anon, authenticated, service_role;

grant select, insert, update on table public.companion_background_analysis_jobs_homolog to service_role;
grant select on table public.companion_commercial_states_homolog to service_role;
grant select on table public.companion_commercial_state_events_homolog to service_role;
grant select, insert, update on table public.companion_method_stage_state_homolog to service_role;

-- Mesmo isolamento de cliente das tabelas canônicas: só o service role.
alter table public.companion_background_analysis_jobs_homolog enable row level security;
alter table public.companion_commercial_states_homolog enable row level security;
alter table public.companion_commercial_state_events_homolog enable row level security;
alter table public.companion_method_stage_state_homolog enable row level security;

create policy companion_background_analysis_jobs_homolog_client_denied
  on public.companion_background_analysis_jobs_homolog
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy companion_commercial_states_homolog_client_access_denied
  on public.companion_commercial_states_homolog
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy companion_commercial_state_events_homolog_client_access_denied
  on public.companion_commercial_state_events_homolog
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy companion_method_stage_state_homolog_client_access_denied
  on public.companion_method_stage_state_homolog
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- 3) RPC de persistência do HOMOLOG: a MESMA lógica (CAS, idempotência por
--    operation_key, auditoria, proibição de escrita em CRM/Agenda) sobre o
--    armazenamento homolog. Gerada da RPC canônica para nunca divergir.
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.rpc_persist_stateful_copilot_state(text, uuid, uuid, text, integer, timestamp with time zone, integer, jsonb, jsonb)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'public.rpc_persist_stateful_copilot_state(',
    'public.rpc_persist_stateful_copilot_state_homolog('
  );

  v_definition := replace(
    v_definition,
    'public.companion_commercial_state_events',
    'public.companion_commercial_state_events_homolog'
  );

  v_definition := replace(
    v_definition,
    'public.companion_commercial_states',
    'public.companion_commercial_states_homolog'
  );

  -- Locks consultivos (transacionais) em outro espaço de chaves: uma
  -- escrita homolog nunca espera uma escrita de produção da mesma conversa.
  v_definition := regexp_replace(
    v_definition,
    'hashtextextended\(([^()]*),\s*0\s*\)',
    'hashtextextended(\1, 7310)',
    'g'
  );

  if position('public.companion_commercial_states_homolog' in v_definition) = 0
    or position('public.companion_commercial_state_events_homolog' in v_definition) = 0
    or v_definition ~ 'public\.companion_commercial_states([^_]|$)'
    or v_definition ~ 'public\.companion_commercial_state_events([^_]|$)'
    or v_definition ~ 'hashtextextended\([^()]*,\s*0\s*\)'
    or position('7310)' in v_definition) = 0
  then
    raise exception 'RPC homolog não está isolada do armazenamento de produção';
  end if;

  execute v_definition;
end
$migration$;

revoke all on function public.rpc_persist_stateful_copilot_state_homolog(text, uuid, uuid, text, integer, timestamp with time zone, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_persist_stateful_copilot_state_homolog(text, uuid, uuid, text, integer, timestamp with time zone, integer, jsonb, jsonb) to service_role;
