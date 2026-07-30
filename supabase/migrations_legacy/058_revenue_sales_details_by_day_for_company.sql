-- =============================================================================
-- Migration 058 — Revenue sales details by day for active company
-- =============================================================================
-- Fase 8A — Faturamento e metas
--
-- Objetivo:
-- 1. Criar RPC segura para detalhe de vendas por dia com p_company_id explícito.
-- 2. Remover dependência de current_company_id().
-- 3. Remover dependência de is_admin().
-- 4. Remover dependência de profiles.company_id.
-- 5. Preservar a regra oficial de data financeira:
--    revenue_seller_ref_date -> won_at -> closed_at.
-- 6. Revogar authenticated da RPC antiga sem p_company_id.
--
-- Esta migration substitui o conteúdo planejado na antiga 031 local.
-- NÃO commitar supabase/migrations/031_revenue_sales_details_by_day.sql.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Revogar acesso da RPC antiga, se existir
-- =============================================================================
-- A função antiga dependia de current_company_id() e is_admin().
-- Ela não deve continuar acessível ao client autenticado.

do $$
begin
  if to_regprocedure('public.rpc_revenue_sales_details_by_day(date, uuid)') is not null then
    execute 'revoke all on function public.rpc_revenue_sales_details_by_day(date, uuid) from public';
    execute 'revoke execute on function public.rpc_revenue_sales_details_by_day(date, uuid) from anon';
    execute 'revoke execute on function public.rpc_revenue_sales_details_by_day(date, uuid) from authenticated';
    execute 'grant execute on function public.rpc_revenue_sales_details_by_day(date, uuid) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Criar RPC nova com company_id explícito
-- =============================================================================

drop function if exists public.rpc_revenue_sales_details_by_day_for_company(uuid, date, uuid);

create or replace function public.rpc_revenue_sales_details_by_day_for_company(
  p_company_id uuid,
  p_ref_date date,
  p_owner_id uuid default null
)
returns table (
  cycle_id uuid,
  lead_id uuid,
  lead_name text,
  seller_id uuid,
  seller_name text,
  seller_email text,
  product_id uuid,
  product_name text,
  product_category text,
  won_total numeric,
  won_unit_price numeric,
  payment_method text,
  payment_type text,
  won_at timestamptz,
  revenue_seller_ref_date date
)
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  v_owner_filter uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  v_is_admin := public.has_company_membership_strict(p_company_id, array['admin']);

  if v_is_admin then
    v_owner_filter := p_owner_id;
  else
    v_owner_filter := v_user_id;
  end if;

  return query
  select
    sc.id as cycle_id,
    sc.lead_id,
    l.name as lead_name,
    coalesce(sc.won_owner_user_id, sc.owner_user_id) as seller_id,
    p.full_name as seller_name,
    p.email as seller_email,
    sc.product_id,
    pr.name as product_name,
    pr.category as product_category,
    coalesce(sc.won_total, 0)::numeric as won_total,
    sc.won_unit_price,
    sc.payment_method::text,
    sc.payment_type::text,
    sc.won_at,
    sc.revenue_seller_ref_date::date
  from public.sales_cycles sc
  left join public.leads l
    on l.id = sc.lead_id
   and l.company_id = sc.company_id
  left join public.profiles p
    on p.id = coalesce(sc.won_owner_user_id, sc.owner_user_id)
  left join public.products pr
    on pr.id = sc.product_id
   and pr.company_id = sc.company_id
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date,
      (sc.closed_at at time zone 'America/Sao_Paulo')::date
    ) = p_ref_date
    and (
      v_owner_filter is null
      or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    )
  order by sc.won_at desc nulls last, sc.updated_at desc;
end;
$$;

revoke all on function public.rpc_revenue_sales_details_by_day_for_company(uuid, date, uuid)
from public;

revoke execute on function public.rpc_revenue_sales_details_by_day_for_company(uuid, date, uuid)
from anon;

grant execute on function public.rpc_revenue_sales_details_by_day_for_company(uuid, date, uuid)
to authenticated, service_role;

commit;