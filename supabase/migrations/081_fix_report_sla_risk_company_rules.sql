create or replace function public.report_sla_risk(
  p_company_id uuid
)
returns table (
  lead_id uuid,
  name text,
  phone text,
  stage text,
  seconds_in_stage integer,
  sla_seconds integer,
  over_seconds integer,
  owner_user_id uuid,
  owner_name text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception using errcode = '42501';
  end if;

  return query
  with base as (
    select
      sc.lead_id,
      l.name,
      l.phone,
      sc.status::text as stage,
      sc.owner_user_id,
      p.full_name as owner_name,
      coalesce(sc.stage_entered_at, sc.created_at) as entered_at
    from public.sales_cycles sc
    join public.leads l on l.id = sc.lead_id
    left join public.profiles p on p.id = sc.owner_user_id
    where sc.company_id = p_company_id
      and sc.status not in ('ganho', 'perdido')
  ),
  sla_lookup as (
    select
      csr.status::text as status,
      csr.danger_minutes * 60 as sla_secs
    from public.company_sla_rules csr
    where csr.company_id = p_company_id
  ),
  calc as (
    select
      b.lead_id,
      b.name,
      b.phone,
      b.stage,
      b.owner_user_id,
      b.owner_name,
      greatest(0, floor(extract(epoch from (now() - b.entered_at)))::int) as seconds_in_stage,
      coalesce(
        sl.sla_secs,
        case b.stage
          when 'novo' then 7200
          when 'contato' then 86400
          when 'respondeu' then 172800
          when 'negociacao' then 259200
          else 172800
        end
      )::int as sla_seconds
    from base b
    left join sla_lookup sl on sl.status = b.stage
  )
  select
    calc.lead_id,
    calc.name,
    calc.phone,
    calc.stage,
    calc.seconds_in_stage,
    calc.sla_seconds,
    (calc.seconds_in_stage - calc.sla_seconds)::int as over_seconds,
    calc.owner_user_id,
    calc.owner_name
  from calc
  where calc.seconds_in_stage > calc.sla_seconds
  order by over_seconds desc, seconds_in_stage desc;
end;
$$;

revoke execute on function public.report_sla_risk(uuid) from public;
revoke execute on function public.report_sla_risk(uuid) from anon;
grant execute on function public.report_sla_risk(uuid) to authenticated;
grant execute on function public.report_sla_risk(uuid) to service_role;
