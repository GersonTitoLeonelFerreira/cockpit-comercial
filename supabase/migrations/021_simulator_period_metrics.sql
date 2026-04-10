create or replace function public.rpc_get_simulator_period_metrics(
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

  with period_rows as (
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
  open_now as (
    select count(*) as total_open
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and sc.status not in ('ganho', 'perdido')
      and (
        p_owner_user_id is null
        or sc.owner_user_id = p_owner_user_id
      )
  ),
  pool_now as (
    select count(*) as total_pool
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and sc.owner_user_id is null
      and sc.status not in ('ganho', 'perdido')
  ),
  status_counts as (
    select
      count(*) filter (where sc.status = 'novo') as novo,
      count(*) filter (where sc.status = 'contato') as contato,
      count(*) filter (where sc.status = 'respondeu') as respondeu,
      count(*) filter (where sc.status = 'negociacao') as negociacao,
      count(*) filter (where sc.status = 'ganho') as ganho,
      count(*) filter (where sc.status = 'perdido') as perdido
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and (
        p_owner_user_id is null
        or sc.owner_user_id = p_owner_user_id
      )
  ),
  totals as (
    select
      count(*) filter (where was_won) as current_wins,
      count(*) filter (where was_worked) as worked_count,
      count(*) filter (where was_lost) as lost_count,
      coalesce(sum(won_total_in_period), 0) as total_real
    from period_rows
  )
  select jsonb_build_object(
    'success', true,
    'company_id', v_company_id,
    'month', v_competency.name,
    'month_start', v_competency.start_date,
    'month_end', v_competency.end_date,
    'owner_user_id', p_owner_user_id,
    'current_wins', coalesce(t.current_wins, 0),
    'worked_count', coalesce(t.worked_count, 0),
    'lost_count', coalesce(t.lost_count, 0),
    'total_real', coalesce(t.total_real, 0),
    'total_open', coalesce(o.total_open, 0),
    'total_pool', coalesce(p.total_pool, 0),
    'counts_by_status', jsonb_build_object(
      'novo', coalesce(s.novo, 0),
      'contato', coalesce(s.contato, 0),
      'respondeu', coalesce(s.respondeu, 0),
      'negociacao', coalesce(s.negociacao, 0),
      'ganho', coalesce(s.ganho, 0),
      'perdido', coalesce(s.perdido, 0)
    )
  )
  into v_result
  from totals t
  cross join open_now o
  cross join pool_now p
  cross join status_counts s;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_simulator_period_metrics(uuid) from public;
grant execute on function public.rpc_get_simulator_period_metrics(uuid) to authenticated;