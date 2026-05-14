-- =============================================================================
-- Migration 071 — Harden residual metric and internal RPCs
-- =============================================================================
-- Fase 12D — SECURITY DEFINER executável por authenticated
--
-- Objetivo:
-- Bloquear execução client-side de RPCs residuais que não aparecem em uso direto
-- no app e que não devem ficar expostas como RPC pública para authenticated.
--
-- Esta migration NÃO mexe nas RPCs ativas usadas por:
-- - simulador
-- - relatórios
-- - faturamento
-- - IA
--
-- Esta migration NÃO mexe em helpers de RLS/policies.
-- Esta migration NÃO mexe na 031.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Competência / período — sem uso direto no app
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_get_active_competency()') is not null then
    execute 'revoke all on function public.rpc_get_active_competency() from public';
    execute 'revoke execute on function public.rpc_get_active_competency() from anon';
    execute 'revoke execute on function public.rpc_get_active_competency() from authenticated';
    execute 'grant execute on function public.rpc_get_active_competency() to service_role';
  end if;

  if to_regprocedure('public.rpc_open_next_monthly_competency()') is not null then
    execute 'revoke all on function public.rpc_open_next_monthly_competency() from public';
    execute 'revoke execute on function public.rpc_open_next_monthly_competency() from anon';
    execute 'revoke execute on function public.rpc_open_next_monthly_competency() from authenticated';
    execute 'grant execute on function public.rpc_open_next_monthly_competency() to service_role';
  end if;

  if to_regprocedure('public.rpc_report_period_summary()') is not null then
    execute 'revoke all on function public.rpc_report_period_summary() from public';
    execute 'revoke execute on function public.rpc_report_period_summary() from anon';
    execute 'revoke execute on function public.rpc_report_period_summary() from authenticated';
    execute 'grant execute on function public.rpc_report_period_summary() to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Eventos auxiliares / touch de competência
-- =============================================================================
-- Observação:
-- Essas funções podem continuar sendo usadas internamente por outras funções,
-- triggers ou service_role. O bloqueio aqui remove apenas chamada direta pelo
-- client authenticated via REST/RPC.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_touch_cycle_in_current_competency(uuid, text, timestamp with time zone, numeric)') is not null then
    execute 'revoke all on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamp with time zone, numeric) from public';
    execute 'revoke execute on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamp with time zone, numeric) from anon';
    execute 'revoke execute on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamp with time zone, numeric) from authenticated';
    execute 'grant execute on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamp with time zone, numeric) to service_role';
  end if;

  if to_regprocedure('public.rpc_touch_lead_in_current_competency(uuid, text, timestamp with time zone, numeric)') is not null then
    execute 'revoke all on function public.rpc_touch_lead_in_current_competency(uuid, text, timestamp with time zone, numeric) from public';
    execute 'revoke execute on function public.rpc_touch_lead_in_current_competency(uuid, text, timestamp with time zone, numeric) from anon';
    execute 'revoke execute on function public.rpc_touch_lead_in_current_competency(uuid, text, timestamp with time zone, numeric) from authenticated';
    execute 'grant execute on function public.rpc_touch_lead_in_current_competency(uuid, text, timestamp with time zone, numeric) to service_role';
  end if;
end $$;

-- =============================================================================
-- 3. Histórico rápido de ciclo sem uso direto no app atual
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_get_cycle_last_events(uuid, integer)') is not null then
    execute 'revoke all on function public.rpc_get_cycle_last_events(uuid, integer) from public';
    execute 'revoke execute on function public.rpc_get_cycle_last_events(uuid, integer) from anon';
    execute 'revoke execute on function public.rpc_get_cycle_last_events(uuid, integer) from authenticated';
    execute 'grant execute on function public.rpc_get_cycle_last_events(uuid, integer) to service_role';
  end if;
end $$;

commit;