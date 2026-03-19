-- ============================================================================
-- FASE 9 — Cockpit do Vendedor
-- Migration idempotente
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure v_pipeline_items has email column
--    Recreate the view with leads.email included.
--    This is idempotent: CREATE OR REPLACE preserves dependent objects.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pipeline_items
WITH (security_invoker = true)
AS
SELECT
  sc.id,
  sc.lead_id,
  l.name,
  l.phone,
  l.email,
  sc.status,
  sc.stage_entered_at,
  sc.owner_user_id  AS owner_id,
  sc.current_group_id AS group_id,
  sc.next_action,
  sc.next_action_date,
  sc.created_at,
  sc.company_id
FROM public.sales_cycles sc
JOIN public.leads l ON l.id = sc.lead_id;

-- ---------------------------------------------------------------------------
-- 2. Update rpc_cycles_status_totals to accept p_search_term
--    Maintains backward compatibility via DEFAULT NULL.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_cycles_status_totals(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_cycles_status_totals(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_cycles_status_totals(
  p_owner_user_id uuid,
  p_group_id      uuid DEFAULT NULL,
  p_search_term   text DEFAULT NULL
)
RETURNS TABLE(status text, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT sc.status::text, COUNT(*)::bigint
  FROM public.sales_cycles sc
  JOIN public.leads l ON l.id = sc.lead_id
  WHERE sc.company_id = v_company_id
    AND sc.owner_user_id = p_owner_user_id
    AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR l.name  ILIKE '%' || p_search_term || '%'
      OR l.phone ILIKE '%' || p_search_term || '%'
      OR l.email ILIKE '%' || p_search_term || '%'
    )
  GROUP BY sc.status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Update rpc_return_cycle_to_pool_with_reason
--    Now also resets status → 'novo' and stage_entered_at → now().
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_return_cycle_to_pool_with_reason(uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_return_cycle_to_pool_with_reason(
  p_cycle_id uuid,
  p_reason   text,
  p_details  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id    = NULL,
    status           = 'novo',
    previous_status  = v_cycle.status,
    stage_entered_at = now(),
    updated_at       = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'returned_to_pool',
    jsonb_build_object(
      'reason',            p_reason,
      'details',           p_details,
      'previous_owner',    v_cycle.owner_user_id::text,
      'previous_status',   v_cycle.status::text,
      'previous_group_id', v_cycle.current_group_id::text,
      'previous_owner_id', v_cycle.owner_user_id::text,
      'source',            'card_return'
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: rpc_seller_micro_kpis
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_seller_micro_kpis(uuid, int);

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

  -- Worked today: distinct cycles with events today created by this user
  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_worked_today
  FROM public.cycle_events ce
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_today_start;

  -- Overdue: cycles with next_action_date < now(), not closed
  SELECT COUNT(*) INTO v_overdue_count
  FROM public.sales_cycles sc
  WHERE sc.company_id        = v_company_id
    AND sc.owner_user_id     = p_owner_user_id
    AND sc.next_action_date IS NOT NULL
    AND sc.next_action_date  < now()
    AND sc.status NOT IN ('ganho', 'perdido');

  -- Scheduled today
  SELECT COUNT(*) INTO v_scheduled_today
  FROM public.sales_cycles sc
  WHERE sc.company_id        = v_company_id
    AND sc.owner_user_id     = p_owner_user_id
    AND sc.next_action_date IS NOT NULL
    AND sc.next_action_date >= v_today_start
    AND sc.next_action_date  < v_today_start + interval '1 day'
    AND sc.status NOT IN ('ganho', 'perdido');

  -- Stage moves today
  SELECT COUNT(*) INTO v_stage_moves_today
  FROM public.cycle_events ce
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_today_start
    AND ce.event_type IN ('stage_checkpoint', 'stage_changed', 'stage_moved');

  -- Worked in period (distinct cycles with any event)
  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_worked_period
  FROM public.cycle_events ce
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_period_start;

  -- Advanced in period (distinct cycles with stage-move events)
  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_advanced_period
  FROM public.cycle_events ce
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
-- 5. RPC: rpc_seller_worklist
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_seller_worklist(uuid, uuid, int);

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

  -- Overdue items
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_overdue
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at
    FROM public.sales_cycles sc
    JOIN public.leads l ON l.id = sc.lead_id
    WHERE sc.company_id        = v_company_id
      AND sc.owner_user_id     = p_owner_user_id
      AND sc.next_action_date IS NOT NULL
      AND sc.next_action_date  < now()
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    ORDER BY sc.next_action_date ASC
    LIMIT p_limit
  ) t;

  -- Today items
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_today
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at
    FROM public.sales_cycles sc
    JOIN public.leads l ON l.id = sc.lead_id
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

  -- SLA danger items (time in stage >= danger_minutes or default 2880 min = 2 days)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_sla_danger
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at,
           ROUND(EXTRACT(EPOCH FROM (now() - sc.stage_entered_at)) / 60) AS minutes_in_stage
    FROM public.sales_cycles sc
    JOIN public.leads l ON l.id = sc.lead_id
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
