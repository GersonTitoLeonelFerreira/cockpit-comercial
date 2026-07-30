-- =============================================================================
-- Migration 035 — Corrige rpc_assign_cycle_owner para manter status novo
-- =============================================================================
-- Objetivo:
-- Padronizar a regra operacional de atribuição de ciclo.
--
-- Regra oficial:
-- - Atribuir um ciclo a um vendedor NÃO deve mover automaticamente de "novo"
--   para "contato".
-- - O lead atribuído deve aparecer no Novo do vendedor.
-- - A mudança para contato deve acontecer apenas por ação real do vendedor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_assign_cycle_owner(
  p_cycle_id uuid,
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_already_closed');
  END IF;

  IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  v_event_type := CASE
    WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
    ELSE 'owner_reassigned'
  END;

  UPDATE public.sales_cycles
  SET
    owner_user_id = p_owner_user_id,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_cycle.status,
      'source', 'single_assign',
      'rule', 'assign_keeps_current_status'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_assign_cycle_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_assign_cycle_owner(uuid, uuid) TO authenticated;