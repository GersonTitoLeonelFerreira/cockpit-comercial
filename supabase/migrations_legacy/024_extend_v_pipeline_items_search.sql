-- ============================================================================
-- FASE 24 — Estender v_pipeline_items para busca unificada
-- ============================================================================

DROP VIEW IF EXISTS public.v_pipeline_items;

CREATE VIEW public.v_pipeline_items
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
  sc.company_id
FROM public.sales_cycles sc
JOIN public.leads l
  ON l.id = sc.lead_id
LEFT JOIN public.lead_profiles lp
  ON lp.lead_id = sc.lead_id
 AND lp.company_id = sc.company_id;