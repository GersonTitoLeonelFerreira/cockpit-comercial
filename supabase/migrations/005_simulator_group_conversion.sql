-- ============================================================================
-- MIGRATION: Simulator Group Conversion
-- Feature: "Conversão por Grupo" no período
-- ============================================================================
--
-- Status mapping:
--   "Não trabalhado" = status 'novo'
--   "Trabalhados"    = contato + respondeu + negociacao + ganho + perdido
--   "Vendas"         = ganho
--   "% do Grupo"     = ganho / trabalhados
--   "% Participação" = trabalhados / trabalhados_total
--
-- Period filter uses stage_entered_at (matches existing simulator).
-- Grouping: sales_cycles.current_group_id; NULL → 'Sem grupo'.
--
-- Sanity check query example (run in SQL editor against your DB):
--
--   SELECT *
--   FROM public.rpc_simulator_group_conversion(
--     p_company_id := '<your company uuid>',
--     p_owner_id   := NULL,
--     p_date_start := '2024-01-01',
--     p_date_end   := '2024-02-01'
--   )
--   ORDER BY trabalhados DESC;
--
--   Expected: rows per group, pct_grupo = ganho/trabalhados, pct_participacao = trabalhados/SUM(trabalhados)
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_simulator_group_conversion(uuid, uuid, date, date);

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
  v_caller_id   uuid;
  v_is_admin    boolean;
  v_trabalhados_total bigint;
BEGIN
  -- ── Security check ─────────────────────────────────────────────────────────
  v_caller_id := auth.uid();
  v_is_admin  := public.is_admin();

  IF NOT v_is_admin THEN
    -- Seller can only query themselves
    IF p_owner_id IS NULL OR p_owner_id <> v_caller_id THEN
      RAISE EXCEPTION
        'Acesso negado: vendedor só pode consultar seus próprios dados.';
    END IF;
  END IF;

  -- ── Pre-compute trabalhados_total (for pct_participacao) ──────────────────
  SELECT COUNT(*)
    INTO v_trabalhados_total
    FROM public.sales_cycles sc
   WHERE sc.company_id = p_company_id
     AND sc.status     <> 'novo'
     AND (p_date_start IS NULL OR sc.stage_entered_at >= p_date_start)
     AND (p_date_end   IS NULL OR sc.stage_entered_at <  p_date_end)
     AND (p_owner_id   IS NULL OR sc.owner_user_id    =  p_owner_id);

  -- ── Main aggregation ───────────────────────────────────────────────────────
  RETURN QUERY
  WITH agg AS (
    SELECT
      sc.current_group_id                                         AS grp_id,
      COUNT(*) FILTER (WHERE sc.status = 'novo')                 AS cnt_novo,
      COUNT(*) FILTER (WHERE sc.status = 'contato')              AS cnt_contato,
      COUNT(*) FILTER (WHERE sc.status = 'respondeu')            AS cnt_respondeu,
      COUNT(*) FILTER (WHERE sc.status = 'negociacao')           AS cnt_negociacao,
      COUNT(*) FILTER (WHERE sc.status = 'ganho')                AS cnt_ganho,
      COUNT(*) FILTER (WHERE sc.status = 'perdido')              AS cnt_perdido,
      COUNT(*) FILTER (WHERE sc.status <> 'novo')                AS cnt_trabalhados
    FROM public.sales_cycles sc
   WHERE sc.company_id = p_company_id
     AND (p_date_start IS NULL OR sc.stage_entered_at >= p_date_start)
     AND (p_date_end   IS NULL OR sc.stage_entered_at <  p_date_end)
     AND (p_owner_id   IS NULL OR sc.owner_user_id    =  p_owner_id)
   GROUP BY sc.current_group_id
  )
  SELECT
    agg.grp_id                                                          AS group_id,
    COALESCE(lg.name, 'Sem grupo')                                      AS group_name,
    agg.cnt_novo::int                                                   AS novo,
    agg.cnt_contato::int                                                AS contato,
    agg.cnt_respondeu::int                                              AS respondeu,
    agg.cnt_negociacao::int                                             AS negociacao,
    agg.cnt_ganho::int                                                  AS ganho,
    agg.cnt_perdido::int                                                AS perdido,
    agg.cnt_trabalhados::int                                            AS trabalhados,
    CASE
      WHEN agg.cnt_trabalhados = 0 THEN 0::numeric
      ELSE ROUND(agg.cnt_ganho::numeric / agg.cnt_trabalhados::numeric, 6)
    END                                                                 AS pct_grupo,
    CASE
      WHEN v_trabalhados_total = 0 THEN 0::numeric
      ELSE ROUND(agg.cnt_trabalhados::numeric / v_trabalhados_total::numeric, 6)
    END                                                                 AS pct_participacao
  FROM agg
  LEFT JOIN public.lead_groups lg
         ON lg.id = agg.grp_id
        AND lg.company_id = p_company_id
  ORDER BY agg.cnt_trabalhados DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_simulator_group_conversion(uuid, uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_simulator_group_conversion(uuid, uuid, date, date) TO authenticated;

-- Index to speed up the aggregation query
CREATE INDEX IF NOT EXISTS idx_sales_cycles_group_stage_entered
  ON public.sales_cycles(company_id, current_group_id, stage_entered_at);
