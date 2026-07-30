-- =============================================================================
-- Migration 066 — Sales cycle metrics for active company
-- =============================================================================
-- Fase 11B.2 — Simulador, Dashboard e Métricas
--
-- Objetivo:
-- 1. Criar rpc_get_sales_cycle_metrics_v1_for_company com p_company_id explícito.
-- 2. Remover dependência de current_company_id().
-- 3. Remover dependência de is_admin().
-- 4. Validar membership ativa.
-- 5. Validar owner_user_id quando informado.
-- 6. Bloquear a RPC antiga sem company_id para authenticated.
--
-- Esta migration NÃO mexe em:
-- - relatórios gerais
-- - rpc_get_active_competency
-- - dashboard visual
-- - sales_cycles schema
-- - revenue
-- =============================================================================

begin;

-- =============================================================================
-- 1. Bloquear RPC antiga sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_get_sales_cycle_metrics_v1(uuid, date)') is not null then
    execute 'revoke all on function public.rpc_get_sales_cycle_metrics_v1(uuid, date) from public';
    execute 'revoke execute on function public.rpc_get_sales_cycle_metrics_v1(uuid, date) from anon';
    execute 'revoke execute on function public.rpc_get_sales_cycle_metrics_v1(uuid, date) from authenticated';
    execute 'grant execute on function public.rpc_get_sales_cycle_metrics_v1(uuid, date) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Criar RPC nova com company_id explícito
-- =============================================================================

drop function if exists public.rpc_get_sales_cycle_metrics_v1_for_company(uuid, uuid, date);

create or replace function public.rpc_get_sales_cycle_metrics_v1_for_company(
  p_company_id uuid,
  p_owner_user_id uuid default null,
  p_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin_or_manager boolean := false;
  v_owner_filter uuid;
  v_month date;
  v_month_start date;
  v_month_end date;
  v_counts_by_status record;
  v_current_wins integer := 0;
  v_worked_count integer := 0;
  v_total_open integer := 0;
  v_total_pool integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  v_is_admin_or_manager := public.has_company_membership_strict(
    p_company_id,
    array['admin', 'manager']
  );

  if v_is_admin_or_manager then
    v_owner_filter := p_owner_user_id;

    if v_owner_filter is not null and not exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = v_owner_filter
        and cm.is_active = true
    ) then
      raise exception 'Vendedor não pertence à empresa ou está inativo';
    end if;
  else
    v_owner_filter := v_user_id;
  end if;

  if p_month is not null then
    v_month := date_trunc('month', p_month)::date;
  else
    v_month := date_trunc('month', now())::date;
  end if;

  v_month_start := v_month;
  v_month_end := (date_trunc('month', v_month)::date + interval '1 month')::date;

  select count(*)
    into v_current_wins
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date,
      (sc.closed_at at time zone 'America/Sao_Paulo')::date
    ) >= v_month_start
    and coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date,
      (sc.closed_at at time zone 'America/Sao_Paulo')::date
    ) < v_month_end
    and (
      v_owner_filter is null
      or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    );

  select count(*)
    into v_worked_count
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status != 'novo'
    and (
      (
        sc.stage_entered_at >= v_month_start
        and sc.stage_entered_at < v_month_end
        and (v_owner_filter is null or sc.owner_user_id = v_owner_filter)
      )
      or (
        sc.status = 'ganho'
        and coalesce(
          sc.revenue_seller_ref_date::date,
          (sc.won_at at time zone 'America/Sao_Paulo')::date,
          (sc.closed_at at time zone 'America/Sao_Paulo')::date
        ) >= v_month_start
        and coalesce(
          sc.revenue_seller_ref_date::date,
          (sc.won_at at time zone 'America/Sao_Paulo')::date,
          (sc.closed_at at time zone 'America/Sao_Paulo')::date
        ) < v_month_end
        and (
          v_owner_filter is null
          or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
        )
      )
    );

  select count(*)
    into v_total_open
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status not in ('ganho', 'perdido')
    and (v_owner_filter is null or sc.owner_user_id = v_owner_filter);

  if v_is_admin_or_manager and v_owner_filter is null then
    select count(*)
      into v_total_pool
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and sc.owner_user_id is null
      and sc.status = 'novo';
  else
    v_total_pool := 0;
  end if;

  with scoped_cycles as (
    select sc.status
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and (
        (
          sc.status = 'ganho'
          and coalesce(
            sc.revenue_seller_ref_date::date,
            (sc.won_at at time zone 'America/Sao_Paulo')::date,
            (sc.closed_at at time zone 'America/Sao_Paulo')::date
          ) >= v_month_start
          and coalesce(
            sc.revenue_seller_ref_date::date,
            (sc.won_at at time zone 'America/Sao_Paulo')::date,
            (sc.closed_at at time zone 'America/Sao_Paulo')::date
          ) < v_month_end
          and (
            v_owner_filter is null
            or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
          )
        )
        or (
          sc.status <> 'ganho'
          and sc.stage_entered_at >= v_month_start
          and sc.stage_entered_at < v_month_end
          and (v_owner_filter is null or sc.owner_user_id = v_owner_filter)
        )
      )
  ),
  status_counts as (
    select status, count(*) as cnt
    from scoped_cycles
    group by status
  )
  select
    coalesce((select cnt from status_counts where status = 'novo'), 0) as novo,
    coalesce((select cnt from status_counts where status = 'contato'), 0) as contato,
    coalesce((select cnt from status_counts where status = 'respondeu'), 0) as respondeu,
    coalesce((select cnt from status_counts where status = 'negociacao'), 0) as negociacao,
    coalesce((select cnt from status_counts where status = 'ganho'), 0) as ganho,
    coalesce((select cnt from status_counts where status = 'perdido'), 0) as perdido
  into v_counts_by_status;

  return jsonb_build_object(
    'company_id', p_company_id::text,
    'month_start', v_month_start::text,
    'month_end', v_month_end::text,
    'owner_user_id', case when v_owner_filter is null then null else v_owner_filter::text end,
    'is_admin', v_is_admin_or_manager,
    'current_wins', coalesce(v_current_wins, 0),
    'worked_count', coalesce(v_worked_count, 0),
    'total_open', coalesce(v_total_open, 0),
    'total_pool', coalesce(v_total_pool, 0),
    'counts_by_status', jsonb_build_object(
      'novo', coalesce(v_counts_by_status.novo, 0),
      'contato', coalesce(v_counts_by_status.contato, 0),
      'respondeu', coalesce(v_counts_by_status.respondeu, 0),
      'negociacao', coalesce(v_counts_by_status.negociacao, 0),
      'ganho', coalesce(v_counts_by_status.ganho, 0),
      'perdido', coalesce(v_counts_by_status.perdido, 0)
    )
  );
end;
$$;

revoke all on function public.rpc_get_sales_cycle_metrics_v1_for_company(uuid, uuid, date)
from public;

revoke execute on function public.rpc_get_sales_cycle_metrics_v1_for_company(uuid, uuid, date)
from anon;

grant execute on function public.rpc_get_sales_cycle_metrics_v1_for_company(uuid, uuid, date)
to authenticated, service_role;

commit;