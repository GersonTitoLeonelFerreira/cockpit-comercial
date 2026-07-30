-- =============================================================================
-- Migration 020 — Fase 3: Rastreabilidade e padronização de cycle_events
-- =============================================================================
--
-- OBJETIVO:
-- Padronizar cycle_events para que a vida do ciclo possa ser reconstruída
-- do início ao fim com rastreabilidade operacional real.
--
-- EVENTOS PADRONIZADOS:
--   - stage_changed
--   - closed_won
--   - closed_lost
--   - returned_to_pool
--   - owner_assigned
--   - owner_reassigned
--   - group_changed
--   - next_action_set
--
-- PRINCÍPIOS:
--   - nomes explícitos
--   - metadata mínima útil
--   - sem quebrar compatibilidade do restante do sistema
--   - migração incremental e idempotente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Índices de auditoria
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cycle_events_cycle_occurred_at
  ON public.cycle_events (cycle_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cycle_events_event_type_occurred_at
  ON public.cycle_events (event_type, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- 2) Normalização histórica de event_type
-- -----------------------------------------------------------------------------
UPDATE public.cycle_events
SET event_type = 'owner_assigned'
WHERE event_type = 'assigned';

UPDATE public.cycle_events
SET event_type = 'owner_reassigned'
WHERE event_type = 'reassigned';

UPDATE public.cycle_events
SET event_type = 'returned_to_pool'
WHERE event_type = 'recalled_to_pool';

UPDATE public.cycle_events
SET event_type = 'stage_changed'
WHERE event_type IN ('stage_checkpoint', 'stage_moved');

-- -----------------------------------------------------------------------------
-- 3) Normalização histórica de metadata
--    Mantemos as chaves antigas e adicionamos as novas, para não quebrar
--    consultas antigas e ao mesmo tempo padronizar auditoria nova.
-- -----------------------------------------------------------------------------

-- owner_assigned
UPDATE public.cycle_events
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'previous_owner_user_id',
      COALESCE(
        metadata->>'previous_owner_user_id',
        metadata->>'previous_owner_id',
        metadata->>'previous_owner',
        metadata->>'from_owner'
      ),
    'new_owner_user_id',
      COALESCE(
        metadata->>'new_owner_user_id',
        metadata->>'owner_new',
        metadata->>'to_owner'
      ),
    'source',
      COALESCE(
        metadata->>'source',
        CASE
          WHEN COALESCE((metadata->>'round_robin')::boolean, false) THEN 'round_robin'
          ELSE 'assignment'
        END
      )
  )
WHERE event_type = 'owner_assigned';

-- owner_reassigned
UPDATE public.cycle_events
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'previous_owner_user_id',
      COALESCE(
        metadata->>'previous_owner_user_id',
        metadata->>'previous_owner_id',
        metadata->>'previous_owner',
        metadata->>'from_owner'
      ),
    'new_owner_user_id',
      COALESCE(
        metadata->>'new_owner_user_id',
        metadata->>'owner_new',
        metadata->>'to_owner'
      ),
    'source',
      COALESCE(metadata->>'source', 'reassignment')
  )
WHERE event_type = 'owner_reassigned';

-- returned_to_pool
UPDATE public.cycle_events
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'previous_owner_user_id',
      COALESCE(
        metadata->>'previous_owner_user_id',
        metadata->>'previous_owner_id',
        metadata->>'previous_owner'
      ),
    'new_owner_user_id', NULL,
    'previous_status',
      COALESCE(metadata->>'previous_status'),
    'new_status',
      COALESCE(metadata->>'new_status', 'novo'),
    'previous_group_id',
      COALESCE(
        metadata->>'previous_group_id',
        metadata->>'group_id'
      ),
    'source',
      COALESCE(
        metadata->>'source',
        CASE
          WHEN metadata ? 'group_id' THEN 'group_recall'
          WHEN COALESCE((metadata->>'by_self')::boolean, false) THEN 'self_return'
          WHEN COALESCE((metadata->>'by_admin')::boolean, false) THEN 'admin_return'
          WHEN metadata ? 'reason' THEN 'card_return'
          ELSE 'pool_return'
        END
      )
  )
WHERE event_type = 'returned_to_pool';

-- stage_changed
UPDATE public.cycle_events
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'action_channel',
      COALESCE(
        metadata->>'action_channel',
        metadata->'checkpoint'->>'action_channel'
      ),
    'action_result',
      COALESCE(
        metadata->>'action_result',
        metadata->'checkpoint'->>'action_result'
      ),
    'result_detail',
      COALESCE(
        metadata->>'result_detail',
        metadata->'checkpoint'->>'result_detail'
      ),
    'note',
      COALESCE(
        metadata->>'note',
        metadata->'checkpoint'->>'note'
      ),
    'next_action',
      COALESCE(
        metadata->>'next_action',
        metadata->'checkpoint'->>'next_action'
      ),
    'next_action_date',
      COALESCE(
        metadata->>'next_action_date',
        metadata->'checkpoint'->>'next_action_date'
      ),
    'lost_reason',
      COALESCE(
        metadata->>'lost_reason',
        metadata->'checkpoint'->>'lost_reason'
      )
  )
WHERE event_type = 'stage_changed';

-- closed_won
UPDATE public.cycle_events
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'to_status', COALESCE(metadata->>'to_status', 'ganho')
  )
WHERE event_type = 'closed_won';

-- closed_lost
UPDATE public.cycle_events
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'to_status', COALESCE(metadata->>'to_status', 'perdido')
  )
WHERE event_type = 'closed_lost';

-- -----------------------------------------------------------------------------
-- 4) rpc_move_cycle_stage
--    Padroniza stage_changed e bloqueia fechamento terminal por este caminho.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_move_cycle_stage(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage(
  p_cycle_id  uuid,
  p_to_status text,
  p_metadata  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
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
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  IF p_to_status IN ('ganho', 'perdido') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won/rpc_close_cycle_lost para fechamento terminal'
    );
  END IF;

  UPDATE public.sales_cycles
  SET
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = v_now,
    updated_at       = v_now
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
      'payload', p_metadata
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_move_cycle_stage(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_cycle_stage(uuid, text, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) rpc_move_cycle_stage_checkpoint
--    Padroniza metadata do evento e mantém bloqueio para fechamento terminal.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_checkpoint(
  p_cycle_id   uuid,
  p_to_status  text,
  p_checkpoint jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id       uuid;
  v_cycle            public.sales_cycles%ROWTYPE;
  v_next_action      text;
  v_next_action_date timestamptz;
  v_now              timestamptz := now();
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
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
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
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = v_now,
    next_action      = COALESCE(v_next_action, next_action),
    next_action_date = COALESCE(v_next_action_date, next_action_date),
    updated_at       = v_now
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
      'checkpoint', p_checkpoint,
      'action_channel', p_checkpoint->>'action_channel',
      'action_result', p_checkpoint->>'action_result',
      'result_detail', p_checkpoint->>'result_detail',
      'note', p_checkpoint->>'note',
      'next_action', p_checkpoint->>'next_action',
      'next_action_date', p_checkpoint->>'next_action_date',
      'lost_reason', p_checkpoint->>'lost_reason'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_move_cycle_stage_checkpoint(uuid, text, jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6) rpc_assign_cycle_owner
--    Padroniza owner_assigned / owner_reassigned.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_assign_cycle_owner(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_assign_cycle_owner(
  p_cycle_id uuid,
  p_owner_user_id uuid
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
  v_new_status text;
  v_event_type text;
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

  v_new_status := CASE
    WHEN v_cycle.status = 'novo' THEN 'contato'
    ELSE v_cycle.status
  END;

  IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id
     AND v_new_status = v_cycle.status THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  v_event_type := CASE
    WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
    ELSE 'owner_reassigned'
  END;

  UPDATE public.sales_cycles
  SET
    owner_user_id    = p_owner_user_id,
    status           = v_new_status,
    previous_status  = v_cycle.status,
    stage_entered_at = CASE WHEN v_new_status <> v_cycle.status THEN v_now ELSE stage_entered_at END,
    updated_at       = v_now
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
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_new_status,
      'source', 'single_assign'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_assign_cycle_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_assign_cycle_owner(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7) rpc_reassign_cycle_owner
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_reassign_cycle_owner(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_reassign_cycle_owner(
  p_cycle_id uuid,
  p_owner_user_id uuid
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
  v_event_type text;
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

  IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  v_event_type := CASE
    WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
    ELSE 'owner_reassigned'
  END;

  UPDATE public.sales_cycles
  SET
    owner_user_id = p_owner_user_id,
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
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_cycle.status,
      'source', 'single_reassign'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_cycle_owner(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8) rpc_bulk_assign_cycles_owner
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_assign_cycles_owner(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.rpc_bulk_assign_cycles_owner(
  p_cycle_ids uuid[],
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id THEN
      CONTINUE;
    END IF;

    v_event_type := CASE
      WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
      ELSE 'owner_reassigned'
    END;

    UPDATE public.sales_cycles
    SET
      owner_user_id = p_owner_user_id,
      updated_at = v_now
    WHERE id = v_cycle_id
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
      v_cycle_id,
      v_company_id,
      v_event_type,
      jsonb_build_object(
        'previous_owner_user_id', v_cycle.owner_user_id,
        'new_owner_user_id', p_owner_user_id,
        'from_status', v_cycle.status,
        'to_status', v_cycle.status,
        'source', 'bulk_assign'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_assign_cycles_owner(uuid[], uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9) rpc_bulk_assign_round_robin
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_assign_round_robin(uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_assign_round_robin(
  p_cycle_ids uuid[],
  p_owner_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_total_owners integer;
  v_updated integer := 0;
  i integer;
  v_cycle_id uuid;
  v_owner_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_event_type text;
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

    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.owner_user_id IS NOT DISTINCT FROM v_owner_id THEN
      CONTINUE;
    END IF;

    v_event_type := CASE
      WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
      ELSE 'owner_reassigned'
    END;

    UPDATE public.sales_cycles
    SET
      owner_user_id = v_owner_id,
      updated_at = v_now
    WHERE id = v_cycle_id
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
      v_cycle_id,
      v_company_id,
      v_event_type,
      jsonb_build_object(
        'previous_owner_user_id', v_cycle.owner_user_id,
        'new_owner_user_id', v_owner_id,
        'from_status', v_cycle.status,
        'to_status', v_cycle.status,
        'source', 'round_robin'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_assign_round_robin(uuid[], uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10) rpc_set_next_action
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_set_next_action(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.rpc_set_next_action(
  p_cycle_id uuid,
  p_next_action text,
  p_next_action_date timestamptz
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
      'error_message', 'Não é possível definir próxima ação em ciclo fechado'
    );
  END IF;

  UPDATE public.sales_cycles
  SET
    next_action = p_next_action,
    next_action_date = p_next_action_date,
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
    'next_action_set',
    jsonb_build_object(
      'previous_next_action', v_cycle.next_action,
      'previous_next_action_date', v_cycle.next_action_date,
      'new_next_action', p_next_action,
      'new_next_action_date', p_next_action_date
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_next_action(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_next_action(uuid, text, timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11) rpc_bulk_return_cycles_to_pool
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_return_cycles_to_pool(uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool(
  p_cycle_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
      CONTINUE;
    END IF;

    IF v_cycle.owner_user_id IS NULL AND v_cycle.status = 'novo' THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      previous_status = status,
      status = 'novo',
      stage_entered_at = v_now,
      updated_at = v_now
    WHERE id = v_cycle_id
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
      v_cycle_id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'previous_owner_user_id', v_cycle.owner_user_id,
        'new_owner_user_id', NULL,
        'previous_status', v_cycle.status,
        'new_status', 'novo',
        'previous_group_id', v_cycle.current_group_id,
        'source', 'admin_bulk_return'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool(uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 12) rpc_bulk_return_cycles_to_pool_self
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_return_cycles_to_pool_self(uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool_self(
  p_cycle_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_user_id := auth.uid();

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id
      AND owner_user_id = v_user_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      previous_status = status,
      status = 'novo',
      stage_entered_at = v_now,
      updated_at = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id
      AND owner_user_id = v_user_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_cycle_id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'previous_owner_user_id', v_user_id,
        'new_owner_user_id', NULL,
        'previous_status', v_cycle.status,
        'new_status', 'novo',
        'previous_group_id', v_cycle.current_group_id,
        'source', 'self_return'
      ),
      v_user_id,
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_return_cycles_to_pool_self(uuid[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 13) rpc_return_cycle_to_pool_with_reason
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_return_cycle_to_pool_with_reason(uuid, text, text);

CREATE OR REPLACE FUNCTION public.rpc_return_cycle_to_pool_with_reason(
  p_cycle_id uuid,
  p_reason text,
  p_details text DEFAULT ''
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
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id = NULL,
    status = 'novo',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
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
    'returned_to_pool',
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', NULL,
      'previous_status', v_cycle.status,
      'new_status', 'novo',
      'previous_group_id', v_cycle.current_group_id,
      'reason', p_reason,
      'details', p_details,
      'source', 'card_return'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_return_cycle_to_pool_with_reason(uuid, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 14) rpc_recall_group_to_pool
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_recall_group_to_pool(uuid);

CREATE OR REPLACE FUNCTION public.rpc_recall_group_to_pool(
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_rec record;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOR v_rec IN
    SELECT id, status, owner_user_id, current_group_id
    FROM public.sales_cycles
    WHERE current_group_id = p_group_id
      AND company_id = v_company_id
      AND status NOT IN ('ganho', 'perdido', 'cancelado')
      AND owner_user_id IS NOT NULL
  LOOP
    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      previous_status = status,
      status = 'novo',
      stage_entered_at = v_now,
      updated_at = v_now
    WHERE id = v_rec.id
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
      v_rec.id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'previous_owner_user_id', v_rec.owner_user_id,
        'new_owner_user_id', NULL,
        'previous_status', v_rec.status,
        'new_status', 'novo',
        'previous_group_id', v_rec.current_group_id,
        'source', 'group_recall'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_recall_group_to_pool(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_recall_group_to_pool(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 15) rpc_set_cycle_group
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_set_cycle_group(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_set_cycle_group(
  p_cycle_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_cycle.current_group_id IS NOT DISTINCT FROM p_group_id THEN
    RETURN true;
  END IF;

  UPDATE public.sales_cycles
  SET
    current_group_id = p_group_id,
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
    'group_changed',
    jsonb_build_object(
      'previous_group_id', v_cycle.current_group_id,
      'new_group_id', p_group_id,
      'source', 'single_set_group'
    ),
    auth.uid(),
    v_now
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_cycle_group(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 16) rpc_bulk_set_cycles_group
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_set_cycles_group(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.rpc_bulk_set_cycles_group(
  p_cycle_ids uuid[],
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.current_group_id IS NOT DISTINCT FROM p_group_id THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_cycles
    SET
      current_group_id = p_group_id,
      updated_at = v_now
    WHERE id = v_cycle_id
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
      v_cycle_id,
      v_company_id,
      'group_changed',
      jsonb_build_object(
        'previous_group_id', v_cycle.current_group_id,
        'new_group_id', p_group_id,
        'source', 'bulk_set_group'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_set_cycles_group(uuid[], uuid) TO authenticated;