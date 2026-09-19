-- Yolen Companion V2 - Fase 2
-- Configuração comercial versionada e isolada por empresa.
--
-- Esta migration cria somente a fundação de dados aprovada. Ela não cria tela,
-- não altera o motor V1, não ativa o motor V2 e não aplica mudanças no CRM.

create schema if not exists private;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_company_id_id_unique'
  ) then
    alter table public.products
      add constraint products_company_id_id_unique
      unique (company_id, id);
  end if;
end;
$$;

create table public.company_commercial_config_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  version_number integer not null,
  contract_version text not null default 'phase-2-v1',
  status text not null default 'draft',
  business_description text not null default '',
  target_audience text not null default '',
  value_proposition text not null default '',
  commercial_method_name text not null default '',
  commercial_method_description text not null default '',
  communication_tone text not null default '',
  required_behaviors text[] not null default '{}'::text[],
  prohibited_behaviors text[] not null default '{}'::text[],
  created_by uuid not null,
  published_by uuid,
  archived_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  published_at timestamp with time zone,
  archived_at timestamp with time zone,

  constraint company_commercial_config_versions_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,

  constraint company_commercial_config_versions_created_by_fkey
    foreign key (created_by)
    references auth.users (id)
    on delete restrict,

  constraint company_commercial_config_versions_published_by_fkey
    foreign key (published_by)
    references auth.users (id)
    on delete set null,

  constraint company_commercial_config_versions_archived_by_fkey
    foreign key (archived_by)
    references auth.users (id)
    on delete set null,

  constraint company_commercial_config_versions_company_id_id_unique
    unique (company_id, id),

  constraint company_commercial_config_versions_company_version_unique
    unique (company_id, version_number),

  constraint company_commercial_config_versions_version_check
    check (version_number > 0),

  constraint company_commercial_config_versions_contract_check
    check (contract_version = 'phase-2-v1'),

  constraint company_commercial_config_versions_status_check
    check (status in ('draft', 'published', 'archived')),

  constraint company_commercial_config_versions_state_timestamps_check
    check (
      (
        status = 'draft'
        and published_at is null
        and published_by is null
        and archived_at is null
        and archived_by is null
      )
      or
      (
        status = 'published'
        and published_at is not null
        and published_by is not null
        and archived_at is null
        and archived_by is null
      )
      or
      (
        status = 'archived'
        and published_at is not null
        and published_by is not null
        and archived_at is not null
        and archived_by is not null
      )
    ),

  constraint company_commercial_config_versions_timestamps_check
    check (
      updated_at >= created_at
      and (published_at is null or published_at >= created_at)
      and (archived_at is null or archived_at >= published_at)
    )
);

create unique index company_commercial_config_one_draft_uidx
  on public.company_commercial_config_versions (company_id)
  where status = 'draft';

create unique index company_commercial_config_one_published_uidx
  on public.company_commercial_config_versions (company_id)
  where status = 'published';

create index company_commercial_config_company_status_idx
  on public.company_commercial_config_versions (
    company_id,
    status,
    version_number desc
  );

create index company_commercial_config_created_by_idx
  on public.company_commercial_config_versions (created_by);

create index company_commercial_config_published_by_idx
  on public.company_commercial_config_versions (published_by)
  where published_by is not null;

create index company_commercial_config_archived_by_idx
  on public.company_commercial_config_versions (archived_by)
  where archived_by is not null;

create table public.company_commercial_method_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  config_version_id uuid not null,
  step_order integer not null,
  name text not null,
  objective text not null,
  completion_criteria text[] not null default '{}'::text[],
  recommended_questions text[] not null default '{}'::text[],
  is_required boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint company_commercial_method_steps_config_fkey
    foreign key (company_id, config_version_id)
    references public.company_commercial_config_versions (company_id, id)
    on delete cascade,

  constraint company_commercial_method_steps_company_id_id_unique
    unique (company_id, id),

  constraint company_commercial_method_steps_order_unique
    unique (config_version_id, step_order),

  constraint company_commercial_method_steps_order_check
    check (step_order > 0),

  constraint company_commercial_method_steps_name_check
    check (
      name = btrim(name)
      and char_length(name) between 1 and 120
    ),

  constraint company_commercial_method_steps_objective_check
    check (
      objective = btrim(objective)
      and char_length(objective) between 1 and 2000
    ),

  constraint company_commercial_method_steps_criteria_check
    check (cardinality(completion_criteria) > 0),

  constraint company_commercial_method_steps_timestamps_check
    check (updated_at >= created_at)
);

create index company_commercial_method_steps_config_order_idx
  on public.company_commercial_method_steps (
    company_id,
    config_version_id,
    step_order
  );

create table public.company_commercial_product_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  config_version_id uuid not null,
  product_id uuid not null,
  indicated_audiences text[] not null default '{}'::text[],
  needs_addressed text[] not null default '{}'::text[],
  benefits text[] not null default '{}'::text[],
  verified_differentiators text[] not null default '{}'::text[],
  limitations text[] not null default '{}'::text[],
  contract_conditions text[] not null default '{}'::text[],
  payment_conditions text[] not null default '{}'::text[],
  allowed_claims text[] not null default '{}'::text[],
  forbidden_claims text[] not null default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint company_commercial_product_profiles_config_fkey
    foreign key (company_id, config_version_id)
    references public.company_commercial_config_versions (company_id, id)
    on delete cascade,

  constraint company_commercial_product_profiles_product_fkey
    foreign key (company_id, product_id)
    references public.products (company_id, id)
    on delete restrict,

  constraint company_commercial_product_profiles_company_id_id_unique
    unique (company_id, id),

  constraint company_commercial_product_profiles_product_unique
    unique (config_version_id, product_id),

  constraint company_commercial_product_profiles_needs_check
    check (cardinality(needs_addressed) > 0),

  constraint company_commercial_product_profiles_benefits_check
    check (cardinality(benefits) > 0),

  constraint company_commercial_product_profiles_timestamps_check
    check (updated_at >= created_at)
);

create index company_commercial_product_profiles_config_idx
  on public.company_commercial_product_profiles (
    company_id,
    config_version_id
  );

create index company_commercial_product_profiles_product_idx
  on public.company_commercial_product_profiles (
    company_id,
    product_id
  );

create table public.company_commercial_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  config_version_id uuid not null,
  category text not null,
  fact_key text not null,
  fact_value text not null,
  source_note text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint company_commercial_facts_config_fkey
    foreign key (company_id, config_version_id)
    references public.company_commercial_config_versions (company_id, id)
    on delete cascade,

  constraint company_commercial_facts_company_id_id_unique
    unique (company_id, id),

  constraint company_commercial_facts_key_unique
    unique (config_version_id, category, fact_key),

  constraint company_commercial_facts_category_check
    check (
      category = btrim(category)
      and char_length(category) between 1 and 80
    ),

  constraint company_commercial_facts_key_check
    check (
      fact_key = btrim(fact_key)
      and char_length(fact_key) between 1 and 160
    ),

  constraint company_commercial_facts_value_check
    check (
      fact_value = btrim(fact_value)
      and char_length(fact_value) between 1 and 4000
    ),

  constraint company_commercial_facts_source_note_check
    check (
      source_note is null
      or (
        source_note = btrim(source_note)
        and char_length(source_note) between 1 and 1000
      )
    ),

  constraint company_commercial_facts_timestamps_check
    check (updated_at >= created_at)
);

create index company_commercial_facts_config_idx
  on public.company_commercial_facts (
    company_id,
    config_version_id,
    category
  );

create table public.company_commercial_objection_guides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  config_version_id uuid not null,
  sort_order integer not null,
  objection text not null,
  signals text[] not null default '{}'::text[],
  discovery_questions text[] not null default '{}'::text[],
  recommended_approach text not null,
  response_limits text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint company_commercial_objection_guides_config_fkey
    foreign key (company_id, config_version_id)
    references public.company_commercial_config_versions (company_id, id)
    on delete cascade,

  constraint company_commercial_objection_guides_company_id_id_unique
    unique (company_id, id),

  constraint company_commercial_objection_guides_order_unique
    unique (config_version_id, sort_order),

  constraint company_commercial_objection_guides_order_check
    check (sort_order > 0),

  constraint company_commercial_objection_guides_objection_check
    check (
      objection = btrim(objection)
      and char_length(objection) between 1 and 500
    ),

  constraint company_commercial_objection_guides_approach_check
    check (
      recommended_approach = btrim(recommended_approach)
      and char_length(recommended_approach) between 1 and 4000
    ),

  constraint company_commercial_objection_guides_timestamps_check
    check (updated_at >= created_at)
);

create index company_commercial_objection_guides_config_order_idx
  on public.company_commercial_objection_guides (
    company_id,
    config_version_id,
    sort_order
  );

create or replace function private.guard_company_commercial_config_version()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Uma configuração comercial deve nascer como rascunho';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(new.company_id::text, 0)
    );

    select coalesce(max(v.version_number), 0) + 1
      into new.version_number
    from public.company_commercial_config_versions v
    where v.company_id = new.company_id;

    new.created_by := coalesce(new.created_by, v_actor);

    if new.created_by is null then
      raise exception 'Usuário criador obrigatório';
    end if;

    new.published_by := null;
    new.archived_by := null;
    new.published_at := null;
    new.archived_at := null;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := new.created_at;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Versões publicadas ou arquivadas são imutáveis';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.version_number is distinct from old.version_number
    or new.contract_version is distinct from old.contract_version
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Identidade e autoria da versão são imutáveis';
  end if;

  if old.status = 'archived' then
    raise exception 'Versões arquivadas são imutáveis';
  end if;

  if old.status = 'published' then
    if new.status <> 'archived' then
      raise exception 'Versão publicada só pode avançar para arquivada';
    end if;

    if new.business_description is distinct from old.business_description
      or new.target_audience is distinct from old.target_audience
      or new.value_proposition is distinct from old.value_proposition
      or new.commercial_method_name is distinct from old.commercial_method_name
      or new.commercial_method_description
        is distinct from old.commercial_method_description
      or new.communication_tone is distinct from old.communication_tone
      or new.required_behaviors is distinct from old.required_behaviors
      or new.prohibited_behaviors is distinct from old.prohibited_behaviors
      or new.published_by is distinct from old.published_by
      or new.published_at is distinct from old.published_at
    then
      raise exception 'Conteúdo publicado é imutável';
    end if;

    new.archived_by := coalesce(v_actor, new.archived_by);
    if new.archived_by is null then
      raise exception 'Usuário responsável pelo arquivamento obrigatório';
    end if;
    new.archived_at := now();
    new.updated_at := new.archived_at;
    return new;
  end if;

  if new.status = 'draft' then
    new.published_by := null;
    new.archived_by := null;
    new.published_at := null;
    new.archived_at := null;
    new.updated_at := now();
    return new;
  end if;

  if new.status <> 'published' then
    raise exception 'Rascunho só pode permanecer rascunho ou ser publicado';
  end if;

  if nullif(btrim(new.business_description), '') is null
    or nullif(btrim(new.target_audience), '') is null
    or nullif(btrim(new.value_proposition), '') is null
    or nullif(btrim(new.commercial_method_name), '') is null
    or nullif(btrim(new.commercial_method_description), '') is null
    or nullif(btrim(new.communication_tone), '') is null
  then
    raise exception 'Contexto, método e tom são obrigatórios para publicar';
  end if;

  if cardinality(new.required_behaviors) = 0
    or cardinality(new.prohibited_behaviors) = 0
  then
    raise exception 'Diretrizes obrigatórias e proibidas devem ser informadas';
  end if;

  if exists (
    select 1
    from unnest(
      new.required_behaviors || new.prohibited_behaviors
    ) as item(value)
    where nullif(btrim(item.value), '') is null
  ) then
    raise exception 'Diretrizes não podem conter valores vazios';
  end if;

  if not exists (
    select 1
    from public.company_commercial_method_steps s
    where s.company_id = new.company_id
      and s.config_version_id = new.id
  ) then
    raise exception 'Ao menos uma etapa do método é obrigatória';
  end if;

  if exists (
    select 1
    from public.company_commercial_method_steps s
    cross join lateral unnest(
      s.completion_criteria || s.recommended_questions
    ) as item(value)
    where s.company_id = new.company_id
      and s.config_version_id = new.id
      and nullif(btrim(item.value), '') is null
  ) then
    raise exception 'Etapas do método não podem conter valores vazios';
  end if;

  if exists (
    select 1
    from public.products p
    where p.company_id = new.company_id
      and p.active = true
      and not exists (
        select 1
        from public.company_commercial_product_profiles pp
        where pp.company_id = new.company_id
          and pp.config_version_id = new.id
          and pp.product_id = p.id
      )
  ) then
    raise exception 'Todo produto ativo precisa de perfil comercial';
  end if;

  if exists (
    select 1
    from public.company_commercial_product_profiles pp
    cross join lateral unnest(
      pp.indicated_audiences
      || pp.needs_addressed
      || pp.benefits
      || pp.verified_differentiators
      || pp.limitations
      || pp.contract_conditions
      || pp.payment_conditions
      || pp.allowed_claims
      || pp.forbidden_claims
    ) as item(value)
    where pp.company_id = new.company_id
      and pp.config_version_id = new.id
      and nullif(btrim(item.value), '') is null
  ) then
    raise exception 'Perfis de produto não podem conter valores vazios';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.company_id::text, 0)
  );

  update public.company_commercial_config_versions current_version
     set status = 'archived',
         archived_by = v_actor,
         archived_at = now(),
         updated_at = now()
   where current_version.company_id = new.company_id
     and current_version.status = 'published'
     and current_version.id <> new.id;

  new.published_by := coalesce(v_actor, new.published_by);
  if new.published_by is null then
    raise exception 'Usuário responsável pela publicação obrigatório';
  end if;
  new.published_at := now();
  new.archived_by := null;
  new.archived_at := null;
  new.updated_at := new.published_at;
  return new;
end;
$$;

create trigger guard_company_commercial_config_version
before insert or update or delete
on public.company_commercial_config_versions
for each row
execute function private.guard_company_commercial_config_version();

create or replace function private.guard_company_commercial_config_child()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_company_id uuid;
  v_config_version_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_config_version_id := old.config_version_id;
  else
    v_company_id := new.company_id;
    v_config_version_id := new.config_version_id;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.config_version_id is distinct from old.config_version_id
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Identidade do item de configuração é imutável';
  end if;

  select v.status
    into v_status
  from public.company_commercial_config_versions v
  where v.company_id = v_company_id
    and v.id = v_config_version_id;

  if v_status is distinct from 'draft' then
    raise exception 'Itens só podem ser alterados em uma versão rascunho';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_company_commercial_method_step
before insert or update or delete
on public.company_commercial_method_steps
for each row
execute function private.guard_company_commercial_config_child();

create trigger guard_company_commercial_product_profile
before insert or update or delete
on public.company_commercial_product_profiles
for each row
execute function private.guard_company_commercial_config_child();

create trigger guard_company_commercial_fact
before insert or update or delete
on public.company_commercial_facts
for each row
execute function private.guard_company_commercial_config_child();

create trigger guard_company_commercial_objection_guide
before insert or update or delete
on public.company_commercial_objection_guides
for each row
execute function private.guard_company_commercial_config_child();

create or replace function private.has_company_commercial_access(
  p_company_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and (
          p_roles is null
          or cm.role = any(p_roles)
        )
    )
$$;

alter table public.company_commercial_config_versions
  enable row level security;
alter table public.company_commercial_config_versions
  force row level security;

alter table public.company_commercial_method_steps
  enable row level security;
alter table public.company_commercial_method_steps
  force row level security;

alter table public.company_commercial_product_profiles
  enable row level security;
alter table public.company_commercial_product_profiles
  force row level security;

alter table public.company_commercial_facts
  enable row level security;
alter table public.company_commercial_facts
  force row level security;

alter table public.company_commercial_objection_guides
  enable row level security;
alter table public.company_commercial_objection_guides
  force row level security;

create policy company_commercial_config_versions_select
  on public.company_commercial_config_versions
  for select
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    or (
      status = 'published'
      and (
        select private.has_company_commercial_access(company_id)
      )
    )
  );

create policy company_commercial_config_versions_insert
  on public.company_commercial_config_versions
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

create policy company_commercial_config_versions_update
  on public.company_commercial_config_versions
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

create policy company_commercial_config_versions_delete
  on public.company_commercial_config_versions
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

create policy company_commercial_method_steps_select
  on public.company_commercial_method_steps
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
    )
  );

create policy company_commercial_method_steps_write
  on public.company_commercial_method_steps
  for all
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_product_profiles_select
  on public.company_commercial_product_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
    )
  );

create policy company_commercial_product_profiles_write
  on public.company_commercial_product_profiles
  for all
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_facts_select
  on public.company_commercial_facts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
    )
  );

create policy company_commercial_facts_write
  on public.company_commercial_facts
  for all
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_objection_guides_select
  on public.company_commercial_objection_guides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
    )
  );

create policy company_commercial_objection_guides_write
  on public.company_commercial_objection_guides
  for all
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
        and v.status = 'draft'
    )
  );

revoke all on table
  public.company_commercial_config_versions,
  public.company_commercial_method_steps,
  public.company_commercial_product_profiles,
  public.company_commercial_facts,
  public.company_commercial_objection_guides
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.company_commercial_config_versions,
  public.company_commercial_method_steps,
  public.company_commercial_product_profiles,
  public.company_commercial_facts,
  public.company_commercial_objection_guides
to authenticated;

grant select, insert, update, delete on table
  public.company_commercial_config_versions,
  public.company_commercial_method_steps,
  public.company_commercial_product_profiles,
  public.company_commercial_facts,
  public.company_commercial_objection_guides
to service_role;

revoke all on function
  private.has_company_commercial_access(uuid, text[]),
  private.guard_company_commercial_config_version(),
  private.guard_company_commercial_config_child()
from public, anon, authenticated, service_role;

grant execute on function
  private.has_company_commercial_access(uuid, text[])
to authenticated;

comment on table public.company_commercial_config_versions is
  'Versões auditáveis do conhecimento comercial de cada empresa.';

comment on column public.company_commercial_config_versions.status is
  'Fluxo imutável draft -> published -> archived; somente uma versão publicada por empresa.';

comment on table public.company_commercial_method_steps is
  'Etapas do método comercial, independentes das etapas do CRM.';

comment on table public.company_commercial_product_profiles is
  'Conhecimento comercial versionado vinculado ao catálogo public.products.';

comment on table public.company_commercial_facts is
  'Fatos oficiais da empresa que a inteligência pode utilizar sem inventar.';

comment on table public.company_commercial_objection_guides is
  'Orientações contextuais e limites para objeções recorrentes da empresa.';

comment on function private.has_company_commercial_access(uuid, text[]) is
  'Autorização interna por vínculo ativo; não é exposta como RPC.';
