-- ============================================================================
-- FASE 2B — Soft delete de leads
-- Objetivo:
-- - Evitar delete físico de leads em operação administrativa.
-- - Preservar histórico e permitir auditoria.
-- - Ocultar leads deletados da view operacional v_pipeline_items.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_leads_company_deleted_at
  ON public.leads (company_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_leads_deleted_at
  ON public.leads (deleted_at);

COMMENT ON COLUMN public.leads.deleted_at IS
  'Marca soft delete operacional do lead. Leads com deleted_at preenchido não devem aparecer no pipeline.';

COMMENT ON COLUMN public.leads.deleted_by IS
  'Usuário admin responsável pelo soft delete operacional do lead.';

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
 AND lp.company_id = sc.company_id
WHERE l.deleted_at IS NULL;