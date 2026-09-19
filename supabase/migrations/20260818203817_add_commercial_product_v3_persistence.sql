-- ============================================================================
-- Yolen — Trilha A / A1.3
-- Persistência versionada do produto comercial complexo V3.
--
-- Compatibilidade:
-- - V1 permanece legado/null;
-- - V2 permanece produto simples;
-- - V3 representa produto complexo;
-- - public.products continua sendo identidade operacional;
-- - variantes, SKU, compatibilidade, especificações, estoque e preço por
--   variante permanecem congelados no commercial_product_definition;
-- - nenhuma configuração existente é convertida automaticamente.
-- ============================================================================

alter table public.company_commercial_product_profiles
  drop constraint if exists
    company_commercial_product_profiles_contract_check;

alter table public.company_commercial_product_profiles
  add constraint
    company_commercial_product_profiles_contract_check
  check (
    commercial_product_contract_version in (
      'commercial-product-v1',
      'commercial-product-v2',
      'commercial-product-v3'
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
      commercial_product_contract_version in (
        'commercial-product-v2',
        'commercial-product-v3'
      )
      and commercial_product_definition is not null
      and jsonb_typeof(
        commercial_product_definition
      ) = 'object'
    )
  );

-- ============================================================================
-- Campos nullable obrigatórios:
-- - a chave precisa existir;
-- - aceita JSON null;
-- - quando texto, não aceita vazio.
-- ============================================================================

create or replace function
private.commercial_product_jsonb_nullable_text_valid(
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
private.commercial_product_jsonb_nullable_text_valid(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Timestamp semântico de estoque.
-- Não exige que esteja no futuro agora:
-- commercial_product_definition é um snapshot versionado.
-- ============================================================================

create or replace function
private.commercial_product_jsonb_timestamptz_valid(
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
private.commercial_product_jsonb_timestamptz_valid(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Validação do commercial-product-v3.
--
-- Reutilizamos deliberadamente o validador V2 para:
-- - campos comerciais comuns;
-- - contrato semântico de pricing.
--
-- A camada V3 acrescenta:
-- - variantes;
-- - SKU/modelo/versão;
-- - aplicações;
-- - especificações;
-- - compatibilidade;
-- - estoque temporal.
-- ============================================================================

create or replace function
private.validate_commercial_product_v3_definition(
  p_definition jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_variants jsonb;
  v_variant jsonb;
  v_specification jsonb;
  v_compatibility jsonb;
  v_stock jsonb;

  v_variant_index integer := 0;

  v_key text;
  v_normalized_key text;
  v_sku text;
  v_normalized_sku text;
  v_model text;
  v_version text;
  v_status text;

  v_quantity numeric;

  v_seen_keys text[] :=
    '{}'::text[];

  v_seen_skus text[] :=
    '{}'::text[];

  v_seen_specification_keys text[];

  v_has_selection boolean;
begin
  if p_definition is null
    or jsonb_typeof(p_definition) <> 'object'
  then
    raise exception
      'A definição comercial do produto V3 precisa ser um objeto';
  end if;

  if p_definition ->> 'contract_version'
    is distinct from 'commercial-product-v3'
  then
    raise exception
      'A definição comercial do produto V3 possui versão incompatível';
  end if;

  if p_definition ->> 'product_kind'
    is distinct from 'complex'
  then
    raise exception
      'A1.3 aceita product_kind=complex';
  end if;

  -- --------------------------------------------------------------------------
  -- Campos comerciais comuns usam exatamente os guardrails já publicados V2.
  -- O preço raiz é sintético/unknown porque no V3 o preço pertence à variante.
  -- --------------------------------------------------------------------------

  perform
    private.validate_commercial_product_v2_definition(
      jsonb_build_object(
        'contract_version',
          'commercial-product-v2',
        'product_kind',
          'simple',
        'name',
          p_definition -> 'name',
        'category',
          p_definition -> 'category',
        'commercial_description',
          p_definition -> 'commercial_description',
        'indicated_audiences',
          p_definition -> 'indicated_audiences',
        'needs_addressed',
          p_definition -> 'needs_addressed',
        'benefits',
          p_definition -> 'benefits',
        'verified_differentiators',
          p_definition -> 'verified_differentiators',
        'limitations',
          p_definition -> 'limitations',
        'recommend_when',
          p_definition -> 'recommend_when',
        'avoid_when',
          p_definition -> 'avoid_when',
        'pricing',
          jsonb_build_object(
            'model',
              'unknown',
            'amount',
              null,
            'currency',
              'BRL',
            'amount_qualifier',
              null,
            'recurrence',
              null,
            'installment_count',
              null,
            'installment_amount_basis',
              null,
            'note',
              null
          ),
        'contract_conditions',
          p_definition -> 'contract_conditions',
        'payment_conditions',
          p_definition -> 'payment_conditions',
        'allowed_claims',
          p_definition -> 'allowed_claims',
        'forbidden_claims',
          p_definition -> 'forbidden_claims'
      )
    );

  v_variants :=
    p_definition -> 'variants';

  if v_variants is null
    or jsonb_typeof(v_variants) <> 'array'
  then
    raise exception
      'Produto complexo precisa possuir uma lista de variantes';
  end if;

  if jsonb_array_length(
    v_variants
  ) = 0 then
    raise exception
      'Produto complexo precisa possuir ao menos uma variante';
  end if;

  for v_variant in
    select item.value
    from jsonb_array_elements(
      v_variants
    ) as item(value)
  loop
    v_variant_index :=
      v_variant_index + 1;

    if jsonb_typeof(
      v_variant
    ) <> 'object'
    then
      raise exception
        'A variante % precisa ser um objeto',
        v_variant_index;
    end if;

    -- ------------------------------------------------------------------------
    -- Identidade básica da variante.
    -- ------------------------------------------------------------------------

    v_key :=
      nullif(
        btrim(
          coalesce(
            v_variant ->> 'key',
            ''
          )
        ),
        ''
      );

    if v_key is null then
      raise exception
        'A variante % precisa possuir uma chave estável',
        v_variant_index;
    end if;

    v_normalized_key :=
      lower(v_key);

    if v_normalized_key =
      any(v_seen_keys)
    then
      raise exception
        'As variantes precisam possuir chaves únicas';
    end if;

    v_seen_keys :=
      array_append(
        v_seen_keys,
        v_normalized_key
      );

    if nullif(
      btrim(
        coalesce(
          v_variant ->> 'name',
          ''
        )
      ),
      ''
    ) is null
    then
      raise exception
        'A variante % precisa possuir nome',
        v_variant_index;
    end if;

    if nullif(
      btrim(
        coalesce(
          v_variant ->> 'commercial_description',
          ''
        )
      ),
      ''
    ) is null
    then
      raise exception
        'A variante % precisa possuir descrição comercial',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_nullable_text_valid(
      v_variant -> 'sku'
    ) then
      raise exception
        'O SKU da variante % precisa possuir texto válido ou ser null',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_nullable_text_valid(
      v_variant -> 'model'
    ) then
      raise exception
        'O modelo da variante % precisa possuir texto válido ou ser null',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_nullable_text_valid(
      v_variant -> 'version'
    ) then
      raise exception
        'A versão da variante % precisa possuir texto válido ou ser null',
        v_variant_index;
    end if;

    v_sku :=
      case
        when v_variant -> 'sku' =
          'null'::jsonb
        then null
        else btrim(
          v_variant ->> 'sku'
        )
      end;

    v_model :=
      case
        when v_variant -> 'model' =
          'null'::jsonb
        then null
        else btrim(
          v_variant ->> 'model'
        )
      end;

    v_version :=
      case
        when v_variant -> 'version' =
          'null'::jsonb
        then null
        else btrim(
          v_variant ->> 'version'
        )
      end;

    if v_sku is not null then
      v_normalized_sku :=
        lower(v_sku);

      if v_normalized_sku =
        any(v_seen_skus)
      then
        raise exception
          'O SKU precisa ser único dentro do produto';
      end if;

      v_seen_skus :=
        array_append(
          v_seen_skus,
          v_normalized_sku
        );
    end if;

    -- ------------------------------------------------------------------------
    -- Aplicações e especificações.
    -- ------------------------------------------------------------------------

    if not private.commercial_product_jsonb_text_array_valid(
      v_variant -> 'applications',
      false
    ) then
      raise exception
        'As aplicações da variante % são inválidas',
        v_variant_index;
    end if;

    if v_variant -> 'specifications' is null
      or jsonb_typeof(
        v_variant -> 'specifications'
      ) <> 'array'
    then
      raise exception
        'As especificações da variante % precisam ser uma lista',
        v_variant_index;
    end if;

    v_seen_specification_keys :=
      '{}'::text[];

    for v_specification in
      select specification.value
      from jsonb_array_elements(
        v_variant -> 'specifications'
      ) as specification(value)
    loop
      if jsonb_typeof(
        v_specification
      ) <> 'object'
      then
        raise exception
          'Cada especificação da variante % precisa ser um objeto',
          v_variant_index;
      end if;

      v_key :=
        nullif(
          btrim(
            coalesce(
              v_specification ->> 'key',
              ''
            )
          ),
          ''
        );

      if v_key is null then
        raise exception
          'A especificação da variante % precisa possuir key',
          v_variant_index;
      end if;

      v_normalized_key :=
        lower(v_key);

      if v_normalized_key =
        any(v_seen_specification_keys)
      then
        raise exception
          'A variante não pode repetir a mesma especificação';
      end if;

      v_seen_specification_keys :=
        array_append(
          v_seen_specification_keys,
          v_normalized_key
        );

      if nullif(
        btrim(
          coalesce(
            v_specification ->> 'label',
            ''
          )
        ),
        ''
      ) is null
      then
        raise exception
          'A especificação da variante % precisa possuir label',
          v_variant_index;
      end if;

      if nullif(
        btrim(
          coalesce(
            v_specification ->> 'value',
            ''
          )
        ),
        ''
      ) is null
      then
        raise exception
          'A especificação da variante % precisa possuir value',
          v_variant_index;
      end if;

      if not private.commercial_product_jsonb_nullable_text_valid(
        v_specification -> 'unit'
      ) then
        raise exception
          'A unidade da especificação da variante % precisa possuir texto válido ou ser null',
          v_variant_index;
      end if;
    end loop;

    -- ------------------------------------------------------------------------
    -- Compatibilidade.
    -- ------------------------------------------------------------------------

    v_compatibility :=
      v_variant -> 'compatibility';

    if v_compatibility is null
      or jsonb_typeof(
        v_compatibility
      ) <> 'object'
    then
      raise exception
        'A compatibilidade da variante % precisa ser um objeto',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_compatibility -> 'compatible_with',
      false
    ) then
      raise exception
        'A lista compatible_with da variante % é inválida',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_compatibility -> 'incompatible_with',
      false
    ) then
      raise exception
        'A lista incompatible_with da variante % é inválida',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_compatibility -> 'notes',
      false
    ) then
      raise exception
        'As notas de compatibilidade da variante % são inválidas',
        v_variant_index;
    end if;

    if private.commercial_product_jsonb_arrays_overlap(
      v_compatibility -> 'compatible_with',
      v_compatibility -> 'incompatible_with'
    ) then
      raise exception
        'O mesmo item não pode ser compatível e incompatível com a variante';
    end if;

    -- ------------------------------------------------------------------------
    -- Regras comerciais específicas da variante.
    -- ------------------------------------------------------------------------

    if not private.commercial_product_jsonb_text_array_valid(
      v_variant -> 'limitations',
      false
    ) then
      raise exception
        'As limitações da variante % são inválidas',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_variant -> 'recommend_when',
      true
    ) then
      raise exception
        'A variante % precisa definir quando faz sentido recomendá-la',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_variant -> 'avoid_when',
      false
    ) then
      raise exception
        'As condições para evitar a variante % são inválidas',
        v_variant_index;
    end if;

    if private.commercial_product_jsonb_arrays_overlap(
      v_variant -> 'recommend_when',
      v_variant -> 'avoid_when'
    ) then
      raise exception
        'A mesma condição não pode recomendar e contraindicar a variante';
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_variant -> 'allowed_claims',
      false
    ) then
      raise exception
        'As afirmações permitidas da variante % são inválidas',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_text_array_valid(
      v_variant -> 'forbidden_claims',
      false
    ) then
      raise exception
        'As afirmações proibidas da variante % são inválidas',
        v_variant_index;
    end if;

    if private.commercial_product_jsonb_arrays_overlap(
      v_variant -> 'allowed_claims',
      v_variant -> 'forbidden_claims'
    ) then
      raise exception
        'A mesma afirmação não pode ser permitida e proibida na variante';
    end if;

    -- ------------------------------------------------------------------------
    -- Pricing: exatamente o mesmo contrato semântico da A1.2.
    -- ------------------------------------------------------------------------

    perform
      private.validate_commercial_product_v2_definition(
        jsonb_build_object(
          'contract_version',
            'commercial-product-v2',
          'product_kind',
            'simple',
          'name',
            'Validação de preço da variante',
          'category',
            'Variante',
          'commercial_description',
            'Envelope interno para validação semântica de preço.',
          'indicated_audiences',
            jsonb_build_array(
              'Validação interna'
            ),
          'needs_addressed',
            jsonb_build_array(
              'Validação interna'
            ),
          'benefits',
            jsonb_build_array(
              'Validação interna'
            ),
          'verified_differentiators',
            '[]'::jsonb,
          'limitations',
            '[]'::jsonb,
          'recommend_when',
            jsonb_build_array(
              'Validação interna'
            ),
          'avoid_when',
            '[]'::jsonb,
          'pricing',
            v_variant -> 'pricing',
          'contract_conditions',
            '[]'::jsonb,
          'payment_conditions',
            '[]'::jsonb,
          'allowed_claims',
            '[]'::jsonb,
          'forbidden_claims',
            '[]'::jsonb
        )
      );

    -- ------------------------------------------------------------------------
    -- Estoque e validade temporal.
    -- ------------------------------------------------------------------------

    v_stock :=
      v_variant -> 'stock';

    if v_stock is null
      or jsonb_typeof(
        v_stock
      ) <> 'object'
    then
      raise exception
        'O estoque da variante % precisa ser um objeto',
        v_variant_index;
    end if;

    v_status :=
      v_stock ->> 'status';

    if v_status is null
      or v_status not in (
        'available',
        'limited',
        'out_of_stock',
        'backorder',
        'discontinued',
        'not_tracked',
        'unknown'
      )
    then
      raise exception
        'O status de estoque da variante % é inválido',
        v_variant_index;
    end if;

    if not private.commercial_product_jsonb_nullable_text_valid(
      v_stock -> 'note'
    ) then
      raise exception
        'A observação de estoque da variante % precisa possuir texto válido ou ser null',
        v_variant_index;
    end if;

    if not (
      v_stock ? 'quantity'
    ) then
      raise exception
        'A quantidade de estoque da variante % precisa existir',
        v_variant_index;
    end if;

    if v_stock -> 'quantity'
      is distinct from 'null'::jsonb
    then
      if jsonb_typeof(
        v_stock -> 'quantity'
      ) <> 'number'
      then
        raise exception
          'A quantidade de estoque precisa ser um inteiro não negativo ou null';
      end if;

      v_quantity :=
        (
          v_stock ->> 'quantity'
        )::numeric;

      if v_quantity < 0
        or v_quantity <>
          trunc(v_quantity)
        or v_quantity >
          9007199254740991
      then
        raise exception
          'A quantidade de estoque precisa ser um inteiro seguro não negativo ou null';
      end if;
    else
      v_quantity :=
        null;
    end if;

    if not (
      v_stock ? 'checked_at'
    )
      or not (
        v_stock ? 'valid_until'
      )
    then
      raise exception
        'O estoque da variante % precisa declarar checked_at e valid_until',
        v_variant_index;
    end if;

    if v_status in (
      'unknown',
      'not_tracked'
    ) then
      if v_stock -> 'quantity'
        is distinct from 'null'::jsonb
        or v_stock -> 'checked_at'
          is distinct from 'null'::jsonb
        or v_stock -> 'valid_until'
          is distinct from 'null'::jsonb
      then
        raise exception
          'Estoque unknown/not_tracked não pode carregar quantidade ou validade';
      end if;
    else
      if not private.commercial_product_jsonb_timestamptz_valid(
        v_stock -> 'checked_at'
      ) then
        raise exception
          'Disponibilidade conhecida precisa informar quando o estoque foi verificado';
      end if;

      if v_status in (
        'available',
        'limited',
        'out_of_stock',
        'backorder'
      ) then
        if not private.commercial_product_jsonb_timestamptz_valid(
          v_stock -> 'valid_until'
        ) then
          raise exception
            'Disponibilidade temporária precisa declarar até quando a informação é válida';
        end if;

        if (
          v_stock ->> 'valid_until'
        )::timestamptz <=
          (
            v_stock ->> 'checked_at'
          )::timestamptz
        then
          raise exception
            'valid_until precisa ser posterior a checked_at';
        end if;
      elsif v_status =
        'discontinued'
      then
        if v_stock -> 'valid_until'
          is distinct from 'null'::jsonb
        then
          raise exception
            'Produto descontinuado não precisa de validade temporária';
        end if;
      end if;
    end if;

    if v_status in (
      'out_of_stock',
      'discontinued'
    )
      and v_quantity is not null
      and v_quantity <> 0
    then
      raise exception
        'Quantidade precisa ser zero para item sem estoque ou descontinuado';
    end if;

    if v_status in (
      'available',
      'limited'
    )
      and v_quantity = 0
    then
      raise exception
        'Quantidade zero contradiz disponibilidade positiva';
    end if;

    -- ------------------------------------------------------------------------
    -- Uma variante complexa precisa realmente diferenciar uma seleção.
    -- ------------------------------------------------------------------------

    v_has_selection :=
      v_sku is not null
      or v_model is not null
      or v_version is not null
      or jsonb_array_length(
        v_variant -> 'applications'
      ) > 0
      or jsonb_array_length(
        v_variant -> 'specifications'
      ) > 0
      or jsonb_array_length(
        v_compatibility -> 'compatible_with'
      ) > 0
      or jsonb_array_length(
        v_compatibility -> 'incompatible_with'
      ) > 0;

    if not v_has_selection then
      raise exception
        'Produto complexo precisa declarar ao menos uma característica que diferencie a variante';
    end if;
  end loop;
end;
$$;

revoke all
on function
private.validate_commercial_product_v3_definition(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Publicação V3:
-- - valida a definição complexa;
-- - confirma identidade com public.products;
-- - confirma que a projeção legada reflete os campos comuns do V3.
-- ============================================================================

create or replace function
private.validate_commercial_product_v3_publish()
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
    where profile.company_id =
      new.company_id
      and profile.config_version_id =
        new.id
      and profile.commercial_product_contract_version =
        'commercial-product-v3'
  loop
    v_definition :=
      v_profile.commercial_product_definition;

    perform
      private.validate_commercial_product_v3_definition(
        v_definition
      );

    select
      product.name,
      product.category
    into
      v_product_name,
      v_product_category
    from public.products product
    where product.company_id =
      new.company_id
      and product.id =
        v_profile.product_id;

    if not found then
      raise exception
        'O produto vinculado ao perfil comercial V3 não existe';
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
        'O nome da definição V3 não corresponde ao produto vinculado';
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
        'A categoria da definição V3 não corresponde ao produto vinculado';
    end if;

    if v_profile.indicated_audiences
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'indicated_audiences'
      )
    then
      raise exception
        'A projeção legada de públicos não corresponde ao produto V3';
    end if;

    if v_profile.needs_addressed
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'needs_addressed'
      )
    then
      raise exception
        'A projeção legada de necessidades não corresponde ao produto V3';
    end if;

    if v_profile.benefits
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'benefits'
      )
    then
      raise exception
        'A projeção legada de benefícios não corresponde ao produto V3';
    end if;

    if v_profile.verified_differentiators
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'verified_differentiators'
      )
    then
      raise exception
        'A projeção legada de diferenciais não corresponde ao produto V3';
    end if;

    if v_profile.limitations
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'limitations'
      )
    then
      raise exception
        'A projeção legada de limitações não corresponde ao produto V3';
    end if;

    if v_profile.contract_conditions
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'contract_conditions'
      )
    then
      raise exception
        'A projeção legada de condições contratuais não corresponde ao produto V3';
    end if;

    if v_profile.payment_conditions
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'payment_conditions'
      )
    then
      raise exception
        'A projeção legada de pagamento não corresponde ao produto V3';
    end if;

    if v_profile.allowed_claims
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'allowed_claims'
      )
    then
      raise exception
        'A projeção legada de afirmações permitidas não corresponde ao produto V3';
    end if;

    if v_profile.forbidden_claims
      is distinct from
      private.commercial_product_jsonb_text_array_normalized(
        v_definition -> 'forbidden_claims'
      )
    then
      raise exception
        'A projeção legada de afirmações proibidas não corresponde ao produto V3';
    end if;
  end loop;

  return new;
end;
$$;

revoke all
on function
private.validate_commercial_product_v3_publish()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_product_v3_validate_publish
on public.company_commercial_config_versions;

create trigger
  commercial_product_v3_validate_publish
before update of status
on public.company_commercial_config_versions
for each row
when (
  old.status is distinct from
  new.status
)
execute function
  private.validate_commercial_product_v3_publish();

-- ============================================================================
-- Wrapper V4 de salvamento.
--
-- V4 chama diretamente o wrapper V2:
-- - V2 continua responsável pelo método comercial;
-- - V4 passa a resolver produto V1/V2/V3 explicitamente.
--
-- O wrapper V3 continua disponível para consumidores A1.2.
-- ============================================================================

create or replace function
public.rpc_save_company_commercial_config_draft_v4(
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
  v_contract_version text;
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
      (
        v_item ->> 'product_id'
      )::uuid;

    v_definition :=
      v_item -> 'commercial_product_definition';

    if v_definition is null
      or v_definition =
        'null'::jsonb
    then
      update public.company_commercial_product_profiles profile
      set
        commercial_product_contract_version =
          'commercial-product-v1',
        commercial_product_definition =
          null
      where profile.company_id =
        p_company_id
        and profile.config_version_id =
          v_result.config_version_id
        and profile.product_id =
          v_product_id;
    else
      if jsonb_typeof(
        v_definition
      ) <> 'object'
      then
        raise exception
          'A definição comercial do produto precisa ser um objeto ou null';
      end if;

      v_contract_version :=
        v_definition ->> 'contract_version';

      if v_contract_version not in (
        'commercial-product-v2',
        'commercial-product-v3'
      )
        or v_contract_version is null
      then
        raise exception
          'A versão da definição comercial do produto é incompatível';
      end if;

      update public.company_commercial_product_profiles profile
      set
        commercial_product_contract_version =
          v_contract_version,
        commercial_product_definition =
          v_definition
      where profile.company_id =
        p_company_id
        and profile.config_version_id =
          v_result.config_version_id
        and profile.product_id =
          v_product_id;
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
public.rpc_save_company_commercial_config_draft_v4(
  uuid,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function
public.rpc_save_company_commercial_config_draft_v4(
  uuid,
  uuid,
  jsonb
)
to authenticated;

-- ============================================================================
-- Wrapper V4 da clonagem.
--
-- V2 cria o novo rascunho e preserva o contrato do método.
-- Depois copiamos exatamente o subcontrato de produto V1/V2/V3.
-- ============================================================================

create or replace function
public.rpc_clone_company_commercial_config_v4(
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
  where source.company_id =
    p_company_id
    and source.config_version_id =
      p_source_config_version_id
    and target.company_id =
      p_company_id
    and target.config_version_id =
      v_result.config_version_id
    and target.product_id =
      source.product_id;

  if exists (
    select 1
    from public.company_commercial_product_profiles source
    where source.company_id =
      p_company_id
      and source.config_version_id =
        p_source_config_version_id
      and not exists (
        select 1
        from public.company_commercial_product_profiles target
        where target.company_id =
          p_company_id
          and target.config_version_id =
            v_result.config_version_id
          and target.product_id =
            source.product_id
          and target.commercial_product_contract_version =
            source.commercial_product_contract_version
          and target.commercial_product_definition
            is not distinct from
            source.commercial_product_definition
      )
  ) then
    raise exception
      'A clonagem não preservou integralmente o contrato comercial do produto';
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
public.rpc_clone_company_commercial_config_v4(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.rpc_clone_company_commercial_config_v4(
  uuid,
  uuid
)
to authenticated;
