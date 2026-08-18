import type {
  CommercialConfigBundle,
  CommercialConfigProductOption,
  CommercialProductProfile,
} from '@/app/types/commercial-config'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
  type DiagnosticLeadStatus,
} from './diagnostic-contract'

import {
  validateCommercialMethodDefinition,
  type CommercialMethodDefinition,
} from './commercial-method-contract'

import {
  validateCommercialProductDefinition,
  type CommercialSimpleProductDefinition,
} from './commercial-product-contract'

export const COMPANION_DIAGNOSTIC_INPUT_VERSION =
  'phase-5-input-v1' as const

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
] as const

const MESSAGE_DIRECTIONS = [
  'incoming',
  'outgoing',
] as const

const MESSAGE_CONTENT_TYPES = [
  'text',
  'audio',
] as const

export type DiagnosticInputStatus =
  | 'ready'
  | 'limited'
  | 'blocked'

export type DiagnosticInputMessage = {
  id: string
  message_key: string
  version: number
  sequence: number
  direction: 'incoming' | 'outgoing'
  occurred_at: string
  observed_at: string
  content_type: 'text' | 'audio'
  text_content: string | null
  audio_transcription: string | null
}

export type DiagnosticExcludedMessage = {
  id: string
  message_key: string
  version: number
  reason: 'deleted'
}

export type DiagnosticCommercialMethodStep = {
  step_order: number
  name: string
  objective: string
  completion_criteria: string[]
  recommended_questions: string[]
  is_required: boolean
}

export type DiagnosticCommercialProduct = {
  product_id: string

  contract_version:
    | 'commercial-product-v1'
    | 'commercial-product-v2'

  definition:
    CommercialSimpleProductDefinition | null

  name: string | null
  category: string | null
  base_price: number | null
  active: boolean | null
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

export type CompanionDiagnosticInput = {
  input_version:
    typeof COMPANION_DIAGNOSTIC_INPUT_VERSION

  diagnostic_contract_version:
    typeof COMPANION_DIAGNOSTIC_CONTRACT_VERSION

  company_id: string
  cycle_id: string
  conversation_key: string
  current_crm_status:
    | DiagnosticLeadStatus
    | null
  reference_time: string

  analysis_precondition: {
    status: DiagnosticInputStatus
    limitations: string[]
  }

  conversation: {
    active_message_ids: string[]
    excluded_message_ids: string[]
    messages: DiagnosticInputMessage[]
    excluded_messages:
      DiagnosticExcludedMessage[]
  }

  commercial_context: {
    configured: boolean
    config_version_id: string | null
    config_version_number: number | null
    config_contract_version: string | null

    business_description: string | null
    target_audience: string | null
    value_proposition: string | null
    communication_tone: string | null

    required_behaviors: string[]
    prohibited_behaviors: string[]

    sales_method: {
      configured: boolean

      contract_version:
        | 'commercial-method-v1'
        | 'commercial-method-v2'
        | null

      name: string | null
      description: string | null

      principles: string[]

      definition:
        CommercialMethodDefinition | null

      steps:
        DiagnosticCommercialMethodStep[]
    }

    products:
      DiagnosticCommercialProduct[]

    facts: Array<{
      category: string
      fact_key: string
      fact_value: string
      source_note: string | null
    }>

    objection_guides: Array<{
      sort_order: number
      objection: string
      signals: string[]
      discovery_questions: string[]
      recommended_approach: string
      response_limits: string[]
    }>
  }
}

export type BuildCompanionDiagnosticInputArgs = {
  company_id: unknown
  cycle_id: unknown
  conversation_key: unknown
  current_crm_status: unknown
  reference_time: unknown
  messages: unknown
  commercial_config:
    | CommercialConfigBundle
    | null
  products:
    CommercialConfigProductOption[]
}

type JsonRecord =
  Record<string, unknown>

type NormalizedCanonicalMessage = {
  id: string
  message_key: string
  version: number
  direction: 'incoming' | 'outgoing'
  occurred_at: string
  occurred_at_timestamp: number
  observed_at: string
  content_type: 'text' | 'audio'
  text_content: string | null
  audio_transcription: string | null
  is_deleted: boolean
}

export class CompanionDiagnosticInputError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'CompanionDiagnosticInputError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new CompanionDiagnosticInputError(
    code,
    path,
    message,
  )
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (!isRecord(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um objeto.`,
    )
  }

  return value
}

function normalizeRequiredString(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um texto.`,
    )
  }

  const normalized = value.trim()

  if (!normalized) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  if (
    normalized.length >
    maximumLength
  ) {
    fail(
      'VALUE_TOO_LONG',
      path,
      `${path} ultrapassa ${maximumLength} caracteres.`,
    )
  }

  return normalized
}

function normalizeNullableString(
  value: unknown,
  path: string,
  maximumLength = 100000,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  return normalizeRequiredString(
    value,
    path,
    maximumLength,
  )
}

function normalizeMessageId(
  value: unknown,
  path: string,
): string {
  if (typeof value === 'bigint') {
    if (value <= BigInt(0)) {
      fail(
        'INVALID_MESSAGE_ID',
        path,
        `${path} precisa ser positivo.`,
      )
    }

    return value.toString()
  }

  if (typeof value === 'number') {
    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      fail(
        'INVALID_MESSAGE_ID',
        path,
        `${path} precisa ser um inteiro positivo seguro.`,
      )
    }

    return String(value)
  }

  const normalized =
    normalizeRequiredString(
      value,
      path,
      100,
    )

  if (!/^[1-9]\d*$/.test(normalized)) {
    fail(
      'INVALID_MESSAGE_ID',
      path,
      `${path} precisa identificar uma mensagem persistida.`,
    )
  }

  return normalized
}

function normalizePositiveInteger(
  value: unknown,
  path: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    fail(
      'INVALID_NUMBER',
      path,
      `${path} precisa ser um inteiro positivo.`,
    )
  }

  return parsed
}

function normalizeBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser booleano.`,
    )
  }

  return value
}

function normalizeDate(
  value: unknown,
  path: string,
): {
  iso: string
  timestamp: number
} {
  const normalized =
    normalizeRequiredString(
      value,
      path,
      100,
    )

  const timestamp =
    Date.parse(normalized)

  if (!Number.isFinite(timestamp)) {
    fail(
      'INVALID_DATE',
      path,
      `${path} possui uma data inválida.`,
    )
  }

  return {
    iso: new Date(
      timestamp,
    ).toISOString(),

    timestamp,
  }
}

function normalizeEnum<
  const TValues extends readonly string[],
>(
  value: unknown,
  allowedValues: TValues,
  path: string,
): TValues[number] {
  if (
    typeof value !== 'string' ||
    !allowedValues.includes(value)
  ) {
    fail(
      'INVALID_ENUM',
      path,
      `${path} possui um valor inválido.`,
    )
  }

  return value as TValues[number]
}

function normalizeStringArray(
  value: unknown,
  path: string,
): string[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  const result: string[] = []

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item =
      normalizeRequiredString(
        value[index],
        `${path}[${index}]`,
        5000,
      )

    if (!result.includes(item)) {
      result.push(item)
    }
  }

  return result
}

function normalizeCurrentCrmStatus(
  value: unknown,
): DiagnosticLeadStatus | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  return normalizeEnum(
    value,
    LEAD_STATUSES,
    'current_crm_status',
  )
}

function normalizeCanonicalMessage(
  value: unknown,
  index: number,
): NormalizedCanonicalMessage {
  const path =
    `messages[${index}]`

  const record =
    requireRecord(
      value,
      path,
    )

  const occurredAt =
    normalizeDate(
      record.occurred_at,
      `${path}.occurred_at`,
    )

  const observedAt =
    normalizeDate(
      record.observed_at,
      `${path}.observed_at`,
    )

  const contentType =
    normalizeEnum(
      record.content_type,
      MESSAGE_CONTENT_TYPES,
      `${path}.content_type`,
    )

  const isDeleted =
    normalizeBoolean(
      record.is_deleted,
      `${path}.is_deleted`,
    )

  let textContent =
    normalizeNullableString(
      record.text_content,
      `${path}.text_content`,
    )

  let audioTranscription =
    normalizeNullableString(
      record.audio_transcription,
      `${path}.audio_transcription`,
      200000,
    )

  if (isDeleted) {
    textContent = null
    audioTranscription = null
  }

  if (
    !isDeleted &&
    contentType === 'text' &&
    textContent === null
  ) {
    fail(
      'INVALID_MESSAGE_CONTENT',
      `${path}.text_content`,
      'Mensagem de texto ativa precisa possuir conteúdo.',
    )
  }

  if (
    contentType === 'text' &&
    audioTranscription !== null
  ) {
    fail(
      'INVALID_MESSAGE_CONTENT',
      `${path}.audio_transcription`,
      'Mensagem de texto não pode possuir transcrição de áudio.',
    )
  }

  return {
    id: normalizeMessageId(
      record.id,
      `${path}.id`,
    ),

    message_key:
      normalizeRequiredString(
        record.message_key,
        `${path}.message_key`,
      ),

    version:
      normalizePositiveInteger(
        record.version,
        `${path}.version`,
      ),

    direction:
      normalizeEnum(
        record.direction,
        MESSAGE_DIRECTIONS,
        `${path}.direction`,
      ),

    occurred_at:
      occurredAt.iso,

    occurred_at_timestamp:
      occurredAt.timestamp,

    observed_at:
      observedAt.iso,

    content_type:
      contentType,

    text_content:
      textContent,

    audio_transcription:
      audioTranscription,

    is_deleted:
      isDeleted,
  }
}

function normalizeCanonicalMessages(
  value: unknown,
): NormalizedCanonicalMessage[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      'messages',
      'messages precisa ser uma lista.',
    )
  }

  if (value.length > 1000) {
    fail(
      'MESSAGE_LIMIT_EXCEEDED',
      'messages',
      'A entrada pode possuir no máximo mil mensagens canônicas.',
    )
  }

  const messages =
    value.map(
      normalizeCanonicalMessage,
    )

  const ids = new Set<string>()
  const messageKeys =
    new Set<string>()

  for (const message of messages) {
    if (ids.has(message.id)) {
      fail(
        'DUPLICATED_MESSAGE',
        'messages',
        `A mensagem ${message.id} apareceu mais de uma vez.`,
      )
    }

    if (
      messageKeys.has(
        message.message_key,
      )
    ) {
      fail(
        'DUPLICATED_MESSAGE_KEY',
        'messages',
        `A message_key ${message.message_key} possui mais de um estado canônico.`,
      )
    }

    ids.add(message.id)
    messageKeys.add(
      message.message_key,
    )
  }

  return messages.sort((a, b) => {
    if (
      a.occurred_at_timestamp !==
      b.occurred_at_timestamp
    ) {
      return (
        a.occurred_at_timestamp -
        b.occurred_at_timestamp
      )
    }

    const keyComparison =
      a.message_key.localeCompare(
        b.message_key,
      )

    if (keyComparison !== 0) {
      return keyComparison
    }

    return a.id.localeCompare(
      b.id,
      'en',
      {
        numeric: true,
      },
    )
  })
}

function validateCommercialBundleScope(
  bundle: CommercialConfigBundle,
  companyId: string,
) {
  if (
    bundle.version.company_id !==
    companyId
  ) {
    fail(
      'COMPANY_SCOPE_VIOLATION',
      'commercial_config.version.company_id',
      'A configuração publicada pertence a outra empresa.',
    )
  }

  if (
    bundle.version.status !==
    'published'
  ) {
    fail(
      'UNPUBLISHED_COMMERCIAL_CONFIG',
      'commercial_config.version.status',
      'O diagnóstico só pode utilizar configuração comercial publicada.',
    )
  }

  const versionId =
    bundle.version.id

  const scopedRecords = [
    ...bundle.method_steps.map(
      (record) => ({
        path: 'method_steps',
        company_id:
          record.company_id,
        config_version_id:
          record.config_version_id,
      }),
    ),

    ...bundle.product_profiles.map(
      (record) => ({
        path: 'product_profiles',
        company_id:
          record.company_id,
        config_version_id:
          record.config_version_id,
      }),
    ),

    ...bundle.facts.map(
      (record) => ({
        path: 'facts',
        company_id:
          record.company_id,
        config_version_id:
          record.config_version_id,
      }),
    ),

    ...bundle.objection_guides.map(
      (record) => ({
        path: 'objection_guides',
        company_id:
          record.company_id,
        config_version_id:
          record.config_version_id,
      }),
    ),
  ]

  for (const record of scopedRecords) {
    if (
      record.company_id !==
      companyId
    ) {
      fail(
        'COMPANY_SCOPE_VIOLATION',
        `commercial_config.${record.path}`,
        'A configuração contém dados vinculados a outra empresa.',
      )
    }

    if (
      record.config_version_id !==
      versionId
    ) {
      fail(
        'CONFIG_VERSION_VIOLATION',
        `commercial_config.${record.path}`,
        'A configuração contém dados vinculados a outra versão.',
      )
    }
  }
}

function validateProductScope(
  products:
    CommercialConfigProductOption[],
  companyId: string,
) {
  for (
    let index = 0;
    index < products.length;
    index += 1
  ) {
    if (
      products[index].company_id !==
      companyId
    ) {
      fail(
        'COMPANY_SCOPE_VIOLATION',
        `products[${index}].company_id`,
        'O catálogo contém produto vinculado a outra empresa.',
      )
    }
  }
}

function addLimitation(
  limitations: string[],
  limitation: string,
) {
  if (
    !limitations.includes(
      limitation,
    )
  ) {
    limitations.push(
      limitation,
    )
  }
}

type ResolvedCommercialMethod = {
  contract_version:
    | 'commercial-method-v1'
    | 'commercial-method-v2'

  definition:
    CommercialMethodDefinition | null
}

function resolveCommercialMethod(
  bundle: CommercialConfigBundle,
): ResolvedCommercialMethod {
  const contractValue: unknown =
    bundle.version
      .commercial_method_contract_version

  const definitionValue: unknown =
    bundle.version
      .commercial_method_definition

  if (
    contractValue === undefined ||
    contractValue === null
  ) {
    if (
      definitionValue !== undefined &&
      definitionValue !== null
    ) {
      fail(
        'INVALID_COMMERCIAL_METHOD_DEFINITION',
        'commercial_config.version.commercial_method_definition',
        'Uma definição semântica não pode existir sem versão do contrato do método.',
      )
    }

    return {
      contract_version:
        'commercial-method-v1',

      definition:
        null,
    }
  }

  if (
    contractValue ===
    'commercial-method-v1'
  ) {
    if (
      definitionValue !== undefined &&
      definitionValue !== null
    ) {
      fail(
        'INVALID_COMMERCIAL_METHOD_DEFINITION',
        'commercial_config.version.commercial_method_definition',
        'O método legado não pode possuir definição semântica V2.',
      )
    }

    return {
      contract_version:
        'commercial-method-v1',

      definition:
        null,
    }
  }

  if (
    contractValue !==
    'commercial-method-v2'
  ) {
    fail(
      'INVALID_COMMERCIAL_METHOD_CONTRACT',
      'commercial_config.version.commercial_method_contract_version',
      'A versão persistida do contrato do método comercial é incompatível.',
    )
  }

  if (!isRecord(definitionValue)) {
    fail(
      'INVALID_COMMERCIAL_METHOD_DEFINITION',
      'commercial_config.version.commercial_method_definition',
      'O método V2 publicado precisa possuir uma definição semântica.',
    )
  }

  const definition =
    definitionValue as unknown as
      CommercialMethodDefinition

  let validation

  try {
    validation =
      validateCommercialMethodDefinition(
        definition,
      )
  } catch {
    fail(
      'INVALID_COMMERCIAL_METHOD_DEFINITION',
      'commercial_config.version.commercial_method_definition',
      'A definição semântica publicada do método comercial é inválida.',
    )
  }

  if (!validation.valid) {
    fail(
      'INVALID_COMMERCIAL_METHOD_DEFINITION',
      'commercial_config.version.commercial_method_definition',
      'A definição semântica publicada do método comercial não respeita o contrato V2.',
    )
  }

  return {
    contract_version:
      'commercial-method-v2',

    definition,
  }
}


type ResolvedCommercialProduct = {
  contract_version:
    | 'commercial-product-v1'
    | 'commercial-product-v2'

  definition:
    CommercialSimpleProductDefinition | null
}

function resolveCommercialProduct(
  profile: CommercialProductProfile,
  index: number,
): ResolvedCommercialProduct {
  const path =
    'commercial_config.product_profiles[' +
    index +
    ']'

  const contractValue: unknown =
    profile
      .commercial_product_contract_version

  const definitionValue: unknown =
    profile
      .commercial_product_definition

  if (
    contractValue === undefined ||
    contractValue === null
  ) {
    if (
      definitionValue !== undefined &&
      definitionValue !== null
    ) {
      fail(
        'INVALID_COMMERCIAL_PRODUCT_DEFINITION',
        path + '.commercial_product_definition',
        'Uma definição semântica de produto não pode existir sem versão do contrato.',
      )
    }

    return {
      contract_version:
        'commercial-product-v1',

      definition:
        null,
    }
  }

  if (
    contractValue ===
    'commercial-product-v1'
  ) {
    if (
      definitionValue !== undefined &&
      definitionValue !== null
    ) {
      fail(
        'INVALID_COMMERCIAL_PRODUCT_DEFINITION',
        path + '.commercial_product_definition',
        'O produto legado não pode possuir definição semântica V2.',
      )
    }

    return {
      contract_version:
        'commercial-product-v1',

      definition:
        null,
    }
  }

  if (
    contractValue !==
    'commercial-product-v2'
  ) {
    fail(
      'INVALID_COMMERCIAL_PRODUCT_CONTRACT',
      path + '.commercial_product_contract_version',
      'A versão persistida do contrato comercial do produto é incompatível.',
    )
  }

  if (!isRecord(definitionValue)) {
    fail(
      'INVALID_COMMERCIAL_PRODUCT_DEFINITION',
      path + '.commercial_product_definition',
      'O produto V2 publicado precisa possuir uma definição semântica.',
    )
  }

  const definition =
    definitionValue as unknown as
      CommercialSimpleProductDefinition

  const validation =
    validateCommercialProductDefinition(
      definition,
    )

  if (!validation.valid) {
    fail(
      'INVALID_COMMERCIAL_PRODUCT_DEFINITION',
      path + '.commercial_product_definition',
      'A definição semântica publicada do produto não respeita o contrato V2.',
    )
  }

  return {
    contract_version:
      'commercial-product-v2',

    definition,
  }
}

function buildCommercialContext(
  bundle:
    | CommercialConfigBundle
    | null,
  products:
    CommercialConfigProductOption[],
  companyId: string,
  limitations: string[],
): CompanionDiagnosticInput[
  'commercial_context'
] {
  validateProductScope(
    products,
    companyId,
  )

  if (!bundle) {
    addLimitation(
      limitations,
      'method_not_configured',
    )

    addLimitation(
      limitations,
      'product_information_missing',
    )

    return {
      configured: false,
      config_version_id: null,
      config_version_number: null,
      config_contract_version: null,

      business_description: null,
      target_audience: null,
      value_proposition: null,
      communication_tone: null,

      required_behaviors: [],
      prohibited_behaviors: [],

      sales_method: {
        configured: false,

        contract_version: null,

        name: null,
        description: null,

        principles: [],

        definition: null,

        steps: [],
      },

      products: [],
      facts: [],
      objection_guides: [],
    }
  }

  validateCommercialBundleScope(
    bundle,
    companyId,
  )

  const catalogById =
    new Map(
      products.map(
        (product) => [
          product.id,
          product,
        ],
      ),
    )

  const resolvedMethod =
    resolveCommercialMethod(
      bundle,
    )

  const legacyMethodSteps =
    [...bundle.method_steps]
      .sort(
        (a, b) =>
          a.step_order -
          b.step_order,
      )
      .map((step) => ({
        step_order:
          step.step_order,

        name:
          normalizeRequiredString(
            step.name,
            'commercial_config.method_steps.name',
          ),

        objective:
          normalizeRequiredString(
            step.objective,
            'commercial_config.method_steps.objective',
            5000,
          ),

        completion_criteria:
          normalizeStringArray(
            step.completion_criteria,
            'commercial_config.method_steps.completion_criteria',
          ),

        recommended_questions:
          normalizeStringArray(
            step.recommended_questions,
            'commercial_config.method_steps.recommended_questions',
          ),

        is_required:
          step.is_required === true,
      }))

  const methodSteps =
    resolvedMethod.definition
      ? [
          ...resolvedMethod
            .definition
            .stages,
        ]
          .sort(
            (a, b) =>
              a.display_order -
              b.display_order,
          )
          .map((stage) => ({
            step_order:
              stage.display_order,

            name:
              normalizeRequiredString(
                stage.name,
                'commercial_config.version.commercial_method_definition.stages.name',
              ),

            objective:
              normalizeRequiredString(
                stage.objective,
                'commercial_config.version.commercial_method_definition.stages.objective',
                5000,
              ),

            completion_criteria:
              normalizeStringArray(
                stage.completion_criteria,
                'commercial_config.version.commercial_method_definition.stages.completion_criteria',
              ),

            recommended_questions:
              normalizeStringArray(
                stage.recommended_questions,
                'commercial_config.version.commercial_method_definition.stages.recommended_questions',
              ),

            is_required:
              stage.requirement ===
              'required',
          }))
      : legacyMethodSteps

  const methodConfigured =
    methodSteps.length > 0

  if (!methodConfigured) {
    addLimitation(
      limitations,
      'method_not_configured',
    )
  }

  const commercialProducts =
    bundle.product_profiles.map(
      (profile, profileIndex) => {
        const catalogProduct =
          catalogById.get(
            profile.product_id,
          )

        const resolvedProduct =
          resolveCommercialProduct(
            profile,
            profileIndex,
          )

        const semanticDefinition =
          resolvedProduct.definition

        const semanticSource =
          semanticDefinition ??
          profile

        return {
          product_id:
            profile.product_id,

          contract_version:
            resolvedProduct
              .contract_version,

          definition:
            semanticDefinition,

          name:
            semanticDefinition
              ?.name ??
            catalogProduct?.name ??
            null,

          category:
            semanticDefinition
              ?.category ??
            catalogProduct?.category ??
            null,

          base_price:
            semanticDefinition
              ? null
              : typeof catalogProduct
                  ?.base_price === 'number' &&
                Number.isFinite(
                  catalogProduct.base_price,
                )
                ? catalogProduct.base_price
                : null,

          active:
            typeof catalogProduct
              ?.active === 'boolean'
              ? catalogProduct.active
              : null,

          indicated_audiences:
            normalizeStringArray(
              semanticSource.indicated_audiences,
              'commercial_config.product_profiles.indicated_audiences',
            ),

          needs_addressed:
            normalizeStringArray(
              semanticSource.needs_addressed,
              'commercial_config.product_profiles.needs_addressed',
            ),

          benefits:
            normalizeStringArray(
              semanticSource.benefits,
              'commercial_config.product_profiles.benefits',
            ),

          verified_differentiators:
            normalizeStringArray(
              semanticSource.verified_differentiators,
              'commercial_config.product_profiles.verified_differentiators',
            ),

          limitations:
            normalizeStringArray(
              semanticSource.limitations,
              'commercial_config.product_profiles.limitations',
            ),

          contract_conditions:
            normalizeStringArray(
              semanticSource.contract_conditions,
              'commercial_config.product_profiles.contract_conditions',
            ),

          payment_conditions:
            normalizeStringArray(
              semanticSource.payment_conditions,
              'commercial_config.product_profiles.payment_conditions',
            ),

          allowed_claims:
            normalizeStringArray(
              semanticSource.allowed_claims,
              'commercial_config.product_profiles.allowed_claims',
            ),

          forbidden_claims:
            normalizeStringArray(
              semanticSource.forbidden_claims,
              'commercial_config.product_profiles.forbidden_claims',
            ),
        }
      },
    )

  if (
    commercialProducts.length === 0
  ) {
    addLimitation(
      limitations,
      'product_information_missing',
    )
  }

  return {
    configured: true,

    config_version_id:
      bundle.version.id,

    config_version_number:
      bundle.version.version_number,

    config_contract_version:
      bundle.version.contract_version,

    business_description:
      normalizeRequiredString(
        bundle.version
          .business_description,
        'commercial_config.version.business_description',
        10000,
      ),

    target_audience:
      normalizeRequiredString(
        bundle.version
          .target_audience,
        'commercial_config.version.target_audience',
        10000,
      ),

    value_proposition:
      normalizeRequiredString(
        bundle.version
          .value_proposition,
        'commercial_config.version.value_proposition',
        10000,
      ),

    communication_tone:
      normalizeRequiredString(
        bundle.version
          .communication_tone,
        'commercial_config.version.communication_tone',
        5000,
      ),

    required_behaviors:
      normalizeStringArray(
        bundle.version
          .required_behaviors,
        'commercial_config.version.required_behaviors',
      ),

    prohibited_behaviors:
      normalizeStringArray(
        bundle.version
          .prohibited_behaviors,
        'commercial_config.version.prohibited_behaviors',
      ),

    sales_method: {
      configured:
        methodConfigured,

      contract_version:
        methodConfigured
          ? resolvedMethod
              .contract_version
          : null,

      name:
        methodConfigured
          ? normalizeRequiredString(
              resolvedMethod
                .definition
                ?.name ??
                bundle.version
                  .commercial_method_name,
              'commercial_context.sales_method.name',
              5000,
            )
          : null,

      description:
        methodConfigured
          ? normalizeRequiredString(
              resolvedMethod
                .definition
                ?.description ??
                bundle.version
                  .commercial_method_description,
              'commercial_context.sales_method.description',
              10000,
            )
          : null,

      principles:
        resolvedMethod.definition
          ? normalizeStringArray(
              resolvedMethod
                .definition
                .principles,
              'commercial_context.sales_method.principles',
            )
          : [],

      definition:
        resolvedMethod.definition,

      steps:
        methodSteps,
    },

    products:
      commercialProducts,

    facts:
      bundle.facts
        .filter(
          (fact) =>
            fact.is_active,
        )
        .map((fact) => ({
          category:
            normalizeRequiredString(
              fact.category,
              'commercial_config.facts.category',
            ),

          fact_key:
            normalizeRequiredString(
              fact.fact_key,
              'commercial_config.facts.fact_key',
            ),

          fact_value:
            normalizeRequiredString(
              fact.fact_value,
              'commercial_config.facts.fact_value',
              10000,
            ),

          source_note:
            normalizeNullableString(
              fact.source_note,
              'commercial_config.facts.source_note',
              5000,
            ),
        })),

    objection_guides:
      bundle.objection_guides
        .filter(
          (guide) =>
            guide.is_active,
        )
        .sort(
          (a, b) =>
            a.sort_order -
            b.sort_order,
        )
        .map((guide) => ({
          sort_order:
            guide.sort_order,

          objection:
            normalizeRequiredString(
              guide.objection,
              'commercial_config.objection_guides.objection',
              5000,
            ),

          signals:
            normalizeStringArray(
              guide.signals,
              'commercial_config.objection_guides.signals',
            ),

          discovery_questions:
            normalizeStringArray(
              guide.discovery_questions,
              'commercial_config.objection_guides.discovery_questions',
            ),

          recommended_approach:
            normalizeRequiredString(
              guide.recommended_approach,
              'commercial_config.objection_guides.recommended_approach',
              10000,
            ),

          response_limits:
            normalizeStringArray(
              guide.response_limits,
              'commercial_config.objection_guides.response_limits',
            ),
        })),
  }
}

export function buildCompanionDiagnosticInput({
  company_id,
  cycle_id,
  conversation_key,
  current_crm_status,
  reference_time,
  messages,
  commercial_config,
  products,
}: BuildCompanionDiagnosticInputArgs): CompanionDiagnosticInput {
  const companyId =
    normalizeRequiredString(
      company_id,
      'company_id',
      100,
    )

  const cycleId =
    normalizeRequiredString(
      cycle_id,
      'cycle_id',
      100,
    )

  const conversationKey =
    normalizeRequiredString(
      conversation_key,
      'conversation_key',
    )

  const referenceTime =
    normalizeDate(
      reference_time,
      'reference_time',
    )

  const currentCrmStatus =
    normalizeCurrentCrmStatus(
      current_crm_status,
    )

  const canonicalMessages =
    normalizeCanonicalMessages(
      messages,
    )

  const limitations: string[] = []

  const activeMessages =
    canonicalMessages.filter(
      (message) =>
        !message.is_deleted,
    )

  const excludedMessages:
    DiagnosticExcludedMessage[] =
    canonicalMessages
      .filter(
        (message) =>
          message.is_deleted,
      )
      .map((message) => ({
        id: message.id,
        message_key:
          message.message_key,
        version: message.version,
        reason: 'deleted',
      }))

  const hasUntranscribedAudio =
    activeMessages.some(
      (message) =>
        message.content_type ===
          'audio' &&
        message.audio_transcription ===
          null,
    )

  if (hasUntranscribedAudio) {
    addLimitation(
      limitations,
      'audio_without_transcription',
    )
  }

  const hasUsableContent =
    activeMessages.some(
      (message) =>
        Boolean(
          message.text_content ||
          message.audio_transcription,
        ),
    )

  if (!hasUsableContent) {
    addLimitation(
      limitations,
      'conversation_context_insufficient',
    )
  }

  const commercialContext =
    buildCommercialContext(
      commercial_config,
      products,
      companyId,
      limitations,
    )

  const status:
    DiagnosticInputStatus =
    !hasUsableContent
      ? 'blocked'
      : limitations.length > 0
        ? 'limited'
        : 'ready'

  const diagnosticMessages:
    DiagnosticInputMessage[] =
    activeMessages.map(
      (message, index) => ({
        id: message.id,
        message_key:
          message.message_key,
        version:
          message.version,
        sequence:
          index + 1,
        direction:
          message.direction,
        occurred_at:
          message.occurred_at,
        observed_at:
          message.observed_at,
        content_type:
          message.content_type,
        text_content:
          message.text_content,
        audio_transcription:
          message.audio_transcription,
      }),
    )

  return {
    input_version:
      COMPANION_DIAGNOSTIC_INPUT_VERSION,

    diagnostic_contract_version:
      COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    current_crm_status:
      currentCrmStatus,

    reference_time:
      referenceTime.iso,

    analysis_precondition: {
      status,
      limitations,
    },

    conversation: {
      active_message_ids:
        diagnosticMessages.map(
          (message) =>
            message.id,
        ),

      excluded_message_ids:
        excludedMessages.map(
          (message) =>
            message.id,
        ),

      messages:
        diagnosticMessages,

      excluded_messages:
        excludedMessages,
    },

    commercial_context:
      commercialContext,
  }
}
