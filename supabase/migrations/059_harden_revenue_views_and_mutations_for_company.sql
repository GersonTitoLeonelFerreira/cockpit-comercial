-- =============================================================================
-- Migration 059 — Harden revenue views and mutations for active company
-- =============================================================================
-- Fase 8B.1 — Faturamento e metas
--
-- Objetivo:
-- 1. Corrigir grants de v_revenue_daily_seller e v_revenue_daily_extra.
-- 2. Remover execução pública/anônima de RPC antiga de meta.
-- 3. Revogar authenticated de RPCs antigas de mutation sem company_id explícito.
-- 4. Criar RPCs novas de mutation de faturamento com p_company_id explícito.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - views antigas de vendas já tratadas na Fase 7
-- - dashboard
-- - simulador
-- =============================================================================

begin;

-- =============================================================================
-- 1. Corrigir grants das views diárias de faturamento
-- =============================================================================

revoke all privileges on table public.v_revenue_daily_seller
from anon;

revoke all privileges on table public.v_revenue_daily_extra
from anon;

revoke all privileges on table public.v_revenue_daily_seller
from authenticated;

revoke all privileges on table public.v_revenue_daily_extra
from authenticated;

grant select on table public.v_revenue_daily_seller
to authenticated;

grant select on table public.v_revenue_daily_extra
to authenticated;

grant all privileges on table public.v_revenue_daily_seller
to service_role;

grant all privileges on table public.v_revenue_daily_extra
to service_role;

-- =============================================================================
-- 2. Revogar RPC antiga de meta com 5 parâmetros
-- =============================================================================
-- Esta versão estava executável por anon. Não deve ser usada pelo client.

do $$
begin
  if to_regprocedure('public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric)') is not null then
    execute 'revoke all on function public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric) from public';
    execute 'revoke execute on function public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric) from anon';
    execute 'revoke execute on function public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric) from authenticated';
    execute 'grant execute on function public.rpc_upsert_revenue_goal(uuid, uuid, date, date, numeric) to service_role';
  end if;
end $$;

-- =============================================================================
-- 3. Revogar authenticated das RPCs antigas sem p_company_id explícito
-- =============================================================================
-- As versões antigas dependem de current_company_id()/is_admin().
-- A partir desta fase, o front deve usar versões _for_company.

do $$
begin
  if to_regprocedure('public.rpc_create_revenue_extra_source(text)') is not null then
    execute 'revoke execute on function public.rpc_create_revenue_extra_source(text) from authenticated';
    execute 'revoke execute on function public.rpc_create_revenue_extra_source(text) from anon';
    execute 'grant execute on function public.rpc_create_revenue_extra_source(text) to service_role';
  end if;

  if to_regprocedure('public.rpc_upsert_revenue_daily_override(text, uuid, date, numeric, text, text)') is not null then
    execute 'revoke execute on function public.rpc_upsert_revenue_daily_override(text, uuid, date, numeric, text, text) from authenticated';
    execute 'revoke execute on function public.rpc_upsert_revenue_daily_override(text, uuid, date, numeric, text, text) from anon';
    execute 'grant execute on function public.rpc_upsert_revenue_daily_override(text, uuid, date, numeric, text, text) to service_role';
  end if;
end $$;

-- =============================================================================
-- 4. RPC nova — criar fonte extra por empresa ativa
-- =============================================================================

drop function if exists public.rpc_create_revenue_extra_source_for_company(uuid, text);

create or replace function public.rpc_create_revenue_extra_source_for_company(
  p_company_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Nome não pode estar vazio';
  end if;

  if not public.has_company_membership_strict(p_company_id, array['admin']) then
    raise exception 'Apenas administradores podem criar fontes de faturamento';
  end if;

  insert into public.revenue_extra_sources (
    company_id,
    name,
    created_by
  )
  values (
    p_company_id,
    trim(p_name),
    auth.uid()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.rpc_create_revenue_extra_source_for_company(uuid, text)
from public;

revoke execute on function public.rpc_create_revenue_extra_source_for_company(uuid, text)
from anon;

grant execute on function public.rpc_create_revenue_extra_source_for_company(uuid, text)
to authenticated, service_role;

-- =============================================================================
-- 5. RPC nova — upsert de override diário por empresa ativa
-- =============================================================================

drop function if exists public.rpc_upsert_revenue_daily_override_for_company(
  uuid,
  text,
  uuid,
  date,
  numeric,
  text,
  text
);

create or replace function public.rpc_upsert_revenue_daily_override_for_company(
  p_company_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_ref_date date,
  p_real_value numeric,
  p_reason text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_source_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_source_kind not in ('seller', 'extra') then
    raise exception 'source_kind deve ser seller ou extra';
  end if;

  if p_source_id is null then
    raise exception 'Fonte não informada';
  end if;

  if p_ref_date is null then
    raise exception 'Data de referência obrigatória';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Motivo é obrigatório';
  end if;

  if not public.has_company_membership_strict(p_company_id, array['admin']) then
    raise exception 'Apenas administradores podem editar faturamento';
  end if;

  if p_source_kind = 'seller' then
    select cm.company_id
      into v_source_company_id
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = p_source_id
      and cm.is_active = true
    limit 1;
  else
    select res.company_id
      into v_source_company_id
    from public.revenue_extra_sources res
    where res.company_id = p_company_id
      and res.id = p_source_id
      and res.archived_at is null
    limit 1;
  end if;

  if v_source_company_id is null or v_source_company_id <> p_company_id then
    raise exception 'Fonte não encontrada ou não pertence à empresa';
  end if;

  insert into public.revenue_overrides_daily (
    company_id,
    source_kind,
    source_id,
    ref_date,
    real_value,
    reason,
    notes,
    edited_by
  )
  values (
    p_company_id,
    p_source_kind,
    p_source_id,
    p_ref_date,
    coalesce(p_real_value, 0),
    trim(p_reason),
    p_notes,
    auth.uid()
  )
  on conflict (company_id, source_kind, source_id, ref_date)
  do update set
    real_value = excluded.real_value,
    reason = excluded.reason,
    notes = excluded.notes,
    edited_by = auth.uid(),
    edited_at = now();

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.rpc_upsert_revenue_daily_override_for_company(
  uuid,
  text,
  uuid,
  date,
  numeric,
  text,
  text
)
from public;

revoke execute on function public.rpc_upsert_revenue_daily_override_for_company(
  uuid,
  text,
  uuid,
  date,
  numeric,
  text,
  text
)
from anon;

grant execute on function public.rpc_upsert_revenue_daily_override_for_company(
  uuid,
  text,
  uuid,
  date,
  numeric,
  text,
  text
)
to authenticated, service_role;

commit;