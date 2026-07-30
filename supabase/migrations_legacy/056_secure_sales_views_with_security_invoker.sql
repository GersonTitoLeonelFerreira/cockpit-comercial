-- =============================================================================
-- Migration 056 — Secure sales views with security_invoker
-- =============================================================================
-- Fase 7 — Views antigas e relatórios com dados globais
--
-- Objetivo:
-- 1. Recriar views antigas de vendas com security_invoker = true.
-- 2. Fazer as views respeitarem RLS das tabelas base.
-- 3. Remover acesso anon.
-- 4. Preservar authenticated e service_role.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - RLS das tabelas principais
-- - RPCs
-- - lógica dos relatórios
-- - dashboard
-- - simulador
-- =============================================================================

begin;

-- =============================================================================
-- 1. vw_sales_cycles_with_revenue
-- =============================================================================
-- View base usada por views agregadas.
-- Precisa vir antes das views que dependem dela.
-- =============================================================================

create or replace view public.vw_sales_cycles_with_revenue
with (security_invoker = true)
as
select
  sc.id,
  sc.lead_id,
  sc.company_id,
  sc.owner_user_id,
  sc.status,
  sc.won_total,
  sc.won_at,
  sc.created_at,
  sc.won_value_source,
  p.email as owner_email,
  p.full_name as owner_name,
  sc.revenue_seller_ref_date,
  coalesce(
    case
      when sc.won_value_source::text = 'revenue'::text
        and rdp.real_value is not null
      then rdp.real_value
      else sc.won_total
    end,
    sc.won_total
  ) as final_won_value,
  rdp.real_value as revenue_real_value,
  rdp.cockpit_value as revenue_cockpit_value,
  sc.won_owner_user_id,
  sc.lost_at,
  sc.lost_reason,
  sc.canceled_at,
  sc.paused_at,
  sc.next_action_date,
  sc.updated_at,
  coalesce(sc.won_owner_user_id, sc.owner_user_id) as seller_id
from public.sales_cycles sc
left join public.profiles p
  on coalesce(sc.won_owner_user_id, sc.owner_user_id) = p.id
left join public.v_revenue_daily_seller rdp
  on coalesce(sc.won_owner_user_id, sc.owner_user_id) = rdp.seller_id
 and sc.revenue_seller_ref_date::date = rdp.ref_date
 and sc.company_id = rdp.company_id;

-- =============================================================================
-- 2. vw_sales_cycles_complete
-- =============================================================================

create or replace view public.vw_sales_cycles_complete
with (security_invoker = true)
as
select
  sc.id,
  sc.company_id,
  sc.lead_id,
  sc.owner_user_id,
  coalesce(p.email, 'N/A'::text)::varchar as owner_email,
  sc.status,
  sc.previous_status,
  sc.stage_entered_at,
  sc.next_action,
  sc.next_action_date,
  sc.current_group_id,
  sc.created_at,
  sc.updated_at,
  sc.closed_at,
  sc.won_owner_user_id,
  sc.won_at,
  sc.won_total,
  sc.won_items,
  sc.won_note,
  sc.lost_reason,
  sc.lost_at,
  sc.lost_owner_user_id,
  coalesce(p_lost.email, 'N/A'::text)::varchar as lost_owner_email,
  sc.paused_at,
  sc.paused_reason,
  sc.canceled_at,
  sc.canceled_reason,
  case
    when sc.status = 'ganho'::lead_status then 'Ganho'
    when sc.status = 'perdido'::lead_status then 'Perdido'
    when sc.status = 'pausado'::lead_status then 'Pausado'
    when sc.status = 'cancelado'::lead_status then 'Cancelado'
    else 'Em Andamento'
  end as status_display,
  extract(day from coalesce(sc.closed_at, now()) - sc.created_at) as dias_em_ciclo,
  case
    when sc.won_at is not null then 'Ganho'
    when sc.lost_at is not null then 'Perdido'
    when sc.canceled_at is not null then 'Cancelado'
    when sc.paused_at is not null then 'Pausado'
    else 'Ativo'
  end as resultado_final
from public.sales_cycles sc
left join public.profiles p
  on sc.owner_user_id = p.id
left join public.profiles p_lost
  on sc.lost_owner_user_id = p_lost.id;

-- =============================================================================
-- 3. vw_sales_funnel
-- =============================================================================

create or replace view public.vw_sales_funnel
with (security_invoker = true)
as
select
  sc.status,
  count(*) as total_deals,
  count(
    case
      when sc.won_at is not null then 1
      else null::integer
    end
  ) as deals_ganhos,
  count(
    case
      when sc.lost_at is not null then 1
      else null::integer
    end
  ) as deals_perdidos,
  round(
    100.0
    * count(
      case
        when sc.won_at is not null then 1
        else null::integer
      end
    )::numeric
    / nullif(count(*), 0)::numeric,
    2
  ) as taxa_conversao_pct,
  round(
    coalesce(
      case
        when count(
          case
            when sc.won_at is not null then 1
            else null::integer
          end
        ) > 0
        then sum(
          case
            when sc.won_at is not null then scwr.final_won_value
            else 0::numeric
          end
        ) / count(
          case
            when sc.won_at is not null then 1
            else null::integer
          end
        )::numeric
        else 0::numeric
      end,
      0::numeric
    ),
    2
  ) as valor_medio_ganho,
  coalesce(
    sum(
      case
        when sc.won_at is not null then scwr.final_won_value
        else 0::numeric
      end
    ),
    0::numeric
  ) as receita_total
from public.sales_cycles sc
left join public.vw_sales_cycles_with_revenue scwr
  on sc.id = scwr.id
where sc.company_id is not null
group by sc.status
order by
  case sc.status
    when 'novo'::lead_status then 1
    when 'contato'::lead_status then 2
    when 'respondeu'::lead_status then 3
    when 'negociacao'::lead_status then 4
    when 'ganho'::lead_status then 5
    when 'perdido'::lead_status then 6
    else 7
  end;

-- =============================================================================
-- 4. vw_sales_lost_analysis
-- =============================================================================

create or replace view public.vw_sales_lost_analysis
with (security_invoker = true)
as
select
  sc.lost_reason as motivo,
  count(*) as total_deals_perdidos,
  round(
    100.0 * count(*)::numeric / nullif(
      (
        select count(*) as count
        from public.sales_cycles
        where sales_cycles.lost_at is not null
      ),
      0
    )::numeric,
    2
  ) as percentual,
  coalesce(
    sum(
      case
        when sc.won_at is not null then scwr.final_won_value
        else 0::numeric
      end
    ),
    0::numeric
  ) as valor_estimado
from public.sales_cycles sc
left join public.vw_sales_cycles_with_revenue scwr
  on sc.id = scwr.id
where sc.lost_at is not null
  and sc.company_id is not null
  and sc.lost_reason is not null
group by sc.lost_reason
order by count(*) desc;

-- =============================================================================
-- 5. vw_sales_monthly_analysis
-- =============================================================================

create or replace view public.vw_sales_monthly_analysis
with (security_invoker = true)
as
select
  date_trunc('month', coalesce(sc.won_at, sc.created_at))::date as mes,
  count(*) as total_deals_criados,
  count(
    case
      when sc.won_at is not null then 1
      else null::integer
    end
  ) as deals_ganhos,
  count(
    case
      when sc.lost_at is not null then 1
      else null::integer
    end
  ) as deals_perdidos,
  round(
    100.0
    * count(
      case
        when sc.won_at is not null then 1
        else null::integer
      end
    )::numeric
    / nullif(count(*), 0)::numeric,
    2
  ) as taxa_conversao_pct,
  coalesce(
    sum(
      case
        when sc.won_at is not null then scwr.final_won_value
        else 0::numeric
      end
    ),
    0::numeric
  ) as receita_total,
  round(
    coalesce(
      case
        when count(
          case
            when sc.won_at is not null then 1
            else null::integer
          end
        ) > 0
        then sum(
          case
            when sc.won_at is not null then scwr.final_won_value
            else 0::numeric
          end
        ) / count(
          case
            when sc.won_at is not null then 1
            else null::integer
          end
        )::numeric
        else 0::numeric
      end,
      0::numeric
    ),
    2
  ) as receita_media_por_deal
from public.sales_cycles sc
left join public.vw_sales_cycles_with_revenue scwr
  on sc.id = scwr.id
where sc.company_id is not null
group by date_trunc('month', coalesce(sc.won_at, sc.created_at))
order by date_trunc('month', coalesce(sc.won_at, sc.created_at))::date desc;

-- =============================================================================
-- 6. vw_sales_performance_by_owner
-- =============================================================================

create or replace view public.vw_sales_performance_by_owner
with (security_invoker = true)
as
select
  p.email as owner_email,
  p.full_name as owner_name,
  count(*) as total_deals,
  count(
    case
      when sc.won_at is not null then 1
      else null::integer
    end
  ) as deals_ganhos,
  count(
    case
      when sc.lost_at is not null then 1
      else null::integer
    end
  ) as deals_perdidos,
  round(
    100.0
    * count(
      case
        when sc.won_at is not null then 1
        else null::integer
      end
    )::numeric
    / nullif(count(*), 0)::numeric,
    2
  ) as taxa_conversao_pct,
  coalesce(
    sum(
      case
        when sc.won_at is not null then scwr.final_won_value
        else 0::numeric
      end
    ),
    0::numeric
  ) as valor_total_ganho,
  round(
    coalesce(
      case
        when count(
          case
            when sc.won_at is not null then 1
            else null::integer
          end
        ) > 0
        then sum(
          case
            when sc.won_at is not null then scwr.final_won_value
            else 0::numeric
          end
        ) / count(
          case
            when sc.won_at is not null then 1
            else null::integer
          end
        )::numeric
        else 0::numeric
      end,
      0::numeric
    ),
    2
  ) as ticket_medio,
  round(avg(extract(day from coalesce(sc.won_at, now()) - sc.created_at)), 1) as dias_medio_ciclo
from public.sales_cycles sc
left join public.profiles p
  on sc.owner_user_id = p.id
left join public.vw_sales_cycles_with_revenue scwr
  on sc.id = scwr.id
where sc.company_id is not null
  and sc.owner_user_id is not null
group by p.id, p.email, p.full_name
order by round(
  100.0
  * count(
    case
      when sc.won_at is not null then 1
      else null::integer
    end
  )::numeric
  / nullif(count(*), 0)::numeric,
  2
) desc;

-- =============================================================================
-- 7. Grants das views
-- =============================================================================
-- As views podem continuar disponíveis para authenticated, mas não para anon.
-- Com security_invoker = true, elas respeitam RLS das tabelas base.
-- =============================================================================

revoke all privileges on table public.vw_sales_funnel from anon;
revoke all privileges on table public.vw_sales_lost_analysis from anon;
revoke all privileges on table public.vw_sales_monthly_analysis from anon;
revoke all privileges on table public.vw_sales_cycles_complete from anon;
revoke all privileges on table public.vw_sales_performance_by_owner from anon;
revoke all privileges on table public.vw_sales_cycles_with_revenue from anon;

grant select on table public.vw_sales_funnel to authenticated;
grant select on table public.vw_sales_lost_analysis to authenticated;
grant select on table public.vw_sales_monthly_analysis to authenticated;
grant select on table public.vw_sales_cycles_complete to authenticated;
grant select on table public.vw_sales_performance_by_owner to authenticated;
grant select on table public.vw_sales_cycles_with_revenue to authenticated;

grant all privileges on table public.vw_sales_funnel to service_role;
grant all privileges on table public.vw_sales_lost_analysis to service_role;
grant all privileges on table public.vw_sales_monthly_analysis to service_role;
grant all privileges on table public.vw_sales_cycles_complete to service_role;
grant all privileges on table public.vw_sales_performance_by_owner to service_role;
grant all privileges on table public.vw_sales_cycles_with_revenue to service_role;

commit;