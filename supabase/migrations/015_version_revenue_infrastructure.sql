-- =============================================================================
-- Migration 015 — Version revenue infrastructure
-- =============================================================================
-- These tables, RPCs, views, indexes and RLS policies were created manually
-- via the Supabase SQL Editor and were never committed to a migration file.
-- This migration versions them so they are not lost on environment migration.
--
-- ALL definitions are copied verbatim from the production database.
-- This migration is idempotent: safe to run on a fresh DB or on production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE: revenue_extra_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revenue_extra_sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id),
  name        text        NOT NULL,
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE public.revenue_extra_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_extra_sources' AND policyname = 'SELECT revenue_extra_sources') THEN
    CREATE POLICY "SELECT revenue_extra_sources" ON public.revenue_extra_sources FOR SELECT USING (company_id = current_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_extra_sources' AND policyname = 'INSERT revenue_extra_sources') THEN
    CREATE POLICY "INSERT revenue_extra_sources" ON public.revenue_extra_sources FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_extra_sources' AND policyname = 'UPDATE revenue_extra_sources') THEN
    CREATE POLICY "UPDATE revenue_extra_sources" ON public.revenue_extra_sources FOR UPDATE USING (company_id = current_company_id() AND is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_extra_sources' AND policyname = 'DELETE revenue_extra_sources') THEN
    CREATE POLICY "DELETE revenue_extra_sources" ON public.revenue_extra_sources FOR DELETE USING (company_id = current_company_id() AND is_admin());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_revenue_extra_sources_company_id ON public.revenue_extra_sources USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_revenue_extra_sources_archived_at ON public.revenue_extra_sources USING btree (archived_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_extra_sources_unique_active_name ON public.revenue_extra_sources USING btree (company_id, name) WHERE (archived_at IS NULL);

-- ---------------------------------------------------------------------------
-- 2. TABLE: revenue_overrides_daily
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revenue_overrides_daily (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id),
  source_kind text        NOT NULL,
  source_id   uuid        NOT NULL,
  ref_date    date        NOT NULL,
  real_value  numeric     NOT NULL DEFAULT 0,
  reason      text        NOT NULL,
  notes       text,
  edited_by   uuid        NOT NULL REFERENCES auth.users(id),
  edited_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_overrides_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_overrides_daily' AND policyname = 'SELECT revenue_overrides_daily') THEN
    CREATE POLICY "SELECT revenue_overrides_daily" ON public.revenue_overrides_daily FOR SELECT USING (company_id = current_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_overrides_daily' AND policyname = 'INSERT revenue_overrides_daily') THEN
    CREATE POLICY "INSERT revenue_overrides_daily" ON public.revenue_overrides_daily FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_overrides_daily' AND policyname = 'UPDATE revenue_overrides_daily') THEN
    CREATE POLICY "UPDATE revenue_overrides_daily" ON public.revenue_overrides_daily FOR UPDATE USING (company_id = current_company_id() AND is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_overrides_daily' AND policyname = 'DELETE revenue_overrides_daily') THEN
    CREATE POLICY "DELETE revenue_overrides_daily" ON public.revenue_overrides_daily FOR DELETE USING (company_id = current_company_id() AND is_admin());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_revenue_overrides_daily_company_id ON public.revenue_overrides_daily USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_revenue_overrides_daily_ref_date ON public.revenue_overrides_daily USING btree (ref_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_overrides_daily_unique ON public.revenue_overrides_daily USING btree (company_id, source_kind, source_id, ref_date);

-- ---------------------------------------------------------------------------
-- 3. TABLE: revenue_goals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revenue_goals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL,
  owner_id    uuid,
  date_start  date        NOT NULL,
  date_end    date        NOT NULL,
  goal_value  numeric     NOT NULL DEFAULT 0,
  created_by  uuid        NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_goals' AND policyname = 'revenue_goals_select') THEN
    CREATE POLICY "revenue_goals_select" ON public.revenue_goals FOR SELECT USING (company_id = current_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_goals' AND policyname = 'revenue_goals_insert') THEN
    CREATE POLICY "revenue_goals_insert" ON public.revenue_goals FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_goals' AND policyname = 'revenue_goals_update') THEN
    CREATE POLICY "revenue_goals_update" ON public.revenue_goals FOR UPDATE USING (company_id = current_company_id() AND is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'revenue_goals' AND policyname = 'revenue_goals_delete') THEN
    CREATE POLICY "revenue_goals_delete" ON public.revenue_goals FOR DELETE USING (company_id = current_company_id() AND is_admin());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS revenue_goals_company_period ON public.revenue_goals USING btree (company_id, date_start, date_end);
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_goals_with_null_owner ON public.revenue_goals USING btree (company_id, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), date_start, date_end);

-- ---------------------------------------------------------------------------
-- 4. VIEW: v_revenue_daily_seller (CORRECTED — no CURRENT_DATE, uses won_owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_revenue_daily_seller
WITH (security_invoker = true)
AS
WITH cockpit_values AS (
    SELECT
        sc.company_id,
        COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id,
        COALESCE(
            sc.revenue_seller_ref_date::date,
            (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date
        ) AS ref_date,
        SUM(COALESCE(sc.won_total, 0::numeric)) AS cockpit_value
    FROM sales_cycles sc
    WHERE sc.status = 'ganho'
      AND COALESCE(sc.won_owner_user_id, sc.owner_user_id) IS NOT NULL
      AND sc.won_at IS NOT NULL
    GROUP BY
        sc.company_id,
        COALESCE(sc.won_owner_user_id, sc.owner_user_id),
        COALESCE(sc.revenue_seller_ref_date::date, (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date)
),
with_overrides AS (
    SELECT
        cv.company_id,
        cv.seller_id,
        cv.ref_date,
        cv.cockpit_value,
        COALESCE(rod.real_value, cv.cockpit_value) AS real_value
    FROM cockpit_values cv
    LEFT JOIN revenue_overrides_daily rod
        ON cv.company_id = rod.company_id
        AND rod.source_kind = 'seller'
        AND cv.seller_id = rod.source_id
        AND cv.ref_date = rod.ref_date
)
SELECT
    company_id,
    seller_id,
    ref_date,
    cockpit_value,
    real_value,
    (real_value - cockpit_value) AS adjustment_value
FROM with_overrides
ORDER BY company_id, seller_id, ref_date DESC;

-- ---------------------------------------------------------------------------
-- 5. VIEW: v_revenue_daily_extra (CORRECTED — no CURRENT_DATE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_revenue_daily_extra
WITH (security_invoker = true)
AS
WITH extra_overrides AS (
    SELECT
        rod.company_id,
        rod.source_id AS extra_id,
        rod.ref_date,
        0::numeric AS cockpit_value,
        COALESCE(rod.real_value, 0::numeric) AS real_value
    FROM revenue_overrides_daily rod
    WHERE rod.source_kind = 'extra'
)
SELECT
    company_id,
    extra_id,
    ref_date,
    cockpit_value,
    real_value,
    (real_value - cockpit_value) AS adjustment_value
FROM extra_overrides
ORDER BY company_id, extra_id, ref_date DESC;

-- ---------------------------------------------------------------------------
-- 6. VIEW: vw_sales_cycles_with_revenue (recreated to match current production)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_sales_cycles_with_revenue AS
SELECT
    sc.id,
    sc.lead_id,
    sc.company_id,
    sc.owner_user_id,
    sc.status,
    sc.won_total,
    sc.won_at,
    sc.created_at,
    sc.won_value_source,
    p.email AS owner_email,
    p.full_name AS owner_name,
    sc.revenue_seller_ref_date,
    COALESCE(
        CASE
            WHEN sc.won_value_source::text = 'revenue'::text
             AND rdp.real_value IS NOT NULL
            THEN rdp.real_value
            ELSE sc.won_total
        END,
        sc.won_total
    ) AS final_won_value,
    rdp.real_value AS revenue_real_value,
    rdp.cockpit_value AS revenue_cockpit_value,
    sc.won_owner_user_id,
    sc.lost_at,
    sc.lost_reason,
    sc.canceled_at,
    sc.paused_at,
    sc.next_action_date,
    sc.updated_at,
    COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id
FROM sales_cycles sc
LEFT JOIN profiles p
    ON COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p.id
LEFT JOIN v_revenue_daily_seller rdp
    ON COALESCE(sc.won_owner_user_id, sc.owner_user_id) = rdp.seller_id
   AND sc.revenue_seller_ref_date::date = rdp.ref_date
   AND sc.company_id = rdp.company_id;

-- ---------------------------------------------------------------------------
-- 7. RPC: rpc_admin_list_sellers_stats
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats(p_days integer DEFAULT 30)
RETURNS TABLE(
  seller_id uuid,
  full_name text,
  email text,
  role text,
  is_active boolean,
  active_cycles_count bigint,
  novo_count bigint,
  contato_count bigint,
  respondeu_count bigint,
  negociacao_count bigint,
  ganho_count_period bigint,
  perdido_count_period bigint,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_period_start timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  v_company_id  := public.current_company_id();
  v_period_start := now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id                                    AS seller_id,
    p.full_name,
    p.email,
    p.role,
    p.is_active,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status NOT IN ('ganho', 'perdido')
    )                                       AS active_cycles_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'novo'
    )                                       AS novo_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'contato'
    )                                       AS contato_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'respondeu'
    )                                       AS respondeu_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'negociacao'
    )                                       AS negociacao_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'ganho'
        AND sc.updated_at >= v_period_start
    )                                       AS ganho_count_period,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'perdido'
        AND sc.updated_at >= v_period_start
    )                                       AS perdido_count_period,
    MAX(sc.updated_at)                      AS last_activity_at
  FROM public.profiles p
  LEFT JOIN public.sales_cycles sc
    ON sc.owner_user_id = p.id
    AND sc.company_id = v_company_id
  WHERE
    p.company_id = v_company_id
    AND p.role IN ('admin', 'manager', 'member', 'seller', 'consultor')
  GROUP BY
    p.id, p.full_name, p.email, p.role, p.is_active
  ORDER BY
    p.full_name ASC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_admin_list_sellers_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_sellers_stats(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: rpc_create_revenue_extra_source
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_revenue_extra_source(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_new_id uuid;
BEGIN
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Nome nao pode estar vazio';
  END IF;

  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao associado a empresa';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem criar fontes de faturamento';
  END IF;

  INSERT INTO public.revenue_extra_sources (company_id, name, created_by)
  VALUES (v_company_id, TRIM(p_name), auth.uid())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_revenue_extra_source(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_revenue_extra_source(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. RPC: rpc_upsert_revenue_daily_override
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_daily_override(
  p_source_kind text,
  p_source_id uuid,
  p_ref_date date,
  p_real_value numeric,
  p_reason text,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_source_company_id uuid;
BEGIN
  IF p_source_kind NOT IN ('seller', 'extra') THEN
    RAISE EXCEPTION 'source_kind deve ser ''seller'' ou ''extra''';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo e obrigatorio';
  END IF;

  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao associado a empresa';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem editar faturamento';
  END IF;

  IF p_source_kind = 'seller' THEN
    SELECT company_id INTO v_source_company_id
    FROM public.profiles
    WHERE id = p_source_id;
  ELSIF p_source_kind = 'extra' THEN
    SELECT company_id INTO v_source_company_id
    FROM public.revenue_extra_sources
    WHERE id = p_source_id;
  END IF;

  IF v_source_company_id IS NULL OR v_source_company_id != v_company_id THEN
    RAISE EXCEPTION 'Source nao encontrado ou nao pertence a empresa';
  END IF;

  INSERT INTO public.revenue_overrides_daily (
    company_id, source_kind, source_id, ref_date, real_value, reason, notes, edited_by
  )
  VALUES (v_company_id, p_source_kind, p_source_id, p_ref_date, p_real_value, TRIM(p_reason), p_notes, auth.uid())
  ON CONFLICT (company_id, source_kind, source_id, ref_date)
  DO UPDATE SET
    real_value = p_real_value,
    reason = TRIM(p_reason),
    notes = p_notes,
    edited_by = auth.uid(),
    edited_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_revenue_daily_override(text, uuid, date, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_revenue_daily_override(text, uuid, date, numeric, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. RPC: rpc_revenue_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_revenue_summary(
  p_company_id uuid,
  p_owner_id uuid,
  p_start_date date,
  p_end_date date,
  p_metric text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_total numeric := 0;
  v_days json;
begin
  if p_metric not in ('faturamento', 'recebimento') then
    raise exception 'Invalid metric: %', p_metric;
  end if;

  if p_metric = 'recebimento' then
    raise exception 'Metric "recebimento" ainda nao implementada nas views (v_revenue_daily_*)';
  end if;

  with date_series as (
    select d::date as ref_date
    from generate_series(p_start_date, p_end_date, interval '1 day') as d
  ),
  seller_daily as (
    select ref_date, sum(real_value)::numeric as value
    from public.v_revenue_daily_seller
    where company_id = p_company_id
      and ref_date between p_start_date and p_end_date
      and (p_owner_id is null or seller_id = p_owner_id)
    group by ref_date
  ),
  extra_daily as (
    select ref_date, sum(real_value)::numeric as value
    from public.v_revenue_daily_extra
    where company_id = p_company_id
      and ref_date between p_start_date and p_end_date
      and p_owner_id is null
    group by ref_date
  ),
  daily as (
    select
      ds.ref_date,
      coalesce(sd.value, 0) + coalesce(ed.value, 0) as value
    from date_series ds
    left join seller_daily sd on sd.ref_date = ds.ref_date
    left join extra_daily ed on ed.ref_date = ds.ref_date
    order by ds.ref_date asc
  )
  select
    coalesce(sum(value), 0),
    json_agg(json_build_object('date', ref_date::text, 'value', value) order by ref_date asc)
  into v_total, v_days
  from daily;

  return json_build_object(
    'success', true,
    'total_real', v_total,
    'days', coalesce(v_days, '[]'::json)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_revenue_summary(uuid, uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_revenue_summary(uuid, uuid, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. RPC: rpc_get_revenue_goal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date
)
RETURNS json
LANGUAGE plpgsql
AS $function$
declare
  v_goal numeric;
begin
  select rg.goal_value
    into v_goal
  from public.revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is not distinct from p_owner_id
    and rg.date_start = p_date_start
    and rg.date_end = p_date_end
  limit 1;

  return json_build_object(
    'success', true,
    'goal_value', coalesce(v_goal, 0)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_revenue_goal(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_revenue_goal(uuid, uuid, date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. RPC: rpc_upsert_revenue_goal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date,
  p_goal_value numeric
)
RETURNS json
LANGUAGE plpgsql
AS $function$
declare
  v_existing_id uuid;
begin
  SELECT id INTO v_existing_id
  FROM public.revenue_goals
  WHERE company_id = p_company_id
    AND date_start = p_date_start
    AND date_end = p_date_end
    AND (
      (owner_id IS NULL AND p_owner_id IS NULL)
      OR (owner_id = p_owner_id)
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.revenue_goals
    SET goal_value = greatest(0, p_goal_value),
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.revenue_goals (company_id, owner_id, date_start, date_end, goal_value, created_by)
    VALUES (p_company_id, p_owner_id, p_date_start, p_date_end, greatest(0, p_goal_value), auth.uid());
  END IF;

  RETURN json_build_object('success', true);
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric) TO authenticated;

-- =============================================================================
-- END Migration 015
-- =============================================================================
