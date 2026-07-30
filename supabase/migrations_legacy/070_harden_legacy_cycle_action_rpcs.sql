-- =============================================================================
-- Migration 070 — Harden legacy cycle action RPCs
-- =============================================================================
-- Fase 12C — SECURITY DEFINER executável por authenticated
--
-- Objetivo:
-- Bloquear execução client-side das RPCs legadas de movimento, próxima ação
-- e fechamento de ciclo que NÃO recebem p_company_id explícito.
--
-- Esta migration NÃO mexe nas versões ativas usadas pelo app:
-- - rpc_move_cycle_stage_for_company
-- - rpc_move_cycle_stage_checkpoint_for_company
-- - rpc_set_next_action_for_company
-- - rpc_close_cycle_won_for_company
-- - rpc_close_cycle_lost_for_company
--
-- Esta migration NÃO mexe na 031.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Movimento de etapa legado sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_move_cycle_stage(uuid, text, jsonb)') is not null then
    execute 'revoke all on function public.rpc_move_cycle_stage(uuid, text, jsonb) from public';
    execute 'revoke execute on function public.rpc_move_cycle_stage(uuid, text, jsonb) from anon';
    execute 'revoke execute on function public.rpc_move_cycle_stage(uuid, text, jsonb) from authenticated';
    execute 'grant execute on function public.rpc_move_cycle_stage(uuid, text, jsonb) to service_role';
  end if;

  if to_regprocedure('public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb)') is not null then
    execute 'revoke all on function public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) from public';
    execute 'revoke execute on function public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) from anon';
    execute 'revoke execute on function public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) from authenticated';
    execute 'grant execute on function public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Próxima ação legada sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_set_next_action(uuid, text, timestamp with time zone)') is not null then
    execute 'revoke all on function public.rpc_set_next_action(uuid, text, timestamp with time zone) from public';
    execute 'revoke execute on function public.rpc_set_next_action(uuid, text, timestamp with time zone) from anon';
    execute 'revoke execute on function public.rpc_set_next_action(uuid, text, timestamp with time zone) from authenticated';
    execute 'grant execute on function public.rpc_set_next_action(uuid, text, timestamp with time zone) to service_role';
  end if;
end $$;

-- =============================================================================
-- 3. Fechamento legado sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_close_cycle_lost(uuid, text, text, text)') is not null then
    execute 'revoke all on function public.rpc_close_cycle_lost(uuid, text, text, text) from public';
    execute 'revoke execute on function public.rpc_close_cycle_lost(uuid, text, text, text) from anon';
    execute 'revoke execute on function public.rpc_close_cycle_lost(uuid, text, text, text) from authenticated';
    execute 'grant execute on function public.rpc_close_cycle_lost(uuid, text, text, text) to service_role';
  end if;

  if to_regprocedure('public.rpc_close_cycle_won(uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text)') is not null then
    execute 'revoke all on function public.rpc_close_cycle_won(uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text) from public';
    execute 'revoke execute on function public.rpc_close_cycle_won(uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text) from anon';
    execute 'revoke execute on function public.rpc_close_cycle_won(uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text) from authenticated';
    execute 'grant execute on function public.rpc_close_cycle_won(uuid, numeric, date, text, uuid, numeric, text, text, numeric, integer, numeric, text) to service_role';
  end if;
end $$;

commit;