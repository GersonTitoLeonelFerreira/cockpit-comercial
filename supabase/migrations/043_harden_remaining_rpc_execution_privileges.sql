-- =============================================================================
-- Migration 043 — Harden remaining RPC execution privileges
-- =============================================================================
-- Fase 5A — Segurança Supabase: exposição restante de funções
--
-- Contexto:
-- A migration 041 criou RPCs seguras de ciclo por empresa ativa.
-- A migration 042 corrigiu grants das RPCs _for_company de ciclo.
--
-- Esta migration NÃO mexe novamente nas RPCs já tratadas pela 042.
-- Esta migration remove execução anônima das demais funções SECURITY DEFINER
-- ainda expostas para anon.
--
-- Estratégia:
-- - REVOKE EXECUTE FROM PUBLIC para remover herança genérica.
-- - REVOKE EXECUTE FROM anon para remover exposição anônima explícita.
-- - GRANT EXECUTE TO authenticated, service_role para não quebrar o app logado.
--
-- Importante:
-- Esta etapa NÃO remove authenticated.
-- A remoção de authenticated em funções internas/trigger fica para a Fase 5B,
-- depois de auditoria final de chamadas no app.
-- =============================================================================

begin;

do $$
declare
  v_signature text;
  v_signatures text[] := array[
    -- =========================================================================
    -- Legado / leads antigos / distribuição antiga
    -- =========================================================================
    'public.assign_leads(uuid,uuid[],text,uuid,uuid[],boolean)',
    'public.assign_leads(uuid,text,integer,uuid[],text,text,text,uuid,uuid[],boolean,text)',
    'public.delete_leads_by_ids(uuid[],uuid)',
    'public.reassign_owner_leads(uuid,uuid,uuid,integer,text,text,text)',
    'public.return_owner_leads_to_pool(uuid,uuid,integer,text,text)',
    'public.round_robin_from_owner_leads(uuid,uuid,uuid[],integer,text,text,text)',
    'public.seller_move_lead_stage(uuid,uuid,text,text,numeric,uuid)',

    -- =========================================================================
    -- Helpers / permissões / perfil
    -- =========================================================================
    'public.current_profile()',
    'public.current_role()',
    'public.fn_set_user_role(uuid,text)',
    'public.fn_set_user_role_for_company(uuid,uuid,text)',
    'public.get_company_members_count(uuid)',
    'public.get_user_company_memberships()',
    'public.has_active_company_membership(uuid,text[])',
    'public.is_company_admin(uuid)',
    'public.seller_get_context()',

    -- =========================================================================
    -- Triggers / funções internas ainda expostas para anon
    -- =========================================================================
    'public.block_lead_profiles_key_update()',
    'public.handle_lead_event_period_activity()',
    'public.handle_lead_status_period_activity()',
    'public.handle_new_user()',
    'public.handle_sales_cycle_closed_at()',
    'public.handle_sales_cycle_period_activity()',
    'public.handle_won_columns_freeze()',
    'public.handle_won_columns_reset()',
    'public.log_lead_stage_change()',
    'public.log_lead_status_change()',
    'public.set_execution_day_calendars_updated_at()',
    'public.sync_profile_email()',
    'public.update_updated_at_column()',

    -- =========================================================================
    -- Admin / vendedores
    -- =========================================================================
    'public.rpc_admin_list_sellers_stats_for_company(uuid,integer)',
    'public.rpc_admin_update_seller_access_for_company(uuid,uuid,text,boolean)',

    -- =========================================================================
    -- IA
    -- =========================================================================
    'public.rpc_apply_ai_open_suggestion(uuid,text,text,timestamp with time zone,text,jsonb,text)',
    'public.rpc_get_cycle_ai_context(uuid,integer)',
    'public.rpc_log_ai_analysis(uuid,jsonb,text)',
    'public.rpc_log_ai_suggestion_applied(uuid,jsonb)',
    'public.rpc_log_ai_suggestion_rejected(uuid,jsonb)',

    -- =========================================================================
    -- Operação comercial / ciclos legados ou ainda client-side
    -- Não inclui as RPCs _for_company já tratadas pela migration 042.
    -- =========================================================================
    'public.rpc_assign_cycle_owner(uuid,uuid)',
    'public.rpc_bulk_import_cycles(jsonb[],uuid,uuid)',
    'public.rpc_bulk_reassign_cycles_owner(uuid[],uuid)',
    'public.rpc_bulk_return_group_to_pool(uuid)',
    'public.rpc_close_cycle_lost(uuid,text,text,text)',
    'public.rpc_close_cycle_won(uuid,numeric,date,text,uuid,numeric,text,text,numeric,integer,numeric,text)',
    'public.rpc_create_lead_and_cycle(uuid,text,text,uuid,text)',
    'public.rpc_create_lead_and_cycle(jsonb,uuid,uuid)',
    'public.rpc_delete_lead(uuid,uuid)',
    'public.rpc_distribute_group_pool_round_robin(uuid,uuid[])',
    'public.rpc_get_cycle_last_events(uuid,integer)',
    'public.rpc_get_pool_cycles(integer,integer)',
    'public.rpc_get_user_sales_cycles(uuid,text,integer,integer)',
    'public.rpc_move_cycle_stage(uuid,text,jsonb)',
    'public.rpc_move_cycle_stage_checkpoint(uuid,text,jsonb)',
    'public.rpc_register_cycle_won(uuid,numeric,integer,text)',
    'public.rpc_reset_cycle_state_on_assignment(uuid,uuid)',
    'public.rpc_return_cycle_to_pool(uuid)',
    'public.rpc_set_next_action(uuid,text,timestamp with time zone)',

    -- =========================================================================
    -- SLA / configurações
    -- =========================================================================
    'public.rpc_get_company_sla_rules()',
    'public.rpc_upsert_company_sla_rules(jsonb)',

    -- =========================================================================
    -- Faturamento / metas / simulador / métricas
    -- =========================================================================
    'public.get_goal_simulation_stats(uuid,date,date,uuid)',
    'public.rpc_create_revenue_extra_source(text)',
    'public.rpc_get_active_competency()',
    'public.rpc_get_close_rate_real(uuid,integer)',
    'public.rpc_get_revenue_goal(uuid,uuid,date,date)',
    'public.rpc_get_revenue_period_summary(uuid)',
    'public.rpc_get_sales_cycle_metrics_v1(uuid,date)',
    'public.rpc_get_simulator_period_metrics(uuid)',
    'public.rpc_open_next_monthly_competency()',
    'public.rpc_report_period_summary()',
    'public.rpc_revenue_sales_details_by_day(date,uuid)',
    'public.rpc_revenue_summary(uuid,uuid,date,date,text)',
    'public.rpc_seller_micro_kpis(uuid,integer)',
    'public.rpc_seller_worklist(uuid,uuid,integer)',
    'public.rpc_simulator_group_conversion(uuid,uuid,date,date)',
    'public.rpc_touch_cycle_in_current_competency(uuid,text,timestamp with time zone,numeric)',
    'public.rpc_touch_lead_in_current_competency(uuid,text,timestamp with time zone,numeric)',
    'public.rpc_upsert_revenue_daily_override(text,uuid,date,numeric,text,text)',
    'public.rpc_upsert_revenue_goal(uuid,uuid,date,date,numeric,numeric)'
  ];
begin
  foreach v_signature in array v_signatures loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke execute on function %s from public', v_signature);
      execute format('revoke execute on function %s from anon', v_signature);
      execute format('grant execute on function %s to authenticated, service_role', v_signature);
    end if;
  end loop;
end $$;

commit;