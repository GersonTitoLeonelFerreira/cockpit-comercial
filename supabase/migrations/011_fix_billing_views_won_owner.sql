-- =============================================================================
-- Migration 011 - Fix billing views to use won_owner_user_id (CASCADE)
-- =============================================================================
-- Problem: vw_sales_cycles_with_revenue JOINs profiles and v_revenue_daily_seller
-- using owner_user_id, which can change after admin reassigns a cycle.
-- The correct field for "who closed the sale" is won_owner_user_id.
--
-- Fix: DROP CASCADE the root view (takes 4 dependents with it), then recreate
-- all 5 views. The root view now uses COALESCE(won_owner_user_id, owner_user_id)
-- in its JOINs and exposes a seller_id column.
--
-- The 4 child views are recreated exactly as they were (they JOIN by sc.id,
-- so they automatically pick up the corrected seller attribution).
--
-- Idempotent: safe to run multiple times.
-- =============================================================================

-- =========================================================
-- STEP 1: DROP the root view CASCADE (kills all 4 children)
-- =========================================================
DROP VIEW IF EXISTS public.vw_sales_cycles_with_revenue CASCADE;

-- =========================================================
-- STEP 2: Recreate vw_sales_cycles_with_revenue (FIXED)
-- =========================================================
CREATE VIEW public.vw_sales_cycles_with_revenue AS
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
  p.email                     AS owner_email,
  p.full_name                 AS owner_name,
  sc.revenue_seller_ref_date,
  COALESCE(
    CASE
      WHEN sc.won_value_source::text = 'revenue'::text
       AND rdp.real_value IS NOT NULL
      THEN rdp.real_value
      ELSE sc.won_total
    END,
    sc.won_total
  )                           AS final_won_value,
  rdp.real_value              AS revenue_real_value,
  rdp.cockpit_value           AS revenue_cockpit_value,
  sc.won_owner_user_id,
  sc.lost_at,
  sc.lost_reason,
  sc.canceled_at,
  sc.paused_at,
  sc.next_action_date,
  sc.updated_at,
  -- NEW: frozen seller id for billing/BI
  COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id
FROM public.sales_cycles sc
  LEFT JOIN public.profiles p
    ON COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p.id
  LEFT JOIN public.v_revenue_daily_seller rdp
    ON COALESCE(sc.won_owner_user_id, sc.owner_user_id) = rdp.seller_id
   AND sc.revenue_seller_ref_date::date = rdp.ref_date
   AND sc.company_id = rdp.company_id;

-- =========================================================
-- STEP 3: Recreate vw_sales_funnel (unchanged logic)
-- =========================================================
CREATE VIEW public.vw_sales_funnel AS
SELECT
  sc.status,
  count(*)                                           AS total_deals,
  count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)  AS deals_ganhos,
  count(CASE WHEN sc.lost_at IS NOT NULL THEN 1 END) AS deals_perdidos,
  round(
    100.0 * count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    2
  )                                                   AS taxa_conversao_pct,
  round(
    COALESCE(
      CASE
        WHEN count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END) > 0
        THEN sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END)
           / count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
        ELSE 0::numeric
      END,
      0::numeric
    ),
    2
  )                                                   AS valor_medio_ganho,
  COALESCE(
    sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END),
    0::numeric
  )                                                   AS receita_total
FROM public.sales_cycles sc
  LEFT JOIN public.vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
WHERE sc.company_id IS NOT NULL
GROUP BY sc.status
ORDER BY
  CASE sc.status
    WHEN 'novo'::lead_status       THEN 1
    WHEN 'contato'::lead_status    THEN 2
    WHEN 'respondeu'::lead_status  THEN 3
    WHEN 'negociacao'::lead_status THEN 4
    WHEN 'ganho'::lead_status      THEN 5
    WHEN 'perdido'::lead_status    THEN 6
    ELSE 7
  END;

-- =========================================================
-- STEP 4: Recreate vw_sales_performance_by_owner (unchanged)
-- =========================================================
CREATE VIEW public.vw_sales_performance_by_owner AS
SELECT
  p.email                                             AS owner_email,
  p.full_name                                         AS owner_name,
  count(*)                                            AS total_deals,
  count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)   AS deals_ganhos,
  count(CASE WHEN sc.lost_at IS NOT NULL THEN 1 END)  AS deals_perdidos,
  round(
    100.0 * count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    2
  )                                                    AS taxa_conversao_pct,
  COALESCE(
    sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END),
    0::numeric
  )                                                    AS valor_total_ganho,
  round(
    COALESCE(
      CASE
        WHEN count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END) > 0
        THEN sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END)
           / count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
        ELSE 0::numeric
      END,
      0::numeric
    ),
    2
  )                                                    AS ticket_medio,
  round(
    avg(EXTRACT(day FROM COALESCE(sc.won_at, now()) - sc.created_at)),
    1
  )                                                    AS dias_medio_ciclo
FROM public.sales_cycles sc
  LEFT JOIN public.profiles p ON sc.owner_user_id = p.id
  LEFT JOIN public.vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
WHERE sc.company_id IS NOT NULL
  AND sc.owner_user_id IS NOT NULL
GROUP BY p.id, p.email, p.full_name
ORDER BY
  round(
    100.0 * count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    2
  ) DESC;

-- =========================================================
-- STEP 5: Recreate vw_sales_monthly_analysis (unchanged)
-- =========================================================
CREATE VIEW public.vw_sales_monthly_analysis AS
SELECT
  date_trunc('month'::text, COALESCE(sc.won_at, sc.created_at))::date AS mes,
  count(*)                                            AS total_deals_criados,
  count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)   AS deals_ganhos,
  count(CASE WHEN sc.lost_at IS NOT NULL THEN 1 END)  AS deals_perdidos,
  round(
    100.0 * count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    2
  )                                                    AS taxa_conversao_pct,
  COALESCE(
    sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END),
    0::numeric
  )                                                    AS receita_total,
  round(
    COALESCE(
      CASE
        WHEN count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END) > 0
        THEN sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END)
           / count(CASE WHEN sc.won_at IS NOT NULL THEN 1 END)::numeric
        ELSE 0::numeric
      END,
      0::numeric
    ),
    2
  )                                                    AS receita_media_por_deal
FROM public.sales_cycles sc
  LEFT JOIN public.vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
WHERE sc.company_id IS NOT NULL
GROUP BY date_trunc('month'::text, COALESCE(sc.won_at, sc.created_at))
ORDER BY date_trunc('month'::text, COALESCE(sc.won_at, sc.created_at))::date DESC;

-- =========================================================
-- STEP 6: Recreate vw_sales_lost_analysis (unchanged)
-- =========================================================
CREATE VIEW public.vw_sales_lost_analysis AS
SELECT
  sc.lost_reason                                       AS motivo,
  count(*)                                             AS total_deals_perdidos,
  round(
    100.0 * count(*)::numeric
    / NULLIF(
        (SELECT count(*) FROM public.sales_cycles WHERE lost_at IS NOT NULL),
        0
      )::numeric,
    2
  )                                                    AS percentual,
  COALESCE(
    sum(CASE WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value ELSE 0::numeric END),
    0::numeric
  )                                                    AS valor_estimado
FROM public.sales_cycles sc
  LEFT JOIN public.vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
WHERE sc.lost_at IS NOT NULL
  AND sc.company_id IS NOT NULL
  AND sc.lost_reason IS NOT NULL
GROUP BY sc.lost_reason
ORDER BY count(*) DESC;
