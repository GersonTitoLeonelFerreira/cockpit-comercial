-- =============================================================================
-- Migration 011 - Fix billing views to use won_owner_user_id
-- =============================================================================
-- Problem: views that calculate revenue by seller were using owner_user_id,
-- which can change after an admin reassigns a cycle. The correct field to
-- identify who closed a sale is won_owner_user_id, which is frozen at the
-- time the deal is marked as won.
--
-- Fix: all three revenue views now use COALESCE(won_owner_user_id, owner_user_id)
-- as seller_id so that:
--   - won_owner_user_id takes precedence (frozen at closing time)
--   - owner_user_id is used as fallback for older records that were backfilled
--
-- Idempotent: CREATE OR REPLACE VIEW runs safely on every deploy.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. vw_sales_cycles_with_revenue
--    Base view for all won deals with seller attribution frozen at closing time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_sales_cycles_with_revenue
WITH (security_invoker = true)
AS
SELECT
  sc.id,
  sc.company_id,
  sc.lead_id,
  sc.owner_user_id,
  sc.won_owner_user_id,
  COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id,
  sc.current_group_id,
  sc.status,
  sc.won_at,
  sc.won_total,
  sc.won_note,
  sc.won_value_source,
  sc.revenue_seller_ref_date,
  COALESCE(sc.revenue_seller_ref_date::date, sc.won_at::date) AS revenue_ref_date,
  sc.stage_entered_at,
  sc.created_at,
  sc.updated_at,
  l.name  AS lead_name,
  l.phone AS lead_phone,
  l.email AS lead_email
FROM public.sales_cycles sc
JOIN public.leads l ON l.id = sc.lead_id
WHERE sc.status = 'ganho';

-- ---------------------------------------------------------------------------
-- 2. vw_revenue_by_seller_day
--    Daily revenue aggregated by seller, using revenue_seller_ref_date when
--    set (cockpit override date) and falling back to won_at date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_revenue_by_seller_day
WITH (security_invoker = true)
AS
SELECT
  sc.company_id,
  COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id,
  COALESCE(sc.revenue_seller_ref_date::date, sc.won_at::date) AS ref_date,
  SUM(sc.won_total)  AS total_value,
  COUNT(sc.id)       AS deal_count
FROM public.sales_cycles sc
WHERE sc.status = 'ganho'
  AND COALESCE(sc.won_owner_user_id, sc.owner_user_id) IS NOT NULL
GROUP BY
  sc.company_id,
  COALESCE(sc.won_owner_user_id, sc.owner_user_id),
  COALESCE(sc.revenue_seller_ref_date::date, sc.won_at::date);

-- ---------------------------------------------------------------------------
-- 3. vw_revenue_by_seller_total
--    Total revenue aggregated by seller across all time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_revenue_by_seller_total
WITH (security_invoker = true)
AS
SELECT
  sc.company_id,
  COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id,
  COUNT(sc.id)       AS total_deals,
  SUM(sc.won_total)  AS total_value,
  AVG(sc.won_total)  AS avg_deal_value,
  MIN(sc.won_at)     AS first_won_at,
  MAX(sc.won_at)     AS last_won_at
FROM public.sales_cycles sc
WHERE sc.status = 'ganho'
  AND COALESCE(sc.won_owner_user_id, sc.owner_user_id) IS NOT NULL
GROUP BY
  sc.company_id,
  COALESCE(sc.won_owner_user_id, sc.owner_user_id);
