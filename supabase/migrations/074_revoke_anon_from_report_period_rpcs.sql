-- =============================================================================
-- Migration 074 — Revoke anon from report period RPCs
-- =============================================================================
-- Objetivo:
-- Remover execução anônima das RPCs de relatório por competência.
--
-- Motivo:
-- As funções validam usuário autenticado internamente, mas não devem ficar
-- expostas para execução por anon na API REST do Supabase.
-- =============================================================================

revoke execute on function public.report_stage_conversion_for_period(uuid, date, date) from anon;
revoke execute on function public.report_stage_losses_for_period(uuid, date, date) from anon;
revoke execute on function public.report_stage_time_summary_for_period(uuid, date, date) from anon;

grant execute on function public.report_stage_conversion_for_period(uuid, date, date) to authenticated;
grant execute on function public.report_stage_losses_for_period(uuid, date, date) to authenticated;
grant execute on function public.report_stage_time_summary_for_period(uuid, date, date) to authenticated;

grant execute on function public.report_stage_conversion_for_period(uuid, date, date) to service_role;
grant execute on function public.report_stage_losses_for_period(uuid, date, date) to service_role;
grant execute on function public.report_stage_time_summary_for_period(uuid, date, date) to service_role;