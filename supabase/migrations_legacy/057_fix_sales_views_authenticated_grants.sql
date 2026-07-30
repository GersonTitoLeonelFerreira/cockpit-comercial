-- =============================================================================
-- Migration 057 — Fix authenticated grants on legacy sales views
-- =============================================================================
-- Fase 7B — Views antigas e relatórios com dados globais
--
-- Objetivo:
-- 1. Remover privilégios antigos e excessivos de authenticated nas views.
-- 2. Manter apenas SELECT para authenticated.
-- 3. Garantir que anon continue sem acesso.
-- 4. Preservar service_role.
--
-- Contexto:
-- A migration 056 recriou as views com security_invoker = true, mas authenticated
-- ainda manteve privilégios antigos herdados/anteriormente concedidos.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - definição das views
-- - RLS das tabelas
-- - RPCs
-- =============================================================================

begin;

-- =============================================================================
-- 1. Revogar privilégios excessivos de authenticated
-- =============================================================================

revoke all privileges on table public.vw_sales_funnel
from authenticated;

revoke all privileges on table public.vw_sales_lost_analysis
from authenticated;

revoke all privileges on table public.vw_sales_monthly_analysis
from authenticated;

revoke all privileges on table public.vw_sales_cycles_complete
from authenticated;

revoke all privileges on table public.vw_sales_performance_by_owner
from authenticated;

revoke all privileges on table public.vw_sales_cycles_with_revenue
from authenticated;

-- =============================================================================
-- 2. Garantir que anon continue sem acesso
-- =============================================================================

revoke all privileges on table public.vw_sales_funnel
from anon;

revoke all privileges on table public.vw_sales_lost_analysis
from anon;

revoke all privileges on table public.vw_sales_monthly_analysis
from anon;

revoke all privileges on table public.vw_sales_cycles_complete
from anon;

revoke all privileges on table public.vw_sales_performance_by_owner
from anon;

revoke all privileges on table public.vw_sales_cycles_with_revenue
from anon;

-- =============================================================================
-- 3. Conceder somente SELECT para authenticated
-- =============================================================================

grant select on table public.vw_sales_funnel
to authenticated;

grant select on table public.vw_sales_lost_analysis
to authenticated;

grant select on table public.vw_sales_monthly_analysis
to authenticated;

grant select on table public.vw_sales_cycles_complete
to authenticated;

grant select on table public.vw_sales_performance_by_owner
to authenticated;

grant select on table public.vw_sales_cycles_with_revenue
to authenticated;

-- =============================================================================
-- 4. Preservar service_role
-- =============================================================================

grant all privileges on table public.vw_sales_funnel
to service_role;

grant all privileges on table public.vw_sales_lost_analysis
to service_role;

grant all privileges on table public.vw_sales_monthly_analysis
to service_role;

grant all privileges on table public.vw_sales_cycles_complete
to service_role;

grant all privileges on table public.vw_sales_performance_by_owner
to service_role;

grant all privileges on table public.vw_sales_cycles_with_revenue
to service_role;

commit;