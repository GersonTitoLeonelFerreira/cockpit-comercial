-- =============================================================================
-- Migration 048 — Replace cycle_events RLS with strict company membership
-- =============================================================================
-- Fase 6B.3 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas de cycle_events.
-- 2. Substituir current_company_id(), is_admin() e roles {public}.
-- 3. Aplicar RLS com company_id explícito + company_memberships.
-- 4. Permitir leitura para admin/manager da empresa ou dono do ciclo.
-- 5. Permitir inserção para admin/manager da empresa ou dono do ciclo.
-- 6. Manter update restrito a admin/manager.
-- 7. Reduzir grants perigosos de authenticated.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - leads
-- - sales_cycles
-- - lead_groups
-- - lead_group_cycles
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Remover policies antigas
-- =============================================================================

drop policy if exists "cycle_events_delete_admin"
on public.cycle_events;

drop policy if exists "cycle_events_insert_admin_or_creator"
on public.cycle_events;

drop policy if exists "cycle_events_select_admin_or_owner"
on public.cycle_events;

drop policy if exists "cycle_events_update_admin"
on public.cycle_events;

-- =============================================================================
-- 2. SELECT — admin/manager vê eventos da empresa; vendedor vê eventos dos ciclos próprios
-- =============================================================================

create policy "cycle_events_select_by_membership_or_cycle_owner"
on public.cycle_events
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
  or (
    public.has_company_membership_strict(company_id, null)
    and exists (
      select 1
      from public.sales_cycles sc
      where sc.id = public.cycle_events.cycle_id
        and sc.company_id = public.cycle_events.company_id
        and sc.owner_user_id = (select auth.uid())
    )
  )
);

-- =============================================================================
-- 3. INSERT — admin/manager insere; vendedor insere em ciclo próprio
-- =============================================================================
-- created_by precisa ser o usuário autenticado.
-- Isso impede inserir evento fingindo ser outro usuário.

create policy "cycle_events_insert_by_membership_or_cycle_owner"
on public.cycle_events
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    public.has_company_membership_strict(company_id, array['admin', 'manager'])
    or (
      public.has_company_membership_strict(company_id, null)
      and exists (
        select 1
        from public.sales_cycles sc
        where sc.id = public.cycle_events.cycle_id
          and sc.company_id = public.cycle_events.company_id
          and sc.owner_user_id = (select auth.uid())
      )
    )
  )
);

-- =============================================================================
-- 4. UPDATE — somente admin/manager da empresa
-- =============================================================================
-- cycle_events é histórico operacional. Vendedor não deve alterar evento já gravado.

create policy "cycle_events_update_by_admin_or_manager"
on public.cycle_events
for update
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
)
with check (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

-- =============================================================================
-- 5. Grants
-- =============================================================================
-- Authenticated não precisa de TRIGGER, TRUNCATE, REFERENCES nem DELETE.
-- SELECT/INSERT/UPDATE ficam preservados e controlados por RLS.
-- DELETE fica apenas para service_role.

revoke delete, trigger, truncate, references
on table public.cycle_events
from authenticated;

grant select, insert, update
on table public.cycle_events
to authenticated;

grant all privileges
on table public.cycle_events
to service_role;

commit;