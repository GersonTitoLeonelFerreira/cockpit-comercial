-- =============================================================================
-- Migration 054 — Replace sales_cycles RLS with operational access
-- =============================================================================
-- Fase 6B.9 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas e duplicadas de sales_cycles.
-- 2. Substituir current_company_id(), is_admin(), is_admin_or_manager()
--    e profiles.company_id.
-- 3. Aplicar acesso por company_memberships + owner_user_id.
-- 4. Permitir leitura para admin/manager da empresa ou dono do ciclo.
-- 5. Permitir insert/update para admin/manager ou dono do ciclo.
-- 6. Bloquear delete direto por authenticated.
-- 7. Reduzir grants perigosos de authenticated.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - leads
-- - lead_profiles
-- - cycle_events
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Helper de leitura operacional de sales_cycles
-- =============================================================================
-- Regras:
-- - admin/manager com membership ativa na empresa lê qualquer ciclo da empresa;
-- - vendedor com membership ativa lê apenas ciclo próprio;
-- - não usa current_company_id();
-- - não usa profiles.company_id;
-- - não usa profiles.role.
--
-- SECURITY DEFINER + row_security off evita dependência circular em RLS.
-- =============================================================================

create or replace function public.can_select_sales_cycle_strict(
  p_company_id uuid,
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select
    exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role = any(array['admin', 'manager'])
    )
    or (
      p_owner_user_id = auth.uid()
      and exists (
        select 1
        from public.company_memberships cm
        where cm.company_id = p_company_id
          and cm.user_id = auth.uid()
          and cm.is_active = true
      )
    );
$$;

revoke all on function public.can_select_sales_cycle_strict(uuid, uuid)
from public;

revoke all on function public.can_select_sales_cycle_strict(uuid, uuid)
from anon;

grant execute on function public.can_select_sales_cycle_strict(uuid, uuid)
to authenticated, service_role;

-- =============================================================================
-- 2. Helper de escrita operacional de sales_cycles
-- =============================================================================
-- Regras:
-- - admin/manager pode criar/alterar ciclo da empresa;
-- - se definir owner_user_id, esse owner precisa ter membership ativa na empresa;
-- - owner_user_id null é permitido para admin/manager porque representa Pool;
-- - vendedor só pode criar/alterar ciclo próprio;
-- - não permite que vendedor jogue ciclo para Pool por update direto.
-- =============================================================================

create or replace function public.can_write_sales_cycle_strict(
  p_company_id uuid,
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select
    (
      exists (
        select 1
        from public.company_memberships actor_cm
        where actor_cm.company_id = p_company_id
          and actor_cm.user_id = auth.uid()
          and actor_cm.is_active = true
          and actor_cm.role = any(array['admin', 'manager'])
      )
      and (
        p_owner_user_id is null
        or exists (
          select 1
          from public.company_memberships target_cm
          where target_cm.company_id = p_company_id
            and target_cm.user_id = p_owner_user_id
            and target_cm.is_active = true
        )
      )
    )
    or (
      p_owner_user_id = auth.uid()
      and exists (
        select 1
        from public.company_memberships cm
        where cm.company_id = p_company_id
          and cm.user_id = auth.uid()
          and cm.is_active = true
      )
    );
$$;

revoke all on function public.can_write_sales_cycle_strict(uuid, uuid)
from public;

revoke all on function public.can_write_sales_cycle_strict(uuid, uuid)
from anon;

grant execute on function public.can_write_sales_cycle_strict(uuid, uuid)
to authenticated, service_role;

-- =============================================================================
-- 3. Remover policies antigas e duplicadas
-- =============================================================================

drop policy if exists "Allow insert for authenticated users in same company"
on public.sales_cycles;

drop policy if exists "Users can view cycles in their company"
on public.sales_cycles;

drop policy if exists "Vendedor atualiza seus próprios deals"
on public.sales_cycles;

drop policy if exists "Vendedor cria deals"
on public.sales_cycles;

drop policy if exists "Vendedor vê seus próprios deals"
on public.sales_cycles;

drop policy if exists "sales_cycles_delete_policy"
on public.sales_cycles;

drop policy if exists "sales_cycles_insert_admin_or_owner"
on public.sales_cycles;

drop policy if exists "sales_cycles_select_admin_or_owner"
on public.sales_cycles;

drop policy if exists "sales_cycles_update_admin_or_owner"
on public.sales_cycles;

-- Remove também policies novas se a migration for reexecutada.

drop policy if exists "sales_cycles_select_by_operational_access"
on public.sales_cycles;

drop policy if exists "sales_cycles_insert_by_operational_access"
on public.sales_cycles;

drop policy if exists "sales_cycles_update_by_operational_access"
on public.sales_cycles;

drop policy if exists "sales_cycles_delete_block_authenticated"
on public.sales_cycles;

-- =============================================================================
-- 4. SELECT — admin/manager da empresa ou dono do ciclo
-- =============================================================================

create policy "sales_cycles_select_by_operational_access"
on public.sales_cycles
for select
to authenticated
using (
  public.can_select_sales_cycle_strict(company_id, owner_user_id)
);

-- =============================================================================
-- 5. INSERT — admin/manager ou dono do ciclo
-- =============================================================================
-- Admin/manager pode criar ciclo para Pool ou vendedor ativo da empresa.
-- Vendedor só pode criar ciclo próprio.
-- =============================================================================

create policy "sales_cycles_insert_by_operational_access"
on public.sales_cycles
for insert
to authenticated
with check (
  public.can_write_sales_cycle_strict(company_id, owner_user_id)
);

-- =============================================================================
-- 6. UPDATE — admin/manager ou dono do ciclo
-- =============================================================================
-- using valida a linha antiga.
-- with check valida a linha final após a alteração.
-- =============================================================================

create policy "sales_cycles_update_by_operational_access"
on public.sales_cycles
for update
to authenticated
using (
  public.can_select_sales_cycle_strict(company_id, owner_user_id)
)
with check (
  public.can_write_sales_cycle_strict(company_id, owner_user_id)
);

-- =============================================================================
-- 7. DELETE — bloqueado para authenticated
-- =============================================================================
-- sales_cycles é operação oficial. Não deve haver delete físico direto pelo client.
-- Soft delete/reativação deve ser fluxo server-side controlado.
-- =============================================================================

create policy "sales_cycles_delete_block_authenticated"
on public.sales_cycles
for delete
to authenticated
using (false);

-- =============================================================================
-- 8. Grants
-- =============================================================================
-- Authenticated precisa de SELECT/INSERT/UPDATE.
-- DELETE/TRIGGER/TRUNCATE/REFERENCES ficam fora do client.
-- service_role permanece com acesso total.
-- =============================================================================

revoke delete, trigger, truncate, references
on table public.sales_cycles
from authenticated;

grant select, insert, update
on table public.sales_cycles
to authenticated;

grant all privileges
on table public.sales_cycles
to service_role;

commit;