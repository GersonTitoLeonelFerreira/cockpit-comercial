-- =============================================================================
-- Migration 068 — Fix revenue goal ticket_medio search_path
-- =============================================================================
-- Fase 12A — Hardening geral
--
-- Objetivo:
-- Corrigir search_path da versão ativa de rpc_upsert_revenue_goal com ticket_medio.
--
-- Contexto:
-- A migration 067 ajustou a assinatura antiga de 5 parâmetros.
-- A versão ativa atual possui 6 parâmetros e foi criada na migration 060.
-- =============================================================================

begin;

alter function public.rpc_upsert_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date,
  p_goal_value numeric,
  p_ticket_medio numeric
)
set search_path = public, auth, pg_temp;

commit;