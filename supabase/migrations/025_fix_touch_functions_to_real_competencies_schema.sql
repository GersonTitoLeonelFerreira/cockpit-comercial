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
  v_cycle record;
  v_competency record;
  v_touch_at timestamptz;
  v_owner_user_id uuid;
  v_existing_id uuid;
begin
  v_touch_at := coalesce(p_touch_at, now());

  if p_touch_type not in ('worked', 'move', 'won', 'lost') then
    return jsonb_build_object('success', false, 'error', 'invalid_touch_type');
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
  limit 1;

  if v_cycle is null then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  select
    c.id,
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_cycle.company_id
    and c.is_active = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
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
      v_cycle.company_id,
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
    'competency_month', v_competency.month,
    'touch_type', p_touch_type,
    'touched_at', v_touch_at
  );
end;
$$;

revoke all on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamptz, numeric) from public;
grant execute on function public.rpc_touch_cycle_in_current_competency(uuid, text, timestamptz, numeric) to authenticated;


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
  v_cycle_id uuid;
begin
  select sc.id
  into v_cycle_id
  from public.sales_cycles sc
  where sc.lead_id = p_lead_id
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