-- =============================================================================
-- Migration 030 — Align simulator metrics with revenue reference period
-- =============================================================================
-- Objetivo:
-- Alinhar as métricas do Simulador de Meta com a mesma lógica temporal usada
-- pela Gestão de Faturamento.
--
-- Regra oficial para vendas ganhas:
-- 1. Se houver revenue_seller_ref_date, essa é a data financeira da venda.
-- 2. Se não houver, usa won_at.
-- 3. Se não houver won_at, usa closed_at.
--
-- Fluxo preservado:
-- Kanban -> sales_cycles -> views de faturamento -> Gestão de Faturamento -> Simulador
-- =============================================================================

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
    v_month := date_trunc('month', p_month)::date;
  ELSE
    v_month := date_trunc('month', now())::date;
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

  SELECT COUNT(*)
    INTO v_current_wins
  FROM public.sales_cycles sc
  WHERE sc.company_id = v_company_id
    AND sc.status = 'ganho'
    AND COALESCE(
      sc.revenue_seller_ref_date::date,
      (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
      (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
    ) >= v_month_start
    AND COALESCE(
      sc.revenue_seller_ref_date::date,
      (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
      (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
    ) < v_month_end
    AND (
      v_owner_filter IS NULL
      OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    );

  SELECT COUNT(*)
    INTO v_worked_count
  FROM public.sales_cycles sc
  WHERE sc.company_id = v_company_id
    AND sc.status != 'novo'
    AND (
      (
        sc.stage_entered_at >= v_month_start
        AND sc.stage_entered_at < v_month_end
        AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter)
      )
      OR (
        sc.status = 'ganho'
        AND COALESCE(
          sc.revenue_seller_ref_date::date,
          (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
          (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
        ) >= v_month_start
        AND COALESCE(
          sc.revenue_seller_ref_date::date,
          (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
          (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
        ) < v_month_end
        AND (
          v_owner_filter IS NULL
          OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
        )
      )
    );

  SELECT COUNT(*)
    INTO v_total_open
  FROM public.sales_cycles sc
  WHERE sc.company_id = v_company_id
    AND sc.status NOT IN ('ganho', 'perdido')
    AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter);

  v_total_pool := 0;

  IF v_is_admin AND v_owner_filter IS NULL THEN
    SELECT COUNT(*)
      INTO v_total_pool
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND sc.owner_user_id IS NULL
      AND sc.status = 'novo';
  END IF;

  WITH scoped_cycles AS (
    SELECT
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND (
        (
          sc.status = 'ganho'
          AND COALESCE(
            sc.revenue_seller_ref_date::date,
            (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
            (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
          ) >= v_month_start
          AND COALESCE(
            sc.revenue_seller_ref_date::date,
            (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
            (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
          ) < v_month_end
          AND (
            v_owner_filter IS NULL
            OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
          )
        )
        OR (
          sc.status <> 'ganho'
          AND sc.stage_entered_at >= v_month_start
          AND sc.stage_entered_at < v_month_end
          AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter)
        )
      )
  ),
  status_counts AS (
    SELECT status, COUNT(*) AS cnt
    FROM scoped_cycles
    GROUP BY status
  )
  SELECT
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'novo'), 0) AS novo,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'contato'), 0) AS contato,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'respondeu'), 0) AS respondeu,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'negociacao'), 0) AS negociacao,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'ganho'), 0) AS ganho,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'perdido'), 0) AS perdido
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


CREATE OR REPLACE FUNCTION public.rpc_simulator_group_conversion(
  p_company_id  uuid,
  p_owner_id    uuid    DEFAULT NULL,
  p_date_start  date    DEFAULT NULL,
  p_date_end    date    DEFAULT NULL
)
RETURNS TABLE (
  group_id          uuid,
  group_name        text,
  novo              int,
  contato           int,
  respondeu         int,
  negociacao        int,
  ganho             int,
  perdido           int,
  trabalhados       int,
  pct_grupo         numeric,
  pct_participacao  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_trabalhados_total bigint;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  IF NOT v_is_admin THEN
    IF p_owner_id IS NULL OR p_owner_id <> v_caller_id THEN
      RAISE EXCEPTION 'Acesso negado: vendedor só pode consultar seus próprios dados.';
    END IF;
  END IF;

  WITH scoped_cycles AS (
    SELECT
      sc.current_group_id,
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = p_company_id
      AND (
        (
          sc.status = 'ganho'
          AND (
            p_date_start IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) >= p_date_start
          )
          AND (
            p_date_end IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) <= p_date_end
          )
          AND (
            p_owner_id IS NULL
            OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p_owner_id
          )
        )
        OR (
          sc.status <> 'ganho'
          AND (p_date_start IS NULL OR sc.stage_entered_at >= p_date_start)
          AND (p_date_end IS NULL OR sc.stage_entered_at < (p_date_end + interval '1 day'))
          AND (p_owner_id IS NULL OR sc.owner_user_id = p_owner_id)
        )
      )
  )
  SELECT COUNT(*)
    INTO v_trabalhados_total
  FROM scoped_cycles
  WHERE status <> 'novo';

  RETURN QUERY
  WITH scoped_cycles AS (
    SELECT
      sc.current_group_id,
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = p_company_id
      AND (
        (
          sc.status = 'ganho'
          AND (
            p_date_start IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) >= p_date_start
          )
          AND (
            p_date_end IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) <= p_date_end
          )
          AND (
            p_owner_id IS NULL
            OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p_owner_id
          )
        )
        OR (
          sc.status <> 'ganho'
          AND (p_date_start IS NULL OR sc.stage_entered_at >= p_date_start)
          AND (p_date_end IS NULL OR sc.stage_entered_at < (p_date_end + interval '1 day'))
          AND (p_owner_id IS NULL OR sc.owner_user_id = p_owner_id)
        )
      )
  ),
  agg AS (
    SELECT
      current_group_id AS grp_id,
      COUNT(*) FILTER (WHERE status = 'novo') AS cnt_novo,
      COUNT(*) FILTER (WHERE status = 'contato') AS cnt_contato,
      COUNT(*) FILTER (WHERE status = 'respondeu') AS cnt_respondeu,
      COUNT(*) FILTER (WHERE status = 'negociacao') AS cnt_negociacao,
      COUNT(*) FILTER (WHERE status = 'ganho') AS cnt_ganho,
      COUNT(*) FILTER (WHERE status = 'perdido') AS cnt_perdido,
      COUNT(*) FILTER (WHERE status <> 'novo') AS cnt_trabalhados
    FROM scoped_cycles
    GROUP BY current_group_id
  )
  SELECT
    agg.grp_id AS group_id,
    COALESCE(lg.name, 'Sem grupo') AS group_name,
    agg.cnt_novo::int AS novo,
    agg.cnt_contato::int AS contato,
    agg.cnt_respondeu::int AS respondeu,
    agg.cnt_negociacao::int AS negociacao,
    agg.cnt_ganho::int AS ganho,
    agg.cnt_perdido::int AS perdido,
    agg.cnt_trabalhados::int AS trabalhados,
    CASE
      WHEN agg.cnt_trabalhados = 0 THEN 0::numeric
      ELSE ROUND(agg.cnt_ganho::numeric / agg.cnt_trabalhados::numeric, 6)
    END AS pct_grupo,
    CASE
      WHEN v_trabalhados_total = 0 THEN 0::numeric
      ELSE ROUND(agg.cnt_trabalhados::numeric / v_trabalhados_total::numeric, 6)
    END AS pct_participacao
  FROM agg
  LEFT JOIN public.lead_groups lg
    ON lg.id = agg.grp_id
   AND lg.company_id = p_company_id
  ORDER BY agg.cnt_trabalhados DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_simulator_group_conversion(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_simulator_group_conversion(uuid, uuid, date, date) TO authenticated;