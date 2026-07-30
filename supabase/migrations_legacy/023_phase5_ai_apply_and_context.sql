-- =============================================================================
-- Migration 023 — Fase 5: contexto ampliado + aplicação transacional da IA
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_get_cycle_ai_context
--    Objetivo:
--    - buscar o ciclo, lead, grupo atual e histórico recente padronizado
--    - servir de contexto único para a rota /api/ai/analyze-conversation
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_get_cycle_ai_context(uuid, integer);

CREATE OR REPLACE FUNCTION public.rpc_get_cycle_ai_context(
  p_cycle_id uuid,
  p_events_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle record;
  v_recent_events jsonb := '[]'::jsonb;
  v_limit integer := GREATEST(COALESCE(p_events_limit, 12), 1);
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT
    sc.id AS cycle_id,
    sc.status::text AS cycle_status,
    sc.owner_user_id,
    sc.next_action,
    sc.next_action_date,
    sc.current_group_id,
    lg.name AS current_group_name,
    l.id AS lead_id,
    l.name AS lead_name,
    l.phone AS lead_phone,
    l.email AS lead_email
  INTO v_cycle
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
  LEFT JOIN public.lead_groups lg
    ON lg.id = sc.current_group_id
   AND lg.company_id = sc.company_id
  WHERE sc.id = p_cycle_id
    AND sc.company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(event_row.event_obj ORDER BY event_row.occurred_at DESC),
    '[]'::jsonb
  )
  INTO v_recent_events
  FROM (
    SELECT
      ce.occurred_at,
      jsonb_build_object(
        'event_type', ce.event_type,
        'occurred_at', ce.occurred_at,
        'from_status', COALESCE(
          ce.metadata->>'from_status',
          ce.metadata->'payload'->>'from_status',
          ce.metadata->'checkpoint'->>'from_status',
          ce.metadata->>'previous_status',
          ce.metadata->>'original_status'
        ),
        'to_status', COALESCE(
          ce.metadata->>'to_status',
          ce.metadata->'payload'->>'to_status',
          ce.metadata->'checkpoint'->>'to_status',
          ce.metadata->>'applied_status',
          ce.metadata->>'new_status'
        ),
        'action_channel', COALESCE(
          ce.metadata->>'action_channel',
          ce.metadata->'payload'->>'action_channel',
          ce.metadata->'checkpoint'->>'action_channel',
          ce.metadata->'suggestion'->>'action_channel'
        ),
        'action_result', COALESCE(
          ce.metadata->>'action_result',
          ce.metadata->'payload'->>'action_result',
          ce.metadata->'checkpoint'->>'action_result',
          ce.metadata->'suggestion'->>'action_result'
        ),
        'result_detail', COALESCE(
          ce.metadata->>'result_detail',
          ce.metadata->'payload'->>'result_detail',
          ce.metadata->'checkpoint'->>'result_detail',
          ce.metadata->'suggestion'->>'result_detail'
        ),
        'next_action', COALESCE(
          ce.metadata->>'next_action',
          ce.metadata->'payload'->>'next_action',
          ce.metadata->'checkpoint'->>'next_action',
          ce.metadata->>'new_next_action'
        ),
        'next_action_date', COALESCE(
          ce.metadata->>'next_action_date',
          ce.metadata->'payload'->>'next_action_date',
          ce.metadata->'checkpoint'->>'next_action_date',
          ce.metadata->>'new_next_action_date'
        ),
        'lost_reason', COALESCE(
          ce.metadata->>'lost_reason',
          ce.metadata->'payload'->>'lost_reason',
          ce.metadata->'checkpoint'->>'lost_reason',
          ce.metadata->'suggestion'->>'close_reason'
        ),
        'source', COALESCE(
          ce.metadata->>'source',
          ce.metadata->'payload'->>'source'
        )
      ) AS event_obj
    FROM public.cycle_events ce
    WHERE ce.company_id = v_company_id
      AND ce.cycle_id = p_cycle_id
    ORDER BY ce.occurred_at DESC
    LIMIT v_limit
  ) AS event_row;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.cycle_id,
      'status', v_cycle.cycle_status,
      'owner_user_id', v_cycle.owner_user_id,
      'next_action', v_cycle.next_action,
      'next_action_date', v_cycle.next_action_date,
      'current_group_id', v_cycle.current_group_id,
      'current_group_name', v_cycle.current_group_name
    ),
    'lead', jsonb_build_object(
      'id', v_cycle.lead_id,
      'name', v_cycle.lead_name,
      'phone', v_cycle.lead_phone,
      'email', v_cycle.lead_email
    ),
    'recent_events', v_recent_events
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_cycle_ai_context(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_cycle_ai_context(uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) rpc_apply_ai_open_suggestion
--    Objetivo:
--    - aplicar sugestão da IA em ciclos abertos em uma única transação
--    - não permitir ganho/perdido/cancelado por este caminho
--    - registrar stage_changed / next_action_set / ai_suggestion_applied
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamptz, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.rpc_apply_ai_open_suggestion(
  p_cycle_id uuid,
  p_to_status text,
  p_next_action text DEFAULT NULL,
  p_next_action_date timestamptz DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_suggestion jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'ai_copilot_detail'
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
  v_to_status public.lead_status;
  v_next_action text;
  v_next_action_date timestamptz;
  v_summary text;
  v_source text;
  v_status_changed boolean := false;
  v_action_changed boolean := false;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF p_to_status IS NULL OR p_to_status NOT IN ('novo', 'contato', 'respondeu', 'negociacao', 'pausado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_open_status');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  v_to_status := p_to_status::public.lead_status;
  v_summary := NULLIF(TRIM(COALESCE(p_summary, '')), '');
  v_source := COALESCE(NULLIF(TRIM(COALESCE(p_source, '')), ''), 'ai_copilot_detail');
  v_next_action := NULLIF(TRIM(COALESCE(p_next_action, '')), '');
  v_next_action_date := p_next_action_date;

  IF v_to_status = 'novo' THEN
    v_next_action := NULL;
    v_next_action_date := NULL;
  END IF;

  IF v_next_action IS NULL THEN
    v_next_action_date := NULL;
  END IF;

  v_status_changed := v_cycle.status IS DISTINCT FROM v_to_status;
  v_action_changed :=
    v_cycle.next_action IS DISTINCT FROM v_next_action
    OR v_cycle.next_action_date IS DISTINCT FROM v_next_action_date;

    UPDATE public.sales_cycles
  SET
    previous_status = CASE
      WHEN v_status_changed THEN v_cycle.status::text
      ELSE previous_status
    END,
    status = CASE
      WHEN v_status_changed THEN v_to_status
      ELSE status
    END,
    stage_entered_at = CASE
      WHEN v_status_changed THEN v_now
      ELSE stage_entered_at
    END,
    next_action = v_next_action,
    next_action_date = v_next_action_date,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF v_status_changed THEN
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
      'stage_changed',
      jsonb_build_object(
        'from_status', v_cycle.status,
        'to_status', v_to_status::text,
        'action_channel', p_suggestion->>'action_channel',
        'action_result', p_suggestion->>'action_result',
        'result_detail', p_suggestion->>'result_detail',
        'note', v_summary,
        'next_action', v_next_action,
        'next_action_date', v_next_action_date,
        'source', v_source,
        'applied_by_ai', true
      ),
      auth.uid(),
      v_now
    );
  END IF;

  IF NOT v_status_changed AND v_action_changed THEN
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
      'next_action_set',
      jsonb_build_object(
        'previous_next_action', v_cycle.next_action,
        'previous_next_action_date', v_cycle.next_action_date,
        'new_next_action', v_next_action,
        'new_next_action_date', v_next_action_date,
        'note', v_summary,
        'source', v_source,
        'applied_by_ai', true
      ),
      auth.uid(),
      v_now
    );
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
    jsonb_build_object(
      'original_status', v_cycle.status,
      'applied_status', v_to_status::text,
      'next_action', v_next_action,
      'next_action_date', v_next_action_date,
      'edited_summary', v_summary,
      'suggestion', COALESCE(p_suggestion, '{}'::jsonb),
      'source', v_source
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', v_to_status::text,
    'previous_status', v_cycle.status,
    'next_action', v_next_action,
    'next_action_date', v_next_action_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamptz, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_apply_ai_open_suggestion(uuid, text, text, timestamptz, text, jsonb, text) TO authenticated;