-- =============================================================================
-- Migration 008 — Phase 8 Missing RPCs
-- Creates all RPCs called by SalesCyclesKanban.tsx that were missing from
-- previous migrations.
-- All statements are idempotent (DROP IF EXISTS / CREATE OR REPLACE).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. rpc_reassign_cycle_owner
--    Redistributes a single cycle from one seller to another.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_reassign_cycle_owner(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_reassign_cycle_owner(
  p_cycle_id       uuid,
  p_owner_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id = p_owner_user_id,
    updated_at    = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'reassigned',
    jsonb_build_object(
      'from_owner', v_cycle.owner_user_id,
      'to_owner',   p_owner_user_id
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. rpc_bulk_assign_cycles_owner
--    Assigns multiple cycles (e.g. from pool) to a single seller.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_assign_cycles_owner(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.rpc_bulk_assign_cycles_owner(
  p_cycle_ids      uuid[],
  p_owner_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle_id   uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    UPDATE public.sales_cycles
    SET
      owner_user_id = p_owner_user_id,
      updated_at    = now()
    WHERE id = v_cycle_id AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id, company_id, event_type, metadata, created_by, occurred_at
    ) VALUES (
      v_cycle_id,
      v_company_id,
      'assigned',
      jsonb_build_object('to_owner', p_owner_user_id),
      auth.uid(),
      now()
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. rpc_bulk_return_cycles_to_pool
--    Admin: returns multiple cycles to the pool (sets owner_user_id = NULL).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_return_cycles_to_pool(uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool(
  p_cycle_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle_id   uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      updated_at    = now()
    WHERE id = v_cycle_id AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id, company_id, event_type, metadata, created_by, occurred_at
    ) VALUES (
      v_cycle_id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object('by_admin', true),
      auth.uid(),
      now()
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. rpc_bulk_return_cycles_to_pool_self
--    Seller: returns their own cycles to the pool (only if owner = auth.uid()).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_return_cycles_to_pool_self(uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool_self(
  p_cycle_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_cycle_id   uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_user_id := auth.uid();

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      updated_at    = now()
    WHERE id           = v_cycle_id
      AND company_id   = v_company_id
      AND owner_user_id = v_user_id;

    IF FOUND THEN
      INSERT INTO public.cycle_events (
        cycle_id, company_id, event_type, metadata, created_by, occurred_at
      ) VALUES (
        v_cycle_id,
        v_company_id,
        'returned_to_pool',
        jsonb_build_object('by_self', true),
        v_user_id,
        now()
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. rpc_bulk_set_cycles_group
--    Sets the group for multiple cycles at once (admin only).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_set_cycles_group(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.rpc_bulk_set_cycles_group(
  p_cycle_ids uuid[],
  p_group_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  UPDATE public.sales_cycles
  SET
    current_group_id = p_group_id,
    updated_at       = now()
  WHERE id         = ANY(p_cycle_ids)
    AND company_id = v_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. rpc_bulk_assign_round_robin
--    Distributes cycles among owners in round-robin order.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_assign_round_robin(uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_assign_round_robin(
  p_cycle_ids  uuid[],
  p_owner_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id   uuid;
  v_total_owners integer;
  v_updated      integer := 0;
  i              integer;
  v_cycle_id     uuid;
  v_owner_id     uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_total_owners := array_length(p_owner_ids, 1);
  IF v_total_owners IS NULL OR v_total_owners = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_owners_provided');
  END IF;

  FOR i IN 1 .. array_length(p_cycle_ids, 1)
  LOOP
    v_cycle_id := p_cycle_ids[i];
    v_owner_id := p_owner_ids[((i - 1) % v_total_owners) + 1];

    UPDATE public.sales_cycles
    SET
      owner_user_id = v_owner_id,
      updated_at    = now()
    WHERE id = v_cycle_id AND company_id = v_company_id;

    IF FOUND THEN
      v_updated := v_updated + 1;

      INSERT INTO public.cycle_events (
        cycle_id, company_id, event_type, metadata, created_by, occurred_at
      ) VALUES (
        v_cycle_id,
        v_company_id,
        'assigned',
        jsonb_build_object(
          'to_owner',     v_owner_id,
          'round_robin',  true
        ),
        auth.uid(),
        now()
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. rpc_return_cycle_to_pool_with_reason
--    Returns a single cycle to the pool, recording the reason.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_return_cycle_to_pool_with_reason(uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_return_cycle_to_pool_with_reason(
  p_cycle_id uuid,
  p_reason   text,
  p_details  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id = NULL,
    updated_at    = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id, company_id, event_type, metadata, created_by, occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    'returned_to_pool',
    jsonb_build_object(
      'reason',        p_reason,
      'details',       p_details,
      'previous_owner', v_cycle.owner_user_id
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. rpc_set_cycle_group
--    Sets (or clears) the group for a single cycle.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_set_cycle_group(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_set_cycle_group(
  p_cycle_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.sales_cycles
  SET
    current_group_id = p_group_id,
    updated_at       = now()
  WHERE id = p_cycle_id AND company_id = v_company_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. rpc_create_lead_group
--    Creates a new lead group for the current company.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_create_lead_group(text);

CREATE OR REPLACE FUNCTION public.rpc_create_lead_group(
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_new_id     uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lead_groups
    WHERE company_id = v_company_id
      AND name = p_name
      AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um grupo com esse nome');
  END IF;

  INSERT INTO public.lead_groups (company_id, name)
  VALUES (v_company_id, p_name)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id, 'name', p_name);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_lead_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_lead_group(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. rpc_recall_group_to_pool
--     Returns all cycles in a group to the pool (sets owner_user_id = NULL).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_recall_group_to_pool(uuid);

CREATE OR REPLACE FUNCTION public.rpc_recall_group_to_pool(
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id   uuid;
  v_updated      integer;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id = NULL,
    updated_at    = now()
  WHERE current_group_id = p_group_id
    AND company_id       = v_company_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_recall_group_to_pool(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_recall_group_to_pool(uuid) TO authenticated;
