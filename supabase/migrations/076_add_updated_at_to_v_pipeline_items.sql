-- ============================================================================
-- Migration 076 — Add updated_at to v_pipeline_items
-- ============================================================================
-- Objetivo:
-- - Expor sales_cycles.updated_at na view v_pipeline_items.
-- - Manter a ordem das colunas existentes da view.
-- - Permitir que Pulso Comercial, Kanban e Detalhe do Ciclo usem a mesma base
--   para calcular tempo sem atualização.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_pipeline_items
WITH (security_invoker = true)
AS
SELECT
  sc.id,
  sc.lead_id,
  l.name,
  l.phone,
  COALESCE(NULLIF(l.email, ''), lp.email) AS email,
  lp.cpf,
  lp.cnpj,
  COALESCE(
    NULLIF(lp.cpf, ''),
    NULLIF(lp.cnpj, ''),
    NULLIF(l.cpf_cnpj, '')
  ) AS document,
  sc.status,
  sc.stage_entered_at,
  sc.owner_user_id AS owner_id,
  sc.current_group_id AS group_id,
  sc.next_action,
  sc.next_action_date,
  sc.created_at,
  sc.company_id,

  -- Campos de busca normalizados
  regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') AS phone_digits,
  regexp_replace(
    COALESCE(
      NULLIF(lp.cpf, ''),
      NULLIF(lp.cnpj, ''),
      NULLIF(l.cpf_cnpj, ''),
      ''
    ),
    '\D',
    '',
    'g'
  ) AS document_digits,

  -- Campo novo precisa ficar no final para não alterar a ordem da view existente
  sc.updated_at
FROM public.sales_cycles sc
JOIN public.leads l
  ON l.id = sc.lead_id
LEFT JOIN public.lead_profiles lp
  ON lp.lead_id = sc.lead_id
 AND lp.company_id = sc.company_id
WHERE l.deleted_at IS NULL;