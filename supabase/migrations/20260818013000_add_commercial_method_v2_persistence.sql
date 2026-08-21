-- ============================================================================
-- Yolen — Trilha A / A1.1
-- Persistência versionada do método comercial V2.
--
-- Compatibilidade:
-- - configurações existentes permanecem commercial-method-v1;
-- - nenhuma configuração publicada é convertida automaticamente;
-- - o contrato global phase-2-v1 não é substituído;
-- - o método V2 é um subcontrato independente.
-- ============================================================================

alter table public.company_commercial_config_versions
  add column if not exists commercial_method_contract_version text
    not null
    default 'commercial-method-v1';

alter table public.company_commercial_config_versions
  add column if not exists commercial_method_definition jsonb;

alter table public.company_commercial_config_versions
  drop constraint if exists
    company_commercial_config_versions_method_contract_check;

alter table public.company_commercial_config_versions
  add constraint
    company_commercial_config_versions_method_contract_check
  check (
    commercial_method_contract_version in (
      'commercial-method-v1',
      'commercial-method-v2'
    )
  );

alter table public.company_commercial_config_versions
  drop constraint if exists
    company_commercial_config_versions_method_definition_check;

alter table public.company_commercial_config_versions
  add constraint
    company_commercial_config_versions_method_definition_check
  check (
    (
      commercial_method_contract_version = 'commercial-method-v1'
      and commercial_method_definition is null
    )
    or
    (
      commercial_method_contract_version = 'commercial-method-v2'
      and commercial_method_definition is not null
      and jsonb_typeof(commercial_method_definition) = 'object'
    )
  );

-- ============================================================================
-- Validação reutilizável de listas JSON de texto.
-- ============================================================================

create or replace function private.commercial_method_jsonb_text_array_valid(
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

  return true;
end;
$$;

revoke all
on function private.commercial_method_jsonb_text_array_valid(
  jsonb,
  boolean
)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Validação semântica do commercial-method-v2.
--
-- Rascunhos podem permanecer incompletos.
-- Esta validação é executada no momento da publicação.
-- ============================================================================

create or replace function private.validate_commercial_method_v2_definition(
  p_definition jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage jsonb;
  v_dimension jsonb;

  v_stage_key text;
  v_stage_order integer;
  v_requirement text;

  v_stage_keys text[] := '{}'::text[];
  v_stage_orders integer[] := '{}'::integer[];
  v_dimension_keys text[];
  v_dimension_key text;
begin
  if p_definition is null
    or jsonb_typeof(p_definition) <> 'object'
  then
    raise exception
      'A definição do método comercial V2 precisa ser um objeto';
  end if;

  if p_definition ->> 'contract_version'
    <> 'commercial-method-v2'
  then
    raise exception
      'A definição do método comercial possui versão incompatível';
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
      'O método comercial precisa possuir um nome';
  end if;

  if nullif(
    btrim(
      coalesce(
        p_definition ->> 'description',
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'O método comercial precisa possuir uma descrição';
  end if;

  if not private.commercial_method_jsonb_text_array_valid(
    p_definition -> 'principles',
    true
  ) then
    raise exception
      'O método comercial precisa possuir princípios válidos';
  end if;

  if p_definition -> 'stages' is null
    or jsonb_typeof(
      p_definition -> 'stages'
    ) <> 'array'
    or jsonb_array_length(
      p_definition -> 'stages'
    ) = 0
  then
    raise exception
      'O método comercial precisa possuir ao menos uma etapa';
  end if;

  for v_stage in
    select item.value
    from jsonb_array_elements(
      p_definition -> 'stages'
    ) as item(value)
  loop
    if jsonb_typeof(v_stage) <> 'object' then
      raise exception
        'Cada etapa do método precisa ser um objeto';
    end if;

    v_stage_key :=
      btrim(
        coalesce(
          v_stage ->> 'key',
          ''
        )
      );

    if v_stage_key = ''
      or v_stage_key !~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    then
      raise exception
        'A chave da etapa do método é inválida';
    end if;

    if v_stage_key = any(v_stage_keys) then
      raise exception
        'A chave de etapa % aparece mais de uma vez',
        v_stage_key;
    end if;

    v_stage_keys :=
      array_append(
        v_stage_keys,
        v_stage_key
      );

    if coalesce(
      v_stage ->> 'display_order',
      ''
    ) !~ '^[1-9][0-9]*$'
    then
      raise exception
        'A ordem da etapa precisa ser um inteiro positivo';
    end if;

    v_stage_order :=
      (v_stage ->> 'display_order')::integer;

    if v_stage_order = any(v_stage_orders) then
      raise exception
        'A ordem de etapa % aparece mais de uma vez',
        v_stage_order;
    end if;

    v_stage_orders :=
      array_append(
        v_stage_orders,
        v_stage_order
      );

    if nullif(
      btrim(
        coalesce(
          v_stage ->> 'name',
          ''
        )
      ),
      ''
    ) is null then
      raise exception
        'Toda etapa precisa possuir um nome';
    end if;

    if nullif(
      btrim(
        coalesce(
          v_stage ->> 'objective',
          ''
        )
      ),
      ''
    ) is null then
      raise exception
        'Toda etapa precisa possuir um objetivo';
    end if;

    v_requirement :=
      v_stage ->> 'requirement';

    if v_requirement is null
      or v_requirement not in (
        'required',
        'conditional',
        'optional'
      )
    then
      raise exception
        'A obrigatoriedade da etapa é inválida';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'completion_criteria',
      true
    ) then
      raise exception
        'Toda etapa precisa possuir critérios de conclusão';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'partial_completion_criteria',
      false
    ) then
      raise exception
        'Os critérios de conclusão parcial da etapa são inválidos';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'skip_conditions',
      false
    ) then
      raise exception
        'As condições para pular a etapa são inválidas';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'recommended_questions',
      false
    ) then
      raise exception
        'As perguntas recomendadas da etapa são inválidas';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'common_mistakes',
      false
    ) then
      raise exception
        'Os erros comuns da etapa são inválidos';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'deepen_when',
      false
    ) then
      raise exception
        'As condições de aprofundamento da etapa são inválidas';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'sufficient_when',
      true
    ) then
      raise exception
        'Toda etapa precisa definir quando há informação suficiente';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'advance_when',
      false
    ) then
      raise exception
        'As condições de avanço da etapa são inválidas';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'wait_when',
      false
    ) then
      raise exception
        'As condições de espera da etapa são inválidas';
    end if;

    if not private.commercial_method_jsonb_text_array_valid(
      v_stage -> 'stop_asking_when',
      true
    ) then
      raise exception
        'Toda etapa precisa definir quando parar de perguntar';
    end if;

    if v_requirement = 'required'
      and jsonb_array_length(
        v_stage -> 'skip_conditions'
      ) > 0
    then
      raise exception
        'Uma etapa obrigatória não pode declarar condições para ser pulada';
    end if;

    if v_requirement = 'conditional'
      and jsonb_array_length(
        v_stage -> 'skip_conditions'
      ) = 0
    then
      raise exception
        'Uma etapa condicional precisa explicar quando pode ser pulada';
    end if;

    if v_stage -> 'dimensions' is null
      or jsonb_typeof(
        v_stage -> 'dimensions'
      ) <> 'array'
    then
      raise exception
        'As dimensões internas da etapa precisam formar uma lista';
    end if;

    v_dimension_keys := '{}'::text[];

    for v_dimension in
      select item.value
      from jsonb_array_elements(
        v_stage -> 'dimensions'
      ) as item(value)
    loop
      if jsonb_typeof(v_dimension) <> 'object' then
        raise exception
          'Cada dimensão do método precisa ser um objeto';
      end if;

      v_dimension_key :=
        btrim(
          coalesce(
            v_dimension ->> 'key',
            ''
          )
        );

      if v_dimension_key = ''
        or v_dimension_key !~ '^[a-z0-9]+(_[a-z0-9]+)*$'
      then
        raise exception
          'A chave da dimensão do método é inválida';
      end if;

      if v_dimension_key = any(v_dimension_keys) then
        raise exception
          'A dimensão % aparece mais de uma vez na etapa',
          v_dimension_key;
      end if;

      v_dimension_keys :=
        array_append(
          v_dimension_keys,
          v_dimension_key
        );

      if nullif(
        btrim(
          coalesce(
            v_dimension ->> 'name',
            ''
          )
        ),
        ''
      ) is null then
        raise exception
          'Toda dimensão precisa possuir um nome';
      end if;

      if nullif(
        btrim(
          coalesce(
            v_dimension ->> 'objective',
            ''
          )
        ),
        ''
      ) is null then
        raise exception
          'Toda dimensão precisa possuir um objetivo';
      end if;

      if not private.commercial_method_jsonb_text_array_valid(
        v_dimension -> 'evidence_criteria',
        true
      ) then
        raise exception
          'Toda dimensão precisa possuir critérios de evidência';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all
on function private.validate_commercial_method_v2_definition(jsonb)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Publicações V2 exigem definição semanticamente válida.
-- ============================================================================

create or replace function private.validate_commercial_method_v2_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'draft'
    and new.status = 'published'
    and new.commercial_method_contract_version =
      'commercial-method-v2'
  then
    perform private.validate_commercial_method_v2_definition(
      new.commercial_method_definition
    );
  end if;

  return new;
end;
$$;

revoke all
on function private.validate_commercial_method_v2_publish()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_method_v2_validate_publish
on public.company_commercial_config_versions;

create trigger commercial_method_v2_validate_publish
before update of status
on public.company_commercial_config_versions
for each row
when (old.status is distinct from new.status)
execute function private.validate_commercial_method_v2_publish();

-- ============================================================================
-- Uma versão publicada ou arquivada não pode ter o método V2 alterado.
-- ============================================================================

create or replace function private.guard_commercial_method_definition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'draft'
    and (
      new.commercial_method_contract_version
        is distinct from
        old.commercial_method_contract_version
      or new.commercial_method_definition
        is distinct from
        old.commercial_method_definition
    )
  then
    raise exception
      'O método de uma configuração publicada ou arquivada é imutável';
  end if;

  return new;
end;
$$;

revoke all
on function private.guard_commercial_method_definition()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_method_definition_immutable
on public.company_commercial_config_versions;

create trigger commercial_method_definition_immutable
before update of
  commercial_method_contract_version,
  commercial_method_definition
on public.company_commercial_config_versions
for each row
execute function private.guard_commercial_method_definition();

-- ============================================================================
-- Wrapper V2 do salvamento existente.
--
-- A operação anterior continua disponível para compatibilidade.
-- ============================================================================

create or replace function public.rpc_save_company_commercial_config_draft_v2(
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
  v_definition jsonb;
begin
  select *
  into strict v_result
  from public.rpc_save_company_commercial_config_draft(
    p_company_id,
    p_config_version_id,
    p_payload
  );

  if p_payload ? 'commercial_method_definition' then
    v_definition :=
      p_payload -> 'commercial_method_definition';

    if v_definition is null
      or v_definition = 'null'::jsonb
    then
      update public.company_commercial_config_versions version
      set
        commercial_method_contract_version =
          'commercial-method-v1',
        commercial_method_definition = null
      where version.company_id = p_company_id
        and version.id = v_result.config_version_id
        and version.status = 'draft';
    else
      if jsonb_typeof(v_definition) <> 'object' then
        raise exception
          'commercial_method_definition precisa ser um objeto';
      end if;

      if v_definition ->> 'contract_version'
        <> 'commercial-method-v2'
      then
        raise exception
          'commercial_method_definition possui versão incompatível';
      end if;

      update public.company_commercial_config_versions version
      set
        commercial_method_contract_version =
          'commercial-method-v2',
        commercial_method_definition =
          v_definition
      where version.company_id = p_company_id
        and version.id = v_result.config_version_id
        and version.status = 'draft';
    end if;
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
on function public.rpc_save_company_commercial_config_draft_v2(
  uuid,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function public.rpc_save_company_commercial_config_draft_v2(
  uuid,
  uuid,
  jsonb
)
to authenticated;

-- ============================================================================
-- Wrapper V2 da clonagem existente.
--
-- Garante que a definição rica seja copiada junto com a versão.
-- ============================================================================

create or replace function public.rpc_clone_company_commercial_config_v2(
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
  v_source_contract text;
  v_source_definition jsonb;
begin
  select
    version.commercial_method_contract_version,
    version.commercial_method_definition
  into
    v_source_contract,
    v_source_definition
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = p_source_config_version_id;

  if v_source_contract is null then
    raise exception
      'Versão comercial de origem não encontrada';
  end if;

  select *
  into strict v_result
  from public.rpc_clone_company_commercial_config(
    p_company_id,
    p_source_config_version_id
  );

  update public.company_commercial_config_versions version
  set
    commercial_method_contract_version =
      v_source_contract,
    commercial_method_definition =
      v_source_definition
  where version.company_id = p_company_id
    and version.id = v_result.config_version_id
    and version.status = 'draft';

  return query
  select
    v_result.company_id::uuid,
    v_result.config_version_id::uuid,
    v_result.version_number::integer,
    v_result.status::text;
end;
$$;

revoke all
on function public.rpc_clone_company_commercial_config_v2(
  uuid,
  uuid
)
from public, anon;

grant execute
on function public.rpc_clone_company_commercial_config_v2(
  uuid,
  uuid
)
to authenticated;
