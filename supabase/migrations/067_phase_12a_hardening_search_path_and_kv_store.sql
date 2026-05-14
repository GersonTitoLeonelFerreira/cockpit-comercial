-- =============================================================================
-- Migration 067 — Phase 12A: hardening search_path and kv_store
-- =============================================================================
-- Fase 12 — Hardening geral
--
-- Objetivo:
-- 1. Corrigir funções com search_path mutável apontadas pelo Security Advisor.
-- 2. Criar policy explícita de bloqueio para public.kv_store_4af580ad.
--
-- Esta migration NÃO mexe em:
-- - SECURITY DEFINER executável por authenticated
-- - leaked password protection
-- - índices duplicados
-- - policies duplicadas
-- - RLS initplan
-- - dashboard visual
-- - simulador visual
-- - faturamento visual
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- =============================================================================

begin;

-- =============================================================================
-- 1. kv_store_4af580ad
-- =============================================================================
-- Diagnóstico confirmado:
-- - RLS ativo
-- - 17 linhas existentes
-- - nenhuma policy
-- - sem uso encontrado no repositório
--
-- Decisão:
-- - não apagar tabela
-- - não liberar SELECT/INSERT/UPDATE/DELETE para client
-- - criar policy explícita de bloqueio
-- =============================================================================

drop policy if exists "kv_store_internal_no_client_access" on public.kv_store_4af580ad;

create policy "kv_store_internal_no_client_access"
on public.kv_store_4af580ad
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- =============================================================================
-- 2. Fix search_path das funções apontadas pelo Advisor
-- =============================================================================
-- Padrão:
-- public, auth, pg_temp
--
-- public = schema principal do sistema
-- auth = necessário para funções que usam auth.uid()
-- pg_temp = reduz risco de resolução insegura de objetos temporários
-- =============================================================================

alter function public.assign_leads(
  p_company_id uuid,
  p_lead_ids uuid[],
  p_mode text,
  p_to_owner_id uuid,
  p_seller_ids uuid[],
  p_only_if_pool boolean
)
set search_path = public, auth, pg_temp;

alter function public.assign_leads(
  p_company_id uuid,
  p_source text,
  p_limit integer,
  p_lead_ids uuid[],
  p_status text,
  p_search text,
  p_mode text,
  p_to_owner_id uuid,
  p_seller_ids uuid[],
  p_only_if_pool boolean,
  p_order_mode text
)
set search_path = public, auth, pg_temp;

alter function public.create_default_quick_actions()
set search_path = public, auth, pg_temp;

alter function public.current_profile()
set search_path = public, auth, pg_temp;

alter function public.delete_leads_by_ids(
  lead_ids uuid[],
  company_id_param uuid
)
set search_path = public, auth, pg_temp;

alter function public.fechamentos_por_consultora(
  empresa_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.fn_audit_sales_cycles()
set search_path = public, auth, pg_temp;

alter function public.fn_auto_fill_closed_at()
set search_path = public, auth, pg_temp;

alter function public.fn_cancel_deal(
  p_sales_cycle_id uuid,
  p_canceled_reason text
)
set search_path = public, auth, pg_temp;

alter function public.fn_log_status_change()
set search_path = public, auth, pg_temp;

alter function public.fn_mark_deal_lost(
  p_sales_cycle_id uuid,
  p_lost_reason text,
  p_lost_owner_user_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.fn_mark_deal_won(
  p_sales_cycle_id uuid,
  p_won_owner_user_id uuid,
  p_won_total numeric,
  p_won_items integer,
  p_won_note text
)
set search_path = public, auth, pg_temp;

alter function public.fn_pause_deal(
  p_sales_cycle_id uuid,
  p_paused_reason text
)
set search_path = public, auth, pg_temp;

alter function public.fn_products_updated_at()
set search_path = public, auth, pg_temp;

alter function public.fn_resume_deal(
  p_sales_cycle_id uuid,
  p_new_status text
)
set search_path = public, auth, pg_temp;

alter function public.gargalo_funil(
  empresa_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.get_avg_ticket_won(
  p_company_id uuid,
  p_days integer
)
set search_path = public, auth, pg_temp;

alter function public.get_funnel_metrics(
  p_company_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_owner_id uuid,
  p_goal_closed integer
)
set search_path = public, auth, pg_temp;

alter function public.get_funnel_metrics_for_profiles(
  p_company_id uuid,
  p_profile_ids uuid[],
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_goal_closed integer
)
set search_path = public, auth, pg_temp;

alter function public.get_funnel_metrics_group(
  p_company_id uuid,
  p_owner_ids uuid[],
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_goal_closed integer
)
set search_path = public, auth, pg_temp;

alter function public.get_goal_simulation_stats(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_owner_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.get_goal_simulation_stats_v2(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_owner_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.log_lead_stage_change()
set search_path = public, auth, pg_temp;

alter function public.log_lead_status_change()
set search_path = public, auth, pg_temp;

alter function public.next_user_code(
  p_company_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.reassign_owner_leads(
  p_company_id uuid,
  p_from_owner_id uuid,
  p_to_owner_id uuid,
  p_limit integer,
  p_status text,
  p_search text,
  p_order_mode text
)
set search_path = public, auth, pg_temp;

alter function public.report_ai_top_next_actions(
  p_company_id uuid,
  p_since timestamp with time zone,
  p_user_id uuid,
  p_limit integer
)
set search_path = public, auth, pg_temp;

alter function public.report_ai_top_objections(
  p_company_id uuid,
  p_since timestamp with time zone,
  p_user_id uuid,
  p_limit integer
)
set search_path = public, auth, pg_temp;

alter function public.report_meta_vs_real(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
set search_path = public, auth, pg_temp;

alter function public.report_sla_risk(
  p_company_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.report_stage_conversion(
  p_company_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.report_stage_losses(
  p_company_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.report_stage_time_summary(
  p_company_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.return_owner_leads_to_pool(
  p_company_id uuid,
  p_owner_id uuid,
  p_limit integer,
  p_status text,
  p_search text
)
set search_path = public, auth, pg_temp;

alter function public.round_robin_from_owner_leads(
  p_company_id uuid,
  p_from_owner_id uuid,
  p_seller_ids uuid[],
  p_limit integer,
  p_status text,
  p_search text,
  p_order_mode text
)
set search_path = public, auth, pg_temp;

alter function public.rpc_revenue_summary(
  p_company_id uuid,
  p_owner_id uuid,
  p_start_date date,
  p_end_date date,
  p_metric text
)
set search_path = public, auth, pg_temp;

alter function public.rpc_upsert_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date,
  p_goal_value numeric
)
set search_path = public, auth, pg_temp;

alter function public.seller_get_context()
set search_path = public, auth, pg_temp;

alter function public.seller_move_lead_stage(
  p_company_id uuid,
  p_lead_id uuid,
  p_to_status text,
  p_reason text,
  p_deal_value numeric,
  p_to_stage_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.set_updated_at()
set search_path = public, auth, pg_temp;

alter function public.sync_profile_email()
set search_path = public, auth, pg_temp;

alter function public.tempo_medio_por_etapa(
  empresa_id uuid
)
set search_path = public, auth, pg_temp;

alter function public.trg_set_updated_at()
set search_path = public, auth, pg_temp;

commit;