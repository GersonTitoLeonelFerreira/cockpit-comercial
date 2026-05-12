-- =============================================================================
-- Migration 044 — Restrict internal and legacy RPC execution
-- =============================================================================
-- Fase 5B — Segurança Supabase: authenticated não deve executar funções internas
-- e legadas diretamente pela API REST.
--
-- Contexto:
-- A migration 043 removeu execução por anon das funções SECURITY DEFINER.
-- Esta migration remove authenticated de funções que não devem ser chamadas
-- diretamente pelo client autenticado.
--
-- Estratégia:
-- - Manter service_role.
-- - Remover authenticated de trigger/internal functions.
-- - Remover authenticated de RPCs legadas baseadas em leads antigos.
-- - Não mexer em RPCs ativas usadas pelo app.
--
-- Não mexer aqui:
-- - RPCs _for_company ativas.
-- - RPCs de IA ainda chamadas pelo app.
-- - RPCs de faturamento/metas ainda chamadas pelo app.
-- - helpers usados em RLS sem auditoria específica.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Funções internas / trigger
-- =============================================================================
-- Essas funções são disparadas por triggers ou mecanismos internos do banco.
-- Elas não precisam ser chamadas como RPC pelo usuário autenticado.

revoke execute on function public.block_lead_profiles_key_update()
from authenticated;

revoke execute on function public.handle_lead_event_period_activity()
from authenticated;

revoke execute on function public.handle_lead_status_period_activity()
from authenticated;

revoke execute on function public.handle_new_user()
from authenticated;

revoke execute on function public.handle_sales_cycle_closed_at()
from authenticated;

revoke execute on function public.handle_sales_cycle_period_activity()
from authenticated;

revoke execute on function public.handle_won_columns_freeze()
from authenticated;

revoke execute on function public.handle_won_columns_reset()
from authenticated;

revoke execute on function public.log_lead_stage_change()
from authenticated;

revoke execute on function public.log_lead_status_change()
from authenticated;

revoke execute on function public.set_execution_day_calendars_updated_at()
from authenticated;

revoke execute on function public.sync_profile_email()
from authenticated;

revoke execute on function public.update_updated_at_column()
from authenticated;

-- Garante execução administrativa/servidor.
grant execute on function public.block_lead_profiles_key_update()
to service_role;

grant execute on function public.handle_lead_event_period_activity()
to service_role;

grant execute on function public.handle_lead_status_period_activity()
to service_role;

grant execute on function public.handle_new_user()
to service_role;

grant execute on function public.handle_sales_cycle_closed_at()
to service_role;

grant execute on function public.handle_sales_cycle_period_activity()
to service_role;

grant execute on function public.handle_won_columns_freeze()
to service_role;

grant execute on function public.handle_won_columns_reset()
to service_role;

grant execute on function public.log_lead_stage_change()
to service_role;

grant execute on function public.log_lead_status_change()
to service_role;

grant execute on function public.set_execution_day_calendars_updated_at()
to service_role;

grant execute on function public.sync_profile_email()
to service_role;

grant execute on function public.update_updated_at_column()
to service_role;

-- =============================================================================
-- 2. Funções legadas baseadas no modelo antigo de leads
-- =============================================================================
-- Essas funções pertencem à arquitetura antiga de leads como operação.
-- A operação oficial atual é sales_cycles + cycle_events.

revoke execute on function public.assign_leads(
  uuid,
  uuid[],
  text,
  uuid,
  uuid[],
  boolean
)
from authenticated;

revoke execute on function public.assign_leads(
  uuid,
  text,
  integer,
  uuid[],
  text,
  text,
  text,
  uuid,
  uuid[],
  boolean,
  text
)
from authenticated;

revoke execute on function public.delete_leads_by_ids(
  uuid[],
  uuid
)
from authenticated;

revoke execute on function public.reassign_owner_leads(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  text
)
from authenticated;

revoke execute on function public.return_owner_leads_to_pool(
  uuid,
  uuid,
  integer,
  text,
  text
)
from authenticated;

revoke execute on function public.round_robin_from_owner_leads(
  uuid,
  uuid,
  uuid[],
  integer,
  text,
  text,
  text
)
from authenticated;

revoke execute on function public.seller_move_lead_stage(
  uuid,
  uuid,
  text,
  text,
  numeric,
  uuid
)
from authenticated;

grant execute on function public.assign_leads(
  uuid,
  uuid[],
  text,
  uuid,
  uuid[],
  boolean
)
to service_role;

grant execute on function public.assign_leads(
  uuid,
  text,
  integer,
  uuid[],
  text,
  text,
  text,
  uuid,
  uuid[],
  boolean,
  text
)
to service_role;

grant execute on function public.delete_leads_by_ids(
  uuid[],
  uuid
)
to service_role;

grant execute on function public.reassign_owner_leads(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  text
)
to service_role;

grant execute on function public.return_owner_leads_to_pool(
  uuid,
  uuid,
  integer,
  text,
  text
)
to service_role;

grant execute on function public.round_robin_from_owner_leads(
  uuid,
  uuid,
  uuid[],
  integer,
  text,
  text,
  text
)
to service_role;

grant execute on function public.seller_move_lead_stage(
  uuid,
  uuid,
  text,
  text,
  numeric,
  uuid
)
to service_role;

-- =============================================================================
-- 3. Funções administrativas legadas substituídas por versões _for_company
-- =============================================================================
-- A gestão de vendedores já usa:
-- rpc_admin_list_sellers_stats_for_company
-- rpc_admin_update_seller_access_for_company
--
-- Portanto as versões sem company_id explícito não devem ser chamadas pelo client.

revoke execute on function public.rpc_admin_list_sellers_stats(
  integer
)
from authenticated;

revoke execute on function public.rpc_admin_update_seller_access(
  uuid,
  text,
  boolean
)
from authenticated;

grant execute on function public.rpc_admin_list_sellers_stats(
  integer
)
to service_role;

grant execute on function public.rpc_admin_update_seller_access(
  uuid,
  text,
  boolean
)
to service_role;

commit;