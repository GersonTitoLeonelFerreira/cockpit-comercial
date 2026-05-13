-- =============================================================================
-- Migration 047 — Replace group RLS with strict company membership
-- =============================================================================
-- Fase 6B.2 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Criar helper estrito de membership por empresa.
-- 2. Remover policies antigas de lead_groups e lead_group_cycles.
-- 3. Substituir current_company_id(), is_admin() e policies {public}
--    por policies explícitas para authenticated.
-- 4. Reduzir privilégios perigosos de authenticated nessas tabelas.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - leads
-- - sales_cycles
-- - cycle_events
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Helper estrito de membership por empresa
-- =============================================================================
-- Diferente de has_active_company_membership(), este helper NÃO dá bypass
-- para platform_admin. Ele valida apenas vínculo ativo na empresa.
--
-- Uso esperado:
-- - RLS operacional de empresa
-- - tabelas com company_id explícito
--
-- Não usar para:
-- - plataforma global
-- - /platform-admin
-- =============================================================================

create or replace function public.has_company_membership_strict(
  p_company_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = p_company_id
      and cm.is_active = true
      and (
        p_roles is null
        or cm.role = any(p_roles)
      )
  );
$$;

revoke all on function public.has_company_membership_strict(uuid, text[])
from public;

revoke all on function public.has_company_membership_strict(uuid, text[])
from anon;

grant execute on function public.has_company_membership_strict(uuid, text[])
to authenticated, service_role;

-- =============================================================================
-- 2. Corrigir policies de lead_groups
-- =============================================================================

drop policy if exists "lead_groups_admin_update"
on public.lead_groups;

drop policy if exists "lead_groups_admin_write"
on public.lead_groups;

drop policy if exists "lead_groups_delete_admin"
on public.lead_groups;

drop policy if exists "lead_groups_insert_admin"
on public.lead_groups;

drop policy if exists "lead_groups_select"
on public.lead_groups;

drop policy if exists "lead_groups_select_company"
on public.lead_groups;

drop policy if exists "lead_groups_update_admin"
on public.lead_groups;

create policy "lead_groups_select_by_membership"
on public.lead_groups
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, null)
);

create policy "lead_groups_insert_by_admin_or_manager"
on public.lead_groups
for insert
to authenticated
with check (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

create policy "lead_groups_update_by_admin_or_manager"
on public.lead_groups
for update
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
)
with check (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

create policy "lead_groups_delete_by_admin_or_manager"
on public.lead_groups
for delete
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

-- =============================================================================
-- 3. Corrigir policies de lead_group_cycles
-- =============================================================================

drop policy if exists "lead_group_cycles_delete_admin"
on public.lead_group_cycles;

drop policy if exists "lead_group_cycles_insert_admin"
on public.lead_group_cycles;

drop policy if exists "lead_group_cycles_select_company"
on public.lead_group_cycles;

drop policy if exists "lead_group_cycles_update_admin"
on public.lead_group_cycles;

create policy "lead_group_cycles_select_by_membership"
on public.lead_group_cycles
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, null)
);

create policy "lead_group_cycles_insert_by_admin_or_manager"
on public.lead_group_cycles
for insert
to authenticated
with check (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

create policy "lead_group_cycles_update_by_admin_or_manager"
on public.lead_group_cycles
for update
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
)
with check (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

create policy "lead_group_cycles_delete_by_admin_or_manager"
on public.lead_group_cycles
for delete
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

-- =============================================================================
-- 4. Reduzir grants perigosos de authenticated
-- =============================================================================
-- Authenticated não precisa de TRIGGER, TRUNCATE ou REFERENCES nessas tabelas.
-- SELECT/INSERT/UPDATE ficam preservados.
-- DELETE também é concedido porque agora existe policy RLS explícita e restritiva
-- para admin/manager. Sem grant de DELETE, a policy de delete nunca será usada.
-- =============================================================================

revoke trigger, truncate, references
on table public.lead_groups
from authenticated;

revoke trigger, truncate, references
on table public.lead_group_cycles
from authenticated;

grant select, insert, update, delete
on table public.lead_groups
to authenticated;

grant select, insert, update, delete
on table public.lead_group_cycles
to authenticated;

grant all privileges
on table public.lead_groups
to service_role;

grant all privileges
on table public.lead_group_cycles
to service_role;

commit;