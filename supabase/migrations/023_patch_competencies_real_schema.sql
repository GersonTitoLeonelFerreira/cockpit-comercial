-- =============================================================================
-- Migration 023 — Patch de compatibilidade com o schema real de competencies
-- Schema real:
--   id uuid
--   company_id uuid
--   month date
--   is_active boolean
--   created_at timestamptz
-- =============================================================================

create or replace function public.rpc_get_active_competency()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_row record;
  v_month_start date;
  v_month_end date;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('error', 'company_not_found');
  end if;

  select
    c.month
  into v_row
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
  limit 1;

  if v_row is null then
    return jsonb_build_object('error', 'active_competency_not_found');
  end if;

  v_month_start := date_trunc('month', v_row.month)::date;
  v_month_end := (date_trunc('month', v_row.month) + interval '1 month')::date;

  return jsonb_build_object(
    'month', to_char(v_row.month, 'TMMonth YYYY'),
    'month_start', v_month_start,
    'month_end', v_month_end
  );
end;
$$;

revoke all on function public.rpc_get_active_competency() from public;
grant execute on function public.rpc_get_active_competency() to authenticated;


create or replace function public.rpc_open_next_monthly_competency()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_current record;
  v_next_month date;
  v_new_id uuid;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select *
  into v_current
  from public.competencies
  where company_id = v_company_id
    and is_active = true
  limit 1;

  if v_current is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  v_next_month := (date_trunc('month', v_current.month) + interval '1 month')::date;

  update public.competencies
  set is_active = false
  where id = v_current.id;

  insert into public.competencies (
    company_id,
    month,
    is_active
  )
  values (
    v_company_id,
    v_next_month,
    true
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'success', true,
    'competency_id', v_new_id,
    'month', to_char(v_next_month, 'TMMonth YYYY'),
    'month_start', date_trunc('month', v_next_month)::date,
    'month_end', (date_trunc('month', v_next_month) + interval '1 month')::date
  );
end;
$$;

revoke all on function public.rpc_open_next_monthly_competency() from public;
grant execute on function public.rpc_open_next_monthly_competency() to authenticated;


create or replace function public.rpc_touch_cycle_in_current_competency(
  p_cycle_id uuid,
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
  v_competency record;
  v_cycle record;
  v_touch_at timestamptz;
  v_owner_user_id uuid;
  v_existing_id uuid;
begin
  v_company_id := public.current_company_id();
  v_touch_at := coalesce(p_touch_at, now());

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  if p_touch_type not in ('worked', 'move', 'won', 'lost') then
    return jsonb_build_object('success', false, 'error', 'invalid_touch_type');
  end if;

  select
    c.id,
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  select
    sc.id,
    sc.company_id,
    sc.owner_user_id,
    sc.status,
    sc.won_total
  into v_cycle
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = v_company_id
  limit 1;

  if v_cycle is null then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  v_owner_user_id := v_cycle.owner_user_id;

  select scpa.id
  into v_existing_id
  from public.sales_cycle_period_activity scpa
  where scpa.cycle_id = p_cycle_id
    and scpa.competency_id = v_competency.id
  limit 1;

  if v_existing_id is null then
    insert into public.sales_cycle_period_activity (
      company_id,
      cycle_id,
      competency_id,
      owner_user_id,
      first_touched_at,
      last_touched_at,
      was_worked,
      was_won,
      was_lost,
      won_total_in_period,
      move_count
    )
    values (
      v_company_id,
      p_cycle_id,
      v_competency.id,
      v_owner_user_id,
      v_touch_at,
      v_touch_at,
      (p_touch_type in ('worked', 'move', 'won', 'lost')),
      (p_touch_type = 'won'),
      (p_touch_type = 'lost'),
      case
        when p_touch_type = 'won' then greatest(0, coalesce(p_won_total, v_cycle.won_total, 0))
        else 0
      end,
      case when p_touch_type = 'move' then 1 else 0 end
    );
  else
    update public.sales_cycle_period_activity
    set
      owner_user_id = coalesce(v_owner_user_id, owner_user_id),
      last_touched_at = greatest(last_touched_at, v_touch_at),
      was_worked = case
        when p_touch_type in ('worked', 'move', 'won', 'lost') then true
        else was_worked
      end,
      was_won = case
        when p_touch_type = 'won' then true
        else was_won
      end,
      was_lost = case
        when p_touch_type = 'lost' then true
        else was_lost
      end,
      won_total_in_period = case
        when p_touch_type = 'won' then greatest(won_total_in_period, greatest(0, coalesce(p_won_total, v_cycle.won_total, 0)))
        else won_total_in_period
      end,
      move_count = case
        when p_touch_type = 'move' then move_count + 1
        else move_count
      end,
      updated_at = now()
    where id = v_existing_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'cycle_id', p_cycle_id,
    'competency_id', v_competency.id,
    'touch_type', p_touch_type,
    'touched_at', v_touch_at
  );
end;
$$;

revoke all on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamptz, numeric) from public;
grant execute on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamptz, numeric) to authenticated;


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
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
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
    'competency_name', to_char(v_competency.month, 'TMMonth YYYY'),
    'start_date', date_trunc('month', v_competency.month)::date,
    'end_date', (date_trunc('month', v_competency.month) + interval '1 month')::date,
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
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
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
    'month', to_char(v_competency.month, 'TMMonth YYYY'),
    'month_start', date_trunc('month', v_competency.month)::date,
    'month_end', (date_trunc('month', v_competency.month) + interval '1 month')::date,
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
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
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
    'competency_name', to_char(v_competency.month, 'TMMonth YYYY'),
    'start_date', date_trunc('month', v_competency.month)::date,
    'end_date', (date_trunc('month', v_competency.month) + interval '1 month')::date,
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