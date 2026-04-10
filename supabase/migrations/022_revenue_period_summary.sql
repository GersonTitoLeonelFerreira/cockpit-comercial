create or replace function public.rpc_get_revenue_period_summary(
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_competency record;
  v_result jsonb;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select
    c.id,
    c.name,
    c.start_date,
    c.end_date
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_current = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  with rows_period as (
    select
      scpa.owner_user_id,
      scpa.was_worked,
      scpa.was_won,
      scpa.was_lost,
      scpa.won_total_in_period
    from public.sales_cycle_period_activity scpa
    where scpa.company_id = v_company_id
      and scpa.competency_id = v_competency.id
      and (
        p_owner_user_id is null
        or scpa.owner_user_id = p_owner_user_id
      )
  ),
  totals as (
    select
      count(*) filter (where was_worked) as worked_count,
      count(*) filter (where was_won) as won_count,
      count(*) filter (where was_lost) as lost_count,
      coalesce(sum(won_total_in_period), 0) as revenue_total
    from rows_period
  )
  select jsonb_build_object(
    'success', true,
    'competency_id', v_competency.id,
    'competency_name', v_competency.name,
    'start_date', v_competency.start_date,
    'end_date', v_competency.end_date,
    'owner_user_id', p_owner_user_id,
    'worked_count', coalesce(t.worked_count, 0),
    'won_count', coalesce(t.won_count, 0),
    'lost_count', coalesce(t.lost_count, 0),
    'revenue_total', coalesce(t.revenue_total, 0),
    'ticket_medio',
      case
        when coalesce(t.won_count, 0) > 0
          then coalesce(t.revenue_total, 0) / t.won_count
        else 0
      end
  )
  into v_result
  from totals t;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_revenue_period_summary(uuid) from public;
grant execute on function public.rpc_get_revenue_period_summary(uuid) to authenticated;