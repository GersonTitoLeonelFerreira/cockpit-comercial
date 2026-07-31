-- Yolen Companion V2 - Fase 3
-- Operações administrativas transacionais da configuração comercial.
--
-- Esta migration não cria dados comerciais e não ativa o motor V2.
-- Ela fornece operações atômicas para a futura interface administrativa.

-- ============================================================================
-- Rascunhos podem ser incompletos.
--
-- A obrigatoriedade de critérios, necessidades e benefícios será validada
-- no momento da publicação, e não durante cada salvamento parcial.
-- ============================================================================

alter table public.company_commercial_method_steps
  drop constraint if exists
    company_commercial_method_steps_criteria_check;

alter table public.company_commercial_product_profiles
  drop constraint if exists
    company_commercial_product_profiles_needs_check;

alter table public.company_commercial_product_profiles
  drop constraint if exists
    company_commercial_product_profiles_benefits_check;

-- ============================================================================
-- Confirma que o usuário atual é administrador ativo da empresa.
-- ============================================================================

create or replace function private.require_company_commercial_admin(
  p_company_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor
      and profile.is_active_global = true
  ) then
    raise exception 'Usuário globalmente inativo';
  end if;

  if not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = p_company_id
      and membership.user_id = v_actor
      and membership.role = 'admin'
      and membership.is_active = true
  ) then
    raise exception
      'Apenas um administrador ativo da empresa pode executar esta operação';
  end if;

  return v_actor;
end;
$$;

revoke all
on function private.require_company_commercial_admin(uuid)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Converte uma lista JSON em text[], remove espaços laterais e ignora vazios.
-- ============================================================================

create or replace function private.commercial_jsonb_text_array(
  p_value jsonb,
  p_field_name text
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
  if p_value is null or p_value = 'null'::jsonb then
    return '{}'::text[];
  end if;

  if jsonb_typeof(p_value) <> 'array' then
    raise exception '% deve ser uma lista', p_field_name;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_value) as item(value)
    where jsonb_typeof(item.value) <> 'string'
  ) then
    raise exception '% deve conter somente textos', p_field_name;
  end if;

  select coalesce(
    array_agg(
      btrim(item.value #>> '{}')
      order by item.ordinality
    ) filter (
      where nullif(btrim(item.value #>> '{}'), '') is not null
    ),
    '{}'::text[]
  )
  into v_result
  from jsonb_array_elements(p_value)
    with ordinality as item(value, ordinality);

  return v_result;
end;
$$;

revoke all
on function private.commercial_jsonb_text_array(jsonb, text)
from public, anon, authenticated, service_role;

-- ============================================================================
-- Mantém as exigências completas no momento da publicação.
-- ============================================================================

create or replace function private.validate_company_commercial_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    if exists (
      select 1
      from public.company_commercial_method_steps step
      where step.company_id = new.company_id
        and step.config_version_id = new.id
        and cardinality(step.completion_criteria) = 0
    ) then
      raise exception
        'Toda etapa do método precisa de ao menos um critério de conclusão';
    end if;

    if exists (
      select 1
      from public.company_commercial_product_profiles profile
      where profile.company_id = new.company_id
        and profile.config_version_id = new.id
        and (
          cardinality(profile.needs_addressed) = 0
          or cardinality(profile.benefits) = 0
        )
    ) then
      raise exception
        'Todo perfil de produto precisa de necessidades atendidas e benefícios';
    end if;
  end if;

  return new;
end;
$$;

revoke all
on function private.validate_company_commercial_publish()
from public, anon, authenticated, service_role;

drop trigger if exists
  commercial_config_validate_publish
on public.company_commercial_config_versions;

create trigger commercial_config_validate_publish
before update of status
on public.company_commercial_config_versions
for each row
when (old.status is distinct from new.status)
execute function private.validate_company_commercial_publish();

-- ============================================================================
-- Salva todo o rascunho em uma única transação.
--
-- Se p_config_version_id for NULL, cria um novo rascunho.
-- Se houver qualquer erro, nenhuma parte da configuração é gravada.
-- ============================================================================

create or replace function public.rpc_save_company_commercial_config_draft(
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
  v_actor uuid;
  v_config_id uuid;
  v_existing_draft_id uuid;
  v_item jsonb;
begin
  v_actor := private.require_company_commercial_admin(p_company_id);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'O conteúdo da configuração deve ser um objeto JSON';
  end if;

  if jsonb_typeof(
    coalesce(p_payload -> 'method_steps', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'method_steps deve ser uma lista';
  end if;

  if jsonb_typeof(
    coalesce(p_payload -> 'product_profiles', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'product_profiles deve ser uma lista';
  end if;

  if jsonb_typeof(
    coalesce(p_payload -> 'facts', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'facts deve ser uma lista';
  end if;

  if jsonb_typeof(
    coalesce(p_payload -> 'objection_guides', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'objection_guides deve ser uma lista';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text, 0)
  );

  if p_config_version_id is null then
    select version.id
    into v_existing_draft_id
    from public.company_commercial_config_versions version
    where version.company_id = p_company_id
      and version.status = 'draft'
    limit 1
    for update;

    if v_existing_draft_id is not null then
      raise exception
        'Já existe um rascunho para esta empresa';
    end if;

    insert into public.company_commercial_config_versions (
      company_id,
      created_by
    )
    values (
      p_company_id,
      v_actor
    )
    returning id
    into v_config_id;
  else
    select version.id
    into v_config_id
    from public.company_commercial_config_versions version
    where version.company_id = p_company_id
      and version.id = p_config_version_id
      and version.status = 'draft'
    for update;

    if v_config_id is null then
      raise exception
        'Rascunho não encontrado ou não está mais disponível para edição';
    end if;
  end if;

  update public.company_commercial_config_versions version
  set
    business_description = btrim(
      coalesce(p_payload ->> 'business_description', '')
    ),
    target_audience = btrim(
      coalesce(p_payload ->> 'target_audience', '')
    ),
    value_proposition = btrim(
      coalesce(p_payload ->> 'value_proposition', '')
    ),
    commercial_method_name = btrim(
      coalesce(p_payload ->> 'commercial_method_name', '')
    ),
    commercial_method_description = btrim(
      coalesce(p_payload ->> 'commercial_method_description', '')
    ),
    communication_tone = btrim(
      coalesce(p_payload ->> 'communication_tone', '')
    ),
    required_behaviors =
      private.commercial_jsonb_text_array(
        p_payload -> 'required_behaviors',
        'required_behaviors'
      ),
    prohibited_behaviors =
      private.commercial_jsonb_text_array(
        p_payload -> 'prohibited_behaviors',
        'prohibited_behaviors'
      )
  where version.company_id = p_company_id
    and version.id = v_config_id;

  delete from public.company_commercial_method_steps step
  where step.company_id = p_company_id
    and step.config_version_id = v_config_id;

  delete from public.company_commercial_product_profiles profile
  where profile.company_id = p_company_id
    and profile.config_version_id = v_config_id;

  delete from public.company_commercial_facts fact
  where fact.company_id = p_company_id
    and fact.config_version_id = v_config_id;

  delete from public.company_commercial_objection_guides guide
  where guide.company_id = p_company_id
    and guide.config_version_id = v_config_id;

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(p_payload -> 'method_steps', '[]'::jsonb)
    ) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada etapa do método deve ser um objeto';
    end if;

    if nullif(v_item ->> 'step_order', '') is null then
      raise exception 'Toda etapa precisa de uma ordem';
    end if;

    if nullif(btrim(coalesce(v_item ->> 'name', '')), '') is null then
      raise exception 'Toda etapa precisa de um nome';
    end if;

    if nullif(
      btrim(coalesce(v_item ->> 'objective', '')),
      ''
    ) is null then
      raise exception 'Toda etapa precisa de um objetivo';
    end if;

    insert into public.company_commercial_method_steps (
      company_id,
      config_version_id,
      step_order,
      name,
      objective,
      completion_criteria,
      recommended_questions,
      is_required
    )
    values (
      p_company_id,
      v_config_id,
      (v_item ->> 'step_order')::integer,
      btrim(v_item ->> 'name'),
      btrim(v_item ->> 'objective'),
      private.commercial_jsonb_text_array(
        v_item -> 'completion_criteria',
        'completion_criteria'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'recommended_questions',
        'recommended_questions'
      ),
      coalesce(
        nullif(v_item ->> 'is_required', '')::boolean,
        true
      )
    );
  end loop;

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(p_payload -> 'product_profiles', '[]'::jsonb)
    ) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada perfil de produto deve ser um objeto';
    end if;

    if nullif(v_item ->> 'product_id', '') is null then
      raise exception 'Todo perfil precisa de um produto';
    end if;

    insert into public.company_commercial_product_profiles (
      company_id,
      config_version_id,
      product_id,
      indicated_audiences,
      needs_addressed,
      benefits,
      verified_differentiators,
      limitations,
      contract_conditions,
      payment_conditions,
      allowed_claims,
      forbidden_claims
    )
    values (
      p_company_id,
      v_config_id,
      (v_item ->> 'product_id')::uuid,
      private.commercial_jsonb_text_array(
        v_item -> 'indicated_audiences',
        'indicated_audiences'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'needs_addressed',
        'needs_addressed'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'benefits',
        'benefits'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'verified_differentiators',
        'verified_differentiators'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'limitations',
        'limitations'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'contract_conditions',
        'contract_conditions'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'payment_conditions',
        'payment_conditions'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'allowed_claims',
        'allowed_claims'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'forbidden_claims',
        'forbidden_claims'
      )
    );
  end loop;

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(p_payload -> 'facts', '[]'::jsonb)
    ) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada fato oficial deve ser um objeto';
    end if;

    if nullif(
      btrim(coalesce(v_item ->> 'category', '')),
      ''
    ) is null then
      raise exception 'Todo fato precisa de uma categoria';
    end if;

    if nullif(
      btrim(coalesce(v_item ->> 'fact_key', '')),
      ''
    ) is null then
      raise exception 'Todo fato precisa de uma identificação';
    end if;

    if nullif(
      btrim(coalesce(v_item ->> 'fact_value', '')),
      ''
    ) is null then
      raise exception 'Todo fato precisa de um valor';
    end if;

    insert into public.company_commercial_facts (
      company_id,
      config_version_id,
      category,
      fact_key,
      fact_value,
      source_note,
      is_active
    )
    values (
      p_company_id,
      v_config_id,
      btrim(v_item ->> 'category'),
      btrim(v_item ->> 'fact_key'),
      btrim(v_item ->> 'fact_value'),
      nullif(
        btrim(coalesce(v_item ->> 'source_note', '')),
        ''
      ),
      coalesce(
        nullif(v_item ->> 'is_active', '')::boolean,
        true
      )
    );
  end loop;

  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(p_payload -> 'objection_guides', '[]'::jsonb)
    ) as item(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada guia de objeção deve ser um objeto';
    end if;

    if nullif(v_item ->> 'sort_order', '') is null then
      raise exception 'Todo guia de objeção precisa de uma ordem';
    end if;

    if nullif(
      btrim(coalesce(v_item ->> 'objection', '')),
      ''
    ) is null then
      raise exception 'Todo guia precisa identificar a objeção';
    end if;

    if nullif(
      btrim(coalesce(v_item ->> 'recommended_approach', '')),
      ''
    ) is null then
      raise exception 'Todo guia precisa de uma abordagem recomendada';
    end if;

    insert into public.company_commercial_objection_guides (
      company_id,
      config_version_id,
      sort_order,
      objection,
      signals,
      discovery_questions,
      recommended_approach,
      response_limits,
      is_active
    )
    values (
      p_company_id,
      v_config_id,
      (v_item ->> 'sort_order')::integer,
      btrim(v_item ->> 'objection'),
      private.commercial_jsonb_text_array(
        v_item -> 'signals',
        'signals'
      ),
      private.commercial_jsonb_text_array(
        v_item -> 'discovery_questions',
        'discovery_questions'
      ),
      btrim(v_item ->> 'recommended_approach'),
      private.commercial_jsonb_text_array(
        v_item -> 'response_limits',
        'response_limits'
      ),
      coalesce(
        nullif(v_item ->> 'is_active', '')::boolean,
        true
      )
    );
  end loop;

  return query
  select
    version.company_id,
    version.id,
    version.version_number,
    version.status
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = v_config_id;
end;
$$;

revoke all
on function public.rpc_save_company_commercial_config_draft(
  uuid,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function public.rpc_save_company_commercial_config_draft(
  uuid,
  uuid,
  jsonb
)
to authenticated;

-- ============================================================================
-- Clona uma versão publicada ou arquivada para um novo rascunho.
-- ============================================================================

create or replace function public.rpc_clone_company_commercial_config(
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
  v_actor uuid;
  v_source public.company_commercial_config_versions%rowtype;
  v_new_config_id uuid;
  v_existing_draft_id uuid;
begin
  v_actor := private.require_company_commercial_admin(p_company_id);

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text, 0)
  );

  select version.id
  into v_existing_draft_id
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.status = 'draft'
  limit 1
  for update;

  if v_existing_draft_id is not null then
    raise exception
      'Exclua ou conclua o rascunho atual antes de clonar outra versão';
  end if;

  select version.*
  into v_source
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = p_source_config_version_id
    and version.status in ('published', 'archived');

  if v_source.id is null then
    raise exception
      'Versão publicada ou arquivada não encontrada';
  end if;

  insert into public.company_commercial_config_versions (
    company_id,
    business_description,
    target_audience,
    value_proposition,
    commercial_method_name,
    commercial_method_description,
    communication_tone,
    required_behaviors,
    prohibited_behaviors,
    created_by
  )
  values (
    p_company_id,
    v_source.business_description,
    v_source.target_audience,
    v_source.value_proposition,
    v_source.commercial_method_name,
    v_source.commercial_method_description,
    v_source.communication_tone,
    v_source.required_behaviors,
    v_source.prohibited_behaviors,
    v_actor
  )
  returning id
  into v_new_config_id;

  insert into public.company_commercial_method_steps (
    company_id,
    config_version_id,
    step_order,
    name,
    objective,
    completion_criteria,
    recommended_questions,
    is_required
  )
  select
    p_company_id,
    v_new_config_id,
    step.step_order,
    step.name,
    step.objective,
    step.completion_criteria,
    step.recommended_questions,
    step.is_required
  from public.company_commercial_method_steps step
  where step.company_id = p_company_id
    and step.config_version_id = v_source.id;

  insert into public.company_commercial_product_profiles (
    company_id,
    config_version_id,
    product_id,
    indicated_audiences,
    needs_addressed,
    benefits,
    verified_differentiators,
    limitations,
    contract_conditions,
    payment_conditions,
    allowed_claims,
    forbidden_claims
  )
  select
    p_company_id,
    v_new_config_id,
    profile.product_id,
    profile.indicated_audiences,
    profile.needs_addressed,
    profile.benefits,
    profile.verified_differentiators,
    profile.limitations,
    profile.contract_conditions,
    profile.payment_conditions,
    profile.allowed_claims,
    profile.forbidden_claims
  from public.company_commercial_product_profiles profile
  where profile.company_id = p_company_id
    and profile.config_version_id = v_source.id;

  insert into public.company_commercial_facts (
    company_id,
    config_version_id,
    category,
    fact_key,
    fact_value,
    source_note,
    is_active
  )
  select
    p_company_id,
    v_new_config_id,
    fact.category,
    fact.fact_key,
    fact.fact_value,
    fact.source_note,
    fact.is_active
  from public.company_commercial_facts fact
  where fact.company_id = p_company_id
    and fact.config_version_id = v_source.id;

  insert into public.company_commercial_objection_guides (
    company_id,
    config_version_id,
    sort_order,
    objection,
    signals,
    discovery_questions,
    recommended_approach,
    response_limits,
    is_active
  )
  select
    p_company_id,
    v_new_config_id,
    guide.sort_order,
    guide.objection,
    guide.signals,
    guide.discovery_questions,
    guide.recommended_approach,
    guide.response_limits,
    guide.is_active
  from public.company_commercial_objection_guides guide
  where guide.company_id = p_company_id
    and guide.config_version_id = v_source.id;

  return query
  select
    version.company_id,
    version.id,
    version.version_number,
    version.status
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = v_new_config_id;
end;
$$;

revoke all
on function public.rpc_clone_company_commercial_config(uuid, uuid)
from public, anon;

grant execute
on function public.rpc_clone_company_commercial_config(uuid, uuid)
to authenticated;

-- ============================================================================
-- Publica um rascunho.
--
-- As validações e o arquivamento da versão anterior continuam protegidos
-- pelos triggers criados na Fase 2.
-- ============================================================================

create or replace function public.rpc_publish_company_commercial_config(
  p_company_id uuid,
  p_config_version_id uuid
)
returns table (
  company_id uuid,
  config_version_id uuid,
  version_number integer,
  status text,
  published_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform private.require_company_commercial_admin(p_company_id);

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text, 0)
  );

  return query
  update public.company_commercial_config_versions version
  set status = 'published'
  where version.company_id = p_company_id
    and version.id = p_config_version_id
    and version.status = 'draft'
  returning
    version.company_id,
    version.id,
    version.version_number,
    version.status,
    version.published_at;

  if not found then
    raise exception
      'Rascunho não encontrado ou já não está disponível para publicação';
  end if;
end;
$$;

revoke all
on function public.rpc_publish_company_commercial_config(uuid, uuid)
from public, anon;

grant execute
on function public.rpc_publish_company_commercial_config(uuid, uuid)
to authenticated;

-- ============================================================================
-- Exclui somente uma versão rascunho.
-- ============================================================================

create or replace function public.rpc_delete_company_commercial_config_draft(
  p_company_id uuid,
  p_config_version_id uuid
)
returns table (
  company_id uuid,
  config_version_id uuid,
  deleted boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_draft_id uuid;
begin
  perform private.require_company_commercial_admin(p_company_id);

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text, 0)
  );

  select version.id
  into v_draft_id
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = p_config_version_id
    and version.status = 'draft'
  for update;

  if v_draft_id is null then
    raise exception
      'Rascunho não encontrado ou não pode mais ser excluído';
  end if;

  delete from public.company_commercial_objection_guides guide
  where guide.company_id = p_company_id
    and guide.config_version_id = v_draft_id;

  delete from public.company_commercial_facts fact
  where fact.company_id = p_company_id
    and fact.config_version_id = v_draft_id;

  delete from public.company_commercial_product_profiles profile
  where profile.company_id = p_company_id
    and profile.config_version_id = v_draft_id;

  delete from public.company_commercial_method_steps step
  where step.company_id = p_company_id
    and step.config_version_id = v_draft_id;

  return query
  delete from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = v_draft_id
    and version.status = 'draft'
  returning
    version.company_id,
    version.id,
    true;
end;
$$;

revoke all
on function public.rpc_delete_company_commercial_config_draft(uuid, uuid)
from public, anon;

grant execute
on function public.rpc_delete_company_commercial_config_draft(uuid, uuid)
to authenticated;

-- ============================================================================
-- Documentação dos contratos públicos.
-- ============================================================================

comment on function public.rpc_save_company_commercial_config_draft(
  uuid,
  uuid,
  jsonb
) is
  'Cria ou substitui atomicamente todo o rascunho comercial de uma empresa.';

comment on function public.rpc_clone_company_commercial_config(
  uuid,
  uuid
) is
  'Clona uma versão comercial publicada ou arquivada para um novo rascunho.';

comment on function public.rpc_publish_company_commercial_config(
  uuid,
  uuid
) is
  'Publica um rascunho comercial após todas as validações obrigatórias.';

comment on function public.rpc_delete_company_commercial_config_draft(
  uuid,
  uuid
) is
  'Exclui uma configuração comercial somente quando ainda é rascunho.';