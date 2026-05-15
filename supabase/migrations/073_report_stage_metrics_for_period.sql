-- =============================================================================
-- Migration 073 — Report stage metrics by company and period
-- =============================================================================
-- Objetivo:
-- Criar RPCs de relatório com filtro explícito de empresa e competência/período.
--
-- Motivo:
-- As funções antigas report_stage_conversion, report_stage_losses e
-- report_stage_time_summary recebem apenas p_company_id e retornam histórico
-- acumulado da empresa. Isso gera leituras como 660 ciclos históricos em "novo",
-- confundindo o usuário com o estoque atual do funil.
--
-- Novas funções:
-- - report_stage_conversion_for_period
-- - report_stage_losses_for_period
-- - report_stage_time_summary_for_period
-- =============================================================================

-- =============================================================================
-- 1. Conversão histórica por período
-- =============================================================================
create or replace function public.report_stage_conversion_for_period(
  p_company_id uuid,
  p_date_start date,
  p_date_end date
)
returns table (
  step_order integer,
  from_stage text,
  to_stage text,
  entered bigint,
  progressed bigint,
  conversion numeric
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período não informado';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Período inválido';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  return query
  with steps as (
    select 1 as step_order, 'contato'::text as from_stage, 'respondeu'::text as to_stage
    union all
    select 2, 'respondeu', 'negociacao'
    union all
    select 3, 'negociacao', 'ganho'
  ),
  entered_counts as (
    select
      (ce.metadata->>'to_status')::text as stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'to_status' in ('contato', 'respondeu', 'negociacao')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'to_status'
  ),
  progressed_counts as (
    select
      (ce.metadata->>'from_status')::text as from_stage,
      (ce.metadata->>'to_status')::text as to_stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'from_status' in ('contato', 'respondeu', 'negociacao')
      and ce.metadata->>'to_status' in ('respondeu', 'negociacao', 'ganho')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'from_status', ce.metadata->>'to_status'
  )
  select
    s.step_order,
    s.from_stage,
    s.to_stage,
    coalesce(en.n, 0) as entered,
    coalesce(pr.n, 0) as progressed,
    case
      when coalesce(en.n, 0) = 0 then 0::numeric
      else round((coalesce(pr.n, 0)::numeric / en.n::numeric) * 100, 2)
    end as conversion
  from steps s
  left join entered_counts en
    on en.stage = s.from_stage
  left join progressed_counts pr
    on pr.from_stage = s.from_stage
   and pr.to_stage = s.to_stage
  order by s.step_order;
end;
$function$;

-- =============================================================================
-- 2. Perdas históricas por período
-- =============================================================================
create or replace function public.report_stage_losses_for_period(
  p_company_id uuid,
  p_date_start date,
  p_date_end date
)
returns table (
  step_order integer,
  stage text,
  lost_to text,
  entered bigint,
  lost bigint,
  loss_rate numeric
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período não informado';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Período inválido';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  return query
  with steps as (
    select 1 as step_order, 'contato'::text as stage
    union all
    select 2, 'respondeu'
    union all
    select 3, 'negociacao'
  ),
  entered_counts as (
    select
      (ce.metadata->>'to_status')::text as stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'to_status' in ('contato', 'respondeu', 'negociacao')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'to_status'
  ),
  lost_counts as (
    select
      (ce.metadata->>'from_status')::text as stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved', 'cycle_lost', 'closed_lost')
      and (
        ce.metadata->>'to_status' = 'perdido'
        or ce.event_type in ('cycle_lost', 'closed_lost')
      )
      and ce.metadata->>'from_status' in ('contato', 'respondeu', 'negociacao')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'from_status'
  )
  select
    s.step_order,
    s.stage,
    'perdido'::text as lost_to,
    coalesce(en.n, 0) as entered,
    coalesce(lo.n, 0) as lost,
    case
      when coalesce(en.n, 0) = 0 then 0::numeric
      else round((coalesce(lo.n, 0)::numeric / en.n::numeric) * 100, 2)
    end as loss_rate
  from steps s
  left join entered_counts en
    on en.stage = s.stage
  left join lost_counts lo
    on lo.stage = s.stage
  order by s.step_order;
end;
$function$;

-- =============================================================================
-- 3. Tempo histórico por etapa no período
-- =============================================================================
create or replace function public.report_stage_time_summary_for_period(
  p_company_id uuid,
  p_date_start date,
  p_date_end date
)
returns table (
  from_stage text,
  moves bigint,
  avg_seconds numeric,
  median_seconds numeric
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período não informado';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Período inválido';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  return query
  with stage_durations as (
    select
      (ce.metadata->>'from_status')::text as from_stage,
      greatest(
        0,
        extract(
          epoch from (
            ce.occurred_at - coalesce(
              (
                select ce2.occurred_at
                from public.cycle_events ce2
                where ce2.cycle_id = ce.cycle_id
                  and ce2.company_id = p_company_id
                  and ce2.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
                  and ce2.metadata->>'to_status' = ce.metadata->>'from_status'
                  and ce2.occurred_at < ce.occurred_at
                order by ce2.occurred_at desc
                limit 1
              ),
              (
                select sc.created_at
                from public.sales_cycles sc
                where sc.id = ce.cycle_id
                  and sc.company_id = p_company_id
              )
            )
          )
        )
      ) as seconds_in_stage
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'from_status' in ('contato', 'respondeu', 'negociacao')
      and ce.metadata->>'to_status' is not null
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
  )
  select
    sd.from_stage,
    count(*) as moves,
    round(avg(sd.seconds_in_stage)::numeric, 0) as avg_seconds,
    round(percentile_cont(0.5) within group (order by sd.seconds_in_stage)::numeric, 0) as median_seconds
  from stage_durations sd
  where sd.seconds_in_stage > 0
  group by sd.from_stage
  order by avg_seconds desc;
end;
$function$;

-- =============================================================================
-- 4. Grants
-- =============================================================================
revoke all on function public.report_stage_conversion_for_period(uuid, date, date) from public;
revoke all on function public.report_stage_losses_for_period(uuid, date, date) from public;
revoke all on function public.report_stage_time_summary_for_period(uuid, date, date) from public;

grant execute on function public.report_stage_conversion_for_period(uuid, date, date) to authenticated;
grant execute on function public.report_stage_losses_for_period(uuid, date, date) to authenticated;
grant execute on function public.report_stage_time_summary_for_period(uuid, date, date) to authenticated;

grant execute on function public.report_stage_conversion_for_period(uuid, date, date) to service_role;
grant execute on function public.report_stage_losses_for_period(uuid, date, date) to service_role;
grant execute on function public.report_stage_time_summary_for_period(uuid, date, date) to service_role;