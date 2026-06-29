begin;

-- ============================================================================
-- Migration 089: Corrige RLS do calendário operacional para multiempresa
-- Fonte oficial de permissão: company_memberships
-- ============================================================================
-- Problema corrigido:
-- As policies antigas dependiam de current_company_id() e is_admin().
-- Em usuário com mais de uma membership ativa, current_company_id() retorna null
-- e bloqueia a criação ou edição do calendário operacional.
--
-- Esta migration também remove policies novas que possam ter sido criadas
-- anteriormente, evitando erro de duplicidade ao recriar as regras corretas.
-- ============================================================================

alter table public.execution_day_calendars enable row level security;

-- Policies antigas
drop policy if exists "execution_day_calendars_select_company_users"
  on public.execution_day_calendars;

drop policy if exists "execution_day_calendars_insert_company_admins"
  on public.execution_day_calendars;

drop policy if exists "execution_day_calendars_update_company_admins"
  on public.execution_day_calendars;

drop policy if exists "execution_day_calendars_delete_company_admins"
  on public.execution_day_calendars;

-- Policies novas que podem já existir por tentativa anterior
drop policy if exists "execution_day_calendars_select_company_members"
  on public.execution_day_calendars;

drop policy if exists "execution_day_calendars_insert_company_members_admins"
  on public.execution_day_calendars;

drop policy if exists "execution_day_calendars_update_company_members_admins"
  on public.execution_day_calendars;

drop policy if exists "execution_day_calendars_delete_company_members_admins"
  on public.execution_day_calendars;

-- Leitura:
-- Qualquer usuário ativo vinculado à empresa do calendário pode consultar.
create policy "execution_day_calendars_select_company_members"
on public.execution_day_calendars
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = execution_day_calendars.company_id
      and cm.user_id = auth.uid()
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
  )
);

-- Criação:
-- Apenas admin ativo da própria empresa pode criar calendário.
create policy "execution_day_calendars_insert_company_members_admins"
on public.execution_day_calendars
for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = execution_day_calendars.company_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
  )
);

-- Atualização:
-- Apenas admin ativo da própria empresa pode atualizar calendário.
create policy "execution_day_calendars_update_company_members_admins"
on public.execution_day_calendars
for update
to authenticated
using (
  exists (
    select 1
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = execution_day_calendars.company_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
  )
)
with check (
  exists (
    select 1
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = execution_day_calendars.company_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
  )
);

-- Exclusão:
-- Apenas admin ativo da própria empresa pode excluir calendário.
create policy "execution_day_calendars_delete_company_members_admins"
on public.execution_day_calendars
for delete
to authenticated
using (
  exists (
    select 1
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = execution_day_calendars.company_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
  )
);

commit;