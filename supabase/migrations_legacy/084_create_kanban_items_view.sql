-- =============================================================================
-- Migration 084 — View exclusiva para leitura do Kanban
-- =============================================================================
-- Objetivo:
--   Criar uma fonte de leitura isolada para o Kanban.
--
-- Segurança:
--   Não altera public.v_pipeline_items.
--   Não altera sales_cycles.
--   Não altera status, won_at, lost_at, closed_at, relatórios ou faturamento.
--
-- Regra da competência:
--   ganho   -> terminal_closed_on usa won_at no fuso America/Sao_Paulo
--   perdido -> terminal_closed_on usa lost_at no fuso America/Sao_Paulo
--   ativos  -> terminal_closed_on fica nulo
-- =============================================================================

begin;

create or replace view public.v_kanban_items as
select
  pipeline_item.*,
  case
    when sales_cycle.status = 'ganho'
      then (sales_cycle.won_at at time zone 'America/Sao_Paulo')::date
    when sales_cycle.status = 'perdido'
      then (sales_cycle.lost_at at time zone 'America/Sao_Paulo')::date
    else null
  end as terminal_closed_on
from public.v_pipeline_items as pipeline_item
join public.sales_cycles as sales_cycle
  on sales_cycle.id = pipeline_item.id
 and sales_cycle.company_id = pipeline_item.company_id;

revoke all on table public.v_kanban_items from anon;
revoke all on table public.v_kanban_items from authenticated;

grant select on table public.v_kanban_items to service_role;

commit;