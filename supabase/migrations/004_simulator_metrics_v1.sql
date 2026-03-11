-- ============================================================================
-- MIGRATION: Simulator Metrics V1
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_get_active_competency();

CREATE OR REPLACE FUNCTION public.rpc_get_active_competency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_month date;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada';
  END IF;

  SELECT month INTO v_month
    FROM public.competencies
   WHERE company_id = v_company_id
     AND is_active = true
   LIMIT 1;

  IF v_month IS NULL THEN
    v_month := date_trunc('month', now())::date;
  END IF;

  RETURN jsonb_build_object(
    'month', v_month::text,
    'month_start', v_month::text,
    'month_end', (date_trunc('month', v_month)::date + interval '1 month')::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_active_competency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_active_competency() TO authenticated;

DROP FUNCTION IF EXISTS public.rpc_get_sales_cycle_metrics_v1(uuid, date);

CREATE OR REPLACE FUNCTION public.rpc_get_sales_cycle_metrics_v1(
  p_owner_user_id uuid DEFAULT NULL,
  p_month date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_is_admin boolean;
  v_owner_filter uuid;
  v_month date;
  v_month_start date;
  v_month_end date;
  v_counts_by_status record;
  v_current_wins integer;
  v_worked_count integer;
  v_total_open integer;
  v_total_pool integer;
  v_result jsonb;
BEGIN
  v_company_id := public.current_company_id();
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada';
  END IF;

  IF p_month IS NOT NULL THEN
    v_month := p_month;
  ELSE
    SELECT month INTO v_month
      FROM public.competencies
     WHERE company_id = v_company_id
       AND is_active = true
     LIMIT 1;

    IF v_month IS NULL THEN
      v_month := date_trunc('month', now())::date;
    END IF;
  END IF;

  v_month_start := v_month;
  v_month_end := (date_trunc('month', v_month)::date + interval '1 month')::date;

  IF NOT v_is_admin THEN
    v_owner_filter := v_user_id;
  ELSIF p_owner_user_id IS NOT NULL THEN
    v_owner_filter := p_owner_user_id;
  ELSE
    v_owner_filter := NULL;
  END IF;

  SELECT COUNT(*) INTO v_current_wins
    FROM public.sales_cycles sc
   WHERE sc.company_id = v_company_id
     AND sc.status = 'ganho'
     AND sc.closed_at >= v_month_start
     AND sc.closed_at < v_month_end
     AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter);

  SELECT COUNT(*) INTO v_worked_count
    FROM public.sales_cycles sc
   WHERE sc.company_id = v_company_id
     AND sc.status != 'novo'
     AND sc.stage_entered_at >= v_month_start
     AND sc.stage_entered_at < v_month_end
     AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter);

  SELECT COUNT(*) INTO v_total_open
    FROM public.sales_cycles sc
   WHERE sc.company_id = v_company_id
     AND sc.status NOT IN ('ganho', 'perdido')
     AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter);

  v_total_pool := 0;
  IF v_is_admin AND v_owner_filter IS NULL THEN
    SELECT COUNT(*) INTO v_total_pool
      FROM public.sales_cycles sc
     WHERE sc.company_id = v_company_id
       AND sc.owner_user_id IS NULL
       AND sc.status = 'novo';
  END IF;

  WITH status_counts AS (
    SELECT status, COUNT(*) as cnt
      FROM public.sales_cycles sc
     WHERE sc.company_id = v_company_id
       AND sc.stage_entered_at >= v_month_start
       AND sc.stage_entered_at < v_month_end
       AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter)
     GROUP BY status
  )
  SELECT
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'novo'), 0) as novo,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'contato'), 0) as contato,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'respondeu'), 0) as respondeu,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'negociacao'), 0) as negociacao,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'ganho'), 0) as ganho,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'perdido'), 0) as perdido
  INTO v_counts_by_status;

  v_result := jsonb_build_object(
    'company_id', v_company_id::text,
    'month_start', v_month_start::text,
    'month_end', v_month_end::text,
    'owner_user_id', COALESCE(v_owner_filter::text, 'null'),
    'is_admin', v_is_admin,
    'current_wins', v_current_wins,
    'worked_count', v_worked_count,
    'total_open', v_total_open,
    'total_pool', v_total_pool,
    'counts_by_status', jsonb_build_object(
      'novo', v_counts_by_status.novo,
      'contato', v_counts_by_status.contato,
      'respondeu', v_counts_by_status.respondeu,
      'negociacao', v_counts_by_status.negociacao,
      'ganho', v_counts_by_status.ganho,
      'perdido', v_counts_by_status.perdido
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_sales_cycle_metrics_v1(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_sales_cycle_metrics_v1(uuid, date) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_sales_cycles_company_status_month
  ON public.sales_cycles(company_id, status, stage_entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_cycles_company_owner_status
  ON public.sales_cycles(company_id, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_competencies_company_active
  ON public.competencies(company_id, is_active)
  WHERE is_active = true;
