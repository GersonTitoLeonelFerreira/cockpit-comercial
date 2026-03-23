-- ==========================================================================
-- Backfill: first_worked_at
--
-- Populates sales_cycles.first_worked_at and leads.first_worked_at
-- from existing cycle_events data using the same classification logic
-- as fn_is_real_work_event (defined in migration 013).
--
-- HOW TO USE:
--   1. Run PASSO 1 first (read-only) to validate the data.
--   2. After validating the dry-run results, uncomment PASSO 2 and run it.
--   3. After the backfill, uncomment PASSO 3 to verify the results.
--
-- IMPORTANT:
--   - This backfill is IDEMPOTENT. It is safe to re-run at any time because
--     all UPDATEs are guarded by "WHERE first_worked_at IS NULL".
--   - Migration 013 already installed the trigger, so all NEW events are
--     handled automatically going forward. This script only covers existing
--     historical data.
--   - Do NOT run PASSO 2 before reviewing the output of PASSO 1.
-- ==========================================================================


-- ==========================================================================
-- PASSO 1 — DRY RUN (read-only, safe to run anytime)
-- ==========================================================================

-- 1a) Total qualifying work events (across all cycles)
SELECT COUNT(*) AS total_qualifying_work_events
FROM public.cycle_events ce
WHERE public.fn_is_real_work_event(ce.event_type, ce.metadata);


-- 1b) Distinct sales_cycles that would receive a first_worked_at value
-- (only cycles that currently have first_worked_at IS NULL)
WITH first_work AS (
  SELECT
    ce.cycle_id,
    ce.occurred_at,
    ROW_NUMBER() OVER (
      PARTITION BY ce.cycle_id
      ORDER BY ce.occurred_at ASC
    ) AS rn
  FROM public.cycle_events ce
  WHERE public.fn_is_real_work_event(ce.event_type, ce.metadata)
)
SELECT COUNT(DISTINCT fw.cycle_id) AS sales_cycles_to_backfill
FROM first_work fw
JOIN public.sales_cycles sc ON sc.id = fw.cycle_id
WHERE fw.rn = 1
  AND sc.first_worked_at IS NULL;


-- 1c) Distinct leads that would receive a first_worked_at value
-- (leads linked to cycles that would be backfilled, currently NULL)
WITH first_work AS (
  SELECT
    ce.cycle_id,
    ce.occurred_at,
    ROW_NUMBER() OVER (
      PARTITION BY ce.cycle_id
      ORDER BY ce.occurred_at ASC
    ) AS rn
  FROM public.cycle_events ce
  WHERE public.fn_is_real_work_event(ce.event_type, ce.metadata)
),
cycle_first AS (
  SELECT fw.cycle_id, fw.occurred_at
  FROM first_work fw
  JOIN public.sales_cycles sc ON sc.id = fw.cycle_id
  WHERE fw.rn = 1
    AND sc.first_worked_at IS NULL
)
SELECT COUNT(DISTINCT sc.lead_id) AS leads_to_backfill
FROM cycle_first cf
JOIN public.sales_cycles sc ON sc.id = cf.cycle_id
JOIN public.leads l ON l.id = sc.lead_id
WHERE l.first_worked_at IS NULL;


-- 1d) Sample of 20 cycles that would be marked (visual validation)
WITH first_work AS (
  SELECT
    ce.cycle_id,
    ce.event_type,
    ce.occurred_at,
    ce.metadata->>'from_status'  AS from_status,
    ce.metadata->>'to_status'    AS to_status,
    ROW_NUMBER() OVER (
      PARTITION BY ce.cycle_id
      ORDER BY ce.occurred_at ASC
    ) AS rn
  FROM public.cycle_events ce
  WHERE public.fn_is_real_work_event(ce.event_type, ce.metadata)
)
SELECT
  fw.cycle_id,
  fw.event_type,
  fw.occurred_at,
  sc.status        AS current_status,
  sc.created_at    AS cycle_created_at,
  fw.from_status,
  fw.to_status
FROM first_work fw
JOIN public.sales_cycles sc ON sc.id = fw.cycle_id
WHERE fw.rn = 1
  AND sc.first_worked_at IS NULL
ORDER BY fw.occurred_at ASC
LIMIT 20;


-- ==========================================================================
-- PASSO 2 — BACKFILL REAL
-- Uncomment and run only after validating PASSO 1 results.
-- ==========================================================================

/*

-- 2a) Backfill sales_cycles.first_worked_at
--     Sets it to the occurred_at of the earliest qualifying work event.
WITH first_work AS (
  SELECT
    ce.cycle_id,
    ce.occurred_at,
    ROW_NUMBER() OVER (
      PARTITION BY ce.cycle_id
      ORDER BY ce.occurred_at ASC
    ) AS rn
  FROM public.cycle_events ce
  WHERE public.fn_is_real_work_event(ce.event_type, ce.metadata)
)
UPDATE public.sales_cycles sc
SET    first_worked_at = fw.occurred_at
FROM   first_work fw
WHERE  fw.cycle_id = sc.id
  AND  fw.rn       = 1
  AND  sc.first_worked_at IS NULL;


-- 2b) Backfill leads.first_worked_at
--     Sets it to the MIN of first_worked_at across all cycles for the lead.
UPDATE public.leads l
SET    first_worked_at = agg.min_first_worked_at
FROM (
  SELECT sc.lead_id, MIN(sc.first_worked_at) AS min_first_worked_at
  FROM   public.sales_cycles sc
  WHERE  sc.first_worked_at IS NOT NULL
  GROUP  BY sc.lead_id
) agg
WHERE l.id             = agg.lead_id
  AND l.first_worked_at IS NULL;

*/


-- ==========================================================================
-- PASSO 3 — VERIFICAÇÃO
-- Uncomment and run after PASSO 2 to confirm results.
-- ==========================================================================

/*

-- 3a) Sales cycles: filled vs unfilled with percentage
SELECT
  COUNT(*)                                                       AS total_cycles,
  COUNT(first_worked_at)                                         AS filled,
  COUNT(*) - COUNT(first_worked_at)                              AS unfilled,
  ROUND(
    COUNT(first_worked_at)::numeric / NULLIF(COUNT(*), 0) * 100,
    1
  )                                                              AS pct_filled
FROM public.sales_cycles;


-- 3b) Leads: filled vs unfilled with percentage
SELECT
  COUNT(*)                                                       AS total_leads,
  COUNT(first_worked_at)                                         AS filled,
  COUNT(*) - COUNT(first_worked_at)                              AS unfilled,
  ROUND(
    COUNT(first_worked_at)::numeric / NULLIF(COUNT(*), 0) * 100,
    1
  )                                                              AS pct_filled
FROM public.leads;


-- 3c) Sanity check: anomalies where first_worked_at < created_at - 1 minute
--     (should return 0 rows; any result indicates a data anomaly to investigate)
SELECT
  id,
  created_at,
  first_worked_at,
  created_at - first_worked_at AS gap
FROM public.sales_cycles
WHERE first_worked_at < created_at - INTERVAL '1 minute'
ORDER BY gap DESC
LIMIT 20;

*/
