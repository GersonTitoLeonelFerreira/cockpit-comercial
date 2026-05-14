    -- =============================================================================
-- Migration 065 — Close rate real for active company
-- =============================================================================
-- Fase 11B.1 — Simulador, Dashboard e Métricas
--
-- Objetivo:
-- 1. Criar rpc_get_close_rate_real_for_company com p_company_id explícito.
-- 2. Validar membership ativa.
-- 3. Permitir admin/manager consultar empresa ou vendedor.
-- 4. Permitir member consultar apenas o próprio escopo.
-- 5. Bloquear a RPC antiga sem company_id explícito para authenticated.
--
-- Esta migration NÃO mexe em:
-- - dashboard visual
-- - simulador visual
-- - sales_cycles schema
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Bloquear RPC antiga sem company_id explícito
-- =============================================================================

do $$
begin
  if to_regprocedure('public.rpc_get_close_rate_real(uuid, integer)') is not null then
    execute 'revoke all on function public.rpc_get_close_rate_real(uuid, integer) from public';
    execute 'revoke execute on function public.rpc_get_close_rate_real(uuid, integer) from anon';
    execute 'revoke execute on function public.rpc_get_close_rate_real(uuid, integer) from authenticated';
    execute 'grant execute on function public.rpc_get_close_rate_real(uuid, integer) to service_role';
  end if;
end $$;

-- =============================================================================
-- 2. Criar RPC nova com company_id explícito
-- =============================================================================

drop function if exists public.rpc_get_close_rate_real_for_company(uuid, uuid, integer);

create or replace function public.rpc_get_close_rate_real_for_company(
  p_company_id uuid,
  p_owner_user_id uuid default null,
  p_days_window integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_days_window integer := greatest(coalesce(p_days_window, 90), 1);
  v_start_at timestamptz := now() - (greatest(coalesce(p_days_window, 90), 1)::text || ' days')::interval;
  v_is_admin_or_manager boolean := false;
  v_effective_owner_id uuid;

  v_company_wins integer := 0;
  v_company_worked integer := 0;
  v_company_rate numeric := 0;

  v_vendor_wins integer := 0;
  v_vendor_worked integer := 0;
  v_vendor_rate numeric := 0;
begin
  if v_actor_id is null then
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
    v_effective_owner_id := p_owner_user_id;

    if v_effective_owner_id is not null and not exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = v_effective_owner_id
        and cm.is_active = true
    ) then
      raise exception 'Vendedor não pertence à empresa ou está inativo';
    end if;
  else
    v_effective_owner_id := v_actor_id;
  end if;

  select count(*)
    into v_company_worked
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status in ('contato', 'respondeu', 'negociacao', 'ganho', 'perdido')
    and coalesce(sc.first_worked_at, sc.updated_at, sc.created_at) >= v_start_at;

  select count(*)
    into v_company_wins
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and coalesce(sc.won_at, sc.closed_at, sc.updated_at) >= v_start_at;

  v_company_rate :=
    case
      when v_company_worked > 0 then v_company_wins::numeric / v_company_worked::numeric
      else null
    end;

  if v_effective_owner_id is not null then
    select count(*)
      into v_vendor_worked
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and sc.owner_user_id = v_effective_owner_id
      and sc.status in ('contato', 'respondeu', 'negociacao', 'ganho', 'perdido')
      and coalesce(sc.first_worked_at, sc.updated_at, sc.created_at) >= v_start_at;

    select count(*)
      into v_vendor_wins
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_effective_owner_id
      and sc.status = 'ganho'
      and coalesce(sc.won_at, sc.closed_at, sc.updated_at) >= v_start_at;

    v_vendor_rate :=
      case
        when v_vendor_worked > 0 then v_vendor_wins::numeric / v_vendor_worked::numeric
        else null
      end;
  end if;

  return jsonb_build_object(
    'success', true,
    'days_window', v_days_window,
    'vendor', jsonb_build_object(
      'owner_user_id', v_effective_owner_id,
      'wins', coalesce(v_vendor_wins, 0),
      'worked', coalesce(v_vendor_worked, 0),
      'close_rate', v_vendor_rate
    ),
    'company', jsonb_build_object(
      'owner_user_id', null,
      'wins', coalesce(v_company_wins, 0),
      'worked', coalesce(v_company_worked, 0),
      'close_rate', v_company_rate
    )
  );
end;
$$;

revoke all on function public.rpc_get_close_rate_real_for_company(uuid, uuid, integer)
from public;

revoke execute on function public.rpc_get_close_rate_real_for_company(uuid, uuid, integer)
from anon;

grant execute on function public.rpc_get_close_rate_real_for_company(uuid, uuid, integer)
to authenticated, service_role;

commit;