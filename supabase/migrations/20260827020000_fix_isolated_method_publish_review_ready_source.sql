-- ============================================================================
-- Yolen — ONDA 8 / FRENTE A — correção
--
-- rpc_publish_builder_commercial_method (20260827010000) tinha três lacunas
-- apontadas pelo Controle Mestre:
--
-- 1) P0 — idempotência dependia só de uma checagem em TypeScript antes de
--    chamar a RPC. Duas requisições simultâneas podiam passar por essa
--    checagem antes de qualquer uma publicar, e a segunda, ao adquirir o
--    advisory lock depois da primeira já ter publicado, criava uma nova
--    versão redundante com o mesmo método.
--
-- 2) A RPC recebia a definição do método (p_method_definition jsonb) como
--    parâmetro do cliente. Isso permite, em tese, publicar qualquer
--    commercial-method-v2 montado à mão, contornando a Guided Journey.
--
-- 3) Nenhuma proteção contra "builder desatualizado": se o método mudasse
--    entre a UI carregar e o clique em publicar, a versão antiga (ou outro
--    método) podia ser publicada com base num JSON velho do cliente.
--
-- Correção: a RPC deixa de receber a definição do método. Ela mesma lê
-- company_commercial_method_builder_drafts (única fonte de verdade),
-- exige method_construction_status = 'review_ready', compara a versão
-- publicada atual com a definição pretendida DEPOIS de adquirir o
-- advisory lock (idempotência garantida no banco, não só no TypeScript),
-- e rejeita explicitamente uma chamada baseada em estado desatualizado do
-- builder (p_expected_method_updated_at).
--
-- Também corrige um bug latente: a versão anterior desta migration copiava
-- company_commercial_method_steps do método ANTERIOR (produção histórica),
-- o que é semanticamente errado ao trocar de método — as etapas de um
-- método diferente não descrevem o método novo. A projeção de
-- compatibilidade histórica agora é derivada das stages do
-- commercial-method-v2 sendo publicado agora.
--
-- Primeira publicação (empresa sem nenhuma company_commercial_config_versions
-- publicada ainda): a Guided Journey/Base Comercial não contém, hoje,
-- contexto de negócio em formato equivalente a business_description/
-- target_audience/value_proposition/communication_tone/comportamentos —
-- são dados estruturados de diagnóstico para construir o MÉTODO, não uma
-- síntese aprovada da configuração comercial base. Sintetizar uma a partir
-- da outra seria inventar conteúdo. Por isso a publicação isolada do
-- método é bloqueada, com mensagem explícita, até existir uma
-- configuração comercial publicada — a base (contexto, tom,
-- comportamentos, produtos) continua sendo publicada pelo editor avançado
-- existente, sem alteração aqui.
--
-- Nenhuma migration antiga é alterada.
-- ============================================================================

drop function if exists
  public.rpc_publish_builder_commercial_method(uuid, jsonb);

create or replace function public.rpc_publish_builder_commercial_method(
  p_company_id uuid,
  p_expected_method_updated_at timestamp with time zone
)
returns table (
  company_id uuid,
  config_version_id uuid,
  version_number integer,
  status text,
  published_at timestamp with time zone,
  already_published boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid;
  v_builder public.company_commercial_method_builder_drafts%rowtype;
  v_method_definition jsonb;
  v_current_published public.company_commercial_config_versions%rowtype;
  v_source public.company_commercial_config_versions%rowtype;
  v_new_config_id uuid;
begin
  v_actor := private.require_company_commercial_admin(p_company_id);

  -- Mesma trava usada por rpc_publish_company_commercial_config e pelas
  -- demais operações desta empresa: serializa qualquer transição de
  -- publicação concorrente. Tudo abaixo — a leitura do builder, a
  -- comparação de idempotência e a publicação — acontece depois do lock,
  -- na mesma transação.
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text, 0)
  );

  select builder.*
  into v_builder
  from public.company_commercial_method_builder_drafts builder
  where builder.company_id = p_company_id
  limit 1;

  if v_builder.company_id is null then
    raise exception
      'A construção do método ainda não foi iniciada para esta empresa.';
  end if;

  if v_builder.method_construction_status <> 'review_ready'
    or v_builder.method_definition is null
  then
    raise exception
      'O método precisa estar pronto para revisão final antes de ser publicado.';
  end if;

  if v_builder.method_updated_at is distinct from p_expected_method_updated_at
  then
    raise exception
      'O método foi alterado desde que a página foi carregada. Atualize a página e tente novamente.';
  end if;

  v_method_definition := v_builder.method_definition;

  if jsonb_typeof(v_method_definition) <> 'object'
    or v_method_definition ->> 'contract_version' <> 'commercial-method-v2'
  then
    raise exception
      'O método construído não está no contrato commercial-method-v2.';
  end if;

  select version.*
  into v_current_published
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.status = 'published';

  -- Idempotência garantida no banco, dentro do lock: se a versão
  -- publicada atual já reflete exatamente esta definição, não cria nada
  -- novo. Cobre duas publicações concorrentes do mesmo método, retry após
  -- commit e refresh.
  if v_current_published.id is not null
    and v_current_published.commercial_method_contract_version =
      'commercial-method-v2'
    and v_current_published.commercial_method_definition =
      v_method_definition
  then
    return query
    select
      v_current_published.company_id,
      v_current_published.id,
      v_current_published.version_number,
      v_current_published.status,
      v_current_published.published_at,
      true;
    return;
  end if;

  -- Primeira publicação: bloqueada. Ver nota no cabeçalho desta migration.
  if v_current_published.id is null then
    raise exception
      'Ainda não existe uma configuração comercial publicada para esta empresa. Publique a configuração comercial base (contexto, tom e comportamentos) antes de publicar o método.';
  end if;

  v_source := v_current_published;

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
    v_source.business_description,
    v_source.target_audience,
    v_source.value_proposition,
    v_method_definition ->> 'name',
    v_method_definition ->> 'description',
    'commercial-method-v2',
    v_method_definition,
    v_source.communication_tone,
    v_source.required_behaviors,
    v_source.prohibited_behaviors,
    v_actor
  )
  returning id
  into v_new_config_id;

  -- Projeção de compatibilidade histórica: method_steps é derivado das
  -- stages do commercial-method-v2 sendo publicado agora — nunca copiado
  -- do método anterior, que descreveria etapas de um método diferente.
  -- O Companion é v2-only; esta tabela existe apenas por compatibilidade
  -- histórica e para satisfazer a validação de publicação já existente.
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
    (stage ->> 'display_order')::integer,
    stage ->> 'name',
    stage ->> 'objective',
    coalesce(
      (
        select array_agg(criterion #>> '{}')
        from jsonb_array_elements(stage -> 'completion_criteria') as criterion
      ),
      '{}'::text[]
    ),
    coalesce(
      (
        select array_agg(question #>> '{}')
        from jsonb_array_elements(stage -> 'recommended_questions') as question
      ),
      '{}'::text[]
    ),
    (stage ->> 'requirement') = 'required'
  from jsonb_array_elements(v_method_definition -> 'stages') as stage;

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
    version.published_at,
    false
  from public.company_commercial_config_versions version
  where version.company_id = p_company_id
    and version.id = v_new_config_id;
end;
$$;

revoke all
on function public.rpc_publish_builder_commercial_method(
  uuid,
  timestamp with time zone
)
from public, anon;

grant execute
on function public.rpc_publish_builder_commercial_method(
  uuid,
  timestamp with time zone
)
to authenticated;

comment on function public.rpc_publish_builder_commercial_method(
  uuid,
  timestamp with time zone
) is
  'Publica isoladamente o método review_ready de '
  'company_commercial_method_builder_drafts (única fonte de verdade — o '
  'cliente não envia mais a definição do método). Idempotente dentro do '
  'próprio advisory lock: se a versão publicada atual já reflete '
  'exatamente esse método, retorna already_published=true sem criar nada '
  'novo. p_expected_method_updated_at rejeita publicação baseada em '
  'estado desatualizado do builder. Nova versão nasce apenas da versão '
  'PUBLICADA atual (produtos, fatos, objeções, tom, comportamentos), '
  'nunca do rascunho comercial geral. Primeira publicação (sem versão '
  'publicada anterior) é bloqueada explicitamente. Ver ONDA 8 / FRENTE A.';
