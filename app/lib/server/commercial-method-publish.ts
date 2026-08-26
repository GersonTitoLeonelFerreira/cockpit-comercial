import type { getAuthedSupabase } from '@/app/lib/supabase/server'
import {
  validateCommercialMethodDefinition,
} from '@/app/lib/companion/commercial-method-contract'
import type {
  CommercialMethodDefinition,
  CommercialMethodValidationIssue,
} from '@/app/lib/companion/commercial-method-contract'
import {
  cloneCommercialConfigVersion,
  getCommercialConfigWorkspace,
  publishCommercialConfigDraft,
  saveCommercialConfigDraft,
} from '@/app/lib/server/commercial-config'
import { getCommercialMethodConstruction } from '@/app/lib/server/commercial-method-construction'
import { createEmptyCommercialConfigDraft } from '@/app/types/commercial-config'
import type {
  CommercialConfigBundle,
  CommercialConfigDraftInput,
} from '@/app/types/commercial-config'

type CommercialMethodPublishSupabase = Awaited<
  ReturnType<typeof getAuthedSupabase>
>['supabase']

// ============================================================================
// Publica, de forma explícita, o método comercial produzido pela Guided
// Commercial Method Journey.
//
// A construção assistida (company_commercial_method_builder_drafts) só
// materializa method_definition quando review_ready; ela nunca publica
// company_commercial_config_versions sozinha. Esta função é a ponte
// explícita entre as duas tabelas: reaproveita o mecanismo de
// save/clone/publish já existente (RPCs V6), preservando produtos, fatos,
// objeções, tom e comportamentos da configuração comercial atual, e troca
// apenas os campos do método pelo commercial-method-v2 compilado pela
// jornada guiada.
// ============================================================================

export type CommercialMethodPublishErrorCode =
  | 'NOT_REVIEW_READY'
  | 'INVALID_DEFINITION'
  | 'SAVE_FAILED'
  | 'PUBLISH_FAILED'
  | 'VERIFICATION_FAILED'

export class CommercialMethodPublishError extends Error {
  readonly code: CommercialMethodPublishErrorCode
  readonly issues?: CommercialMethodValidationIssue[]

  constructor(
    code: CommercialMethodPublishErrorCode,
    message: string,
    issues?: CommercialMethodValidationIssue[],
  ) {
    super(message)
    this.name = 'CommercialMethodPublishError'
    this.code = code
    this.issues = issues
  }
}

export interface PublishBuilderCommercialMethodResult {
  company_id: string
  config_version_id: string
  version_number: number
  published_at: string
  method_name: string
  method_definition: CommercialMethodDefinition
  previous_published_version_number: number | null
  already_published: boolean
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

// Comparação estrutural, insensível à ordem de chaves de objeto (jsonb do
// Postgres não garante preservar a ordem de inserção), mas sensível à ordem
// de listas (a ordem das etapas e dos princípios importa).
function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqualJson(item, b[index]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord)
    const bKeys = Object.keys(bRecord)

    if (aKeys.length !== bKeys.length) return false

    return aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(bRecord, key) &&
        deepEqualJson(aRecord[key], bRecord[key]),
    )
  }

  return false
}

// Constrói o payload completo de rascunho a partir da versão comercial
// atual (draft ou publicada), preservando tudo o que não é o método, e
// substituindo apenas nome, descrição e definição do método.
function bundleToDraftInput(
  bundle: CommercialConfigBundle | null,
  methodDefinition: CommercialMethodDefinition,
): CommercialConfigDraftInput {
  const methodFields = {
    commercial_method_name: methodDefinition.name,
    commercial_method_description: methodDefinition.description,
    commercial_method_definition: methodDefinition,
  }

  if (!bundle) {
    return {
      ...createEmptyCommercialConfigDraft(),
      ...methodFields,
    }
  }

  return {
    config_version_id: bundle.version.id,

    business_description: bundle.version.business_description,
    target_audience: bundle.version.target_audience,
    value_proposition: bundle.version.value_proposition,

    ...methodFields,

    communication_tone: bundle.version.communication_tone,

    required_behaviors: bundle.version.required_behaviors,
    prohibited_behaviors: bundle.version.prohibited_behaviors,

    method_steps: bundle.method_steps.map((step) => ({
      id: step.id,
      step_order: step.step_order,
      name: step.name,
      objective: step.objective,
      completion_criteria: step.completion_criteria,
      recommended_questions: step.recommended_questions,
      is_required: step.is_required,
    })),

    product_profiles: bundle.product_profiles.map((profile) => ({
      id: profile.id,
      product_id: profile.product_id,
      commercial_product_contract_version:
        profile.commercial_product_contract_version,
      commercial_product_definition: profile.commercial_product_definition,
      indicated_audiences: profile.indicated_audiences,
      needs_addressed: profile.needs_addressed,
      benefits: profile.benefits,
      verified_differentiators: profile.verified_differentiators,
      limitations: profile.limitations,
      contract_conditions: profile.contract_conditions,
      payment_conditions: profile.payment_conditions,
      allowed_claims: profile.allowed_claims,
      forbidden_claims: profile.forbidden_claims,
    })),

    facts: bundle.facts.map((fact) => ({
      id: fact.id,
      commercial_fact_contract_version: fact.commercial_fact_contract_version,
      commercial_fact_definition: fact.commercial_fact_definition,
      category: fact.category,
      fact_key: fact.fact_key,
      fact_value: fact.fact_value,
      source_note: fact.source_note,
      is_active: fact.is_active,
    })),

    objection_guides: bundle.objection_guides.map((guide) => ({
      id: guide.id,
      commercial_objection_contract_version:
        guide.commercial_objection_contract_version,
      commercial_objection_definition: guide.commercial_objection_definition,
      sort_order: guide.sort_order,
      objection: guide.objection,
      signals: guide.signals,
      discovery_questions: guide.discovery_questions,
      recommended_approach: guide.recommended_approach,
      response_limits: guide.response_limits,
      is_active: guide.is_active,
    })),
  }
}

export async function publishBuilderCommercialMethod(
  supabase: CommercialMethodPublishSupabase,
  companyId: string,
): Promise<PublishBuilderCommercialMethodResult> {
  const construction = await getCommercialMethodConstruction(
    supabase,
    companyId,
  )

  if (
    !construction ||
    construction.status !== 'review_ready' ||
    !construction.method_definition
  ) {
    throw new CommercialMethodPublishError(
      'NOT_REVIEW_READY',
      'O método precisa estar pronto para revisão final antes de ser publicado.',
    )
  }

  const methodDefinition = construction.method_definition
  const validation = validateCommercialMethodDefinition(methodDefinition)

  if (!validation.valid) {
    throw new CommercialMethodPublishError(
      'INVALID_DEFINITION',
      'O método construído não passa nas validações do contrato commercial-method-v2.',
      validation.issues,
    )
  }

  let workspace = await getCommercialConfigWorkspace(supabase, companyId)
  const previousPublishedVersionNumber =
    workspace.published?.version.version_number ?? null

  // Idempotência: se a versão publicada já reflete exatamente este método,
  // não há nada a fazer. Cobre retry, clique duplo e refresh depois de uma
  // publicação que já havia sido concluída.
  if (
    workspace.published &&
    workspace.published.version.commercial_method_contract_version ===
      'commercial-method-v2' &&
    deepEqualJson(
      workspace.published.version.commercial_method_definition,
      methodDefinition,
    )
  ) {
    return {
      company_id: companyId,
      config_version_id: workspace.published.version.id,
      version_number: workspace.published.version.version_number,
      published_at:
        workspace.published.version.published_at ??
        new Date().toISOString(),
      method_name: workspace.published.version.commercial_method_name,
      method_definition: methodDefinition,
      previous_published_version_number: previousPublishedVersionNumber,
      already_published: true,
    }
  }

  if (!workspace.draft && workspace.published) {
    // Não existe rascunho em andamento: clona a versão publicada atual para
    // preservar produtos, fatos, objeções, tom e comportamentos antes de
    // trocar apenas o método.
    try {
      await cloneCommercialConfigVersion(
        supabase,
        companyId,
        workspace.published.version.id,
      )
    } catch (cloneError: unknown) {
      throw new CommercialMethodPublishError(
        'SAVE_FAILED',
        errorMessage(
          cloneError,
          'Erro ao preparar a nova versão comercial a partir da versão publicada.',
        ),
      )
    }

    workspace = await getCommercialConfigWorkspace(supabase, companyId)
  }

  const payload = bundleToDraftInput(workspace.draft, methodDefinition)

  let saveResult
  try {
    saveResult = await saveCommercialConfigDraft(
      supabase,
      companyId,
      payload,
    )
  } catch (saveError: unknown) {
    throw new CommercialMethodPublishError(
      'SAVE_FAILED',
      errorMessage(
        saveError,
        'Erro ao preparar o método para publicação.',
      ),
    )
  }

  let publishResult
  try {
    publishResult = await publishCommercialConfigDraft(
      supabase,
      companyId,
      saveResult.config_version_id,
    )
  } catch (publishError: unknown) {
    throw new CommercialMethodPublishError(
      'PUBLISH_FAILED',
      errorMessage(
        publishError,
        'Erro ao publicar o método. O método anterior continua ativo.',
      ),
    )
  }

  // Fonte de verdade é o banco: relê a versão publicada e comprova que ela
  // contém exatamente o método compilado pela jornada guiada antes de
  // reportar sucesso.
  const verifyWorkspace = await getCommercialConfigWorkspace(
    supabase,
    companyId,
  )
  const published = verifyWorkspace.published

  if (
    !published ||
    published.version.id !== publishResult.config_version_id ||
    published.version.status !== 'published' ||
    published.version.commercial_method_contract_version !==
      'commercial-method-v2' ||
    !deepEqualJson(
      published.version.commercial_method_definition,
      methodDefinition,
    )
  ) {
    throw new CommercialMethodPublishError(
      'VERIFICATION_FAILED',
      'A publicação não pôde ser confirmada no banco de dados.',
    )
  }

  return {
    company_id: companyId,
    config_version_id: published.version.id,
    version_number: published.version.version_number,
    published_at: published.version.published_at ?? new Date().toISOString(),
    method_name: published.version.commercial_method_name,
    method_definition: methodDefinition,
    previous_published_version_number: previousPublishedVersionNumber,
    already_published: false,
  }
}
