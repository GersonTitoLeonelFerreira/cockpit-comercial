-- ============================================================================
-- FASE 26 — Normalizar busca da rpc_cycles_status_totals
-- ============================================================================
-- Objetivo:
-- alinhar os totais por status com a mesma lógica da busca do Kanban.
-- ============================================================================

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
  v_search text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  v_search := btrim(COALESCE(p_search_term, ''));
  v_digits := regexp_replace(v_search, '\D', '', 'g');

  RETURN QUERY
  SELECT
    v.status::text,
    COUNT(*)::bigint
  FROM public.v_pipeline_items v
  WHERE v.company_id = v_company_id
    AND v.owner_id = p_owner_user_id
    AND (p_group_id IS NULL OR v.group_id = p_group_id)
    AND (
      v_search = ''
      OR (
        position('@' in v_search) > 0
        AND (
          COALESCE(v.email, '') ILIKE '%' || v_search || '%'
          OR v.name ILIKE '%' || v_search || '%'
        )
      )
      OR (
        length(v_digits) >= 6
        AND (
          COALESCE(v.phone_digits, '') ILIKE '%' || v_digits || '%'
          OR COALESCE(v.document_digits, '') ILIKE '%' || v_digits || '%'
        )
      )
      OR (
        position('@' in v_search) = 0
        AND length(v_digits) < 6
        AND v.name ILIKE '%' || v_search || '%'
      )
    )
  GROUP BY v.status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) TO authenticated;