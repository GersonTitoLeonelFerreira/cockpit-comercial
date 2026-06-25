-- =============================================================================
-- Migration 085 — Dados de resultado para os cards terminais do Kanban
-- =============================================================================
-- Objetivo:
--   Expor somente os campos necessários para o card resumido de Ganho e Perdido.
--
-- Segurança:
--   Não altera sales_cycles.
--   Não altera valores, datas, status, histórico, relatórios ou faturamento.
--   Apenas amplia a view exclusiva de leitura do Kanban.
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
  end as terminal_closed_on,
  case
    when sales_cycle.status = 'ganho'
      then sales_cycle.won_total
    else null
  end as terminal_won_total,
  case
    when sales_cycle.status = 'perdido'
      then sales_cycle.lost_reason
    else null
  end as terminal_lost_reason,
  case
    when sales_cycle.status in ('ganho', 'perdido')
      then product.name
    else null
  end as terminal_product_name
from public.v_pipeline_items as pipeline_item
join public.sales_cycles as sales_cycle
  on sales_cycle.id = pipeline_item.id
 and sales_cycle.company_id = pipeline_item.company_id
left join public.products as product
  on product.id = sales_cycle.product_id
 and product.company_id = sales_cycle.company_id;

commit;
