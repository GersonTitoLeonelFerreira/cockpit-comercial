-- =============================================================================
-- Migration 053 — Replace revenue RLS with strict company membership
-- =============================================================================
-- Fase 6B.8 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas de revenue_extra_sources, revenue_goals
--    e revenue_overrides_daily.
-- 2. Substituir current_company_id(), current_profile() e is_admin().
-- 3. Aplicar leitura por membership ativa na empresa.
-- 4. Aplicar escrita somente para admin da empresa.
-- 5. Reduzir grants perigosos de authenticated.
--
-- Regra preservada:
-- - Antes, SELECT era por empresa.
-- - Antes, escrita era para admin.
-- - Esta migration mantém essa lógica, mas troca a base para company_memberships.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - views de revenue
-- - RPCs de revenue
-- - sales_cycles
-- - leads
-- - dashboard
-- - simulador
-- =============================================================================

begin;

-- =============================================================================
-- 1. Remover policies antigas de revenue_extra_sources
-- =============================================================================

drop policy if exists "DELETE revenue_extra_sources"
on public.revenue_extra_sources;

drop policy if exists "INSERT revenue_extra_sources"
on public.revenue_extra_sources;

drop policy if exists "SELECT revenue_extra_sources"
on public.revenue_extra_sources;

drop policy if exists "UPDATE revenue_extra_sources"
on public.revenue_extra_sources;

-- =============================================================================
-- 2. Criar policies novas de revenue_extra_sources
-- =============================================================================

create policy "revenue_extra_sources_select_by_membership"
on public.revenue_extra_sources
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, null)
);

create policy "revenue_extra_sources_insert_by_admin"
on public.revenue_extra_sources
for insert
to authenticated
with check (
  public.has_company_membership_strict(company_id, array['admin'])
  and created_by = (select auth.uid())
);

create policy "revenue_extra_sources_update_by_admin"
on public.revenue_extra_sources
for update
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin'])
)
with check (
  public.has_company_membership_strict(company_id, array['admin'])
);

create policy "revenue_extra_sources_delete_by_admin"
on public.revenue_extra_sources
for delete
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin'])
);

-- =============================================================================
-- 3. Remover policies antigas de revenue_goals
-- =============================================================================

drop policy if exists "revenue_goals_delete"
on public.revenue_goals;

drop policy if exists "revenue_goals_insert"
on public.revenue_goals;

drop policy if exists "revenue_goals_select"
on public.revenue_goals;

drop policy if exists "revenue_goals_update"
on public.revenue_goals;

-- =============================================================================
-- 4. Criar policies novas de revenue_goals
-- =============================================================================

create policy "revenue_goals_select_by_membership"
on public.revenue_goals
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, null)
);

create policy "revenue_goals_insert_by_admin"
on public.revenue_goals
for insert
to authenticated
with check (
  public.has_company_membership_strict(company_id, array['admin'])
  and created_by = (select auth.uid())
);

create policy "revenue_goals_update_by_admin"
on public.revenue_goals
for update
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin'])
)
with check (
  public.has_company_membership_strict(company_id, array['admin'])
);

create policy "revenue_goals_delete_by_admin"
on public.revenue_goals
for delete
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin'])
);

-- =============================================================================
-- 5. Remover policies antigas de revenue_overrides_daily
-- =============================================================================

drop policy if exists "DELETE revenue_overrides_daily"
on public.revenue_overrides_daily;

drop policy if exists "INSERT revenue_overrides_daily"
on public.revenue_overrides_daily;

drop policy if exists "SELECT revenue_overrides_daily"
on public.revenue_overrides_daily;

drop policy if exists "UPDATE revenue_overrides_daily"
on public.revenue_overrides_daily;

-- =============================================================================
-- 6. Criar policies novas de revenue_overrides_daily
-- =============================================================================

create policy "revenue_overrides_daily_select_by_membership"
on public.revenue_overrides_daily
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, null)
);

create policy "revenue_overrides_daily_insert_by_admin"
on public.revenue_overrides_daily
for insert
to authenticated
with check (
  public.has_company_membership_strict(company_id, array['admin'])
  and edited_by = (select auth.uid())
);

create policy "revenue_overrides_daily_update_by_admin"
on public.revenue_overrides_daily
for update
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin'])
)
with check (
  public.has_company_membership_strict(company_id, array['admin'])
  and edited_by = (select auth.uid())
);

create policy "revenue_overrides_daily_delete_by_admin"
on public.revenue_overrides_daily
for delete
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin'])
);

-- =============================================================================
-- 7. Reduzir grants perigosos de authenticated
-- =============================================================================
-- Authenticated não precisa de TRIGGER, TRUNCATE ou REFERENCES nessas tabelas.
-- SELECT/INSERT/UPDATE/DELETE ficam preservados e controlados por RLS.
-- service_role permanece com acesso total.
-- =============================================================================

revoke trigger, truncate, references
on table public.revenue_extra_sources
from authenticated;

revoke trigger, truncate, references
on table public.revenue_goals
from authenticated;

revoke trigger, truncate, references
on table public.revenue_overrides_daily
from authenticated;

grant select, insert, update, delete
on table public.revenue_extra_sources
to authenticated;

grant select, insert, update, delete
on table public.revenue_goals
to authenticated;

grant select, insert, update, delete
on table public.revenue_overrides_daily
to authenticated;

grant all privileges
on table public.revenue_extra_sources
to service_role;

grant all privileges
on table public.revenue_goals
to service_role;

grant all privileges
on table public.revenue_overrides_daily
to service_role;

commit;