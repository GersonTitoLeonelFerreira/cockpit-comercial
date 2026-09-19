-- ============================================================================
-- Yolen — Trilha A / A1.2
-- Persistência versionada do produto comercial simples V2.
--
-- Compatibilidade:
-- - perfis existentes permanecem commercial-product-v1;
-- - nenhuma configuração publicada é convertida automaticamente;
-- - o catálogo public.products continua sendo a identidade operacional;
-- - a semântica V2 fica congelada no perfil da versão comercial;
-- - base_price não ganha significado comercial automaticamente;
-- - A1.3 continuará responsável por produtos complexos.
-- ============================================================================

alter table public.company_commercial_product_profiles
  add column if not exists
    commercial_product_contract_version text
    not null
    default 'commercial-product-v1';

alter table public.company_commercial_product_profiles
  add column if not exists
    commercial_product_definition jsonb;

alter table public.company_commercial_product_profiles
  drop constraint if exists
    company_commercial_product_profiles_contract_check;

alter table public.company_commercial_product_profiles
  add constraint
    company_commercial_product_profiles_contract_check
  check (
    commercial_product_contract_version in (
      'commercial-product-v1',
      'commercial-product-v2'
    )
  );

alter table public.company_commercial_product_profiles
  drop constraint if exists
    company_commercial_product_profiles_definition_check;

alter table public.company_commercial_product_profiles
  add constraint
    company_commercial_product_profiles_definition_check
  check (
    (
      commercial_product_contract_version =
        'commercial-product-v1'
      and commercial_product_definition is null
    )
    or
    (
      commercial_product_contract_version =
        'commercial-product-v2'
      and commercial_product_definition is not null
      and jsonb_typeof(
        commercial_product_definition
      ) = 'object'
    )
  );

-- ============================================================================
-- Lista JSON de textos:
-- - precisa ser array;
-- - pode ser obrigatória;
-- - não aceita vazios;
-- - não aceita duplicidade semântica ignorando caixa/espaços laterais.
-- ============================================================================

create or replace function
private.commercial_product_jsonb_text_array_valid(
  p_value jsonb,
  p_require_nonempty boolean default false
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

  if p_require_nonempty
    and jsonb_array_length(p_value) = 0
  then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_value) as item(value)
    where jsonb_typeof(item.value) <> 'string'
      or nullif(
        btrim(item.value #>> '{}'),
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
          btrim(item.value #>> '{}')
        ) as normalized_value,
        count(*) as item_count
      from jsonb_array_elements(p_value) as item(value)
      group by
        lower(
          btrim(item.value #>> '{}')
        )
    ) duplicated
    where duplicated.item_count > 1
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all
on function
private.commercial_product_jsonb_text_array_valid(
  jsonb,
  boolean
)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Converte lista JSON válida na projeção text[] usada pelo contrato legado.
-- ============================================================================

create or replace function
private.commercial_product_jsonb_text_array_normalized(
  p_value jsonb
)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    array_agg(
      btrim(item.value #>> '{}')
      order by item.ordinality
    ),
    '{}'::text[]
  )
  from jsonb_array_elements(p_value)
    with ordinality as item(value, ordinality);
$$;

revoke all
on function
private.commercial_product_jsonb_text_array_normalized(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Detecta contradição entre duas listas semânticas.
-- ============================================================================

create or replace function
private.commercial_product_jsonb_arrays_overlap(
  p_left jsonb,
  p_right jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(p_left)
      as left_item(value)
    join jsonb_array_elements_text(p_right)
      as right_item(value)
      on lower(btrim(left_item.value)) =
         lower(btrim(right_item.value))
  );
$$;

revoke all
on function
private.commercial_product_jsonb_arrays_overlap(
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Validação semântica do commercial-product-v2.
--
-- Rascunhos podem ser incompletos.
-- A definição completa é exigida somente na publicação.
-- ============================================================================

create or replace function
private.validate_commercial_product_v2_definition(
  p_definition jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pricing jsonb;
  v_model text;
begin
  if p_definition is null
    or jsonb_typeof(p_definition) <> 'object'
  then
    raise exception
      'A definição comercial do produto V2 precisa ser um objeto';
  end if;

  if p_definition ->> 'contract_version'
    is distinct from 'commercial-product-v2'
  then
    raise exception
      'A definição comercial do produto possui versão incompatível';
  end if;

  if p_definition ->> 'product_kind'
    is distinct from 'simple'
  then
    raise exception
      'A1.2 aceita exclusivamente produtos simples';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'name',
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'O produto comercial precisa possuir um nome';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'category',
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'O produto comercial precisa possuir uma categoria';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'commercial_description',
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'O produto precisa explicar comercialmente o que ele é';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'indicated_audiences',
    true
  ) then
    raise exception
      'O produto precisa possuir públicos indicados válidos';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'needs_addressed',
    true
  ) then
    raise exception
      'O produto precisa possuir necessidades atendidas válidas';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'benefits',
    true
  ) then
    raise exception
      'O produto precisa possuir benefícios válidos';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'verified_differentiators',
    false
  ) then
    raise exception
      'Os diferenciais comprovados do produto são inválidos';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'limitations',
    false
  ) then
    raise exception
      'As limitações do produto são inválidas';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'recommend_when',
    true
  ) then
    raise exception
      'O produto precisa definir quando faz sentido recomendá-lo';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'avoid_when',
    false
  ) then
    raise exception
      'As condições para evitar o produto são inválidas';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'contract_conditions',
    false
  ) then
    raise exception
      'As condições contratuais do produto são inválidas';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'payment_conditions',
    false
  ) then
    raise exception
      'As condições de pagamento do produto são inválidas';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'allowed_claims',
    false
  ) then
    raise exception
      'As afirmações permitidas do produto são inválidas';
  end if;

  if not private.commercial_product_jsonb_text_array_valid(
    p_definition -> 'forbidden_claims',
    false
  ) then
    raise exception
      'As afirmações proibidas do produto são inválidas';
  end if;

  if private.commercial_product_jsonb_arrays_overlap(
    p_definition -> 'recommend_when',
    p_definition -> 'avoid_when'
  ) then
    raise exception
      'A mesma condição não pode recomendar e contraindicar o produto';
  end if;

  if private.commercial_product_jsonb_arrays_overlap(
    p_definition -> 'allowed_claims',
    p_definition -> 'forbidden_claims'
  ) then
    raise exception
      'A mesma afirmação não pode ser permitida e proibida';
  end if;

  v_pricing :=
    p_definition -> 'pricing';

  if v_pricing is null
    or jsonb_typeof(v_pricing) <> 'object'
  then
    raise exception
      'A configuração comercial de preço precisa ser um objeto';
  end if;

  v_model :=
    v_pricing ->> 'model';

  if v_model is null
    or v_model not in (
      'one_time',
      'recurring',
      'installment',
      'quote_required',
      'free',
      'unknown'
    )
  then
    raise exception
      'O modelo comercial de preço é inválido';
  end if;

  if v_pricing ->> 'currency'
    is distinct from 'BRL'
  then
    raise exception
      'A moeda do produto comercial precisa ser BRL';
  end if;

  if v_pricing ? 'note'
    and v_pricing -> 'note'
      is distinct from 'null'::jsonb
    and (
      jsonb_typeof(
        v_pricing -> 'note'
      ) <> 'string'
      or nullif(
        btrim(
          v_pricing ->> 'note'
        ),
        ''
      ) is null
    )
  then
    raise exception
      'A observação de preço precisa possuir texto válido ou ser null';
  end if;

  if v_model in (
    'unknown',
    'quote_required',
    'free'
  ) then
    if v_pricing -> 'amount'
      is distinct from 'null'::jsonb
    then
      raise exception
        'Este modelo de preço não pode possuir valor numérico';
    end if;

    if v_pricing -> 'amount_qualifier'
      is distinct from 'null'::jsonb
    then
      raise exception
        'Este modelo de preço não pode qualificar um valor inexistente';
    end if;

    if v_pricing -> 'recurrence'
      is distinct from 'null'::jsonb
    then
      raise exception
        'Este modelo de preço não pode possuir recorrência';
    end if;

    if v_pricing -> 'installment_count'
      is distinct from 'null'::jsonb
    then
      raise exception
        'Este modelo de preço não pode possuir parcelas';
    end if;

    if v_pricing -> 'installment_amount_basis'
      is distinct from 'null'::jsonb
    then
      raise exception
        'Este modelo de preço não pode possuir base de parcelamento';
    end if;

    return;
  end if;

  if jsonb_typeof(
    v_pricing -> 'amount'
  ) is distinct from 'number'
    or (v_pricing ->> 'amount')::numeric <= 0
  then
    raise exception
      'O valor comercial precisa ser um número positivo';
  end if;

  if v_pricing ->> 'amount_qualifier'
    is null
    or v_pricing ->> 'amount_qualifier'
      not in (
        'exact',
        'starting_at'
      )
  then
    raise exception
      'O valor precisa informar se é exato ou a partir de';
  end if;

  if v_model = 'one_time' then
    if v_pricing -> 'recurrence'
      is distinct from 'null'::jsonb
      or v_pricing -> 'installment_count'
        is distinct from 'null'::jsonb
      or v_pricing -> 'installment_amount_basis'
        is distinct from 'null'::jsonb
    then
      raise exception
        'Preço único não pode possuir recorrência ou parcelamento';
    end if;

    return;
  end if;

  if v_model = 'recurring' then
    if v_pricing ->> 'recurrence'
      is null
      or v_pricing ->> 'recurrence'
        not in (
          'monthly',
          'quarterly',
          'semiannual',
          'annual'
        )
    then
      raise exception
        'Preço recorrente precisa declarar periodicidade válida';
    end if;

    if v_pricing -> 'installment_count'
      is distinct from 'null'::jsonb
      or v_pricing -> 'installment_amount_basis'
        is distinct from 'null'::jsonb
    then
      raise exception
        'Preço recorrente não pode declarar parcelamento';
    end if;

    return;
  end if;

  if v_model = 'installment' then
    if v_pricing -> 'recurrence'
      is distinct from 'null'::jsonb
    then
      raise exception
        'Preço parcelado não pode possuir recorrência';
    end if;

    if jsonb_typeof(
      v_pricing -> 'installment_count'
    ) <> 'number'
      or coalesce(
        v_pricing ->> 'installment_count',
        ''
      ) !~ '^[0-9]+$'
      or (
        v_pricing ->> 'installment_count'
      )::integer < 2
    then
      raise exception
        'Preço parcelado precisa declarar pelo menos duas parcelas';
    end if;

    if v_pricing ->> 'installment_amount_basis'
      is null
      or v_pricing ->> 'installment_amount_basis'
        not in (
          'total',
          'per_installment'
        )
    then
      raise exception
        'Preço parcelado precisa informar o significado do valor';
    end if;
  end if;
end;
$$;

revoke all
on function
private.validate_commercial_product_v2_definition(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Publicação V2:
-- - valida o contrato rico;
-- - confirma que name/category correspondem ao produto selecionado;
-- - confirma que os campos legados são uma projeção fiel do V2.
--
-- Isso impede que o cérebro V2 e um consumidor legado recebam duas verdades
-- diferentes para o mesmo produto.
-- ============================================================================

create or replace function
private.validate_commercial_product_v2_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile record;
  v_product_name text;
  v_product_category text;
  v_definition jsonb;
begin
  if old.status <> 'draft'
    or new.status <> 'published'
  then
    return new;
  end if;

  for v_profile in
    select profile.*
    from public.company_commercial_product_profiles profile
    where profile.company_id = new.company_id
      and profile.config_version_id = new.id
      and profile.commercial_product_contract_version =
        'commercial-product-v2'
  loop
    v_definition :=
      v_profile.commercial_product_definition;

    perform
      private.validate_commercial_product_v2_definition(
        v_definition
      );

    select
      product.name,
      product.category
    into
      v_product_name,
      v_product_category
    from public.products product
    where product.company_id = new.company_id
      and product.id = v_profile.product_id;

    if not found then
      raise exception
        'O produto vinculado ao perfil comercial V2 não existe';
    end if;

    if btrim(
      coalesce(
        v_definition ->> 'name',
        ''
      )
    ) <> btrim(
      coalesce(
        v_product_name,
        ''
      )
    ) then
      raise exception
        'O nome da definição V2 não corresponde ao produto vinculado';
    end if;

    if btrim(
      coalesce(
        v_definition ->> 'category',
        ''
      )
    ) <> btrim(
      coalesce(
        v_product_category,
        ''
      )
    ) then
      raise exception
        'A categoria da definição V2 não corresponde ao produto vinculado';
    end if;

    if v_profile.indicated_audiences
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'indicated_audiences'
      )
    then
      raise exception
        'A projeção legada de públicos não corresponde ao produto V2';
    end if;

    if v_profile.needs_addressed
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'needs_addressed'
      )
    then
      raise exception
        'A projeção legada de necessidades não corresponde ao produto V2';
    end if;

    if v_profile.benefits
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'benefits'
      )
    then
      raise exception
        'A projeção legada de benefícios não corresponde ao produto V2';
    end if;

    if v_profile.verified_differentiators
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'verified_differentiators'
      )
    then
      raise exception
        'A projeção legada de diferenciais não corresponde ao produto V2';
    end if;

    if v_profile.limitations
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'limitations'
      )
    then
      raise exception
        'A projeção legada de limitações não corresponde ao produto V2';
    end if;

    if v_profile.contract_conditions
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'contract_conditions'
      )
    then
      raise exception
        'A projeção legada de condições contratuais não corresponde ao produto V2';
    end if;

    if v_profile.payment_conditions
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'payment_conditions'
      )
    then
      raise exception
        'A projeção legada de pagamento não corresponde ao produto V2';
    end if;

    if v_profile.allowed_claims
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'allowed_claims'
      )
    then
      raise exception
        'A projeção legada de afirmações permitidas não corresponde ao produto V2';
    end if;

    if v_profile.forbidden_claims
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'forbidden_claims'
      )
    then
      raise exception
        'A projeção legada de afirmações proibidas não corresponde ao produto V2';
    end if;
  end loop;

  return new;
end;
$$;

revoke all
on function
private.validate_commercial_product_v2_publish()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_product_v2_validate_publish
on public.company_commercial_config_versions;

create trigger
  commercial_product_v2_validate_publish
before update of status
on public.company_commercial_config_versions
for each row
when (old.status is distinct from new.status)
execute function
  private.validate_commercial_product_v2_publish();

-- ============================================================================
-- Wrapper V3 do salvamento.
--
-- V3 chama V2 primeiro:
-- V1 global -> V2 método -> V3 produto.
--
-- O salvamento V2 continua disponível para compatibilidade.
-- ============================================================================

create or replace function
public.rpc_save_company_commercial_config_draft_v3(
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
  v_product_id uuid;
  v_definition jsonb;
begin
  select *
  into strict v_result
  from public.rpc_save_company_commercial_config_draft_v2(
    p_company_id,
    p_config_version_id,
    p_payload
  );

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(
        p_payload -> 'product_profiles',
        '[]'::jsonb
      )
    ) as item(value)
  loop
    if not (
      v_item ? 'commercial_product_definition'
    ) then
      continue;
    end if;

    v_product_id :=
      (v_item ->> 'product_id')::uuid;

    v_definition :=
      v_item -> 'commercial_product_definition';

    if v_definition is null
      or v_definition = 'null'::jsonb
    then
      update public.company_commercial_product_profiles profile
      set
        commercial_product_contract_version =
          'commercial-product-v1',
        commercial_product_definition =
          null
      where profile.company_id = p_company_id
        and profile.config_version_id =
          v_result.config_version_id
        and profile.product_id = v_product_id;
    else
      update public.company_commercial_product_profiles profile
      set
        commercial_product_contract_version =
          'commercial-product-v2',
        commercial_product_definition =
          v_definition
      where profile.company_id = p_company_id
        and profile.config_version_id =
          v_result.config_version_id
        and profile.product_id = v_product_id;
    end if;

    if not found then
      raise exception
        'Perfil de produto não encontrado após salvamento da configuração';
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
public.rpc_save_company_commercial_config_draft_v3(
  uuid,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function
public.rpc_save_company_commercial_config_draft_v3(
  uuid,
  uuid,
  jsonb
)
to authenticated;

-- ============================================================================
-- Wrapper V3 da clonagem.
--
-- Primeiro preserva tudo que o wrapper V2 já sabe clonar.
-- Depois copia o subcontrato de produto para o novo rascunho.
-- ============================================================================

create or replace function
public.rpc_clone_company_commercial_config_v3(
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
  from public.rpc_clone_company_commercial_config_v2(
    p_company_id,
    p_source_config_version_id
  );

  update public.company_commercial_product_profiles target
  set
    commercial_product_contract_version =
      source.commercial_product_contract_version,
    commercial_product_definition =
      source.commercial_product_definition
  from public.company_commercial_product_profiles source
  where source.company_id = p_company_id
    and source.config_version_id =
      p_source_config_version_id
    and target.company_id = p_company_id
    and target.config_version_id =
      v_result.config_version_id
    and target.product_id =
      source.product_id;

  if exists (
    select 1
    from public.company_commercial_product_profiles source
    where source.company_id = p_company_id
      and source.config_version_id =
        p_source_config_version_id
      and source.commercial_product_contract_version =
        'commercial-product-v2'
      and not exists (
        select 1
        from public.company_commercial_product_profiles target
        where target.company_id = p_company_id
          and target.config_version_id =
            v_result.config_version_id
          and target.product_id =
            source.product_id
          and target.commercial_product_contract_version =
            source.commercial_product_contract_version
          and target.commercial_product_definition =
            source.commercial_product_definition
      )
  ) then
    raise exception
      'A clonagem não preservou integralmente o produto comercial V2';
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
public.rpc_clone_company_commercial_config_v3(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.rpc_clone_company_commercial_config_v3(
  uuid,
  uuid
)
to authenticated;
