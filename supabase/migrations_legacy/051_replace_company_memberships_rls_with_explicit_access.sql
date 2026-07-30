-- =============================================================================
-- Migration 051 — Replace company_memberships RLS with explicit access
-- =============================================================================
-- Fase 6B.6 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas de company_memberships com roles {public}.
-- 2. Criar helpers explícitos para leitura/administração de memberships.
-- 3. Permitir que o usuário leia a própria membership.
-- 4. Permitir que admin/manager leia memberships da própria empresa.
-- 5. Permitir escrita direta apenas para platform_admin ativo.
-- 6. Reduzir grants perigosos de authenticated.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - leads
-- - sales_cycles
-- - profiles
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Helper: platform_admin ativo
-- =============================================================================
-- Platform admin é permissão global da plataforma.
-- Pode continuar vindo de profiles, porque NÃO representa empresa operacional.
-- Não usa profiles.company_id nem profiles.role.
-- =============================================================================

create or replace function public.is_platform_admin_active()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_platform_admin = true
      and coalesce(p.is_active_global, true) = true
  );
$$;

revoke all on function public.is_platform_admin_active()
from public;

revoke all on function public.is_platform_admin_active()
from anon;

grant execute on function public.is_platform_admin_active()
to authenticated, service_role;

-- =============================================================================
-- 2. Helper: leitura segura de company_memberships
-- =============================================================================
-- Regras:
-- - usuário pode ler a própria membership;
-- - admin/manager pode ler memberships da própria empresa;
-- - platform_admin ativo pode ler qualquer membership.
--
-- SECURITY DEFINER + row_security off evita recursão de RLS ao consultar
-- company_memberships dentro de uma policy da própria tabela.
-- =============================================================================

create or replace function public.can_select_company_membership_strict(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select
    p_user_id = auth.uid()
    or public.is_platform_admin_active()
    or exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role = any(array['admin', 'manager'])
    );
$$;

revoke all on function public.can_select_company_membership_strict(uuid, uuid)
from public;

revoke all on function public.can_select_company_membership_strict(uuid, uuid)
from anon;

grant execute on function public.can_select_company_membership_strict(uuid, uuid)
to authenticated, service_role;

-- =============================================================================
-- 3. Remover policies antigas
-- =============================================================================

drop policy if exists "company_memberships_delete_platform_admin"
on public.company_memberships;

drop policy if exists "company_memberships_insert_platform_admin"
on public.company_memberships;

drop policy if exists "company_memberships_select_self_or_platform_admin"
on public.company_memberships;

drop policy if exists "company_memberships_update_platform_admin"
on public.company_memberships;

-- =============================================================================
-- 4. SELECT — próprio usuário, admin/manager da empresa ou platform_admin
-- =============================================================================

create policy "company_memberships_select_explicit_access"
on public.company_memberships
for select
to authenticated
using (
  public.can_select_company_membership_strict(company_id, user_id)
);

-- =============================================================================
-- 5. INSERT/UPDATE/DELETE — somente platform_admin ativo
-- =============================================================================
-- Gestão operacional de vendedores por admin da empresa deve continuar via API/RPC
-- server-side segura. Escrita direta nessa tabela é perigosa.
-- =============================================================================

create policy "company_memberships_insert_platform_admin"
on public.company_memberships
for insert
to authenticated
with check (
  public.is_platform_admin_active()
);

create policy "company_memberships_update_platform_admin"
on public.company_memberships
for update
to authenticated
using (
  public.is_platform_admin_active()
)
with check (
  public.is_platform_admin_active()
);

create policy "company_memberships_delete_platform_admin"
on public.company_memberships
for delete
to authenticated
using (
  public.is_platform_admin_active()
);

-- =============================================================================
-- 6. Grants
-- =============================================================================
-- Authenticated precisa de SELECT.
-- INSERT/UPDATE/DELETE ficam concedidos porque as policies restringem a platform_admin.
-- TRIGGER/TRUNCATE/REFERENCES não devem ficar no client.
-- service_role permanece com acesso total.
-- =============================================================================

revoke trigger, truncate, references
on table public.company_memberships
from authenticated;

grant select, insert, update, delete
on table public.company_memberships
to authenticated;

grant all privileges
on table public.company_memberships
to service_role;

commit;