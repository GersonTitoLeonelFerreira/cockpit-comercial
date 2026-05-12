-- ============================================================================
-- Migration 035 — Harden legacy Phase 3 RPC execution privileges
-- ============================================================================
-- Objetivo:
-- As RPCs abaixo foram removidas do fluxo operacional do app na Fase 3.
-- O Pool, Kanban e Configurações de Grupos agora usam APIs server-side.
--
-- Esta migration remove execução pública/anônima/autenticada das RPCs antigas
-- para reduzir superfície de ataque no Supabase.
--
-- IMPORTANTE:
-- Não remover as funções agora.
-- Apenas revogar EXECUTE para PUBLIC, anon e authenticated.
-- Manter service_role para contingência administrativa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Pool / Kanban legacy assignment RPCs
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Group legacy RPCs
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_create_lead_group(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_lead_group(text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_create_lead_group(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_lead_group(text) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_recall_group_to_pool(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_recall_group_to_pool(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_recall_group_to_pool(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_recall_group_to_pool(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Individual legacy cycle operation RPCs removed from Phase 3 flow
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- Legacy status totals RPC
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) TO service_role;