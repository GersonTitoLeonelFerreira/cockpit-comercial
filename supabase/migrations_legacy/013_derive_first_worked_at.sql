-- ==========================================================================
-- Migration 013 — Derive first_worked_at
--
-- Classifies cycle_events as "real commercial work" and propagates
-- first_worked_at to sales_cycles and leads on INSERT via trigger.
--
-- Depends on: Migration 012 (first_worked_at columns on sales_cycles and leads)
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER IF EXISTS, CREATE INDEX IF NOT EXISTS
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. fn_is_real_work_event
--    IMMUTABLE: result depends only on arguments, no external state.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_is_real_work_event(
  p_event_type text,
  p_metadata   jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE

    -- GRUPO 1: quick_* actions — always real commercial work
    WHEN p_event_type IN (
      'quick_approach_contact',
      'quick_call_done',
      'quick_whats_sent',
      'quick_answered_doubt',
      'quick_scheduled',
      'quick_proposal'
    ) THEN true

    -- GRUPO 2: stage_changed / stage_moved — real work only when all conditions met
    WHEN p_event_type IN ('stage_changed', 'stage_moved') THEN (

      -- Condition A: from_status must be 'novo'
      -- Supports both flat layout (metadata->>'from_status')
      -- and nested layout (metadata->'metadata'->>'from_status')
      COALESCE(
        p_metadata->>'from_status',
        p_metadata->'metadata'->>'from_status'
      ) = 'novo'

      -- Condition B: to_status must be a genuine work stage
      AND COALESCE(
        p_metadata->>'to_status',
        p_metadata->'metadata'->>'to_status'
      ) IN ('contato', 'respondeu', 'negociacao')

      -- Condition C: at least one piece of operational evidence must be present
      AND (
        -- checkpoint is present and not empty ({} or null)
        (
          p_metadata->'checkpoint' IS NOT NULL
          AND p_metadata->'checkpoint' <> 'null'::jsonb
          AND p_metadata->'checkpoint' <> '{}'::jsonb
        )
        -- OR action_result at root or nested level
        OR p_metadata->>'action_result' IS NOT NULL
        OR p_metadata->'metadata'->>'action_result' IS NOT NULL
        -- OR action_channel at root or nested level
        OR p_metadata->>'action_channel' IS NOT NULL
        OR p_metadata->'metadata'->>'action_channel' IS NOT NULL
      )
    )

    -- Everything else: not real commercial work
    ELSE false

  END;
$$;

COMMENT ON FUNCTION public.fn_is_real_work_event(text, jsonb) IS
'Classifies a cycle_event as real commercial work for the purpose of
deriving first_worked_at.

GRUPO 1 (always real work):
  quick_approach_contact, quick_call_done, quick_whats_sent,
  quick_answered_doubt, quick_scheduled, quick_proposal.

GRUPO 2 (conditional — stage_changed / stage_moved):
  Returns true only when ALL three conditions are satisfied:
  1. from_status = ''novo'' (checked at root and at metadata.metadata level)
  2. to_status IN (''contato'', ''respondeu'', ''negociacao'')
  3. At least one operational signal: checkpoint not empty, action_result
     present, or action_channel present (checked at root and nested levels).

Everything else returns false (administrative events such as assigned,
owner_assigned, recalled_to_pool, cycle_created, etc. are excluded).';

-- --------------------------------------------------------------------------
-- 2. trg_set_first_worked_at — trigger function
--    Writes first_worked_at once (write-once semantics: NULL → value only).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_set_first_worked_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the event is not real commercial work, do nothing
  IF NOT public.fn_is_real_work_event(NEW.event_type, NEW.metadata) THEN
    RETURN NEW;
  END IF;

  -- Write-once: update sales_cycle only if first_worked_at is still NULL
  UPDATE public.sales_cycles
  SET    first_worked_at = NEW.occurred_at
  WHERE  id              = NEW.cycle_id
    AND  first_worked_at IS NULL;

  -- Write-once: update lead only if first_worked_at is still NULL
  UPDATE public.leads AS l
  SET    first_worked_at = NEW.occurred_at
  FROM   public.sales_cycles sc
  WHERE  sc.id           = NEW.cycle_id
    AND  sc.lead_id      = l.id
    AND  l.first_worked_at IS NULL;

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Trigger (idempotent — DROP IF EXISTS before CREATE)
-- --------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_cycle_events_first_worked ON public.cycle_events;

CREATE TRIGGER trg_cycle_events_first_worked
  AFTER INSERT ON public.cycle_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_first_worked_at();

-- --------------------------------------------------------------------------
-- 4. Partial index for performance
--    Covers only the event types that fn_is_real_work_event can return true for.
-- --------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_cycle_events_work_lookup
  ON public.cycle_events (cycle_id, occurred_at ASC)
  WHERE event_type IN (
    'quick_approach_contact', 'quick_call_done', 'quick_whats_sent',
    'quick_answered_doubt', 'quick_scheduled', 'quick_proposal',
    'stage_changed', 'stage_moved'
  );
