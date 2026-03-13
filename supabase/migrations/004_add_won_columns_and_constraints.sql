-- ============================================================
-- Migration 004: Complete Sales Cycle Won Columns
-- Adds won_* tracking columns, constraints, triggers,
-- RPC function, and analytics views to sales_cycles table.
-- ============================================================

-- ============================================================
-- A) NEW COLUMNS (won_* fields)
-- ============================================================

ALTER TABLE public.sales_cycles
  ADD COLUMN IF NOT EXISTS won_owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS won_at            timestamptz,
  ADD COLUMN IF NOT EXISTS won_total         numeric,
  ADD COLUMN IF NOT EXISTS won_items         integer,
  ADD COLUMN IF NOT EXISTS won_note          text;

-- ============================================================
-- B) CONSTRAINTS & VALIDATION
-- ============================================================

-- won_total must be positive (NULL is allowed)
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS chk_won_total_positive;
ALTER TABLE public.sales_cycles
  ADD CONSTRAINT chk_won_total_positive
    CHECK (won_total IS NULL OR won_total > 0);

-- won_items must be positive (NULL is allowed)
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS chk_won_items_positive;
ALTER TABLE public.sales_cycles
  ADD CONSTRAINT chk_won_items_positive
    CHECK (won_items IS NULL OR won_items > 0);

-- Consistency: status='ganho' requires won_owner_user_id + won_at;
--              any other status must have those fields NULL.
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS chk_won_columns_consistency;
ALTER TABLE public.sales_cycles
  ADD CONSTRAINT chk_won_columns_consistency CHECK (
    (status = 'ganho' AND won_owner_user_id IS NOT NULL AND won_at IS NOT NULL)
    OR
    (status <> 'ganho' AND won_owner_user_id IS NULL AND won_at IS NULL)
  );

-- Foreign key to auth.users for won_owner_user_id
ALTER TABLE public.sales_cycles
  DROP CONSTRAINT IF EXISTS fk_won_owner_user_id;
ALTER TABLE public.sales_cycles
  ADD CONSTRAINT fk_won_owner_user_id
    FOREIGN KEY (won_owner_user_id) REFERENCES auth.users(id);

-- ============================================================
-- C) INDEXES
-- ============================================================

-- Analytics: revenue queries filtered by won status
CREATE INDEX IF NOT EXISTS idx_sales_cycles_won_at
  ON public.sales_cycles (company_id, won_at DESC)
  WHERE status = 'ganho';

-- Analytics: revenue queries grouped by seller
CREATE INDEX IF NOT EXISTS idx_sales_cycles_won_owner
  ON public.sales_cycles (company_id, won_owner_user_id)
  WHERE status = 'ganho';

-- Business rule: only one active cycle per lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_cycles_lead_active_unique
  ON public.sales_cycles (lead_id)
  WHERE status NOT IN ('ganho', 'perdido');

-- ============================================================
-- D) TRIGGER FUNCTIONS
-- ============================================================

-- 1. Freeze won_owner_user_id and won_at when status → 'ganho'
CREATE OR REPLACE FUNCTION public.handle_won_columns_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'ganho' AND (OLD.status IS DISTINCT FROM 'ganho') THEN
    NEW.won_owner_user_id := NEW.owner_user_id;
    NEW.won_at            := transaction_timestamp();
    NEW.closed_at         := transaction_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_won_columns_freeze ON public.sales_cycles;
CREATE TRIGGER trg_won_columns_freeze
  BEFORE UPDATE ON public.sales_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_won_columns_freeze();

-- 2. Reset all won_* fields when status leaves 'ganho'
CREATE OR REPLACE FUNCTION public.handle_won_columns_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status = 'ganho' AND NEW.status <> 'ganho' THEN
    NEW.won_owner_user_id := NULL;
    NEW.won_at            := NULL;
    NEW.won_total         := NULL;
    NEW.won_items         := NULL;
    NEW.won_note          := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_won_columns_reset ON public.sales_cycles;
CREATE TRIGGER trg_won_columns_reset
  BEFORE UPDATE ON public.sales_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_won_columns_reset();

-- ============================================================
-- E) RPC FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_register_cycle_won(
  p_cycle_id  uuid,
  p_won_total numeric,
  p_won_items integer,
  p_won_note  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id  uuid;
  v_cycle    public.sales_cycles%ROWTYPE;
BEGIN
  -- Require authenticated caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Validate inputs
  IF p_won_total IS NULL OR p_won_total <= 0 THEN
    RETURN jsonb_build_object('error', 'won_total must be a positive number');
  END IF;

  IF p_won_items IS NULL OR p_won_items <= 0 THEN
    RETURN jsonb_build_object('error', 'won_items must be a positive integer');
  END IF;

  -- Fetch cycle and confirm it is in 'ganho' status
  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Cycle not found');
  END IF;

  IF v_cycle.status <> 'ganho' THEN
    RETURN jsonb_build_object('error', 'Cycle is not in ganho status');
  END IF;

  -- Populate won details
  UPDATE public.sales_cycles
  SET
    won_total  = p_won_total,
    won_items  = p_won_items,
    won_note   = p_won_note,
    updated_at = now()
  WHERE id = p_cycle_id;

  -- Log to cycle_events (best-effort: skip if table does not exist yet)
  BEGIN
    INSERT INTO public.cycle_events (
      cycle_id,
      user_id,
      event_type,
      payload,
      created_at
    ) VALUES (
      p_cycle_id,
      v_user_id,
      'won_registered',
      jsonb_build_object(
        'won_total', p_won_total,
        'won_items', p_won_items,
        'won_note',  p_won_note
      ),
      now()
    );
  EXCEPTION WHEN undefined_table THEN
    NULL; -- cycle_events table not yet created; skip logging
  END;

  RETURN jsonb_build_object('success', true, 'cycle_id', p_cycle_id);
END;
$$;

-- ============================================================
-- F) ANALYTICS VIEWS
-- ============================================================

-- 1. Daily revenue by seller
CREATE OR REPLACE VIEW public.vw_revenue_by_seller_day AS
SELECT
  sc.company_id,
  sc.won_owner_user_id                          AS seller_user_id,
  date_trunc('day', sc.won_at)::date            AS revenue_day,
  SUM(sc.won_total)                             AS total_revenue,
  SUM(sc.won_items)                             AS total_items,
  COUNT(*)                                      AS total_deals
FROM public.sales_cycles sc
WHERE sc.status = 'ganho'
  AND sc.won_at IS NOT NULL
GROUP BY
  sc.company_id,
  sc.won_owner_user_id,
  date_trunc('day', sc.won_at)::date;

-- 2. Cumulative revenue by seller (all time)
CREATE OR REPLACE VIEW public.vw_revenue_by_seller_total AS
SELECT
  sc.company_id,
  sc.won_owner_user_id                          AS seller_user_id,
  SUM(sc.won_total)                             AS total_revenue,
  SUM(sc.won_items)                             AS total_items,
  COUNT(*)                                      AS total_deals,
  MIN(sc.won_at)                                AS first_win_at,
  MAX(sc.won_at)                                AS last_win_at
FROM public.sales_cycles sc
WHERE sc.status = 'ganho'
  AND sc.won_at IS NOT NULL
GROUP BY
  sc.company_id,
  sc.won_owner_user_id;

-- ============================================================
-- DATA FIX: Assign won_owner_user_id for orphaned cycle
-- (cycle 53b32a2b-a80a-4c07-886f-ee4c1009f7d8 had no owner)
-- ============================================================

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Find the earliest-created user as fallback owner for the orphaned cycle
  SELECT id INTO v_admin_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    UPDATE public.sales_cycles
    SET
      won_owner_user_id = v_admin_id,
      won_at            = COALESCE(won_at, closed_at, CURRENT_TIMESTAMP),
      updated_at        = now()
    WHERE id = '53b32a2b-a80a-4c07-886f-ee4c1009f7d8'
      AND status = 'ganho'
      AND won_owner_user_id IS NULL;
  END IF;
END;
$$;
