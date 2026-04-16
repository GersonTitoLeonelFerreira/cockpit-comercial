create or replace function public.rpc_touch_lead_in_current_competency(
  p_lead_id uuid,
  p_touch_type text default 'worked',
  p_touch_at timestamptz default now(),
  p_won_total numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_cycle_id uuid;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select sc.id
  into v_cycle_id
  from public.sales_cycles sc
  where sc.company_id = v_company_id
    and sc.lead_id = p_lead_id
  order by sc.created_at desc
  limit 1;

  if v_cycle_id is null then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found_for_lead');
  end if;

  return public.rpc_touch_cycle_in_current_competency(
    v_cycle_id,
    p_touch_type,
    p_touch_at,
    p_won_total
  );
end;
$$;

revoke all on function public.rpc_touch_lead_in_current_competency(uuid, text, timestamptz, numeric) from public;
grant execute on function public.rpc_touch_lead_in_current_competency(uuid, text, timestamptz, numeric) to authenticated;

