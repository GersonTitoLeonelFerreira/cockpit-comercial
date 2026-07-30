-- =============================================================================
-- Migration 060 — Harden revenue goal RPCs with active company membership
-- =============================================================================
-- Fase 8B.2 — Metas e ticket médio
--
-- Objetivo:
-- 1. Reescrever rpc_get_revenue_goal com validação explícita por company_id.
-- 2. Reescrever rpc_upsert_revenue_goal com validação admin por company_id.
-- 3. Preservar ticket_medio.
-- 4. Manter bloqueada a versão antiga de 5 parâmetros.
-- 5. Remover dependência de current_company_id(), profiles.company_id e profiles.role.
--
-- Esta migration NÃO mexe em:
-- - dashboard visual
-- - simulador visual
-- - sales_cycles
-- - revenue views
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- =============================================================================

begin;

-- =============================================================================
-- 1. Manter a RPC antiga de 5 parâmetros bloqueada para client
-- =============================================================================

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
-- 2. Leitura da meta e ticket médio
-- =============================================================================
-- Regra:
-- - qualquer usuário com membership ativa na empresa pode ler meta;
-- - p_company_id é obrigatório;
-- - retorna goal_value e ticket_medio;
-- - se não houver meta, retorna 0 para ambos.
-- =============================================================================

drop function if exists public.rpc_get_revenue_goal(uuid, uuid, date, date);

create or replace function public.rpc_get_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date
)
returns json
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_goal_value numeric := 0;
  v_ticket_medio numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período da meta é obrigatório';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  select
    coalesce(rg.goal_value, 0),
    coalesce(rg.ticket_medio, 0)
  into
    v_goal_value,
    v_ticket_medio
  from public.revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is not distinct from p_owner_id
    and rg.date_start = p_date_start
    and rg.date_end = p_date_end
  limit 1;

  return json_build_object(
    'success', true,
    'goal_value', coalesce(v_goal_value, 0),
    'ticket_medio', coalesce(v_ticket_medio, 0)
  );
end;
$$;

revoke all on function public.rpc_get_revenue_goal(uuid, uuid, date, date)
from public;

revoke execute on function public.rpc_get_revenue_goal(uuid, uuid, date, date)
from anon;

grant execute on function public.rpc_get_revenue_goal(uuid, uuid, date, date)
to authenticated, service_role;

-- =============================================================================
-- 3. Upsert da meta e ticket médio
-- =============================================================================
-- Regra:
-- - apenas admin da empresa pode gravar meta/ticket médio;
-- - owner_id pode ser null para meta da empresa;
-- - owner_id, se informado, precisa ter membership ativa na empresa;
-- - ticket_medio nunca fica negativo.
-- =============================================================================

drop function if exists public.rpc_upsert_revenue_goal(
  uuid,
  uuid,
  date,
  date,
  numeric,
  numeric
);

create or replace function public.rpc_upsert_revenue_goal(
  p_company_id uuid,
  p_owner_id uuid,
  p_date_start date,
  p_date_end date,
  p_goal_value numeric,
  p_ticket_medio numeric
)
returns json
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
declare
  v_existing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período da meta é obrigatório';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Data final não pode ser menor que a data inicial';
  end if;

  if not public.has_company_membership_strict(p_company_id, array['admin']) then
    raise exception 'Apenas administradores podem editar metas';
  end if;

  if p_owner_id is not null and not exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = p_owner_id
      and cm.is_active = true
  ) then
    raise exception 'Vendedor não pertence à empresa ou está inativo';
  end if;

  select rg.id
    into v_existing_id
  from public.revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is not distinct from p_owner_id
    and rg.date_start = p_date_start
    and rg.date_end = p_date_end
  limit 1;

  if v_existing_id is not null then
    update public.revenue_goals
    set
      goal_value = greatest(0, coalesce(p_goal_value, 0)),
      ticket_medio = greatest(0, coalesce(p_ticket_medio, 0)),
      updated_at = now()
    where id = v_existing_id;
  else
    insert into public.revenue_goals (
      company_id,
      owner_id,
      date_start,
      date_end,
      goal_value,
      ticket_medio,
      created_by
    )
    values (
      p_company_id,
      p_owner_id,
      p_date_start,
      p_date_end,
      greatest(0, coalesce(p_goal_value, 0)),
      greatest(0, coalesce(p_ticket_medio, 0)),
      auth.uid()
    );
  end if;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.rpc_upsert_revenue_goal(
  uuid,
  uuid,
  date,
  date,
  numeric,
  numeric
)
from public;

revoke execute on function public.rpc_upsert_revenue_goal(
  uuid,
  uuid,
  date,
  date,
  numeric,
  numeric
)
from anon;

grant execute on function public.rpc_upsert_revenue_goal(
  uuid,
  uuid,
  date,
  date,
  numeric,
  numeric
)
to authenticated, service_role;

commit;