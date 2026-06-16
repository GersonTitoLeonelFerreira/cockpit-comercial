-- ============================================================================
-- Migration 077 — Add sales_cycles indexes for Pulso Comercial
-- ============================================================================
-- Objetivo:
-- - Acelerar consultas do Pulso Comercial.
-- - Acelerar leitura de ciclos em andamento por empresa, vendedor e status.
-- - Preparar base para paginação real e filtros mais pesados no Pulso.
-- ============================================================================

create index if not exists idx_sales_cycles_pulse_company_status_owner_stage
on public.sales_cycles (
  company_id,
  status,
  owner_user_id,
  stage_entered_at
)
where status in ('contato', 'respondeu', 'negociacao');

create index if not exists idx_sales_cycles_pulse_company_status_owner_updated
on public.sales_cycles (
  company_id,
  status,
  owner_user_id,
  updated_at
)
where status in ('contato', 'respondeu', 'negociacao');

create index if not exists idx_sales_cycles_pulse_next_action_date
on public.sales_cycles (
  company_id,
  next_action_date
)
where status in ('contato', 'respondeu', 'negociacao')
  and next_action_date is not null;