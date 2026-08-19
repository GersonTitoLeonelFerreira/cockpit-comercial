-- ============================================================================
-- Yolen — Trilha A / A1.4
-- Persistência versionada de fatos comerciais oficiais V2.
--
-- Compatibilidade:
-- - fatos existentes permanecem commercial-fact-v1 / definition null;
-- - commercial-fact-v2 possui definição semântica congelada;
-- - category/fact_key/fact_value continuam como projeção legada;
-- - nenhuma linha existente é convertida automaticamente.
-- ============================================================================

alter table public.company_commercial_facts
  add column commercial_fact_contract_version text
  not null
  default 'commercial-fact-v1';

alter table public.company_commercial_facts
  add column commercial_fact_definition jsonb;

alter table public.company_commercial_facts
  add constraint company_commercial_facts_contract_check
  check (
    commercial_fact_contract_version in (
      'commercial-fact-v1',
      'commercial-fact-v2'
    )
  );

alter table public.company_commercial_facts
  add constraint company_commercial_facts_definition_check
  check (
    (
      commercial_fact_contract_version =
        'commercial-fact-v1'
      and commercial_fact_definition is null
    )
    or
    (
      commercial_fact_contract_version =
        'commercial-fact-v2'
      and commercial_fact_definition is not null
      and jsonb_typeof(
        commercial_fact_definition
      ) = 'object'
    )
  );

-- ============================================================================
-- Helpers semânticos.
-- ============================================================================

create or replace function
private.commercial_fact_nullable_text_valid(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null then
    return false;
  end if;

  if p_value = 'null'::jsonb then
    return true;
  end if;

  return
    jsonb_typeof(p_value) = 'string'
    and nullif(
      btrim(
        p_value #>> '{}'
      ),
      ''
    ) is not null;
end;
$$;

revoke all
on function
private.commercial_fact_nullable_text_valid(jsonb)
from public, anon, authenticated, service_role;

create or replace function
private.commercial_fact_timestamptz_valid(
  p_value jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_value is null
    or jsonb_typeof(p_value) <> 'string'
    or nullif(
      btrim(
        p_value #>> '{}'
      ),
      ''
    ) is null
  then
    return false;
  end if;

  perform
    (p_value #>> '{}')::timestamptz;

  return true;

exception
  when others then
    return false;
end;
$$;

revoke all
on function
private.commercial_fact_timestamptz_valid(jsonb)
from public, anon, authenticated, service_role;

create or replace function
private.commercial_fact_uuid_valid(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null
    or jsonb_typeof(p_value) <> 'string'
    or nullif(
      btrim(
        p_value #>> '{}'
      ),
      ''
    ) is null
  then
    return false;
  end if;

  perform
    (p_value #>> '{}')::uuid;

  return true;

exception
  when others then
    return false;
end;
$$;

revoke all
on function
private.commercial_fact_uuid_valid(jsonb)
from public, anon, authenticated, service_role;

create or replace function
private.commercial_fact_text_array_valid(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null
    or jsonb_typeof(p_value) <> 'array'
  then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      p_value
    ) as item(value)
    where jsonb_typeof(
      item.value
    ) <> 'string'
      or nullif(
        btrim(
          item.value #>> '{}'
        ),
        ''
      ) is null
  ) then
    return false;
  end if;

  if exists (
    select 1
    from (
      select
        lower(
          btrim(
            item.value #>> '{}'
          )
        ) as normalized_value
      from jsonb_array_elements(
        p_value
      ) as item(value)
      group by
        lower(
          btrim(
            item.value #>> '{}'
          )
        )
      having count(*) > 1
    ) duplicated
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all
on function
private.commercial_fact_text_array_valid(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Validador do commercial-fact-v2.
-- ============================================================================

create or replace function
private.validate_commercial_fact_v2_definition(
  p_definition jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scope jsonb;
  v_scope_type text;
  v_validity jsonb;
  v_validity_mode text;
  v_source jsonb;
  v_source_type text;
begin
  if p_definition is null
    or jsonb_typeof(
      p_definition
    ) <> 'object'
  then
    raise exception
      'A definição do fato oficial V2 precisa ser um objeto';
  end if;

  if p_definition ->>
    'contract_version'
    is distinct from
    'commercial-fact-v2'
  then
    raise exception
      'A definição do fato oficial possui versão incompatível';
  end if;

  if p_definition ->>
    'fact_kind'
    is distinct from
    'official'
  then
    raise exception
      'Fatos V2 precisam possuir fact_kind=official';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'category',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'category'
      )
    ) > 80
  then
    raise exception
      'A categoria do fato oficial é inválida';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'fact_key',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'fact_key'
      )
    ) > 160
  then
    raise exception
      'A identificação do fato oficial é inválida';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'fact_value',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'fact_value'
      )
    ) > 4000
  then
    raise exception
      'O valor do fato oficial é inválido';
  end if;

  if not private.commercial_fact_text_array_valid(
    p_definition -> 'conditions'
  ) then
    raise exception
      'As condições do fato oficial são inválidas';
  end if;

  if not private.commercial_fact_text_array_valid(
    p_definition -> 'limitations'
  ) then
    raise exception
      'As limitações do fato oficial são inválidas';
  end if;

  -- --------------------------------------------------------------------------
  -- Escopo.
  -- --------------------------------------------------------------------------

  v_scope :=
    p_definition -> 'scope';

  if v_scope is null
    or jsonb_typeof(
      v_scope
    ) <> 'object'
  then
    raise exception
      'O escopo do fato oficial precisa ser um objeto';
  end if;

  if not (
    v_scope ? 'product_id'
  )
    or not (
      v_scope ? 'variant_key'
    )
    or not (
      v_scope ? 'reference_key'
    )
  then
    raise exception
      'O escopo do fato oficial precisa declarar todas as referências';
  end if;

  v_scope_type :=
    v_scope ->> 'type';

  if v_scope_type is null
    or v_scope_type not in (
      'company',
      'product',
      'product_variant',
      'commercial_policy',
      'operation',
      'service',
      'integration',
      'security',
      'other'
    )
  then
    raise exception
      'O tipo de escopo do fato oficial é inválido';
  end if;

  if v_scope_type = 'company'
  then
    if v_scope -> 'product_id'
      is distinct from
      'null'::jsonb
      or v_scope -> 'variant_key'
        is distinct from
        'null'::jsonb
      or v_scope -> 'reference_key'
        is distinct from
        'null'::jsonb
    then
      raise exception
        'Fato de empresa não pode declarar referência específica';
    end if;

  elsif v_scope_type = 'product'
  then
    if not private.commercial_fact_uuid_valid(
      v_scope -> 'product_id'
    )
      or v_scope -> 'variant_key'
        is distinct from
        'null'::jsonb
      or v_scope -> 'reference_key'
        is distinct from
        'null'::jsonb
    then
      raise exception
        'Fato de produto exige product_id válido e nenhuma outra referência';
    end if;

  elsif v_scope_type =
    'product_variant'
  then
    if not private.commercial_fact_uuid_valid(
      v_scope -> 'product_id'
    )
      or not private.commercial_fact_nullable_text_valid(
        v_scope -> 'variant_key'
      )
      or v_scope -> 'variant_key' =
        'null'::jsonb
      or v_scope -> 'reference_key'
        is distinct from
        'null'::jsonb
    then
      raise exception
        'Fato de variante exige product_id e variant_key válidos';
    end if;

  else
    if v_scope -> 'product_id'
      is distinct from
      'null'::jsonb
      or v_scope -> 'variant_key'
        is distinct from
        'null'::jsonb
      or not private.commercial_fact_nullable_text_valid(
        v_scope -> 'reference_key'
      )
      or v_scope -> 'reference_key' =
        'null'::jsonb
    then
      raise exception
        'O escopo exige reference_key e não aceita produto ou variante';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- Vigência.
  -- --------------------------------------------------------------------------

  v_validity :=
    p_definition -> 'validity';

  if v_validity is null
    or jsonb_typeof(
      v_validity
    ) <> 'object'
  then
    raise exception
      'A vigência do fato oficial precisa ser um objeto';
  end if;

  if not (
    v_validity ? 'valid_from'
  )
    or not (
      v_validity ? 'valid_until'
    )
  then
    raise exception
      'A vigência precisa declarar valid_from e valid_until';
  end if;

  v_validity_mode :=
    v_validity ->> 'mode';

  if v_validity_mode is null
    or v_validity_mode not in (
      'ongoing',
      'bounded'
    )
  then
    raise exception
      'O modo de vigência do fato oficial é inválido';
  end if;

  if v_validity -> 'valid_from'
    is distinct from
    'null'::jsonb
    and not private.commercial_fact_timestamptz_valid(
      v_validity -> 'valid_from'
    )
  then
    raise exception
      'valid_from precisa ser uma data válida ou null';
  end if;

  if v_validity_mode =
    'ongoing'
  then
    if v_validity -> 'valid_until'
      is distinct from
      'null'::jsonb
    then
      raise exception
        'Fato ongoing não pode possuir valid_until';
    end if;

  else
    if not private.commercial_fact_timestamptz_valid(
      v_validity -> 'valid_until'
    )
    then
      raise exception
        'Fato bounded precisa possuir valid_until válido';
    end if;

    if v_validity -> 'valid_from'
      is distinct from
      'null'::jsonb
      and (
        v_validity ->> 'valid_until'
      )::timestamptz <=
        (
          v_validity ->> 'valid_from'
        )::timestamptz
    then
      raise exception
        'valid_until precisa ser posterior a valid_from';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- Procedência.
  -- --------------------------------------------------------------------------

  v_source :=
    p_definition -> 'source';

  if v_source is null
    or jsonb_typeof(
      v_source
    ) <> 'object'
  then
    raise exception
      'A procedência do fato oficial precisa ser um objeto';
  end if;

  v_source_type :=
    v_source ->> 'type';

  if v_source_type is null
    or v_source_type not in (
      'internal_policy',
      'contract',
      'product_documentation',
      'system_record',
      'manual_verification',
      'regulatory_document',
      'other'
    )
  then
    raise exception
      'O tipo de procedência do fato oficial é inválido';
  end if;

  if nullif(
    btrim(
      coalesce(
        v_source ->> 'reference',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        v_source ->> 'reference'
      )
    ) > 1000
  then
    raise exception
      'Todo fato oficial precisa possuir referência de origem';
  end if;

  if not private.commercial_fact_timestamptz_valid(
    v_source -> 'verified_at'
  )
  then
    raise exception
      'Todo fato oficial precisa declarar quando a fonte foi verificada';
  end if;
end;
$$;

revoke all
on function
private.validate_commercial_fact_v2_definition(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Publicação:
-- - definição precisa ser válida;
-- - projeção legada precisa coincidir;
-- - fatos de produto precisam apontar para produto configurado;
-- - fatos de variante precisam apontar para variante V3 existente.
-- ============================================================================

create or replace function
private.validate_commercial_fact_v2_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fact record;
  v_definition jsonb;
  v_scope jsonb;
  v_scope_type text;
  v_product_id uuid;
  v_variant_key text;
  v_product_definition jsonb;
begin
  if old.status <> 'draft'
    or new.status <> 'published'
  then
    return new;
  end if;

  for v_fact in
    select fact.*
    from public.company_commercial_facts fact
    where fact.company_id =
      new.company_id
      and fact.config_version_id =
        new.id
      and fact.commercial_fact_contract_version =
        'commercial-fact-v2'
  loop
    v_definition :=
      v_fact.commercial_fact_definition;

    perform
      private.validate_commercial_fact_v2_definition(
        v_definition
      );

    if v_fact.category
      is distinct from
      btrim(
        v_definition ->> 'category'
      )
    then
      raise exception
        'A projeção legada de category não corresponde ao fato V2';
    end if;

    if v_fact.fact_key
      is distinct from
      btrim(
        v_definition ->> 'fact_key'
      )
    then
      raise exception
        'A projeção legada de fact_key não corresponde ao fato V2';
    end if;

    if v_fact.fact_value
      is distinct from
      btrim(
        v_definition ->> 'fact_value'
      )
    then
      raise exception
        'A projeção legada de fact_value não corresponde ao fato V2';
    end if;

    v_scope :=
      v_definition -> 'scope';

    v_scope_type :=
      v_scope ->> 'type';

    if v_scope_type in (
      'product',
      'product_variant'
    )
    then
      v_product_id :=
        (
          v_scope ->> 'product_id'
        )::uuid;

      if not exists (
        select 1
        from public.company_commercial_product_profiles profile
        where profile.company_id =
          new.company_id
          and profile.config_version_id =
            new.id
          and profile.product_id =
            v_product_id
      ) then
        raise exception
          'O fato oficial aponta para produto não configurado nesta versão';
      end if;
    end if;

    if v_scope_type =
      'product_variant'
    then
      v_variant_key :=
        btrim(
          v_scope ->> 'variant_key'
        );

      select
        profile.commercial_product_definition
      into
        v_product_definition
      from public.company_commercial_product_profiles profile
      where profile.company_id =
        new.company_id
        and profile.config_version_id =
          new.id
        and profile.product_id =
          v_product_id
        and profile.commercial_product_contract_version =
          'commercial-product-v3';

      if not found
        or v_product_definition is null
        or jsonb_typeof(
          v_product_definition -> 'variants'
        ) <> 'array'
      then
        raise exception
          'Fato de variante exige produto comercial V3 configurado';
      end if;

      if not exists (
        select 1
        from jsonb_array_elements(
          v_product_definition -> 'variants'
        ) as variant(value)
        where lower(
          btrim(
            variant.value ->> 'key'
          )
        ) =
          lower(
            v_variant_key
          )
      ) then
        raise exception
          'O fato oficial aponta para variante inexistente';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all
on function
private.validate_commercial_fact_v2_publish()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_fact_v2_validate_publish
on public.company_commercial_config_versions;

create trigger
  commercial_fact_v2_validate_publish
before update of status
on public.company_commercial_config_versions
for each row
when (
  old.status is distinct from
  new.status
)
execute function
  private.validate_commercial_fact_v2_publish();

-- ============================================================================
-- Wrapper V5 de salvamento.
--
-- V4 continua responsável por método e produtos.
-- V5 acrescenta somente o subcontrato dos fatos oficiais.
-- ============================================================================

create or replace function
public.rpc_save_company_commercial_config_draft_v5(
  p_company_id uuid,
  p_config_version_id uuid,
  p_payload jsonb
)
returns table (
  company_id uuid,
  config_version_id uuid,
  version_number integer,
  status text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result record;
  v_item jsonb;
  v_definition jsonb;
  v_category text;
  v_fact_key text;
begin
  select *
  into strict v_result
  from public.rpc_save_company_commercial_config_draft_v4(
    p_company_id,
    p_config_version_id,
    p_payload
  );

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(
        p_payload -> 'facts',
        '[]'::jsonb
      )
    ) as item(value)
  loop
    v_category :=
      btrim(
        coalesce(
          v_item ->> 'category',
          ''
        )
      );

    v_fact_key :=
      btrim(
        coalesce(
          v_item ->> 'fact_key',
          ''
        )
      );

    if not (
      v_item ?
      'commercial_fact_definition'
    )
    then
      update public.company_commercial_facts fact
      set
        commercial_fact_contract_version =
          'commercial-fact-v1',
        commercial_fact_definition =
          null
      where fact.company_id =
        p_company_id
        and fact.config_version_id =
          v_result.config_version_id
        and fact.category =
          v_category
        and fact.fact_key =
          v_fact_key;

      continue;
    end if;

    v_definition :=
      v_item ->
        'commercial_fact_definition';

    if v_definition is null
      or v_definition =
        'null'::jsonb
    then
      update public.company_commercial_facts fact
      set
        commercial_fact_contract_version =
          'commercial-fact-v1',
        commercial_fact_definition =
          null
      where fact.company_id =
        p_company_id
        and fact.config_version_id =
          v_result.config_version_id
        and fact.category =
          v_category
        and fact.fact_key =
          v_fact_key;
    else
      if jsonb_typeof(
        v_definition
      ) <> 'object'
      then
        raise exception
          'A definição comercial do fato precisa ser um objeto ou null';
      end if;

      if v_definition ->>
        'contract_version'
        is distinct from
        'commercial-fact-v2'
      then
        raise exception
          'A versão da definição comercial do fato é incompatível';
      end if;

      update public.company_commercial_facts fact
      set
        commercial_fact_contract_version =
          'commercial-fact-v2',
        commercial_fact_definition =
          v_definition
      where fact.company_id =
        p_company_id
        and fact.config_version_id =
          v_result.config_version_id
        and fact.category =
          v_category
        and fact.fact_key =
          v_fact_key;
    end if;

    if not found then
      raise exception
        'Fato oficial não encontrado após salvamento da configuração';
    end if;
  end loop;

  return query
  select
    v_result.company_id::uuid,
    v_result.config_version_id::uuid,
    v_result.version_number::integer,
    v_result.status::text;
end;
$$;

revoke all
on function
public.rpc_save_company_commercial_config_draft_v5(
  uuid,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function
public.rpc_save_company_commercial_config_draft_v5(
  uuid,
  uuid,
  jsonb
)
to authenticated;

-- ============================================================================
-- Wrapper V5 de clonagem.
-- ============================================================================

create or replace function
public.rpc_clone_company_commercial_config_v5(
  p_company_id uuid,
  p_source_config_version_id uuid
)
returns table (
  company_id uuid,
  config_version_id uuid,
  version_number integer,
  status text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result record;
begin
  select *
  into strict v_result
  from public.rpc_clone_company_commercial_config_v4(
    p_company_id,
    p_source_config_version_id
  );

  update public.company_commercial_facts target
  set
    commercial_fact_contract_version =
      source.commercial_fact_contract_version,
    commercial_fact_definition =
      source.commercial_fact_definition
  from public.company_commercial_facts source
  where source.company_id =
    p_company_id
    and source.config_version_id =
      p_source_config_version_id
    and target.company_id =
      p_company_id
    and target.config_version_id =
      v_result.config_version_id
    and target.category =
      source.category
    and target.fact_key =
      source.fact_key;

  if exists (
    select 1
    from public.company_commercial_facts source
    where source.company_id =
      p_company_id
      and source.config_version_id =
        p_source_config_version_id
      and not exists (
        select 1
        from public.company_commercial_facts target
        where target.company_id =
          p_company_id
          and target.config_version_id =
            v_result.config_version_id
          and target.category =
            source.category
          and target.fact_key =
            source.fact_key
          and target.commercial_fact_contract_version =
            source.commercial_fact_contract_version
          and target.commercial_fact_definition
            is not distinct from
            source.commercial_fact_definition
      )
  ) then
    raise exception
      'A clonagem não preservou integralmente o contrato comercial dos fatos';
  end if;

  return query
  select
    v_result.company_id::uuid,
    v_result.config_version_id::uuid,
    v_result.version_number::integer,
    v_result.status::text;
end;
$$;

revoke all
on function
public.rpc_clone_company_commercial_config_v5(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.rpc_clone_company_commercial_config_v5(
  uuid,
  uuid
)
to authenticated;
