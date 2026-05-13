-- =============================================================================
-- Migration 055 — Replace leads RLS with base record access
-- =============================================================================
-- Fase 6B.10 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas e duplicadas de leads.
-- 2. Remover dependência de profiles.company_id, profiles.role e status = 'pool'.
-- 3. Tratar leads como cadastro base, não como operação comercial.
-- 4. Permitir leitura por admin/manager da empresa ou vínculo operacional via sales_cycles.
-- 5. Bloquear insert/delete direto por authenticated.
-- 6. Reduzir grants perigosos de authenticated.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - sales_cycles
-- - lead_profiles
-- - cycle_events
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Helper de leitura do cadastro base do lead
-- =============================================================================
-- Regras:
-- - admin/manager com membership ativa lê qualquer lead da empresa;
-- - vendedor com membership ativa lê lead vinculado a ciclo próprio;
-- - vendedor também lê lead criado/atribuído a ele para compatibilidade;
-- - lead soft-deletado só fica visível para admin/manager;
-- - não usa leads.status;
-- - não usa profiles.company_id;
-- - não usa profiles.role.
--
-- SECURITY DEFINER + row_security off evita dependência circular com RLS de
-- sales_cycles/leads enquanto a Fase 6 está sendo finalizada.
-- =============================================================================

create or replace function public.can_select_lead_base_strict(
  p_company_id uuid,
  p_lead_id uuid,
  p_owner_id uuid,
  p_created_by uuid,
  p_deleted_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select
    public.has_company_membership_strict(p_company_id, array['admin', 'manager'])
    or (
      p_deleted_at is null
      and public.has_company_membership_strict(p_company_id, null)
      and (
        p_owner_id = auth.uid()
        or p_created_by = auth.uid()
        or exists (
          select 1
          from public.sales_cycles sc
          where sc.company_id = p_company_id
            and sc.lead_id = p_lead_id
            and sc.owner_user_id = auth.uid()
        )
      )
    );
$$;

revoke all on function public.can_select_lead_base_strict(uuid, uuid, uuid, uuid, timestamptz)
from public;

revoke all on function public.can_select_lead_base_strict(uuid, uuid, uuid, uuid, timestamptz)
from anon;

grant execute on function public.can_select_lead_base_strict(uuid, uuid, uuid, uuid, timestamptz)
to authenticated, service_role;

-- =============================================================================
-- 2. Helper de escrita do cadastro base do lead
-- =============================================================================
-- Regras:
-- - admin/manager com membership ativa pode atualizar cadastro base da empresa;
-- - vendedor pode atualizar lead não deletado criado/atribuído a ele ou vinculado a ciclo próprio;
-- - insert direto por authenticated será bloqueado por policy separada;
-- - delete direto por authenticated será bloqueado por policy separada.
-- =============================================================================

create or replace function public.can_update_lead_base_strict(
  p_company_id uuid,
  p_lead_id uuid,
  p_owner_id uuid,
  p_created_by uuid,
  p_deleted_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select
    public.has_company_membership_strict(p_company_id, array['admin', 'manager'])
    or (
      p_deleted_at is null
      and public.has_company_membership_strict(p_company_id, null)
      and (
        p_owner_id = auth.uid()
        or p_created_by = auth.uid()
        or exists (
          select 1
          from public.sales_cycles sc
          where sc.company_id = p_company_id
            and sc.lead_id = p_lead_id
            and sc.owner_user_id = auth.uid()
        )
      )
    );
$$;

revoke all on function public.can_update_lead_base_strict(uuid, uuid, uuid, uuid, timestamptz)
from public;

revoke all on function public.can_update_lead_base_strict(uuid, uuid, uuid, uuid, timestamptz)
from anon;

grant execute on function public.can_update_lead_base_strict(uuid, uuid, uuid, uuid, timestamptz)
to authenticated, service_role;

-- =============================================================================
-- 3. Remover policies antigas e duplicadas de leads
-- =============================================================================

drop policy if exists "admin_assigns_pool"
on public.leads;

drop policy if exists "admin_can_read_pool"
on public.leads;

drop policy if exists "allow_delete_leads"
on public.leads;

drop policy if exists "consultor_reads_own_leads"
on public.leads;

drop policy if exists "delete_own_leads"
on public.leads;

drop policy if exists "leads_company_isolation"
on public.leads;

drop policy if exists "leads_delete_own"
on public.leads;

drop policy if exists "leads_insert_own"
on public.leads;

drop policy if exists "leads_insert_seller_private"
on public.leads;

drop policy if exists "leads_select_admin_company"
on public.leads;

drop policy if exists "leads_select_company_admin"
on public.leads;

drop policy if exists "leads_select_own"
on public.leads;

drop policy if exists "leads_select_owner_or_creator"
on public.leads;

drop policy if exists "leads_update_admin_company"
on public.leads;

drop policy if exists "leads_update_company_admin"
on public.leads;

drop policy if exists "leads_update_own"
on public.leads;

-- Remove também policies novas se a migration for reexecutada.

drop policy if exists "leads_select_by_base_record_access"
on public.leads;

drop policy if exists "leads_update_by_base_record_access"
on public.leads;

drop policy if exists "leads_insert_block_authenticated"
on public.leads;

drop policy if exists "leads_delete_block_authenticated"
on public.leads;

-- =============================================================================
-- 4. SELECT — cadastro base visível por acesso operacional
-- =============================================================================

create policy "leads_select_by_base_record_access"
on public.leads
for select
to authenticated
using (
  public.can_select_lead_base_strict(
    company_id,
    id,
    owner_id,
    created_by,
    deleted_at
  )
);

-- =============================================================================
-- 5. UPDATE — cadastro base atualizado por acesso operacional
-- =============================================================================
-- Observação:
-- Este UPDATE não deve ser usado para operação comercial.
-- Operação comercial deve continuar em sales_cycles/cycle_events.
-- =============================================================================

create policy "leads_update_by_base_record_access"
on public.leads
for update
to authenticated
using (
  public.can_update_lead_base_strict(
    company_id,
    id,
    owner_id,
    created_by,
    deleted_at
  )
)
with check (
  public.can_update_lead_base_strict(
    company_id,
    id,
    owner_id,
    created_by,
    deleted_at
  )
);

-- =============================================================================
-- 6. INSERT — bloqueado para authenticated
-- =============================================================================
-- Criação manual/importação deve ocorrer por API server-side/service_role,
-- criando lead base + lead_profile + sales_cycle + cycle_event.
-- =============================================================================

create policy "leads_insert_block_authenticated"
on public.leads
for insert
to authenticated
with check (false);

-- =============================================================================
-- 7. DELETE — bloqueado para authenticated
-- =============================================================================
-- Não deve haver delete físico direto.
-- Soft delete/reativação deve ocorrer por API server-side controlada.
-- =============================================================================

create policy "leads_delete_block_authenticated"
on public.leads
for delete
to authenticated
using (false);

-- =============================================================================
-- 8. Grants
-- =============================================================================
-- Authenticated precisa de SELECT/UPDATE para leitura/edição controlada.
-- INSERT/DELETE/TRIGGER/TRUNCATE/REFERENCES ficam fora do client.
-- service_role permanece com acesso total.
-- =============================================================================

revoke insert, delete, trigger, truncate, references
on table public.leads
from authenticated;

grant select, update
on table public.leads
to authenticated;

grant all privileges
on table public.leads
to service_role;

commit;