-- =============================================================================
-- Migration 075 — SLA rules for active company
-- =============================================================================
-- Objetivo:
-- Criar uma RPC de leitura de SLA com company_id explícito.
--
-- Contexto:
-- A função legada public.rpc_get_company_sla_rules() depende de
-- public.current_company_id(), o que é inadequado para o modelo multiempresa
-- baseado em cockpit_active_company_id no app.
--
-- Esta migration NÃO remove a função antiga.
-- Ela cria uma versão nova para migração gradual do front.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_company_sla_rules_for_company(
  p_company_id uuid
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  status text,
  target_minutes integer,
  warning_minutes integer,
  danger_minutes integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_memberships cm
    JOIN public.profiles p
      ON p.id = cm.user_id
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.is_active = true
      AND COALESCE(p.is_active_global, true) = true
  ) THEN
    RAISE EXCEPTION 'Usuário sem vínculo ativo com a empresa.';
  END IF;

  RETURN QUERY
  SELECT
    sr.id,
    sr.company_id,
    sr.status,
    sr.target_minutes,
    sr.warning_minutes,
    sr.danger_minutes,
    sr.created_at,
    sr.updated_at
  FROM public.sla_rules sr
  WHERE sr.company_id = p_company_id
  ORDER BY sr.status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_company_sla_rules_for_company(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_get_company_sla_rules_for_company(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_company_sla_rules_for_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_company_sla_rules_for_company(uuid) TO service_role;