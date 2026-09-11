export const COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION =
  'commercial-intelligence-v1' as const

export const COMMERCIAL_INTELLIGENCE_KINDS = [
  'technique',
  'principle',
  'anti_pattern',
  'risk',
  'company_knowledge',
] as const

export const COMMERCIAL_INTELLIGENCE_SCOPES = [
  'general',
  'company',
  'product',
] as const

export const COMMERCIAL_INTELLIGENCE_SOURCE_TYPES = [
  'general_library',
  'commercial_config',
  'sales_method',
  'product_profile',
  'official_fact',
  'objection_guide',
  'seller_guideline',
] as const

export type CommercialIntelligenceKind =
  (typeof COMMERCIAL_INTELLIGENCE_KINDS)[number]

export type CommercialIntelligenceScope =
  (typeof COMMERCIAL_INTELLIGENCE_SCOPES)[number]

export type CommercialIntelligenceSourceType =
  (typeof COMMERCIAL_INTELLIGENCE_SOURCE_TYPES)[number]

export type CommercialIntelligenceProvenance = {
  source_type: CommercialIntelligenceSourceType
  source_id: string | null
  company_id: string | null
  product_id: string | null
  config_version_id: string | null
}

export type CommercialIntelligenceExample = {
  situation: string
  application: string
}

export type CommercialIntelligenceEntry = {
  contract_version:
    typeof COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION

  id: string
  kind: CommercialIntelligenceKind
  scope: CommercialIntelligenceScope

  title: string
  objective: string
  description: string

  situations: string[]
  signals: string[]
  when_to_use: string[]
  when_not_to_use: string[]
  risks: string[]
  examples: CommercialIntelligenceExample[]

  provenance: CommercialIntelligenceProvenance
}

export type CommercialIntelligenceQuery = {
  company_id: string
  product_ids: string[]
  situations: string[]
  signals: string[]
  objectives: string[]
  limit?: number
}

export type RankedCommercialIntelligenceEntry = {
  entry: CommercialIntelligenceEntry
  score: number
  matched_signals: string[]
  matched_situations: string[]
  matched_objectives: string[]
  ranking_reasons: string[]
}

export class CommercialIntelligenceContractError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)
    this.name = 'CommercialIntelligenceContractError'
    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new CommercialIntelligenceContractError(
    code,
    path,
    message,
  )
}

function requireText(
  value: string,
  path: string,
): void {
  if (!value.trim()) {
    fail(
      'EMPTY_TEXT',
      path,
      `${path} não pode ficar vazio.`,
    )
  }
}

function requireUniqueTextList(
  values: string[],
  path: string,
): void {
  const normalized =
    values.map(value => value.trim())

  if (normalized.some(value => !value)) {
    fail(
      'EMPTY_LIST_ITEM',
      path,
      `${path} possui item vazio.`,
    )
  }

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    fail(
      'DUPLICATE_LIST_ITEM',
      path,
      `${path} possui item duplicado.`,
    )
  }
}

export function validateCommercialIntelligenceEntry(
  entry: CommercialIntelligenceEntry,
): CommercialIntelligenceEntry {
  if (
    entry.contract_version !==
    COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION
  ) {
    fail(
      'CONTRACT_VERSION_MISMATCH',
      'entry.contract_version',
      'Versão incompatível da biblioteca de inteligência comercial.',
    )
  }

  if (
    !COMMERCIAL_INTELLIGENCE_KINDS.includes(
      entry.kind,
    )
  ) {
    fail(
      'INVALID_KIND',
      'entry.kind',
      'Tipo de inteligência comercial inválido.',
    )
  }

  if (
    !COMMERCIAL_INTELLIGENCE_SCOPES.includes(
      entry.scope,
    )
  ) {
    fail(
      'INVALID_SCOPE',
      'entry.scope',
      'Escopo de inteligência comercial inválido.',
    )
  }

  requireText(entry.id, 'entry.id')
  requireText(entry.title, 'entry.title')
  requireText(entry.objective, 'entry.objective')
  requireText(entry.description, 'entry.description')

  requireUniqueTextList(
    entry.situations,
    'entry.situations',
  )
  requireUniqueTextList(
    entry.signals,
    'entry.signals',
  )
  requireUniqueTextList(
    entry.when_to_use,
    'entry.when_to_use',
  )
  requireUniqueTextList(
    entry.when_not_to_use,
    'entry.when_not_to_use',
  )
  requireUniqueTextList(
    entry.risks,
    'entry.risks',
  )

  entry.examples.forEach(
    (example, index) => {
      requireText(
        example.situation,
        `entry.examples[${index}].situation`,
      )
      requireText(
        example.application,
        `entry.examples[${index}].application`,
      )
    },
  )

  if (
    entry.scope === 'general' &&
    (
      entry.provenance.company_id !== null ||
      entry.provenance.product_id !== null
    )
  ) {
    fail(
      'GENERAL_SCOPE_IDENTITY_LEAK',
      'entry.provenance',
      'Conhecimento geral não pode carregar identidade de empresa ou produto.',
    )
  }

  if (
    entry.scope === 'company' &&
    !entry.provenance.company_id
  ) {
    fail(
      'COMPANY_SCOPE_REQUIRES_COMPANY',
      'entry.provenance.company_id',
      'Conhecimento de empresa precisa declarar company_id.',
    )
  }

  if (
    entry.scope === 'product' &&
    (
      !entry.provenance.company_id ||
      !entry.provenance.product_id
    )
  ) {
    fail(
      'PRODUCT_SCOPE_REQUIRES_IDENTITY',
      'entry.provenance',
      'Conhecimento de produto precisa declarar company_id e product_id.',
    )
  }

  return entry
}
