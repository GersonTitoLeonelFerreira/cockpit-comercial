-- =============================================================================
-- Migration 046 — Harden table grants and sales cycle period activity RLS
-- =============================================================================
-- Fase 6A — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover acesso anon das tabelas principais do núcleo operacional.
-- 2. Habilitar RLS em public.sales_cycle_period_activity.
-- 3. Criar policies mínimas por company_memberships nessa tabela.
-- 4. Reduzir privilégios perigosos de authenticated nessa tabela.
-- 5. Preservar service_role.
--
-- Contexto:
-- sales_cycle_period_activity é tabela operacional de métricas por competência.
-- Ela é alimentada por triggers/funções internas ligadas a leads e sales_cycles.
-- Portanto não deve ser removida nem bloqueada sem policy.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - views de faturamento
-- - policies das demais tabelas
-- - RPCs
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Remover acesso anon das tabelas principais sensíveis
-- =============================================================================
-- Com RLS ativo, policies ainda protegem linhas.
-- Mesmo assim, anon não precisa ter grants diretos nessas tabelas.
-- sales_cycle_period_activity é ainda mais crítica porque estava sem RLS.

revoke all privileges on table public.admin_events from anon;
revoke all privileges on table public.company_memberships from anon;
revoke all privileges on table public.cycle_events from anon;
revoke all privileges on table public.lead_group_cycles from anon;
revoke all privileges on table public.lead_groups from anon;
revoke all privileges on table public.lead_profiles from anon;
revoke all privileges on table public.leads from anon;
revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.revenue_extra_sources from anon;
revoke all privileges on table public.revenue_goals from anon;
revoke all privileges on table public.revenue_overrides_daily from anon;
revoke all privileges on table public.sales_cycle_period_activity from anon;
revoke all privileges on table public.sales_cycles from anon;

-- Evita que futuras tabelas criadas pelo mesmo owner voltem a nascer expostas para anon.
alter default privileges in schema public
revoke all on tables from anon;

-- =============================================================================
-- 2. Proteger sales_cycle_period_activity com RLS
-- =============================================================================

alter table public.sales_cycle_period_activity enable row level security;

-- Remove policies antigas se alguém tiver criado manualmente antes desta migration.
drop policy if exists "sales_cycle_period_activity_select_by_membership"
on public.sales_cycle_period_activity;

drop policy if exists "sales_cycle_period_activity_insert_by_membership"
on public.sales_cycle_period_activity;

drop policy if exists "sales_cycle_period_activity_update_by_membership"
on public.sales_cycle_period_activity;

-- SELECT:
-- Usuário autenticado só lê linhas da empresa onde possui membership ativa.
create policy "sales_cycle_period_activity_select_by_membership"
on public.sales_cycle_period_activity
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = public.sales_cycle_period_activity.company_id
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
);

-- INSERT:
-- Mantido para authenticated porque a tabela é alimentada por fluxo operacional.
-- A policy garante que a linha inserida pertence a uma empresa onde o usuário tem vínculo ativo.
create policy "sales_cycle_period_activity_insert_by_membership"
on public.sales_cycle_period_activity
for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = public.sales_cycle_period_activity.company_id
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
);

-- UPDATE:
-- Mantido para não quebrar atualização de métricas por competência.
-- A linha antiga e a nova linha precisam pertencer a uma empresa com membership ativa.
create policy "sales_cycle_period_activity_update_by_membership"
on public.sales_cycle_period_activity
for update
to authenticated
using (
  exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = public.sales_cycle_period_activity.company_id
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = public.sales_cycle_period_activity.company_id
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
);

-- =============================================================================
-- 3. Reduzir privilégios perigosos de authenticated na tabela de métricas
-- =============================================================================
-- Authenticated não deve deletar, truncar, criar trigger ou usar REFERENCES
-- nessa tabela operacional.
-- SELECT/INSERT/UPDATE ficam preservados, controlados por RLS.

revoke delete, truncate, trigger, references
on table public.sales_cycle_period_activity
from authenticated;

grant select, insert, update
on table public.sales_cycle_period_activity
to authenticated;

-- service_role preservado para rotinas server-side/admin.
grant all privileges
on table public.sales_cycle_period_activity
to service_role;

commit;