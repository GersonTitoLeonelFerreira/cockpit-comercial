-- =============================================================================
-- Migration 027 — Simulator close rate real
-- =============================================================================
-- Cria a RPC usada pelo Simulador de Meta para calcular taxa real de fechamento.
--
-- Contrato esperado pelo frontend:
-- public.rpc_get_close_rate_real(p_owner_user_id uuid, p_days_window integer)
--
-- Retorno:
-- {
--   success: boolean,
--   days_window: number,
--   vendor: {
--     owner_user_id: string | null,
--     wins: number,
--     worked: number,
--     close_rate: number | null
--   },
--   company: {
--     owner_user_id: null,
--     wins: number,
--     worked: number,
--     close_rate: number | null
--   }
-- }
--
-- Regra:
-- - Admin pode consultar empresa e vendedor selecionado.
-- - Usuário não-admin sempre consulta a própria taxa como vendor.
-- - A taxa usa coorte de ciclos trabalhados no período:
--   worked = ciclos com COALESCE(first_worked_at, stage_entered_at, created_at) dentro da janela
--   wins   = desses ciclos, quantos estão com status='ganho'
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_get_close_rate_real(uuid, integer);

CREATE OR REPLACE FUNCTION public.rpc_get_close_rate_real(
  p_owner_user_id uuid DEFAULT NULL,
  p_days_window integer DEFAULT 90
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
  v_vendor_id uuid;
  v_days_window integer;
  v_start timestamptz;
  v_end timestamptz;

  v_company_worked integer := 0;
  v_company_wins integer := 0;
  v_vendor_worked integer := 0;
  v_vendor_wins integer := 0;
BEGIN
  v_company_id := public.current_company_id();
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'days_window', COALESCE(p_days_window, 90),
      'vendor', jsonb_build_object(
        'owner_user_id', NULL,
        'wins', 0,
        'worked', 0,
        'close_rate', NULL
      ),
      'company', jsonb_build_object(
        'owner_user_id', NULL,
        'wins', 0,
        'worked', 0,
        'close_rate', NULL
      ),
      'error_message', 'company_not_found'
    );
  END IF;

  v_days_window := GREATEST(COALESCE(p_days_window, 90), 1);
  v_start := now() - make_interval(days => v_days_window);
  v_end := now();

  IF v_is_admin THEN
    v_vendor_id := p_owner_user_id;
  ELSE
    v_vendor_id := v_user_id;
  END IF;

  WITH company_base AS (
    SELECT
      sc.id,
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) >= v_start
      AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) <= v_end
      AND sc.status <> 'novo'
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'ganho')::integer
  INTO
    v_company_worked,
    v_company_wins
  FROM company_base;

  IF v_vendor_id IS NOT NULL THEN
    WITH vendor_base AS (
      SELECT
        sc.id,
        sc.status
      FROM public.sales_cycles sc
      WHERE sc.company_id = v_company_id
        AND COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_vendor_id
        AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) >= v_start
        AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) <= v_end
        AND sc.status <> 'novo'
    )
    SELECT
      COUNT(*)::integer,
      COUNT(*) FILTER (WHERE status = 'ganho')::integer
    INTO
      v_vendor_worked,
      v_vendor_wins
    FROM vendor_base;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'days_window', v_days_window,
    'vendor', jsonb_build_object(
      'owner_user_id', v_vendor_id,
      'wins', COALESCE(v_vendor_wins, 0),
      'worked', COALESCE(v_vendor_worked, 0),
      'close_rate',
        CASE
          WHEN COALESCE(v_vendor_worked, 0) > 0
            THEN ROUND((v_vendor_wins::numeric / v_vendor_worked::numeric), 4)
          ELSE NULL
        END
    ),
    'company', jsonb_build_object(
      'owner_user_id', NULL,
      'wins', COALESCE(v_company_wins, 0),
      'worked', COALESCE(v_company_worked, 0),
      'close_rate',
        CASE
          WHEN COALESCE(v_company_worked, 0) > 0
            THEN ROUND((v_company_wins::numeric / v_company_worked::numeric), 4)
          ELSE NULL
        END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_close_rate_real(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_close_rate_real(uuid, integer) TO authenticated;