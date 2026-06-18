begin;

revoke execute on function public.create_default_quick_actions() from public;
revoke execute on function public.create_default_quick_actions() from anon;
grant execute on function public.create_default_quick_actions() to authenticated;
grant execute on function public.create_default_quick_actions() to service_role;

revoke execute on function public.fechamentos_por_consultora(uuid) from public;
revoke execute on function public.fechamentos_por_consultora(uuid) from anon;
grant execute on function public.fechamentos_por_consultora(uuid) to authenticated;
grant execute on function public.fechamentos_por_consultora(uuid) to service_role;

revoke execute on function public.fn_audit_sales_cycles() from public;
revoke execute on function public.fn_audit_sales_cycles() from anon;
grant execute on function public.fn_audit_sales_cycles() to authenticated;
grant execute on function public.fn_audit_sales_cycles() to service_role;

revoke execute on function public.fn_auto_fill_closed_at() from public;
revoke execute on function public.fn_auto_fill_closed_at() from anon;
grant execute on function public.fn_auto_fill_closed_at() to authenticated;
grant execute on function public.fn_auto_fill_closed_at() to service_role;

revoke execute on function public.fn_cancel_deal(uuid, text) from public;
revoke execute on function public.fn_cancel_deal(uuid, text) from anon;
grant execute on function public.fn_cancel_deal(uuid, text) to authenticated;
grant execute on function public.fn_cancel_deal(uuid, text) to service_role;

revoke execute on function public.fn_log_status_change() from public;
revoke execute on function public.fn_log_status_change() from anon;
grant execute on function public.fn_log_status_change() to authenticated;
grant execute on function public.fn_log_status_change() to service_role;

revoke execute on function public.fn_mark_deal_lost(uuid, text, uuid) from public;
revoke execute on function public.fn_mark_deal_lost(uuid, text, uuid) from anon;
grant execute on function public.fn_mark_deal_lost(uuid, text, uuid) to authenticated;
grant execute on function public.fn_mark_deal_lost(uuid, text, uuid) to service_role;

revoke execute on function public.fn_mark_deal_won(uuid, uuid, numeric, integer, text) from public;
revoke execute on function public.fn_mark_deal_won(uuid, uuid, numeric, integer, text) from anon;
grant execute on function public.fn_mark_deal_won(uuid, uuid, numeric, integer, text) to authenticated;
grant execute on function public.fn_mark_deal_won(uuid, uuid, numeric, integer, text) to service_role;

revoke execute on function public.fn_pause_deal(uuid, text) from public;
revoke execute on function public.fn_pause_deal(uuid, text) from anon;
grant execute on function public.fn_pause_deal(uuid, text) to authenticated;
grant execute on function public.fn_pause_deal(uuid, text) to service_role;

revoke execute on function public.fn_products_updated_at() from public;
revoke execute on function public.fn_products_updated_at() from anon;
grant execute on function public.fn_products_updated_at() to authenticated;
grant execute on function public.fn_products_updated_at() to service_role;

revoke execute on function public.fn_resume_deal(uuid, text) from public;
revoke execute on function public.fn_resume_deal(uuid, text) from anon;
grant execute on function public.fn_resume_deal(uuid, text) to authenticated;
grant execute on function public.fn_resume_deal(uuid, text) to service_role;

revoke execute on function public.gargalo_funil(uuid) from public;
revoke execute on function public.gargalo_funil(uuid) from anon;
grant execute on function public.gargalo_funil(uuid) to authenticated;
grant execute on function public.gargalo_funil(uuid) to service_role;

revoke execute on function public.get_avg_ticket_won(uuid, integer) from public;
revoke execute on function public.get_avg_ticket_won(uuid, integer) from anon;
grant execute on function public.get_avg_ticket_won(uuid, integer) to authenticated;
grant execute on function public.get_avg_ticket_won(uuid, integer) to service_role;

revoke execute on function public.get_funnel_metrics(uuid, timestamp with time zone, timestamp with time zone, uuid, integer) from public;
revoke execute on function public.get_funnel_metrics(uuid, timestamp with time zone, timestamp with time zone, uuid, integer) from anon;
grant execute on function public.get_funnel_metrics(uuid, timestamp with time zone, timestamp with time zone, uuid, integer) to authenticated;
grant execute on function public.get_funnel_metrics(uuid, timestamp with time zone, timestamp with time zone, uuid, integer) to service_role;

revoke execute on function public.get_funnel_metrics_for_profiles(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) from public;
revoke execute on function public.get_funnel_metrics_for_profiles(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) from anon;
grant execute on function public.get_funnel_metrics_for_profiles(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) to authenticated;
grant execute on function public.get_funnel_metrics_for_profiles(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) to service_role;

revoke execute on function public.get_funnel_metrics_group(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) from public;
revoke execute on function public.get_funnel_metrics_group(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) from anon;
grant execute on function public.get_funnel_metrics_group(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) to authenticated;
grant execute on function public.get_funnel_metrics_group(uuid, uuid[], timestamp with time zone, timestamp with time zone, integer) to service_role;

revoke execute on function public.report_ai_top_next_actions(uuid, timestamp with time zone, uuid, integer) from public;
revoke execute on function public.report_ai_top_next_actions(uuid, timestamp with time zone, uuid, integer) from anon;
grant execute on function public.report_ai_top_next_actions(uuid, timestamp with time zone, uuid, integer) to authenticated;
grant execute on function public.report_ai_top_next_actions(uuid, timestamp with time zone, uuid, integer) to service_role;

revoke execute on function public.report_ai_top_objections(uuid, timestamp with time zone, uuid, integer) from public;
revoke execute on function public.report_ai_top_objections(uuid, timestamp with time zone, uuid, integer) from anon;
grant execute on function public.report_ai_top_objections(uuid, timestamp with time zone, uuid, integer) to authenticated;
grant execute on function public.report_ai_top_objections(uuid, timestamp with time zone, uuid, integer) to service_role;

revoke execute on function public.report_meta_vs_real(uuid, date, date) from public;
revoke execute on function public.report_meta_vs_real(uuid, date, date) from anon;
grant execute on function public.report_meta_vs_real(uuid, date, date) to authenticated;
grant execute on function public.report_meta_vs_real(uuid, date, date) to service_role;

revoke execute on function public.report_sla_risk(uuid) from public;
revoke execute on function public.report_sla_risk(uuid) from anon;
grant execute on function public.report_sla_risk(uuid) to authenticated;
grant execute on function public.report_sla_risk(uuid) to service_role;

revoke execute on function public.report_stage_conversion(uuid) from public;
revoke execute on function public.report_stage_conversion(uuid) from anon;
grant execute on function public.report_stage_conversion(uuid) to authenticated;
grant execute on function public.report_stage_conversion(uuid) to service_role;

revoke execute on function public.report_stage_losses(uuid) from public;
revoke execute on function public.report_stage_losses(uuid) from anon;
grant execute on function public.report_stage_losses(uuid) to authenticated;
grant execute on function public.report_stage_losses(uuid) to service_role;

revoke execute on function public.report_stage_time_summary(uuid) from public;
revoke execute on function public.report_stage_time_summary(uuid) from anon;
grant execute on function public.report_stage_time_summary(uuid) to authenticated;
grant execute on function public.report_stage_time_summary(uuid) to service_role;

revoke execute on function public.set_company_memberships_updated_at() from public;
revoke execute on function public.set_company_memberships_updated_at() from anon;
grant execute on function public.set_company_memberships_updated_at() to authenticated;
grant execute on function public.set_company_memberships_updated_at() to service_role;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.set_updated_at() to service_role;

revoke execute on function public.tempo_medio_por_etapa(uuid) from public;
revoke execute on function public.tempo_medio_por_etapa(uuid) from anon;
grant execute on function public.tempo_medio_por_etapa(uuid) to authenticated;
grant execute on function public.tempo_medio_por_etapa(uuid) to service_role;

revoke execute on function public.trg_set_updated_at() from public;
revoke execute on function public.trg_set_updated_at() from anon;
grant execute on function public.trg_set_updated_at() to authenticated;
grant execute on function public.trg_set_updated_at() to service_role;

commit;
