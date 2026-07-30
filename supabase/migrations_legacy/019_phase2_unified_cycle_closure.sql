-- =============================================================================
-- Migration 019 — Fase 2: Fechamento unificado de sales_cycles
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_close_cycle_won — versão unificada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_close_cycle_won(uuid, numeric);

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_won(
  p_cycle_id uuid,
  p_won_value numeric DEFAULT NULL,
  p_revenue_date_ref date DEFAULT NULL,
  p_won_note text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_won_unit_price numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_entry_amount numeric DEFAULT NULL,
  p_installments_count integer DEFAULT NULL,
  p_installment_amount numeric DEFAULT NULL,
  p_payment_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_won_owner_user_id uuid;
  v_won_note text;
  v_payment_notes text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  v_won_owner_user_id := COALESCE(v_cycle.owner_user_id, auth.uid());
  v_won_note := NULLIF(TRIM(p_won_note), '');
  v_payment_notes := NULLIF(TRIM(p_payment_notes), '');

  UPDATE public.sales_cycles
  SET
    status = 'ganho',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    won_at = v_now,
    closed_at = v_now,
    won_total = COALESCE(p_won_value, v_cycle.won_total, 0),
    won_owner_user_id = v_won_owner_user_id,
    revenue_seller_ref_date = p_revenue_date_ref,
    won_value_source = CASE
      WHEN p_revenue_date_ref IS NOT NULL THEN 'revenue'
      ELSE 'manual'
    END,
    won_note = v_won_note,
    product_id = p_product_id,
    won_unit_price = p_won_unit_price,
    payment_method = p_payment_method,
    payment_type = p_payment_type,
    entry_amount = p_entry_amount,
    installments_count = p_installments_count,
    installment_amount = p_installment_amount,
    payment_notes = v_payment_notes,
    next_action = NULL,
    next_action_date = NULL,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'closed_won',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'ganho',
      'won_total', COALESCE(p_won_value, v_cycle.won_total, 0),
      'won_owner_user_id', v_won_owner_user_id,
      'revenue_seller_ref_date', p_revenue_date_ref,
      'won_note', v_won_note,
      'product_id', p_product_id,
      'won_unit_price', p_won_unit_price,
      'payment_method', p_payment_method,
      'payment_type', p_payment_type,
      'entry_amount', p_entry_amount,
      'installments_count', p_installments_count,
      'installment_amount', p_installment_amount,
      'payment_notes', v_payment_notes
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'ganho',
    'previous_status', v_cycle.status,
    'won_at', v_now,
    'closed_at', v_now,
    'won_total', COALESCE(p_won_value, v_cycle.won_total, 0),
    'won_owner_user_id', v_won_owner_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_close_cycle_won(
  uuid,
  numeric,
  date,
  text,
  uuid,
  numeric,
  text,
  text,
  numeric,
  integer,
  numeric,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_close_cycle_won(
  uuid,
  numeric,
  date,
  text,
  uuid,
  numeric,
  text,
  text,
  numeric,
  integer,
  numeric,
  text
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) rpc_close_cycle_lost — versão unificada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_close_cycle_lost(uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_lost(
  p_cycle_id uuid,
  p_lost_reason text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_action_channel text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_reason text;
  v_note text;
  v_lost_owner_user_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  v_reason := COALESCE(NULLIF(TRIM(p_lost_reason), ''), 'Não informado');
  v_note := NULLIF(TRIM(p_note), '');
  v_lost_owner_user_id := COALESCE(v_cycle.owner_user_id, auth.uid());

  UPDATE public.sales_cycles
  SET
    status = 'perdido',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    lost_at = v_now,
    closed_at = v_now,
    lost_reason = v_reason,
    lost_owner_user_id = v_lost_owner_user_id,
    next_action = NULL,
    next_action_date = NULL,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'closed_lost',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'perdido',
      'lost_reason', v_reason,
      'lost_owner_user_id', v_lost_owner_user_id,
      'note', v_note,
      'action_channel', p_action_channel
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'perdido',
    'previous_status', v_cycle.status,
    'lost_at', v_now,
    'closed_at', v_now,
    'lost_reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_close_cycle_lost(
  uuid,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_close_cycle_lost(
  uuid,
  text,
  text,
  text
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) rpc_move_cycle_stage_checkpoint — bloquear fechamento terminal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_checkpoint(
  p_cycle_id uuid,
  p_to_status text,
  p_checkpoint jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_next_action text;
  v_next_action_date timestamptz;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  IF p_to_status IN ('ganho', 'perdido') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won/rpc_close_cycle_lost para fechamento terminal'
    );
  END IF;

  v_next_action := p_checkpoint->>'next_action';
  v_next_action_date := (p_checkpoint->>'next_action_date')::timestamptz;

  UPDATE public.sales_cycles
  SET
    previous_status = status,
    status = p_to_status::lead_status,
    stage_entered_at = v_now,
    next_action = COALESCE(v_next_action, next_action),
    next_action_date = COALESCE(v_next_action_date, next_action_date),
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'checkpoint', p_checkpoint
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) TO authenticated;