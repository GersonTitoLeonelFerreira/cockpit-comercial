-- =============================================================================
-- Migration 052 — Replace profiles RLS with global profile access
-- =============================================================================
-- Fase 6B.7 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas de profiles com roles {public}.
-- 2. Remover dependência de profiles.company_id, profiles.role e current_role().
-- 3. Tratar profiles como perfil global da pessoa.
-- 4. Permitir que o usuário leia/atualize o próprio profile.
-- 5. Permitir que admin/manager leia profiles de usuários da mesma empresa.
-- 6. Permitir que platform_admin ativo leia profiles globalmente.
-- 7. Bloquear insert/delete direto por authenticated.
--
-- Esta migration NÃO mexe em:
-- - supabase/migrations/031_revenue_sales_details_by_day.sql
-- - company_memberships
-- - leads
-- - sales_cycles
-- - revenue
-- - user_code
-- =============================================================================

begin;

-- =============================================================================
-- 1. Helper: acesso de leitura ao profile global
-- =============================================================================
-- Regras:
-- - usuário lê o próprio profile;
-- - platform_admin ativo lê qualquer profile;
-- - admin/manager lê profiles de usuários com membership na mesma empresa;
-- - não usa profiles.company_id;
-- - não usa profiles.role;
-- - não usa current_company_id().
--
-- SECURITY DEFINER + row_security off evita recursão e dependência das policies
-- em transição durante a Fase 6.
-- =============================================================================

create or replace function public.can_select_profile_strict(
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select
    p_profile_id = auth.uid()
    or public.is_platform_admin_active()
    or exists (
      select 1
      from public.company_memberships actor_cm
      join public.company_memberships target_cm
        on target_cm.company_id = actor_cm.company_id
      where actor_cm.user_id = auth.uid()
        and actor_cm.is_active = true
        and actor_cm.role = any(array['admin', 'manager'])
        and target_cm.user_id = p_profile_id
        and target_cm.is_active = true
    );
$$;

revoke all on function public.can_select_profile_strict(uuid)
from public;

revoke all on function public.can_select_profile_strict(uuid)
from anon;

grant execute on function public.can_select_profile_strict(uuid)
to authenticated, service_role;

-- =============================================================================
-- 2. Remover policies antigas e policies novas se a migration for reexecutada
-- =============================================================================
-- As policies novas também são removidas antes da recriação para evitar erro:
-- ERROR 42710: policy already exists

drop policy if exists "profiles_select_company_admin"
on public.profiles;

drop policy if exists "profiles_select_own"
on public.profiles;

drop policy if exists "profiles_select_self"
on public.profiles;

drop policy if exists "profiles_update_own"
on public.profiles;

drop policy if exists "profiles_select_by_global_access"
on public.profiles;

drop policy if exists "profiles_insert_block_authenticated"
on public.profiles;

drop policy if exists "profiles_delete_block_authenticated"
on public.profiles;

-- =============================================================================
-- 3. SELECT — perfil próprio, admin/manager da mesma empresa ou platform_admin
-- =============================================================================

create policy "profiles_select_by_global_access"
on public.profiles
for select
to authenticated
using (
  public.can_select_profile_strict(id)
);

-- =============================================================================
-- 4. UPDATE — usuário atualiza apenas o próprio profile
-- =============================================================================
-- Não permitir que admin/manager atualize profiles diretamente por RLS.
-- Alterações administrativas devem continuar por API/RPC server-side segura.
-- =============================================================================

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
)
with check (
  id = (select auth.uid())
);

-- =============================================================================
-- 5. Bloquear insert/delete direto por authenticated
-- =============================================================================
-- Criação de profile deve vir de trigger/service_role/fluxo server-side.
-- Exclusão de profile não deve ser ação direta do client.
-- =============================================================================

create policy "profiles_insert_block_authenticated"
on public.profiles
for insert
to authenticated
with check (false);

create policy "profiles_delete_block_authenticated"
on public.profiles
for delete
to authenticated
using (false);

-- =============================================================================
-- 6. Grants
-- =============================================================================
-- Authenticated precisa de SELECT e UPDATE.
-- INSERT/DELETE/TRIGGER/TRUNCATE/REFERENCES ficam fora do client.
-- service_role permanece com acesso total.
-- =============================================================================

revoke insert, delete, trigger, truncate, references
on table public.profiles
from authenticated;

grant select, update
on table public.profiles
to authenticated;

grant all privileges
on table public.profiles
to service_role;

commit;