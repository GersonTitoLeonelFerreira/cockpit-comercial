-- Yolen — ONDA 8 / FASE 1
-- Rascunho do Construtor Assistido de Método Comercial.
--
-- Esta tabela guarda a matéria-prima do diagnóstico da operação antes da
-- transformação em commercial-method-v2. Ela não publica configuração, não
-- cria etapas do método e não altera o contrato consumido pelo Companion.

create table public.company_commercial_method_builder_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  contract_version text not null default 'commercial-method-builder-v1',
  current_step smallint not null default 1,
  completed_steps smallint[] not null default '{}'::smallint[],
  ready_for_method boolean not null default false,
  draft_data jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint company_commercial_method_builder_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,

  constraint company_commercial_method_builder_created_by_fkey
    foreign key (created_by)
    references auth.users (id)
    on delete restrict,

  constraint company_commercial_method_builder_updated_by_fkey
    foreign key (updated_by)
    references auth.users (id)
    on delete restrict,

  constraint company_commercial_method_builder_company_unique
    unique (company_id),

  constraint company_commercial_method_builder_contract_check
    check (contract_version = 'commercial-method-builder-v1'),

  constraint company_commercial_method_builder_step_check
    check (current_step between 1 and 4),

  constraint company_commercial_method_builder_completed_steps_check
    check (
      completed_steps <@ array[1, 2, 3, 4]::smallint[]
    ),

  constraint company_commercial_method_builder_draft_data_check
    check (jsonb_typeof(draft_data) = 'object'),

  constraint company_commercial_method_builder_ready_check
    check (
      ready_for_method = false
      or (
        current_step = 4
        and completed_steps @> array[1, 2, 3]::smallint[]
      )
    ),

  constraint company_commercial_method_builder_timestamps_check
    check (updated_at >= created_at)
);

create index company_commercial_method_builder_updated_idx
  on public.company_commercial_method_builder_drafts (
    company_id,
    updated_at desc
  );

create or replace function private.guard_company_commercial_method_builder_draft()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Usuário autenticado obrigatório';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, v_actor);
    new.updated_by := v_actor;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := new.created_at;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.contract_version is distinct from old.contract_version
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Identidade do rascunho assistido é imutável';
  end if;

  new.updated_by := v_actor;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_company_commercial_method_builder_draft
before insert or update
on public.company_commercial_method_builder_drafts
for each row
execute function private.guard_company_commercial_method_builder_draft();

alter table public.company_commercial_method_builder_drafts
  enable row level security;

alter table public.company_commercial_method_builder_drafts
  force row level security;

create policy company_commercial_method_builder_select
  on public.company_commercial_method_builder_drafts
  for select
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
  );

create policy company_commercial_method_builder_insert
  on public.company_commercial_method_builder_drafts
  for insert
  to authenticated
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
  );

create policy company_commercial_method_builder_update
  on public.company_commercial_method_builder_drafts
  for update
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
  );

create policy company_commercial_method_builder_delete
  on public.company_commercial_method_builder_drafts
  for delete
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
  );

revoke all on table public.company_commercial_method_builder_drafts from anon;
grant select, insert, update, delete
  on table public.company_commercial_method_builder_drafts
  to authenticated;
grant all
  on table public.company_commercial_method_builder_drafts
  to service_role;
