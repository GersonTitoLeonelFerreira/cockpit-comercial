// ============================================================================
// Yolen Companion V2
// Tipos da configuração comercial versionada
// ============================================================================

import type {
  CommercialMethodDefinition,
} from '@/app/lib/companion/commercial-method-contract'

import type {
  CommercialSimpleProductDefinition,
} from '@/app/lib/companion/commercial-product-contract'

export const COMMERCIAL_CONFIG_CONTRACT_VERSION =
  'phase-2-v1' as const

export type CommercialConfigContractVersion =
  typeof COMMERCIAL_CONFIG_CONTRACT_VERSION

export type CommercialMethodPersistenceContractVersion =
  | 'commercial-method-v1'
  | 'commercial-method-v2'

export type CommercialProductPersistenceContractVersion =
  | 'commercial-product-v1'
  | 'commercial-product-v2'

export type CommercialConfigStatus =
  | 'draft'
  | 'published'
  | 'archived'

// ============================================================================
// Registros persistidos no banco
// ============================================================================

export interface CommercialConfigVersion {
  id: string
  company_id: string
  version_number: number
  contract_version: CommercialConfigContractVersion
  status: CommercialConfigStatus

  business_description: string
  target_audience: string
  value_proposition: string

  commercial_method_name: string
  commercial_method_description: string

  commercial_method_contract_version:
    CommercialMethodPersistenceContractVersion

  commercial_method_definition:
    CommercialMethodDefinition | null

  communication_tone: string

  required_behaviors: string[]
  prohibited_behaviors: string[]

  created_by: string
  published_by: string | null
  archived_by: string | null

  created_at: string
  updated_at: string
  published_at: string | null
  archived_at: string | null
}

export interface CommercialMethodStep {
  id: string
  company_id: string
  config_version_id: string

  step_order: number
  name: string
  objective: string
  completion_criteria: string[]
  recommended_questions: string[]
  is_required: boolean

  created_at: string
  updated_at: string
}

export interface CommercialProductProfile {
  id: string
  company_id: string
  config_version_id: string
  product_id: string

  commercial_product_contract_version:
    CommercialProductPersistenceContractVersion

  commercial_product_definition:
    CommercialSimpleProductDefinition | null

  indicated_audiences: string[]
  needs_addressed: string[]
  benefits: string[]
  verified_differentiators: string[]
  limitations: string[]
  contract_conditions: string[]
  payment_conditions: string[]
  allowed_claims: string[]
  forbidden_claims: string[]

  created_at: string
  updated_at: string
}

export interface CommercialFact {
  id: string
  company_id: string
  config_version_id: string

  category: string
  fact_key: string
  fact_value: string
  source_note: string | null
  is_active: boolean

  created_at: string
  updated_at: string
}

export interface CommercialObjectionGuide {
  id: string
  company_id: string
  config_version_id: string

  sort_order: number
  objection: string
  signals: string[]
  discovery_questions: string[]
  recommended_approach: string
  response_limits: string[]
  is_active: boolean

  created_at: string
  updated_at: string
}

// ============================================================================
// Pacote completo de uma versão
// ============================================================================

export interface CommercialConfigBundle {
  version: CommercialConfigVersion
  method_steps: CommercialMethodStep[]
  product_profiles: CommercialProductProfile[]
  facts: CommercialFact[]
  objection_guides: CommercialObjectionGuide[]
}

// ============================================================================
// Dados editáveis do rascunho
// ============================================================================

export interface CommercialMethodStepDraft {
  id?: string
  step_order: number
  name: string
  objective: string
  completion_criteria: string[]
  recommended_questions: string[]
  is_required: boolean
}

export interface CommercialProductProfileDraft {
  id?: string
  product_id: string

  commercial_product_contract_version:
    CommercialProductPersistenceContractVersion

  commercial_product_definition:
    CommercialSimpleProductDefinition | null

  indicated_audiences: string[]
  needs_addressed: string[]
  benefits: string[]
  verified_differentiators: string[]
  limitations: string[]
  contract_conditions: string[]
  payment_conditions: string[]
  allowed_claims: string[]
  forbidden_claims: string[]
}

export interface CommercialFactDraft {
  id?: string

  category: string
  fact_key: string
  fact_value: string
  source_note: string | null
  is_active: boolean
}

export interface CommercialObjectionGuideDraft {
  id?: string

  sort_order: number
  objection: string
  signals: string[]
  discovery_questions: string[]
  recommended_approach: string
  response_limits: string[]
  is_active: boolean
}

export interface CommercialConfigDraftInput {
  config_version_id?: string | null

  business_description: string
  target_audience: string
  value_proposition: string

  commercial_method_name: string
  commercial_method_description: string

  commercial_method_definition:
    CommercialMethodDefinition | null

  communication_tone: string

  required_behaviors: string[]
  prohibited_behaviors: string[]

  method_steps: CommercialMethodStepDraft[]
  product_profiles: CommercialProductProfileDraft[]
  facts: CommercialFactDraft[]
  objection_guides: CommercialObjectionGuideDraft[]
}

// ============================================================================
// Respostas das operações administrativas
// ============================================================================

export interface CommercialConfigMutationResult {
  company_id: string
  config_version_id: string
  version_number: number
  status: CommercialConfigStatus
}

export interface CommercialConfigPublishResult
  extends CommercialConfigMutationResult {
  status: 'published'
  published_at: string
}

export interface CommercialConfigDeleteResult {
  company_id: string
  config_version_id: string
  deleted: boolean
}

// ============================================================================
// Estado utilizado pela futura interface administrativa
// ============================================================================

export interface CommercialConfigProductOption {
  id: string
  company_id: string
  name: string
  category: string
  base_price: number
  active: boolean
}

export interface CommercialConfigWorkspace {
  draft: CommercialConfigBundle | null
  published: CommercialConfigBundle | null
  archived_versions: CommercialConfigVersion[]
  products: CommercialConfigProductOption[]
}

// ============================================================================
// Validação da interface
// ============================================================================

export type CommercialConfigSectionKey =
  | 'company_context'
  | 'commercial_method'
  | 'product_profiles'
  | 'official_facts'
  | 'objection_guides'
  | 'seller_guidelines'

export interface CommercialConfigValidationIssue {
  section: CommercialConfigSectionKey
  field: string
  message: string
}

export interface CommercialConfigValidationResult {
  valid: boolean
  issues: CommercialConfigValidationIssue[]
}

// ============================================================================
// Estado inicial de um novo rascunho
// ============================================================================

export function createEmptyCommercialConfigDraft(): CommercialConfigDraftInput {
  return {
    config_version_id: null,

    business_description: '',
    target_audience: '',
    value_proposition: '',

    commercial_method_name: '',
    commercial_method_description: '',

    commercial_method_definition: null,

    communication_tone: '',

    required_behaviors: [],
    prohibited_behaviors: [],

    method_steps: [],
    product_profiles: [],
    facts: [],
    objection_guides: [],
  }
}
