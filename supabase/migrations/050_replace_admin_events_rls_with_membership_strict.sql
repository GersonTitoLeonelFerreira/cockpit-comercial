-- =============================================================================
-- Migration 050 — Replace admin_events RLS with strict company membership
-- =============================================================================
-- Fase 6B.5 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas de admin_events.
-- 2. Substituir current_company_id(), is_admin() e roles {public}.
-- 3. Permitir leitura apenas para admin/manager da empresa.
-- 4. Bloquear escrita direta por authenticated.
-- 5. Preservar service_role para escrita server-side/auditoria.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - leads
-- - sales_cycles
-- - cycle_events
-- - lead_profiles
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Remover policies antigas
-- =============================================================================

drop policy if exists "admin_events_no_direct_writes"
on public.admin_events;

drop policy if exists "admin_events_select_same_company_admin"
on public.admin_events;

-- =============================================================================
-- 2. SELECT — somente admin/manager da empresa
-- =============================================================================
-- admin_events é tabela de auditoria administrativa.
-- Membro comum não deve consultar eventos administrativos da empresa.

create policy "admin_events_select_by_admin_or_manager"
on public.admin_events
for select
to authenticated
using (
  public.has_company_membership_strict(company_id, array['admin', 'manager'])
);

-- =============================================================================
-- 3. Bloqueio explícito de escrita direta por authenticated
-- =============================================================================
-- Escrita em admin_events deve ocorrer por API server-side, RPC segura ou service_role.
-- O client autenticado não deve inserir, alterar nem apagar eventos de auditoria.

create policy "admin_events_insert_block_authenticated"
on public.admin_events
for insert
to authenticated
with check (false);

create policy "admin_events_update_block_authenticated"
on public.admin_events
for update
to authenticated
using (false)
with check (false);

create policy "admin_events_delete_block_authenticated"
on public.admin_events
for delete
to authenticated
using (false);

-- =============================================================================
-- 4. Grants
-- =============================================================================
-- Authenticated só precisa de SELECT, controlado por RLS.
-- Escrita direta fica fora do client.
-- service_role permanece com acesso total para auditoria server-side.

revoke insert, update, delete, trigger, truncate, references
on table public.admin_events
from authenticated;

grant select
on table public.admin_events
to authenticated;

grant all privileges
on table public.admin_events
to service_role;

commit;