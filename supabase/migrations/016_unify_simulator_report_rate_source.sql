-- =============================================================================
-- Migration 016 — Unify simulator and report rate source
-- =============================================================================

ALTER TABLE public.revenue_goals
  ADD COLUMN IF NOT EXISTS ticket_medio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close_rate_percent numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'planejada';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'revenue_goals_rate_source_check'
  ) THEN
    ALTER TABLE public.revenue_goals
      ADD CONSTRAINT revenue_goals_rate_source_check
      CHECK (rate_source IN ('planejada', 'real'));
  END IF;
END $$;

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
  v_ticket_medio numeric;
  v_close_rate_percent numeric;
  v_rate_source text;
begin
  select
    rg.goal_value,
    coalesce(rg.ticket_medio, 0),
    coalesce(rg.close_rate_percent, 20),
    coalesce(rg.rate_source, 'planejada')
    into v_goal, v_ticket_medio, v_close_rate_percent, v_rate_source
  from public.revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is not distinct from p_owner_id
    and rg.date_start = p_date_start
    and rg.date_end = p_date_end
  limit 1;

  return json_build_object(
    'success', true,
    'goal_value', coalesce(v_goal, 0),
    'ticket_medio', coalesce(v_ticket_medio, 0),
    'close_rate_percent', coalesce(v_close_rate_percent, 20),
    'rate_source', coalesce(v_rate_source, 'planejada')
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_revenue_goal(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_revenue_goal(uuid, uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date,
  p_goal_value numeric,
  p_ticket_medio numeric DEFAULT 0,
  p_close_rate_percent numeric DEFAULT 20,
  p_rate_source text DEFAULT 'planejada'
)
RETURNS json
LANGUAGE plpgsql
AS $function$
declare
  v_existing_id uuid;
begin
  if p_rate_source not in ('planejada', 'real') then
    raise exception 'rate_source inválido: %', p_rate_source;
  end if;

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
        ticket_medio = greatest(0, coalesce(p_ticket_medio, 0)),
        close_rate_percent = greatest(1, least(90, coalesce(p_close_rate_percent, 20))),
        rate_source = p_rate_source,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.revenue_goals (
      company_id,
      owner_id,
      date_start,
      date_end,
      goal_value,
      ticket_medio,
      close_rate_percent,
      rate_source,
      created_by
    )
    VALUES (
      p_company_id,
      p_owner_id,
      p_date_start,
      p_date_end,
      greatest(0, p_goal_value),
      greatest(0, coalesce(p_ticket_medio, 0)),
      greatest(1, least(90, coalesce(p_close_rate_percent, 20))),
      p_rate_source,
      auth.uid()
    );
  END IF;

  RETURN json_build_object('success', true);
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric, numeric, numeric, text) TO authenticated;
