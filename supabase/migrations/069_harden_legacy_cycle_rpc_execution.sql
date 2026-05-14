-- =============================================================================
-- Migration 069 — Harden legacy cycle RPC execution
-- =============================================================================
-- Fase 12B — SECURITY DEFINER executável por authenticated
--
-- Objetivo:
-- Bloquear execução client-side de RPCs legadas de ciclo/comercial que não aparecem
-- em uso ativo no app.
--
-- Esta migration NÃO mexe em RPCs ainda usadas pelo app:
-- - rpc_seller_micro_kpis
-- - rpc_get_user_sales_cycles
-- - rpc_get_pool_cycles
-- - rpc_assign_cycle_owner_for_company
--
-- Esta migration NÃO mexe em helpers de RLS/policies.
-- Esta migration NÃO mexe em faturamento.
-- Esta migration NÃO mexe na 031.
-- =============================================================================

begin;

-- =============================================================================
-- 1. RPC legada de atribuição individual sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_assign_cycle_owner(uuid, uuid)') is not null then
    execute 'revoke all on function public.rpc_assign_cycle_owner(uuid, uuid) from public';
    execute 'revoke execute on function public.rpc_assign_cycle_owner(uuid, uuid) from anon';
    execute 'revoke execute on function public.rpc_assign_cycle_owner(uuid, uuid) from authenticated';
    execute 'grant execute on function public.rpc_assign_cycle_owner(uuid, uuid) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. RPCs legadas de importação/distribuição em massa
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_bulk_import_cycles(jsonb[], uuid, uuid)') is not null then
    execute 'revoke all on function public.rpc_bulk_import_cycles(jsonb[], uuid, uuid) from public';
    execute 'revoke execute on function public.rpc_bulk_import_cycles(jsonb[], uuid, uuid) from anon';
    execute 'revoke execute on function public.rpc_bulk_import_cycles(jsonb[], uuid, uuid) from authenticated';
    execute 'grant execute on function public.rpc_bulk_import_cycles(jsonb[], uuid, uuid) to service_role';
  end if;

  if to_regprocedure('public.rpc_bulk_reassign_cycles_owner(uuid[], uuid)') is not null then
    execute 'revoke all on function public.rpc_bulk_reassign_cycles_owner(uuid[], uuid) from public';
    execute 'revoke execute on function public.rpc_bulk_reassign_cycles_owner(uuid[], uuid) from anon';
    execute 'revoke execute on function public.rpc_bulk_reassign_cycles_owner(uuid[], uuid) from authenticated';
    execute 'grant execute on function public.rpc_bulk_reassign_cycles_owner(uuid[], uuid) to service_role';
  end if;

  if to_regprocedure('public.rpc_bulk_return_group_to_pool(uuid)') is not null then
    execute 'revoke all on function public.rpc_bulk_return_group_to_pool(uuid) from public';
    execute 'revoke execute on function public.rpc_bulk_return_group_to_pool(uuid) from anon';
    execute 'revoke execute on function public.rpc_bulk_return_group_to_pool(uuid) from authenticated';
    execute 'grant execute on function public.rpc_bulk_return_group_to_pool(uuid) to service_role';
  end if;

  if to_regprocedure('public.rpc_distribute_group_pool_round_robin(uuid, uuid[])') is not null then
    execute 'revoke all on function public.rpc_distribute_group_pool_round_robin(uuid, uuid[]) from public';
    execute 'revoke execute on function public.rpc_distribute_group_pool_round_robin(uuid, uuid[]) from anon';
    execute 'revoke execute on function public.rpc_distribute_group_pool_round_robin(uuid, uuid[]) from authenticated';
    execute 'grant execute on function public.rpc_distribute_group_pool_round_robin(uuid, uuid[]) to service_role';
  end if;
end $$;

-- =============================================================================
-- 3. RPCs legadas de ciclo sem contrato atual do app
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_return_cycle_to_pool(uuid)') is not null then
    execute 'revoke all on function public.rpc_return_cycle_to_pool(uuid) from public';
    execute 'revoke execute on function public.rpc_return_cycle_to_pool(uuid) from anon';
    execute 'revoke execute on function public.rpc_return_cycle_to_pool(uuid) from authenticated';
    execute 'grant execute on function public.rpc_return_cycle_to_pool(uuid) to service_role';
  end if;

  if to_regprocedure('public.rpc_register_cycle_won(uuid, numeric, integer, text)') is not null then
    execute 'revoke all on function public.rpc_register_cycle_won(uuid, numeric, integer, text) from public';
    execute 'revoke execute on function public.rpc_register_cycle_won(uuid, numeric, integer, text) from anon';
    execute 'revoke execute on function public.rpc_register_cycle_won(uuid, numeric, integer, text) from authenticated';
    execute 'grant execute on function public.rpc_register_cycle_won(uuid, numeric, integer, text) to service_role';
  end if;

  if to_regprocedure('public.rpc_reset_cycle_state_on_assignment(uuid, uuid)') is not null then
    execute 'revoke all on function public.rpc_reset_cycle_state_on_assignment(uuid, uuid) from public';
    execute 'revoke execute on function public.rpc_reset_cycle_state_on_assignment(uuid, uuid) from anon';
    execute 'revoke execute on function public.rpc_reset_cycle_state_on_assignment(uuid, uuid) from authenticated';
    execute 'grant execute on function public.rpc_reset_cycle_state_on_assignment(uuid, uuid) to service_role';
  end if;
end $$;

-- =============================================================================
-- 4. RPC legada de worklist não usada pelo app atual
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_seller_worklist(uuid, uuid, integer)') is not null then
    execute 'revoke all on function public.rpc_seller_worklist(uuid, uuid, integer) from public';
    execute 'revoke execute on function public.rpc_seller_worklist(uuid, uuid, integer) from anon';
    execute 'revoke execute on function public.rpc_seller_worklist(uuid, uuid, integer) from authenticated';
    execute 'grant execute on function public.rpc_seller_worklist(uuid, uuid, integer) to service_role';
  end if;
end $$;

commit;