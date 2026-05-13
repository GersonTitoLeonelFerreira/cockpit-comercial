-- =============================================================================
-- Migration 061 — Harden legacy goal and simulator functions
-- =============================================================================
-- Fase 8C.1 — Auditoria final de faturamento/metas
--
-- Objetivo:
-- 1. Remover execução anônima de funções legadas de meta/simulador.
-- 2. Bloquear funções antigas sem uso ativo no app.
-- 3. Preservar service_role.
--
-- Contexto:
-- A auditoria encontrou get_goal_simulation_stats_v2 executável por anon.
-- Busca no app não encontrou uso direto dessas funções legadas.
--
-- Esta migration NÃO mexe em:
-- - rpc_get_revenue_goal
-- - rpc_upsert_revenue_goal com ticket_medio
-- - rpc_revenue_summary
-- - rpc_simulator_group_conversion
-- - dashboard visual
-- - simulador visual
-- =============================================================================

begin;

-- =============================================================================
-- 1. Bloquear get_goal_simulation_stats_v2
-- =============================================================================
-- Função não encontrada em uso ativo no app.
-- Não deve ser executável por anon nem por authenticated.

do $$
begin
  if to_regprocedure('public.get_goal_simulation_stats_v2(uuid, date, date, uuid)') is not null then
    execute 'revoke all on function public.get_goal_simulation_stats_v2(uuid, date, date, uuid) from public';
    execute 'revoke execute on function public.get_goal_simulation_stats_v2(uuid, date, date, uuid) from anon';
    execute 'revoke execute on function public.get_goal_simulation_stats_v2(uuid, date, date, uuid) from authenticated';
    execute 'grant execute on function public.get_goal_simulation_stats_v2(uuid, date, date, uuid) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Bloquear get_goal_simulation_stats se não for chamada pelo app
-- =============================================================================
-- Mantém apenas service_role. A versão oficial de meta/ticket médio agora é:
-- rpc_get_revenue_goal + rpc_upsert_revenue_goal com company_id explícito.

do $$
begin
  if to_regprocedure('public.get_goal_simulation_stats(uuid, date, date, uuid)') is not null then
    execute 'revoke all on function public.get_goal_simulation_stats(uuid, date, date, uuid) from public';
    execute 'revoke execute on function public.get_goal_simulation_stats(uuid, date, date, uuid) from anon';
    execute 'revoke execute on function public.get_goal_simulation_stats(uuid, date, date, uuid) from authenticated';
    execute 'grant execute on function public.get_goal_simulation_stats(uuid, date, date, uuid) to service_role';
  end if;
end $$;

-- =============================================================================
-- 3. Bloquear RPCs legadas sem company_id explícito
-- =============================================================================
-- Essas funções recebem apenas owner_user_id.
-- Isso não é o padrão seguro multiempresa atual.

do $$
begin
  if to_regprocedure('public.rpc_get_revenue_period_summary(uuid)') is not null then
    execute 'revoke all on function public.rpc_get_revenue_period_summary(uuid) from public';
    execute 'revoke execute on function public.rpc_get_revenue_period_summary(uuid) from anon';
    execute 'revoke execute on function public.rpc_get_revenue_period_summary(uuid) from authenticated';
    execute 'grant execute on function public.rpc_get_revenue_period_summary(uuid) to service_role';
  end if;

  if to_regprocedure('public.rpc_get_simulator_period_metrics(uuid)') is not null then
    execute 'revoke all on function public.rpc_get_simulator_period_metrics(uuid) from public';
    execute 'revoke execute on function public.rpc_get_simulator_period_metrics(uuid) from anon';
    execute 'revoke execute on function public.rpc_get_simulator_period_metrics(uuid) from authenticated';
    execute 'grant execute on function public.rpc_get_simulator_period_metrics(uuid) to service_role';
  end if;
end $$;

commit;