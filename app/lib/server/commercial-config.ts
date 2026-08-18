import type { getAuthedSupabase } from '@/app/lib/supabase/server'
import type {
  CommercialConfigBundle,
  CommercialConfigDeleteResult,
  CommercialConfigDraftInput,
  CommercialConfigMutationResult,
  CommercialConfigProductOption,
  CommercialConfigPublishResult,
  CommercialConfigVersion,
  CommercialConfigWorkspace,
  CommercialFact,
  CommercialMethodStep,
  CommercialObjectionGuide,
  CommercialProductProfile,
} from '@/app/types/commercial-config'

type CommercialConfigSupabase = Awaited<
  ReturnType<typeof getAuthedSupabase>
>['supabase']

const VERSION_FIELDS = `
  id,
  company_id,
  version_number,
  contract_version,
  status,
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
  created_by,
  published_by,
  archived_by,
  created_at,
  updated_at,
  published_at,
  archived_at
`

const METHOD_STEP_FIELDS = `
  id,
  company_id,
  config_version_id,
  step_order,
  name,
  objective,
  completion_criteria,
  recommended_questions,
  is_required,
  created_at,
  updated_at
`

const PRODUCT_PROFILE_FIELDS = `
  id,
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
  forbidden_claims,
  created_at,
  updated_at
`

const FACT_FIELDS = `
  id,
  company_id,
  config_version_id,
  category,
  fact_key,
  fact_value,
  source_note,
  is_active,
  created_at,
  updated_at
`

const OBJECTION_GUIDE_FIELDS = `
  id,
  company_id,
  config_version_id,
  sort_order,
  objection,
  signals,
  discovery_questions,
  recommended_approach,
  response_limits,
  is_active,
  created_at,
  updated_at
`

const PRODUCT_OPTION_FIELDS = `
  id,
  company_id,
  name,
  category,
  base_price,
  active
`

function buildBundle(
  version: CommercialConfigVersion | null,
  methodSteps: CommercialMethodStep[],
  productProfiles: CommercialProductProfile[],
  facts: CommercialFact[],
  objectionGuides: CommercialObjectionGuide[],
): CommercialConfigBundle | null {
  if (!version) {
    return null
  }

  return {
    version,
    method_steps: methodSteps
      .filter(
        (step) => step.config_version_id === version.id,
      )
      .sort((a, b) => a.step_order - b.step_order),

    product_profiles: productProfiles.filter(
      (profile) => profile.config_version_id === version.id,
    ),

    facts: facts
      .filter((fact) => fact.config_version_id === version.id)
      .sort((a, b) => {
        const categoryComparison = a.category.localeCompare(
          b.category,
          'pt-BR',
        )

        if (categoryComparison !== 0) {
          return categoryComparison
        }

        return a.fact_key.localeCompare(b.fact_key, 'pt-BR')
      }),

    objection_guides: objectionGuides
      .filter(
        (guide) => guide.config_version_id === version.id,
      )
      .sort((a, b) => a.sort_order - b.sort_order),
  }
}

function getRpcRow<T>(
  data: unknown,
  operationName: string,
): T {
  const row = Array.isArray(data) ? data[0] : data

  if (!row) {
    throw new Error(
      `${operationName} não retornou o resultado esperado.`,
    )
  }

  return row as T
}

function buildDraftPayload(input: CommercialConfigDraftInput) {
  return {
    business_description: input.business_description,
    target_audience: input.target_audience,
    value_proposition: input.value_proposition,

    commercial_method_name: input.commercial_method_name,
    commercial_method_description:
      input.commercial_method_description,

    commercial_method_definition:
      input.commercial_method_definition,

    communication_tone: input.communication_tone,

    required_behaviors: input.required_behaviors,
    prohibited_behaviors: input.prohibited_behaviors,

    method_steps: input.method_steps.map((step) => ({
      step_order: step.step_order,
      name: step.name,
      objective: step.objective,
      completion_criteria: step.completion_criteria,
      recommended_questions: step.recommended_questions,
      is_required: step.is_required,
    })),

    product_profiles: input.product_profiles.map(
      (profile) => ({
        product_id: profile.product_id,

        commercial_product_definition:
          profile.commercial_product_definition,

        indicated_audiences: profile.indicated_audiences,
        needs_addressed: profile.needs_addressed,
        benefits: profile.benefits,
        verified_differentiators:
          profile.verified_differentiators,
        limitations: profile.limitations,
        contract_conditions: profile.contract_conditions,
        payment_conditions: profile.payment_conditions,
        allowed_claims: profile.allowed_claims,
        forbidden_claims: profile.forbidden_claims,
      }),
    ),

    facts: input.facts.map((fact) => ({
      category: fact.category,
      fact_key: fact.fact_key,
      fact_value: fact.fact_value,
      source_note: fact.source_note,
      is_active: fact.is_active,
    })),

    objection_guides: input.objection_guides.map(
      (guide) => ({
        sort_order: guide.sort_order,
        objection: guide.objection,
        signals: guide.signals,
        discovery_questions: guide.discovery_questions,
        recommended_approach: guide.recommended_approach,
        response_limits: guide.response_limits,
        is_active: guide.is_active,
      }),
    ),
  }
}

export async function getCommercialConfigWorkspace(
  supabase: CommercialConfigSupabase,
  companyId: string,
): Promise<CommercialConfigWorkspace> {
  const [versionsResult, productsResult] = await Promise.all([
    supabase
      .from('company_commercial_config_versions')
      .select(VERSION_FIELDS)
      .eq('company_id', companyId)
      .order('version_number', { ascending: false }),

    supabase
      .from('products')
      .select(PRODUCT_OPTION_FIELDS)
      .eq('company_id', companyId)
      .order('active', { ascending: false })
      .order('name', { ascending: true }),
  ])

  if (versionsResult.error) {
    throw new Error(
      `Erro ao carregar versões comerciais: ${versionsResult.error.message}`,
    )
  }

  if (productsResult.error) {
    throw new Error(
      `Erro ao carregar produtos: ${productsResult.error.message}`,
    )
  }

  const versions =
    (versionsResult.data ?? []) as CommercialConfigVersion[]

  const products =
    (productsResult.data ??
      []) as CommercialConfigProductOption[]

  const draftVersion =
    versions.find((version) => version.status === 'draft') ??
    null

  const publishedVersion =
    versions.find(
      (version) => version.status === 'published',
    ) ?? null

  const archivedVersions = versions.filter(
    (version) => version.status === 'archived',
  )

  const bundleVersionIds = [
    draftVersion?.id,
    publishedVersion?.id,
  ].filter((value): value is string => Boolean(value))

  let methodSteps: CommercialMethodStep[] = []
  let productProfiles: CommercialProductProfile[] = []
  let facts: CommercialFact[] = []
  let objectionGuides: CommercialObjectionGuide[] = []

  if (bundleVersionIds.length > 0) {
    const [
      methodStepsResult,
      productProfilesResult,
      factsResult,
      objectionGuidesResult,
    ] = await Promise.all([
      supabase
        .from('company_commercial_method_steps')
        .select(METHOD_STEP_FIELDS)
        .eq('company_id', companyId)
        .in('config_version_id', bundleVersionIds)
        .order('step_order', { ascending: true }),

      supabase
        .from('company_commercial_product_profiles')
        .select(PRODUCT_PROFILE_FIELDS)
        .eq('company_id', companyId)
        .in('config_version_id', bundleVersionIds),

      supabase
        .from('company_commercial_facts')
        .select(FACT_FIELDS)
        .eq('company_id', companyId)
        .in('config_version_id', bundleVersionIds)
        .order('category', { ascending: true })
        .order('fact_key', { ascending: true }),

      supabase
        .from('company_commercial_objection_guides')
        .select(OBJECTION_GUIDE_FIELDS)
        .eq('company_id', companyId)
        .in('config_version_id', bundleVersionIds)
        .order('sort_order', { ascending: true }),
    ])

    if (methodStepsResult.error) {
      throw new Error(
        `Erro ao carregar etapas do método: ${methodStepsResult.error.message}`,
      )
    }

    if (productProfilesResult.error) {
      throw new Error(
        `Erro ao carregar perfis de produto: ${productProfilesResult.error.message}`,
      )
    }

    if (factsResult.error) {
      throw new Error(
        `Erro ao carregar fatos oficiais: ${factsResult.error.message}`,
      )
    }

    if (objectionGuidesResult.error) {
      throw new Error(
        `Erro ao carregar guias de objeção: ${objectionGuidesResult.error.message}`,
      )
    }

    methodSteps =
      (methodStepsResult.data ?? []) as CommercialMethodStep[]

    productProfiles =
      (productProfilesResult.data ??
        []) as CommercialProductProfile[]

    facts = (factsResult.data ?? []) as CommercialFact[]

    objectionGuides =
      (objectionGuidesResult.data ??
        []) as CommercialObjectionGuide[]
  }

  return {
    draft: buildBundle(
      draftVersion,
      methodSteps,
      productProfiles,
      facts,
      objectionGuides,
    ),

    published: buildBundle(
      publishedVersion,
      methodSteps,
      productProfiles,
      facts,
      objectionGuides,
    ),

    archived_versions: archivedVersions,
    products,
  }
}

export async function saveCommercialConfigDraft(
  supabase: CommercialConfigSupabase,
  companyId: string,
  input: CommercialConfigDraftInput,
): Promise<CommercialConfigMutationResult> {
  const { data, error } = await supabase.rpc(
    'rpc_save_company_commercial_config_draft_v4',
    {
      p_company_id: companyId,
      p_config_version_id:
        input.config_version_id ?? null,
      p_payload: buildDraftPayload(input),
    },
  )

  if (error) {
    throw new Error(
      `Erro ao salvar configuração comercial: ${error.message}`,
    )
  }

  return getRpcRow<CommercialConfigMutationResult>(
    data,
    'O salvamento da configuração comercial',
  )
}

export async function cloneCommercialConfigVersion(
  supabase: CommercialConfigSupabase,
  companyId: string,
  sourceConfigVersionId: string,
): Promise<CommercialConfigMutationResult> {
  const { data, error } = await supabase.rpc(
    'rpc_clone_company_commercial_config_v4',
    {
      p_company_id: companyId,
      p_source_config_version_id:
        sourceConfigVersionId,
    },
  )

  if (error) {
    throw new Error(
      `Erro ao clonar configuração comercial: ${error.message}`,
    )
  }

  return getRpcRow<CommercialConfigMutationResult>(
    data,
    'A clonagem da configuração comercial',
  )
}

export async function publishCommercialConfigDraft(
  supabase: CommercialConfigSupabase,
  companyId: string,
  configVersionId: string,
): Promise<CommercialConfigPublishResult> {
  const { data, error } = await supabase.rpc(
    'rpc_publish_company_commercial_config',
    {
      p_company_id: companyId,
      p_config_version_id: configVersionId,
    },
  )

  if (error) {
    throw new Error(
      `Erro ao publicar configuração comercial: ${error.message}`,
    )
  }

  return getRpcRow<CommercialConfigPublishResult>(
    data,
    'A publicação da configuração comercial',
  )
}

export async function deleteCommercialConfigDraft(
  supabase: CommercialConfigSupabase,
  companyId: string,
  configVersionId: string,
): Promise<CommercialConfigDeleteResult> {
  const { data, error } = await supabase.rpc(
    'rpc_delete_company_commercial_config_draft',
    {
      p_company_id: companyId,
      p_config_version_id: configVersionId,
    },
  )

  if (error) {
    throw new Error(
      `Erro ao excluir rascunho comercial: ${error.message}`,
    )
  }

  return getRpcRow<CommercialConfigDeleteResult>(
    data,
    'A exclusão do rascunho comercial',
  )
}