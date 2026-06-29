-- ============================================================================
-- 089_add_site_lead_auto_distribution.sql
-- Estado por empresa do rodízio de leads recebidos pelo site.
-- ============================================================================

begin;

create table if not exists public.company_site_lead_distribution (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_assigned_owner_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.company_site_lead_distribution enable row level security;

revoke all on table public.company_site_lead_distribution from anon, authenticated;

commit;
