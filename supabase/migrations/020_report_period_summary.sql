create or replace function public.rpc_report_period_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_competency record;
  v_summary jsonb;
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

  with period_data as (
    select
      scpa.owner_user_id,
      scpa.was_worked,
      scpa.was_won,
      scpa.was_lost,
      scpa.won_total_in_period
    from public.sales_cycle_period_activity scpa
    where scpa.company_id = v_company_id
      and scpa.competency_id = v_competency.id
  ),
  totals as (
    select
      count(*) filter (where was_worked) as worked_count,
      count(*) filter (where was_won) as won_count,
      count(*) filter (where was_lost) as lost_count,
      coalesce(sum(won_total_in_period), 0) as revenue_total
    from period_data
  ),
  by_owner as (
    select jsonb_agg(
      jsonb_build_object(
        'owner_user_id', owner_user_id,
        'worked_count', worked_count,
        'won_count', won_count,
        'lost_count', lost_count,
        'revenue_total', revenue_total
      )
      order by revenue_total desc
    ) as rows
    from (
      select
        owner_user_id,
        count(*) filter (where was_worked) as worked_count,
        count(*) filter (where was_won) as won_count,
        count(*) filter (where was_lost) as lost_count,
        coalesce(sum(won_total_in_period), 0) as revenue_total
      from period_data
      group by owner_user_id
    ) t
  ),
  pool_now as (
    select count(*) as total_pool
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and sc.owner_user_id is null
      and sc.status not in ('ganho', 'perdido')
  )
  select jsonb_build_object(
    'success', true,
    'competency_id', v_competency.id,
    'competency_name', v_competency.name,
    'start_date', v_competency.start_date,
    'end_date', v_competency.end_date,
    'worked_count', coalesce(t.worked_count, 0),
    'won_count', coalesce(t.won_count, 0),
    'lost_count', coalesce(t.lost_count, 0),
    'revenue_total', coalesce(t.revenue_total, 0),
    'total_pool_now', coalesce(p.total_pool, 0),
    'by_owner', coalesce(o.rows, '[]'::jsonb)
  )
  into v_summary
  from totals t
  cross join by_owner o
  cross join pool_now p;

  return v_summary;
end;
$$;

revoke all on function public.rpc_report_period_summary() from public;
grant execute on function public.rpc_report_period_summary() to authenticated;