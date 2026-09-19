create table if not exists public.companion_runtime_path_diagnostics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  cycle_id uuid not null,
  analysis_job_id text not null,
  stage text not null
    check (stage in ('producer_retry', 'consumer_start')),
  deployment_sha text,
  vercel_env text,
  queue_topic text,
  consumer_version text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint companion_runtime_path_diagnostics_cycle_fkey
    foreign key (company_id, cycle_id)
    references public.sales_cycles(company_id, id)
    on delete restrict
);

create index if not exists companion_runtime_path_diagnostics_job_time_idx
  on public.companion_runtime_path_diagnostics(
    analysis_job_id,
    recorded_at desc
  );

alter table public.companion_runtime_path_diagnostics
  enable row level security;

revoke all
  on table public.companion_runtime_path_diagnostics
  from anon, authenticated;
