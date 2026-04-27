-- =============================================================================
-- 027 — Calendário operacional do Simulador de Meta
-- Salva exceções de dias de execução por empresa e período.
-- =============================================================================

create table if not exists public.execution_day_calendars (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,

  period_start date not null,
  period_end date not null,

  execution_day_overrides jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint execution_day_calendars_period_check
    check (period_end >= period_start),

  constraint execution_day_calendars_overrides_object_check
    check (jsonb_typeof(execution_day_overrides) = 'object'),

  constraint execution_day_calendars_unique_period
    unique (company_id, period_start, period_end)
);

create index if not exists execution_day_calendars_company_period_idx
  on public.execution_day_calendars (company_id, period_start, period_end);

create index if not exists execution_day_calendars_company_idx
  on public.execution_day_calendars (company_id);

-- =============================================================================
-- Foreign key opcional para companies
-- Só cria a FK se public.companies existir.
-- Isso evita quebra em ambientes onde a base inicial foi criada fora das migrations.
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'companies'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where constraint_schema = 'public'
        and table_name = 'execution_day_calendars'
        and constraint_name = 'execution_day_calendars_company_id_fkey'
    ) then
      alter table public.execution_day_calendars
        add constraint execution_day_calendars_company_id_fkey
        foreign key (company_id)
        references public.companies(id)
        on delete cascade;
    end if;
  end if;
end;
$$;

-- =============================================================================
-- Trigger para updated_at
-- =============================================================================

create or replace function public.set_execution_day_calendars_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_execution_day_calendars_updated_at
  on public.execution_day_calendars;

create trigger trg_execution_day_calendars_updated_at
before update on public.execution_day_calendars
for each row
execute function public.set_execution_day_calendars_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.execution_day_calendars enable row level security;

-- Usuários autenticados da empresa podem visualizar o calendário da própria empresa.
drop policy if exists "execution_day_calendars_select_company_users"
  on public.execution_day_calendars;

create policy "execution_day_calendars_select_company_users"
on public.execution_day_calendars
for select
to authenticated
using (
  company_id = public.current_company_id()
);

-- Apenas admin da empresa pode criar calendário oficial.
drop policy if exists "execution_day_calendars_insert_company_admins"
  on public.execution_day_calendars;

create policy "execution_day_calendars_insert_company_admins"
on public.execution_day_calendars
for insert
to authenticated
with check (
  public.is_admin()
  and company_id = public.current_company_id()
);

-- Apenas admin da empresa pode atualizar calendário oficial.
drop policy if exists "execution_day_calendars_update_company_admins"
  on public.execution_day_calendars;

create policy "execution_day_calendars_update_company_admins"
on public.execution_day_calendars
for update
to authenticated
using (
  public.is_admin()
  and company_id = public.current_company_id()
)
with check (
  public.is_admin()
  and company_id = public.current_company_id()
);

-- Apenas admin da empresa pode apagar calendário oficial.
drop policy if exists "execution_day_calendars_delete_company_admins"
  on public.execution_day_calendars;

create policy "execution_day_calendars_delete_company_admins"
on public.execution_day_calendars
for delete
to authenticated
using (
  public.is_admin()
  and company_id = public.current_company_id()
);