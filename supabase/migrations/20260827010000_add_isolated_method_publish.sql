-- ============================================================================
-- Yolen — ONDA 8 / FRENTE A
-- Publicação isolada do método comercial.
--
-- Problema: publishBuilderCommercialMethod (Frente 1) reaproveita o
-- rascunho comercial da empresa quando ele já existe. Se esse rascunho
-- contiver alterações paralelas não relacionadas ao método (produto, fato,
-- objeção, tom, comportamento), "Publicar método" publicaria também essas
-- alterações sem o usuário ter escolhido isso.
--
-- Correção: uma nova versão publicada do método nunca nasce a partir do
-- rascunho comercial geral da empresa. Ela nasce exclusivamente a partir da
-- versão PUBLICADA atual (produtos, fatos, objeções, tom e comportamentos
-- tal como estão publicados hoje), com apenas os campos do método
-- substituídos, e é publicada na mesma transação. O rascunho comercial
-- geral, se existir, nunca é lido nem escrito por esta operação.
--
-- Isso exige poder ter, ao mesmo tempo, um rascunho comercial geral da
-- empresa (em edição pelo gestor) E um rascunho técnico e efêmero desta
-- operação (nascido e publicado dentro da mesma transação). O índice único
-- que hoje garante "um único rascunho por empresa" não distingue os dois
-- motivos de existir um rascunho — por isso a coluna draft_purpose abaixo.
--
-- Nenhuma migration antiga é alterada. As triggers de validação e
-- arquivamento já existentes (guard_company_commercial_config_version,
-- commercial_method_v2_validate_publish, guard_company_commercial_config_child)
-- continuam intactas e são reaproveitadas integralmente: a nova RPC insere
-- a versão como rascunho (a única forma permitida de nascer uma versão) e
-- depois a publica com um UPDATE ... SET status = 'published' idêntico ao
-- da RPC de publicação já existente, para herdar toda a validação e o
-- arquivamento automático da versão publicada anterior sem duplicar lógica.
-- ============================================================================

alter table public.company_commercial_config_versions
  add column if not exists draft_purpose text not null default 'general';

alter table public.company_commercial_config_versions
  drop constraint if exists
    company_commercial_config_versions_draft_purpose_check;

alter table public.company_commercial_config_versions
  add constraint company_commercial_config_versions_draft_purpose_check
  check (draft_purpose in ('general', 'method_publish'));

comment on column public.company_commercial_config_versions.draft_purpose is
  'Distingue, apenas enquanto status=draft, o rascunho comercial geral '
  '(general) do rascunho efêmero de publicação isolada do método '
  '(method_publish, criado e publicado na mesma transação por '
  'rpc_publish_builder_commercial_method). Sem efeito depois de publicado '
  'ou arquivado.';

-- O índice de "um único rascunho por empresa" precisa ser reescopado por
-- draft_purpose: general e method_publish são slots de unicidade
-- independentes, para que a publicação isolada do método nunca dispute o
-- mesmo slot do rascunho comercial geral do gestor.
drop index if exists public.company_commercial_config_one_draft_uidx;

create unique index company_commercial_config_one_general_draft_uidx
  on public.company_commercial_config_versions (company_id)
  where status = 'draft' and draft_purpose = 'general';

-- Garante, no próprio banco, que duas publicações isoladas de método não
-- possam coexistir em rascunho para a mesma empresa — proteção real contra
-- clique duplo/concorrência, independente do advisory lock abaixo.
create unique index company_commercial_config_one_method_publish_draft_uidx
  on public.company_commercial_config_versions (company_id)
  where status = 'draft' and draft_purpose = 'method_publish';

-- ============================================================================
-- rpc_publish_builder_commercial_method
--
-- Publica, de forma isolada e atômica, o método comercial construído pela
-- Guided Commercial Method Journey (commercial-method-v2), preservando
-- exatamente o estado atualmente PUBLICADO de produtos, fatos, objeções,
-- tom e comportamentos. Nunca lê nem altera o rascunho comercial geral da
-- empresa, se ele existir.
-- ============================================================================

create or replace function public.rpc_publish_builder_commercial_method(
  p_company_id uuid,
  p_method_definition jsonb
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
declare
  v_actor uuid;
  v_source public.company_commercial_config_versions%rowtype;
  v_new_config_id uuid;
begin
  v_actor := private.require_company_commercial_admin(p_company_id);

  if p_method_definition is null
    or jsonb_typeof(p_method_definition) <> 'object'
  then
    raise exception 'A definição do método precisa ser um objeto.';
  end if;

  if p_method_definition ->> 'contract_version' <> 'commercial-method-v2' then
    raise exception
      'A definição do método precisa declarar commercial-method-v2.';
  end if;

  if nullif(btrim(p_method_definition ->> 'name'), '') is null then
    raise exception 'O método precisa ter um nome.';
  end if;

  if nullif(btrim(p_method_definition ->> 'description'), '') is null then
    raise exception 'O método precisa ter uma descrição.';
  end if;

  -- Mesma trava usada por rpc_publish_company_commercial_config e pelas
  -- demais operações desta empresa: serializa qualquer transição de
  -- publicação concorrente, isolada ou não.
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text, 0)
  );

  -- Único ponto de leitura de estado comercial existente: a versão
  -- PUBLICADA atual, se houver. O rascunho comercial geral, se existir,
  -- nunca é lido nem alterado por esta função.
  select version.*
  into v_source
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.status = 'published';

  insert into public.company_commercial_config_versions (
    company_id,
    draft_purpose,
    business_description,
    target_audience,
    value_proposition,
    commercial_method_name,
    commercial_method_description,
    commercial_method_contract_version,
    commercial_method_definition,
    communication_tone,
    required_behaviors,
    prohibited_behaviors,
    created_by
  )
  values (
    p_company_id,
    'method_publish',
    coalesce(v_source.business_description, ''),
    coalesce(v_source.target_audience, ''),
    coalesce(v_source.value_proposition, ''),
    p_method_definition ->> 'name',
    p_method_definition ->> 'description',
    'commercial-method-v2',
    p_method_definition,
    coalesce(v_source.communication_tone, ''),
    coalesce(v_source.required_behaviors, '{}'::text[]),
    coalesce(v_source.prohibited_behaviors, '{}'::text[]),
    v_actor
  )
  returning id
  into v_new_config_id;

  if v_source.id is not null then
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
      commercial_product_contract_version,
      commercial_product_definition,
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
      profile.commercial_product_contract_version,
      profile.commercial_product_definition,
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
      commercial_fact_contract_version,
      commercial_fact_definition,
      category,
      fact_key,
      fact_value,
      source_note,
      is_active
    )
    select
      p_company_id,
      v_new_config_id,
      fact.commercial_fact_contract_version,
      fact.commercial_fact_definition,
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
      commercial_objection_contract_version,
      commercial_objection_definition,
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
      guide.commercial_objection_contract_version,
      guide.commercial_objection_definition,
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
  end if;

  -- Publica exatamente como rpc_publish_company_commercial_config: a
  -- validação de campos obrigatórios, a validação semântica do
  -- commercial-method-v2 e o arquivamento automático da versão publicada
  -- anterior continuam inteiramente a cargo das triggers já existentes.
  update public.company_commercial_config_versions version
  set status = 'published'
  where version.company_id = p_company_id
    and version.id = v_new_config_id
    and version.status = 'draft';

  if not found then
    raise exception
      'Não foi possível publicar o método comercial isoladamente.';
  end if;

  return query
  select
    version.company_id,
    version.id,
    version.version_number,
    version.status,
    version.published_at
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = v_new_config_id;
end;
$$;

revoke all
on function public.rpc_publish_builder_commercial_method(uuid, jsonb)
from public, anon;

grant execute
on function public.rpc_publish_builder_commercial_method(uuid, jsonb)
to authenticated;

comment on function public.rpc_publish_builder_commercial_method(uuid, jsonb) is
  'Publica o método comercial-method-v2 construído pela Guided Commercial '
  'Method Journey isoladamente: nova versão nasce apenas da versão '
  'PUBLICADA atual (produtos, fatos, objeções, tom, comportamentos), nunca '
  'do rascunho comercial geral da empresa. Ver ONDA 8 / FRENTE A.';
