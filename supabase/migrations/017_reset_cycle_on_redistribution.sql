-- =============================================================================
-- Migration 017 — Reset ciclo ao redistribuir ou devolver ao pool
-- =============================================================================

create or replace function public.rpc_reset_cycle_assignment(
  p_cycle_id uuid,
  p_company_id uuid,
  p_new_owner_id uuid default null
)
returns json
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_cycle record;
  v_initial_stage_id uuid;
  v_now timestamptz := now();
  v_old_status text;
begin
  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  select
    sc.id,
    sc.company_id,
    sc.current_pipeline_id,
    sc.status
  into v_cycle
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id
  limit 1;

  if v_cycle is null then
    raise exception 'Ciclo não encontrado';
  end if;

  v_old_status := v_cycle.status;

  select ps.id
  into v_initial_stage_id
  from public.pipeline_stages ps
  where ps.pipeline_id = v_cycle.current_pipeline_id
    and ps.is_active = true
  order by ps.position asc
  limit 1;

  if v_initial_stage_id is null then
    raise exception 'Pipeline sem etapa inicial ativa';
  end if;

  update public.sales_cycles
  set
    owner_user_id = p_new_owner_id,
    status = 'novo',
    current_stage_id = v_initial_stage_id,
    stage_entered_at = v_now,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.lead_events (
    company_id,
    lead_id,
    user_id,
    event_type,
    from_stage,
    to_stage,
    seconds_in_from_stage,
    metadata,
    created_at
  )
  select
    sc.company_id,
    sc.lead_id,
    auth.uid(),
    case
      when p_new_owner_id is null then 'returned_to_pool'
      else 'reassigned'
    end,
    v_old_status,
    'novo',
    null,
    jsonb_build_object(
      'cycle_id', sc.id,
      'new_owner_id', p_new_owner_id,
      'source', 'rpc_reset_cycle_assignment'
    ),
    v_now
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  return json_build_object(
    'success', true,
    'cycle_id', p_cycle_id,
    'new_owner_id', p_new_owner_id,
    'reset_to', 'novo',
    'current_stage_id', v_initial_stage_id
  );
end;
$function$;

revoke all on function public.rpc_reset_cycle_assignment(uuid, uuid, uuid) from public;
grant execute on function public.rpc_reset_cycle_assignment(uuid, uuid, uuid) to authenticated;