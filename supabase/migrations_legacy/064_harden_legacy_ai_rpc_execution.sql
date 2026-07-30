-- =============================================================================
-- Migration 064 — Harden legacy AI RPC execution
-- =============================================================================
-- Fase 10A — IA e sugestões
--
-- Objetivo:
-- 1. Bloquear RPCs antigas de IA sem p_company_id explícito.
-- 2. Preservar as RPCs novas _for_company usadas pelas rotas server-side.
-- 3. Preservar service_role.
--
-- Contexto:
-- O app já usa:
-- - rpc_get_cycle_ai_context_for_company
-- - rpc_apply_ai_open_suggestion_for_company
--
-- As rotas client-facing chamam /api/ai/*, não as RPCs diretamente.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Contexto antigo de IA sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_get_cycle_ai_context(uuid, integer)') is not null then
    execute 'revoke all on function public.rpc_get_cycle_ai_context(uuid, integer) from public';
    execute 'revoke execute on function public.rpc_get_cycle_ai_context(uuid, integer) from anon';
    execute 'revoke execute on function public.rpc_get_cycle_ai_context(uuid, integer) from authenticated';
    execute 'grant execute on function public.rpc_get_cycle_ai_context(uuid, integer) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Aplicação antiga de sugestão de IA sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamp with time zone, text, jsonb, text)') is not null then
    execute 'revoke all on function public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamp with time zone, text, jsonb, text) from public';
    execute 'revoke execute on function public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamp with time zone, text, jsonb, text) from anon';
    execute 'revoke execute on function public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamp with time zone, text, jsonb, text) from authenticated';
    execute 'grant execute on function public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamp with time zone, text, jsonb, text) to service_role';
  end if;
end $$;

-- =============================================================================
-- 3. Logs antigos de IA sem company_id explícito
-- =============================================================================
-- Essas funções ainda podem existir como legado. O fluxo atual de análise/aplicação
-- deve registrar via rotas e RPCs validadas por ciclo/empresa.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_log_ai_analysis(uuid, jsonb, text)') is not null then
    execute 'revoke all on function public.rpc_log_ai_analysis(uuid, jsonb, text) from public';
    execute 'revoke execute on function public.rpc_log_ai_analysis(uuid, jsonb, text) from anon';
    execute 'revoke execute on function public.rpc_log_ai_analysis(uuid, jsonb, text) from authenticated';
    execute 'grant execute on function public.rpc_log_ai_analysis(uuid, jsonb, text) to service_role';
  end if;

  if to_regprocedure('public.rpc_log_ai_suggestion_applied(uuid, jsonb)') is not null then
    execute 'revoke all on function public.rpc_log_ai_suggestion_applied(uuid, jsonb) from public';
    execute 'revoke execute on function public.rpc_log_ai_suggestion_applied(uuid, jsonb) from anon';
    execute 'revoke execute on function public.rpc_log_ai_suggestion_applied(uuid, jsonb) from authenticated';
    execute 'grant execute on function public.rpc_log_ai_suggestion_applied(uuid, jsonb) to service_role';
  end if;

  if to_regprocedure('public.rpc_log_ai_suggestion_rejected(uuid, jsonb)') is not null then
    execute 'revoke all on function public.rpc_log_ai_suggestion_rejected(uuid, jsonb) from public';
    execute 'revoke execute on function public.rpc_log_ai_suggestion_rejected(uuid, jsonb) from anon';
    execute 'revoke execute on function public.rpc_log_ai_suggestion_rejected(uuid, jsonb) from authenticated';
    execute 'grant execute on function public.rpc_log_ai_suggestion_rejected(uuid, jsonb) to service_role';
  end if;
end $$;

commit;