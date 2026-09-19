-- ============================================================================
-- Yolen — Trilha A / A1.5
-- Persistência versionada de objeções comerciais V2.
--
-- Compatibilidade:
-- - guias existentes permanecem commercial-objection-v1 / definition null;
-- - commercial-objection-v2 possui definição semântica congelada;
-- - campos legados continuam como projeção operacional;
-- - nenhuma linha existente é convertida automaticamente.
-- ============================================================================

alter table public.company_commercial_objection_guides
  add column commercial_objection_contract_version text
  not null
  default 'commercial-objection-v1';

alter table public.company_commercial_objection_guides
  add column commercial_objection_definition jsonb;

alter table public.company_commercial_objection_guides
  add constraint company_commercial_objection_guides_contract_check
  check (
    commercial_objection_contract_version in (
      'commercial-objection-v1',
      'commercial-objection-v2'
    )
  );

alter table public.company_commercial_objection_guides
  add constraint company_commercial_objection_guides_definition_check
  check (
    (
      commercial_objection_contract_version =
        'commercial-objection-v1'
      and commercial_objection_definition is null
    )
    or
    (
      commercial_objection_contract_version =
        'commercial-objection-v2'
      and commercial_objection_definition is not null
      and jsonb_typeof(
        commercial_objection_definition
      ) = 'object'
    )
  );

-- ============================================================================
-- Helpers semânticos.
-- ============================================================================

create or replace function
private.commercial_objection_text_array_valid(
  p_value jsonb,
  p_min_items integer,
  p_max_length integer
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

  if jsonb_array_length(p_value) <
    p_min_items
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
      or char_length(
        btrim(
          item.value #>> '{}'
        )
      ) > p_max_length
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
private.commercial_objection_text_array_valid(
  jsonb,
  integer,
  integer
)
from public, anon, authenticated, service_role;

create or replace function
private.commercial_objection_text_array(
  p_value jsonb
)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_result text[];
begin
  select coalesce(
    array_agg(
      btrim(
        item.value #>> '{}'
      )
      order by
        item.ordinality
    ),
    '{}'::text[]
  )
  into v_result
  from jsonb_array_elements(
    p_value
  ) with ordinality
    as item(value, ordinality);

  return v_result;
end;
$$;

revoke all
on function
private.commercial_objection_text_array(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Validador do commercial-objection-v2.
-- ============================================================================

create or replace function
private.validate_commercial_objection_v2_definition(
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
begin
  if p_definition is null
    or jsonb_typeof(
      p_definition
    ) <> 'object'
  then
    raise exception
      'A definição da objeção comercial V2 precisa ser um objeto';
  end if;

  if p_definition ->>
    'contract_version'
    is distinct from
    'commercial-objection-v2'
  then
    raise exception
      'A definição da objeção possui versão incompatível';
  end if;

  if p_definition ->>
    'objection_kind'
    is distinct from
    'commercial_objection'
  then
    raise exception
      'Objeções V2 precisam possuir objection_kind=commercial_objection';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'objection_key',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'objection_key'
      )
    ) > 160
    or btrim(
      p_definition ->> 'objection_key'
    ) !~
      '^[a-z0-9]+([._-][a-z0-9]+)*$'
  then
    raise exception
      'A chave semântica da objeção é inválida';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'objection',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'objection'
      )
    ) > 500
  then
    raise exception
      'A identificação da objeção é inválida';
  end if;

  if p_definition ->> 'category'
    is null
    or p_definition ->> 'category'
      not in (
        'price',
        'budget',
        'payment',
        'timing',
        'authority',
        'trust',
        'competition',
        'fit',
        'implementation',
        'risk',
        'contract',
        'availability',
        'other'
      )
  then
    raise exception
      'A categoria da objeção é inválida';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'description',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'description'
      )
    ) > 2000
  then
    raise exception
      'A descrição da objeção é inválida';
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
      'O escopo da objeção precisa ser um objeto';
  end if;

  if not (
    v_scope ? 'product_id'
  )
    or not (
      v_scope ? 'variant_key'
    )
  then
    raise exception
      'O escopo da objeção precisa declarar product_id e variant_key';
  end if;

  v_scope_type :=
    v_scope ->> 'type';

  if v_scope_type is null
    or v_scope_type not in (
      'company',
      'product',
      'product_variant'
    )
  then
    raise exception
      'O tipo de escopo da objeção é inválido';
  end if;

  if v_scope_type =
    'company'
  then
    if v_scope -> 'product_id'
      is distinct from
      'null'::jsonb
      or v_scope -> 'variant_key'
        is distinct from
        'null'::jsonb
    then
      raise exception
        'Objeção de empresa não pode declarar produto ou variante';
    end if;

  elsif v_scope_type =
    'product'
  then
    if jsonb_typeof(
      v_scope -> 'product_id'
    ) <> 'string'
      or nullif(
        btrim(
          v_scope ->> 'product_id'
        ),
        ''
      ) is null
      or char_length(
        btrim(
          v_scope ->> 'product_id'
        )
      ) > 200
      or v_scope -> 'variant_key'
        is distinct from
        'null'::jsonb
    then
      raise exception
        'Objeção de produto exige product_id e nenhuma variante';
    end if;

  else
    if jsonb_typeof(
      v_scope -> 'product_id'
    ) <> 'string'
      or nullif(
        btrim(
          v_scope ->> 'product_id'
        ),
        ''
      ) is null
      or char_length(
        btrim(
          v_scope ->> 'product_id'
        )
      ) > 200
      or jsonb_typeof(
        v_scope -> 'variant_key'
      ) <> 'string'
      or nullif(
        btrim(
          v_scope ->> 'variant_key'
        ),
        ''
      ) is null
      or char_length(
        btrim(
          v_scope ->> 'variant_key'
        )
      ) > 200
    then
      raise exception
        'Objeção de variante exige product_id e variant_key';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- Reconhecimento da objeção.
  -- --------------------------------------------------------------------------

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'signals',
      1,
      2000
    )
  then
    raise exception
      'Os sinais da objeção são inválidos';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'objection_when',
      1,
      2000
    )
  then
    raise exception
      'Os critérios positivos da objeção são inválidos';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'not_objection_when',
      1,
      2000
    )
  then
    raise exception
      'As regras para evitar falso positivo são inválidas';
  end if;

  if p_definition -> 'distinguish_from'
    is null
    or jsonb_typeof(
      p_definition -> 'distinguish_from'
    ) <> 'array'
    or jsonb_array_length(
      p_definition -> 'distinguish_from'
    ) = 0
  then
    raise exception
      'Toda objeção precisa declarar estados comerciais vizinhos';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      p_definition -> 'distinguish_from'
    ) as item(value)
    where jsonb_typeof(
      item.value
    ) <> 'string'
      or item.value #>> '{}'
        not in (
          'question',
          'information_request',
          'condition',
          'postponement',
          'rejection',
          'uncertainty'
        )
  ) then
    raise exception
      'A objeção possui estado comercial vizinho inválido';
  end if;

  if exists (
    select 1
    from (
      select
        item.value #>> '{}'
          as neighboring_state
      from jsonb_array_elements(
        p_definition -> 'distinguish_from'
      ) as item(value)
      group by
        item.value #>> '{}'
      having count(*) > 1
    ) duplicated
  ) then
    raise exception
      'A objeção possui estado comercial vizinho duplicado';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(
      p_definition -> 'objection_when'
    ) as positive(value)
    join jsonb_array_elements_text(
      p_definition -> 'not_objection_when'
    ) as negative(value)
      on lower(
        btrim(
          positive.value
        )
      ) =
        lower(
          btrim(
            negative.value
          )
        )
  ) then
    raise exception
      'A mesma regra não pode caracterizar e descaracterizar uma objeção';
  end if;

  -- --------------------------------------------------------------------------
  -- Orientação comercial.
  -- --------------------------------------------------------------------------

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'discovery_questions',
      0,
      2000
    )
  then
    raise exception
      'As perguntas de descoberta da objeção são inválidas';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'recommended_approach',
        ''
      )
    ),
    ''
  ) is null
    or char_length(
      btrim(
        p_definition ->> 'recommended_approach'
      )
    ) > 4000
  then
    raise exception
      'A abordagem recomendada da objeção é inválida';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'response_limits',
      1,
      2000
    )
  then
    raise exception
      'Os limites de resposta da objeção são inválidos';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'resolution_criteria',
      1,
      2000
    )
  then
    raise exception
      'Os critérios de resolução da objeção são inválidos';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'wait_when',
      0,
      2000
    )
  then
    raise exception
      'As regras de espera da objeção são inválidas';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'give_space_when',
      0,
      2000
    )
  then
    raise exception
      'As regras para dar espaço são inválidas';
  end if;

  if not
    private.commercial_objection_text_array_valid(
      p_definition -> 'stop_when',
      0,
      2000
    )
  then
    raise exception
      'As regras de encerramento da objeção são inválidas';
  end if;
end;
$$;

revoke all
on function
private.validate_commercial_objection_v2_definition(
  jsonb
)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Publicação:
-- - definição V2 precisa ser semanticamente válida;
-- - projeção legada precisa coincidir com a definição;
-- - escopos de produto precisam apontar para produto configurado;
-- - escopos de variante precisam apontar para variante V3 existente.
-- ============================================================================

create or replace function
private.validate_commercial_objection_v2_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_guide record;
  v_definition jsonb;
  v_scope jsonb;
  v_scope_type text;
  v_product_id text;
  v_variant_key text;
  v_product_definition jsonb;
begin
  if old.status <> 'draft'
    or new.status <> 'published'
  then
    return new;
  end if;

  for v_guide in
    select guide.*
    from public.company_commercial_objection_guides guide
    where guide.company_id =
      new.company_id
      and guide.config_version_id =
        new.id
      and guide.commercial_objection_contract_version =
        'commercial-objection-v2'
  loop
    v_definition :=
      v_guide.commercial_objection_definition;

    perform
      private.validate_commercial_objection_v2_definition(
        v_definition
      );

    if v_guide.objection
      is distinct from
      btrim(
        v_definition ->> 'objection'
      )
    then
      raise exception
        'A projeção legada de objection não corresponde à definição V2';
    end if;

    if v_guide.signals
      is distinct from
      private.commercial_objection_text_array(
        v_definition -> 'signals'
      )
    then
      raise exception
        'A projeção legada de signals não corresponde à definição V2';
    end if;

    if v_guide.discovery_questions
      is distinct from
      private.commercial_objection_text_array(
        v_definition -> 'discovery_questions'
      )
    then
      raise exception
        'A projeção legada de discovery_questions não corresponde à definição V2';
    end if;

    if v_guide.recommended_approach
      is distinct from
      btrim(
        v_definition ->> 'recommended_approach'
      )
    then
      raise exception
        'A projeção legada de recommended_approach não corresponde à definição V2';
    end if;

    if v_guide.response_limits
      is distinct from
      private.commercial_objection_text_array(
        v_definition -> 'response_limits'
      )
    then
      raise exception
        'A projeção legada de response_limits não corresponde à definição V2';
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
        btrim(
          v_scope ->> 'product_id'
        );

      if not exists (
        select 1
        from public.company_commercial_product_profiles profile
        where profile.company_id =
          new.company_id
          and profile.config_version_id =
            new.id
          and profile.product_id::text =
            v_product_id
      ) then
        raise exception
          'A objeção aponta para produto não configurado nesta versão';
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
        and profile.product_id::text =
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
          'Objeção de variante exige produto comercial V3 configurado';
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
          'A objeção aponta para variante inexistente';
      end if;
    end if;
  end loop;

  if exists (
    select 1
    from public.company_commercial_objection_guides guide
    where guide.company_id =
      new.company_id
      and guide.config_version_id =
        new.id
      and guide.commercial_objection_contract_version =
        'commercial-objection-v2'
    group by
      lower(
        btrim(
          guide.commercial_objection_definition ->>
            'objection_key'
        )
      ),
      guide.commercial_objection_definition ->
        'scope' ->> 'type',
      coalesce(
        guide.commercial_objection_definition ->
          'scope' ->> 'product_id',
        ''
      ),
      coalesce(
        guide.commercial_objection_definition ->
          'scope' ->> 'variant_key',
        ''
      )
    having count(*) > 1
  ) then
    raise exception
      'A configuração não pode possuir objection_key duplicada no mesmo escopo';
  end if;

  return new;
end;
$$;

revoke all
on function
private.validate_commercial_objection_v2_publish()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_objection_v2_validate_publish
on public.company_commercial_config_versions;

create trigger
  commercial_objection_v2_validate_publish
before update of status
on public.company_commercial_config_versions
for each row
when (
  old.status is distinct from
  new.status
)
execute function
  private.validate_commercial_objection_v2_publish();

-- ============================================================================
-- Wrapper V6 de salvamento.
--
-- V5 continua responsável por método, produtos e fatos oficiais.
-- V6 acrescenta somente o subcontrato semântico das objeções.
-- ============================================================================

create or replace function
public.rpc_save_company_commercial_config_draft_v6(
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
  v_sort_order integer;
begin
  select *
  into strict v_result
  from public.rpc_save_company_commercial_config_draft_v5(
    p_company_id,
    p_config_version_id,
    p_payload
  );

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(
        p_payload -> 'objection_guides',
        '[]'::jsonb
      )
    ) as item(value)
  loop
    v_sort_order :=
      (
        v_item ->> 'sort_order'
      )::integer;

    if not (
      v_item ?
      'commercial_objection_definition'
    )
    then
      update public.company_commercial_objection_guides guide
      set
        commercial_objection_contract_version =
          'commercial-objection-v1',
        commercial_objection_definition =
          null
      where guide.company_id =
        p_company_id
        and guide.config_version_id =
          v_result.config_version_id
        and guide.sort_order =
          v_sort_order;

      if not found then
        raise exception
          'Guia de objeção não encontrado após salvamento da configuração';
      end if;

      continue;
    end if;

    v_definition :=
      v_item ->
        'commercial_objection_definition';

    if v_definition is null
      or v_definition =
        'null'::jsonb
    then
      update public.company_commercial_objection_guides guide
      set
        commercial_objection_contract_version =
          'commercial-objection-v1',
        commercial_objection_definition =
          null
      where guide.company_id =
        p_company_id
        and guide.config_version_id =
          v_result.config_version_id
        and guide.sort_order =
          v_sort_order;
    else
      if jsonb_typeof(
        v_definition
      ) <> 'object'
      then
        raise exception
          'A definição comercial da objeção precisa ser um objeto ou null';
      end if;

      if v_definition ->>
        'contract_version'
        is distinct from
        'commercial-objection-v2'
      then
        raise exception
          'A versão da definição comercial da objeção é incompatível';
      end if;

      update public.company_commercial_objection_guides guide
      set
        commercial_objection_contract_version =
          'commercial-objection-v2',
        commercial_objection_definition =
          v_definition
      where guide.company_id =
        p_company_id
        and guide.config_version_id =
          v_result.config_version_id
        and guide.sort_order =
          v_sort_order;
    end if;

    if not found then
      raise exception
        'Guia de objeção não encontrado após salvamento da configuração';
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
public.rpc_save_company_commercial_config_draft_v6(
  uuid,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function
public.rpc_save_company_commercial_config_draft_v6(
  uuid,
  uuid,
  jsonb
)
to authenticated;

-- ============================================================================
-- Wrapper V6 de clonagem.
-- ============================================================================

create or replace function
public.rpc_clone_company_commercial_config_v6(
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
  from public.rpc_clone_company_commercial_config_v5(
    p_company_id,
    p_source_config_version_id
  );

  update public.company_commercial_objection_guides target
  set
    commercial_objection_contract_version =
      source.commercial_objection_contract_version,
    commercial_objection_definition =
      source.commercial_objection_definition
  from public.company_commercial_objection_guides source
  where source.company_id =
    p_company_id
    and source.config_version_id =
      p_source_config_version_id
    and target.company_id =
      p_company_id
    and target.config_version_id =
      v_result.config_version_id
    and target.sort_order =
      source.sort_order;

  if exists (
    select 1
    from public.company_commercial_objection_guides source
    where source.company_id =
      p_company_id
      and source.config_version_id =
        p_source_config_version_id
      and not exists (
        select 1
        from public.company_commercial_objection_guides target
        where target.company_id =
          p_company_id
          and target.config_version_id =
            v_result.config_version_id
          and target.sort_order =
            source.sort_order
          and target.commercial_objection_contract_version =
            source.commercial_objection_contract_version
          and target.commercial_objection_definition
            is not distinct from
            source.commercial_objection_definition
      )
  ) then
    raise exception
      'A clonagem não preservou integralmente o contrato comercial das objeções';
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
public.rpc_clone_company_commercial_config_v6(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.rpc_clone_company_commercial_config_v6(
  uuid,
  uuid
)
to authenticated;
