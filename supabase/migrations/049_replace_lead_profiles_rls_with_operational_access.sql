-- =============================================================================
-- Migration 049 — Replace lead_profiles RLS with operational access
-- =============================================================================
-- Fase 6B.4 — RLS e grants das tabelas principais
--
-- Objetivo:
-- 1. Remover policies antigas de lead_profiles.
-- 2. Substituir profiles.company_id, current_company_id(), is_admin() e roles {public}.
-- 3. Aplicar acesso por company_memberships + vínculo operacional em sales_cycles.
-- 4. Permitir leitura/edição para admin/manager da empresa.
-- 5. Permitir leitura/edição para vendedor dono de ciclo do lead.
-- 6. Reduzir grants perigosos de authenticated.
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
-- 1. Helper de acesso operacional ao lead_profile
-- =============================================================================
-- Regra:
-- - admin/manager com membership ativa na empresa pode acessar.
-- - vendedor com membership ativa pode acessar se possuir ciclo daquele lead.
-- - lead_id precisa pertencer à mesma company_id informada.
-- - vendedor não acessa lead soft-deletado.
--
-- SECURITY DEFINER + row_security off evita que este helper dependa das
-- policies antigas de leads/sales_cycles enquanto a Fase 6 ainda está em andamento.
-- =============================================================================

create or replace function public.can_access_lead_profile_strict(
  p_company_id uuid,
  p_lead_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.company_id = p_company_id
      and (
        public.has_company_membership_strict(p_company_id, array['admin', 'manager'])
        or (
          l.deleted_at is null
          and public.has_company_membership_strict(p_company_id, null)
          and exists (
            select 1
            from public.sales_cycles sc
            where sc.company_id = p_company_id
              and sc.lead_id = p_lead_id
              and sc.owner_user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function public.can_access_lead_profile_strict(uuid, uuid)
from public;

revoke all on function public.can_access_lead_profile_strict(uuid, uuid)
from anon;

grant execute on function public.can_access_lead_profile_strict(uuid, uuid)
to authenticated, service_role;

-- =============================================================================
-- 2. Remover policies antigas de lead_profiles
-- =============================================================================

drop policy if exists "allow_insert_lead_profiles"
on public.lead_profiles;

drop policy if exists "allow_select_lead_profiles"
on public.lead_profiles;

drop policy if exists "allow_update_lead_profiles"
on public.lead_profiles;

drop policy if exists "lead_profiles_delete_via_cycle_access"
on public.lead_profiles;

drop policy if exists "lead_profiles_insert_via_cycle_access"
on public.lead_profiles;

drop policy if exists "lead_profiles_select_via_cycle_access"
on public.lead_profiles;

drop policy if exists "lead_profiles_update_via_cycle_access"
on public.lead_profiles;

-- =============================================================================
-- 3. SELECT — admin/manager da empresa ou dono de ciclo do lead
-- =============================================================================

create policy "lead_profiles_select_by_operational_access"
on public.lead_profiles
for select
to authenticated
using (
  public.can_access_lead_profile_strict(company_id, lead_id)
);

-- =============================================================================
-- 4. INSERT — admin/manager da empresa ou dono de ciclo do lead
-- =============================================================================
-- Na criação manual/importação, o app usa service_role.
-- Esta policy mantém compatibilidade caso algum fluxo autenticado precise inserir.
-- =============================================================================

create policy "lead_profiles_insert_by_operational_access"
on public.lead_profiles
for insert
to authenticated
with check (
  public.can_access_lead_profile_strict(company_id, lead_id)
);

-- =============================================================================
-- 5. UPDATE — admin/manager da empresa ou dono de ciclo do lead
-- =============================================================================
-- Necessário porque EditLeadProfileModal atualiza lead_profiles diretamente
-- pelo client autenticado filtrando lead_id e company_id.
-- =============================================================================

create policy "lead_profiles_update_by_operational_access"
on public.lead_profiles
for update
to authenticated
using (
  public.can_access_lead_profile_strict(company_id, lead_id)
)
with check (
  public.can_access_lead_profile_strict(company_id, lead_id)
);

-- =============================================================================
-- 6. Grants
-- =============================================================================
-- Authenticated não precisa de DELETE, TRIGGER, TRUNCATE nem REFERENCES.
-- SELECT/INSERT/UPDATE ficam preservados e controlados por RLS.
-- DELETE fica apenas para service_role.
-- =============================================================================

revoke delete, trigger, truncate, references
on table public.lead_profiles
from authenticated;

grant select, insert, update
on table public.lead_profiles
to authenticated;

grant all privileges
on table public.lead_profiles
to service_role;

commit;