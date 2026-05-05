-- ============================================================================
-- FASE 2D — Filtrar leads com soft delete nas RPCs operacionais
-- Objetivo:
-- - Impedir que RPCs antigas retornem ou contem leads com deleted_at preenchido.
-- - Preservar o soft delete como regra operacional global.
-- - Proteger Cockpit do Vendedor, IA e métricas rápidas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. rpc_cycles_status_totals
-- ---------------------------------------------------------------------------
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
   AND l.deleted_at IS NULL
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

-- ---------------------------------------------------------------------------
-- 2. rpc_seller_micro_kpis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_seller_micro_kpis(
  p_owner_user_id uuid,
  p_days          int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id        uuid;
  v_today_start       timestamptz;
  v_period_start      timestamptz;
  v_worked_today      bigint;
  v_overdue_count     bigint;
  v_scheduled_today   bigint;
  v_stage_moves_today bigint;
  v_worked_period     bigint;
  v_advanced_period   bigint;
  v_advance_rate      numeric;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  v_today_start  := date_trunc('day', now());
  v_period_start := date_trunc('day', now() - (p_days || ' days')::interval);

  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_worked_today
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_today_start;

  SELECT COUNT(*) INTO v_overdue_count
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE sc.company_id        = v_company_id
    AND sc.owner_user_id     = p_owner_user_id
    AND sc.next_action_date IS NOT NULL
    AND sc.next_action_date  < now()
    AND sc.status NOT IN ('ganho', 'perdido');

  SELECT COUNT(*) INTO v_scheduled_today
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE sc.company_id        = v_company_id
    AND sc.owner_user_id     = p_owner_user_id
    AND sc.next_action_date IS NOT NULL
    AND sc.next_action_date >= v_today_start
    AND sc.next_action_date  < v_today_start + interval '1 day'
    AND sc.status NOT IN ('ganho', 'perdido');

  SELECT COUNT(*) INTO v_stage_moves_today
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_today_start
    AND ce.event_type IN ('stage_checkpoint', 'stage_changed', 'stage_moved');

  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_worked_period
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_period_start;

  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_advanced_period
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_period_start
    AND ce.event_type IN ('stage_checkpoint', 'stage_changed', 'stage_moved');

  IF v_worked_period > 0 THEN
    v_advance_rate := ROUND((v_advanced_period::numeric / v_worked_period::numeric) * 100, 1);
  ELSE
    v_advance_rate := 0;
  END IF;

  RETURN jsonb_build_object(
    'worked_today',      v_worked_today,
    'overdue_count',     v_overdue_count,
    'scheduled_today',   v_scheduled_today,
    'stage_moves_today', v_stage_moves_today,
    'worked_period',     v_worked_period,
    'advanced_period',   v_advanced_period,
    'advance_rate',      v_advance_rate,
    'period_days',       p_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_seller_micro_kpis(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_seller_micro_kpis(uuid, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. rpc_seller_worklist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_seller_worklist(
  p_owner_user_id uuid,
  p_group_id      uuid DEFAULT NULL,
  p_limit         int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id  uuid;
  v_today_start timestamptz;
  v_overdue     jsonb;
  v_today       jsonb;
  v_sla_danger  jsonb;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  v_today_start := date_trunc('day', now());

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_overdue
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at
    FROM public.sales_cycles sc
    JOIN public.leads l
      ON l.id = sc.lead_id
     AND l.deleted_at IS NULL
    WHERE sc.company_id        = v_company_id
      AND sc.owner_user_id     = p_owner_user_id
      AND sc.next_action_date IS NOT NULL
      AND sc.next_action_date  < now()
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    ORDER BY sc.next_action_date ASC
    LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_today
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at
    FROM public.sales_cycles sc
    JOIN public.leads l
      ON l.id = sc.lead_id
     AND l.deleted_at IS NULL
    WHERE sc.company_id        = v_company_id
      AND sc.owner_user_id     = p_owner_user_id
      AND sc.next_action_date IS NOT NULL
      AND sc.next_action_date >= v_today_start
      AND sc.next_action_date  < v_today_start + interval '1 day'
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    ORDER BY sc.next_action_date ASC
    LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_sla_danger
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at,
           ROUND(EXTRACT(EPOCH FROM (now() - sc.stage_entered_at)) / 60) AS minutes_in_stage
    FROM public.sales_cycles sc
    JOIN public.leads l
      ON l.id = sc.lead_id
     AND l.deleted_at IS NULL
    LEFT JOIN public.sla_rules sr
      ON sr.company_id = v_company_id AND sr.status = sc.status::text
    WHERE sc.company_id    = v_company_id
      AND sc.owner_user_id = p_owner_user_id
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
      AND EXTRACT(EPOCH FROM (now() - sc.stage_entered_at)) / 60
          >= COALESCE(sr.danger_minutes, 2880)
    ORDER BY sc.stage_entered_at ASC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'overdue',    v_overdue,
    'today',      v_today,
    'sla_danger', v_sla_danger
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_seller_worklist(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_seller_worklist(uuid, uuid, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. rpc_get_cycle_ai_context
-- ---------------------------------------------------------------------------
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
   AND l.deleted_at IS NULL
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