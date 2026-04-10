create table if not exists public.competencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period_type text not null default 'monthly',
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competencies_period_type_check
    check (period_type in ('monthly', 'weekly', 'fortnightly')),
  constraint competencies_date_check
    check (end_date >= start_date)
);

create index if not exists idx_competencies_company_id
  on public.competencies(company_id);

create index if not exists idx_competencies_company_current
  on public.competencies(company_id, is_current);

create unique index if not exists uq_competencies_company_current_true
  on public.competencies(company_id)
  where is_current = true;

create or replace function public.rpc_get_active_competency()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_row record;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('error', 'company_not_found');
  end if;

  select
    c.name,
    c.start_date,
    c.end_date,
    c.period_type
  into v_row
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_current = true
  limit 1;

  if v_row is null then
    return jsonb_build_object('error', 'active_competency_not_found');
  end if;

  return jsonb_build_object(
    'month', v_row.name,
    'month_start', v_row.start_date,
    'month_end', v_row.end_date,
    'period_type', v_row.period_type
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
  v_next_start date;
  v_next_end date;
  v_new_id uuid;
  v_name text;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select *
  into v_current
  from public.competencies
  where company_id = v_company_id
    and is_current = true
  limit 1;

  if v_current is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  v_next_start := (date_trunc('month', v_current.end_date + interval '1 day'))::date;
  v_next_end := (date_trunc('month', v_next_start) + interval '1 month - 1 day')::date;
  v_name := to_char(v_next_start, 'TMMonth YYYY');

  update public.competencies
  set
    is_current = false,
    is_closed = true,
    updated_at = now()
  where id = v_current.id;

  insert into public.competencies (
    company_id,
    name,
    period_type,
    start_date,
    end_date,
    is_current,
    is_closed
  )
  values (
    v_company_id,
    v_name,
    'monthly',
    v_next_start,
    v_next_end,
    true,
    false
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'success', true,
    'competency_id', v_new_id,
    'name', v_name,
    'start_date', v_next_start,
    'end_date', v_next_end
  );
end;
$$;

revoke all on function public.rpc_open_next_monthly_competency() from public;
grant execute on function public.rpc_open_next_monthly_competency() to authenticated;