-- ==========================================================================
-- FASE 22 — Corrigir busca por CPF no Cockpit Comercial
-- Versão compatível com bancos que já têm v_pipeline_items em outra ordem
-- ==========================================================================

DROP VIEW IF EXISTS public.v_pipeline_items;

CREATE VIEW public.v_pipeline_items
WITH (security_invoker = true)
AS
SELECT
  sc.id,
  sc.lead_id,
  l.name,
  l.phone,
  l.email,
  lp.cpf,
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

DROP FUNCTION IF EXISTS public.rpc_cycles_status_totals(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_cycles_status_totals(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_cycles_status_totals(
  p_owner_user_id uuid,
  p_group_id uuid DEFAULT NULL,
  p_search_term text DEFAULT NULL
)
RETURNS TABLE(status text, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_digits text;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  v_digits := regexp_replace(COALESCE(p_search_term, ''), '\D', '', 'g');

  RETURN QUERY
  SELECT sc.status::text, COUNT(*)::bigint
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
  LEFT JOIN public.lead_profiles lp
    ON lp.lead_id = sc.lead_id
   AND lp.company_id = sc.company_id
  WHERE sc.company_id = v_company_id
    AND sc.owner_user_id = p_owner_user_id
    AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR l.name ILIKE '%' || p_search_term || '%'
      OR l.phone ILIKE '%' || p_search_term || '%'
      OR l.email ILIKE '%' || p_search_term || '%'
      OR (
        length(v_digits) = 11
        AND lp.cpf ILIKE '%' || v_digits || '%'
      )
    )
  GROUP BY sc.status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) TO authenticated;