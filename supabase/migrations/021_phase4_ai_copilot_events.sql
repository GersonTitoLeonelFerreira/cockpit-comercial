-- =============================================================================
-- Migration 021 — Fase 4B: auditoria do copiloto de IA
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cycle_events_ai_event_type_occurred_at
  ON public.cycle_events (event_type, occurred_at DESC)
  WHERE event_type IN (
    'ai_analysis_generated',
    'ai_suggestion_applied',
    'ai_suggestion_rejected'
  );

-- -----------------------------------------------------------------------------
-- Função: registrar análise gerada pela IA
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_log_ai_analysis(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.rpc_log_ai_analysis(
  p_cycle_id uuid,
  p_suggestion jsonb,
  p_conversation_excerpt text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_cycles
    WHERE id = p_cycle_id
      AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

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
    'ai_analysis_generated',
    jsonb_build_object(
      'suggestion', COALESCE(p_suggestion, '{}'::jsonb),
      'conversation_excerpt', NULLIF(TRIM(p_conversation_excerpt), '')
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_ai_analysis(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_log_ai_analysis(uuid, jsonb, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Função: registrar aplicação da sugestão da IA
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_log_ai_suggestion_applied(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_log_ai_suggestion_applied(
  p_cycle_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_cycles
    WHERE id = p_cycle_id
      AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

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
    'ai_suggestion_applied',
    COALESCE(p_payload, '{}'::jsonb),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_ai_suggestion_applied(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_log_ai_suggestion_applied(uuid, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- Função: registrar rejeição da sugestão da IA
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_log_ai_suggestion_rejected(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_log_ai_suggestion_rejected(
  p_cycle_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_cycles
    WHERE id = p_cycle_id
      AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

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
    'ai_suggestion_rejected',
    COALESCE(p_payload, '{}'::jsonb),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_ai_suggestion_rejected(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_log_ai_suggestion_rejected(uuid, jsonb) TO authenticated;