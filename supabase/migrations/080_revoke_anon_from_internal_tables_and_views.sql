begin;

revoke all privileges on table public.audit_sales_cycles from anon;
revoke all privileges on table public.companies from anon;
revoke all privileges on table public.company_admin_invitations from anon;
revoke all privileges on table public.company_counters from anon;
revoke all privileges on table public.company_sla_rules from anon;
revoke all privileges on table public.competencies from anon;
revoke all privileges on table public.demo_requests from anon;
revoke all privileges on table public.execution_day_calendars from anon;
revoke all privileges on table public.kv_store_4af580ad from anon;
revoke all privileges on table public.lead_conversation_analyses from anon;
revoke all privileges on table public.lead_events from anon;
revoke all privileges on table public.lead_interactions from anon;
revoke all privileges on table public.lead_list_members from anon;
revoke all privileges on table public.lead_lists from anon;
revoke all privileges on table public.lead_stage_events from anon;
revoke all privileges on table public.lead_status_history from anon;
revoke all privileges on table public.lead_user_priority from anon;
revoke all privileges on table public.pipeline_stages from anon;
revoke all privileges on table public.pipelines from anon;
revoke all privileges on table public.products from anon;
revoke all privileges on table public.profile_details from anon;
revoke all privileges on table public.quick_actions_config from anon;
revoke all privileges on table public.sla_rules from anon;

revoke all privileges on table public.v_pipeline_items from anon;
revoke all privileges on table public.v_pool_items_with_returns from anon;
revoke all privileges on table public.vw_audit_sales_cycles_history from anon;
revoke all privileges on table public.vw_lead_status_age from anon;
revoke all privileges on table public.vw_revenue_by_seller_day from anon;
revoke all privileges on table public.vw_revenue_by_seller_total from anon;

commit;
