-- =============================================================================
-- Migration 007 — Phase 7 Cockpit Vendor RPCs
-- Creates all RPCs and tables used by SalesCyclesKanban.tsx that were
-- previously only applied directly via the Supabase SQL Editor.
-- All statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SLA RULES TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status          text NOT NULL,
  target_minutes  integer NOT NULL DEFAULT 1440,
  warning_minutes integer NOT NULL DEFAULT 2880,
  danger_minutes  integer NOT NULL DEFAULT 4320,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, status)
);

ALTER TABLE public.sla_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sla_rules' AND policyname = 'sla_rules_company_isolation'
  ) THEN
    CREATE POLICY sla_rules_company_isolation ON public.sla_rules
      USING (company_id = public.current_company_id());
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. PERFORMANCE INDEXES (idempotent)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cycle_events_cycle_id
  ON public.cycle_events (cycle_id);

CREATE INDEX IF NOT EXISTS idx_cycle_events_company_occurred
  ON public.cycle_events (company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_cycles_next_action_date
  ON public.sales_cycles (next_action_date)
  WHERE next_action_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cycles_owner_company_status
  ON public.sales_cycles (owner_user_id, company_id, status);

-- ---------------------------------------------------------------------------
-- 3. rpc_cycles_status_totals
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_cycles_status_totals(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_cycles_status_totals(
  p_owner_user_id uuid,
  p_group_id      uuid DEFAULT NULL
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
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sc.status::text, COUNT(*)::bigint
  FROM public.sales_cycles sc
  WHERE sc.company_id      = v_company_id
    AND sc.owner_user_id   = p_owner_user_id
    AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
  GROUP BY sc.status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cycles_status_totals(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. rpc_move_cycle_stage
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_move_cycle_stage(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage(
  p_cycle_id  uuid,
  p_to_status text,
  p_metadata  jsonb DEFAULT '{}'::jsonb
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
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = now(),
    updated_at       = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status',   p_to_status,
      'metadata',    p_metadata
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_move_cycle_stage(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_cycle_stage(uuid, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. rpc_move_cycle_stage_checkpoint
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_checkpoint(
  p_cycle_id   uuid,
  p_to_status  text,
  p_checkpoint jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id       uuid;
  v_cycle            public.sales_cycles%ROWTYPE;
  v_next_action      text;
  v_next_action_date timestamptz;
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

  v_next_action      := p_checkpoint->>'next_action';
  v_next_action_date := (p_checkpoint->>'next_action_date')::timestamptz;

  UPDATE public.sales_cycles
  SET
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = now(),
    next_action      = COALESCE(v_next_action, next_action),
    next_action_date = COALESCE(v_next_action_date, next_action_date),
    updated_at       = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status',   p_to_status,
      'checkpoint',  p_checkpoint
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. rpc_get_company_sla_rules
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_get_company_sla_rules();

CREATE OR REPLACE FUNCTION public.rpc_get_company_sla_rules()
RETURNS SETOF public.sla_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.sla_rules
  WHERE company_id = v_company_id
  ORDER BY status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_company_sla_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_company_sla_rules() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. rpc_upsert_company_sla_rules
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_upsert_company_sla_rules(jsonb);

CREATE OR REPLACE FUNCTION public.rpc_upsert_company_sla_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_rule       jsonb;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  -- Only admins may write SLA rules
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules)
  LOOP
    INSERT INTO public.sla_rules (
      company_id, status, target_minutes, warning_minutes, danger_minutes, updated_at
    ) VALUES (
      v_company_id,
      v_rule->>'status',
      (v_rule->>'target_minutes')::integer,
      (v_rule->>'warning_minutes')::integer,
      (v_rule->>'danger_minutes')::integer,
      now()
    )
    ON CONFLICT (company_id, status) DO UPDATE SET
      target_minutes  = EXCLUDED.target_minutes,
      warning_minutes = EXCLUDED.warning_minutes,
      danger_minutes  = EXCLUDED.danger_minutes,
      updated_at      = now();
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_company_sla_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_company_sla_rules(jsonb) TO authenticated;
