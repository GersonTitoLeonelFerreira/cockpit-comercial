-- =============================================================================
-- Migration 042 — Harden cycle operations for company grants
-- =============================================================================
-- Objetivo:
-- Corrigir privilégios das RPCs criadas na migration 041.
--
-- Problema encontrado:
-- Mesmo após a migration 041, as novas RPCs continuaram executáveis por anon.
--
-- Regra esperada:
-- - anon: false
-- - authenticated: true
-- - service_role: true
--
-- Núcleo afetado:
-- - RPCs operacionais de ciclo
-- - sales_cycles
-- - cycle_events
-- - segurança multiempresa
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Remover execução anônima explicitamente
-- -----------------------------------------------------------------------------

revoke execute on function public.rpc_set_next_action_for_company(
  uuid,
  uuid,
  text,
  timestamp with time zone
) from anon;

revoke execute on function public.rpc_move_cycle_stage_for_company(
  uuid,
  uuid,
  text,
  jsonb
) from anon;

revoke execute on function public.rpc_move_cycle_stage_checkpoint_for_company(
  uuid,
  uuid,
  text,
  jsonb
) from anon;

revoke execute on function public.rpc_close_cycle_lost_for_company(
  uuid,
  uuid,
  text,
  text,
  text
) from anon;

revoke execute on function public.rpc_close_cycle_won_for_company(
  uuid,
  uuid,
  numeric,
  date,
  text,
  uuid,
  numeric,
  text,
  text,
  numeric,
  integer,
  numeric,
  text
) from anon;

revoke execute on function public.rpc_assign_cycle_owner_for_company(
  uuid,
  uuid,
  uuid
) from anon;

-- -----------------------------------------------------------------------------
-- 2. Remover execução herdada por PUBLIC
-- -----------------------------------------------------------------------------

revoke execute on function public.rpc_set_next_action_for_company(
  uuid,
  uuid,
  text,
  timestamp with time zone
) from public;

revoke execute on function public.rpc_move_cycle_stage_for_company(
  uuid,
  uuid,
  text,
  jsonb
) from public;

revoke execute on function public.rpc_move_cycle_stage_checkpoint_for_company(
  uuid,
  uuid,
  text,
  jsonb
) from public;

revoke execute on function public.rpc_close_cycle_lost_for_company(
  uuid,
  uuid,
  text,
  text,
  text
) from public;

revoke execute on function public.rpc_close_cycle_won_for_company(
  uuid,
  uuid,
  numeric,
  date,
  text,
  uuid,
  numeric,
  text,
  text,
  numeric,
  integer,
  numeric,
  text
) from public;

revoke execute on function public.rpc_assign_cycle_owner_for_company(
  uuid,
  uuid,
  uuid
) from public;

-- -----------------------------------------------------------------------------
-- 3. Garantir execução apenas para usuários autenticados e service_role
-- -----------------------------------------------------------------------------

grant execute on function public.rpc_set_next_action_for_company(
  uuid,
  uuid,
  text,
  timestamp with time zone
) to authenticated, service_role;

grant execute on function public.rpc_move_cycle_stage_for_company(
  uuid,
  uuid,
  text,
  jsonb
) to authenticated, service_role;

grant execute on function public.rpc_move_cycle_stage_checkpoint_for_company(
  uuid,
  uuid,
  text,
  jsonb
) to authenticated, service_role;

grant execute on function public.rpc_close_cycle_lost_for_company(
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated, service_role;

grant execute on function public.rpc_close_cycle_won_for_company(
  uuid,
  uuid,
  numeric,
  date,
  text,
  uuid,
  numeric,
  text,
  text,
  numeric,
  integer,
  numeric,
  text
) to authenticated, service_role;

grant execute on function public.rpc_assign_cycle_owner_for_company(
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

commit;