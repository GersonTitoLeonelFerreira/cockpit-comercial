import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CommercialConfigBundle,
  CommercialConfigProductOption,
  CommercialConfigVersion,
  CommercialFact,
  CommercialMethodStep,
  CommercialObjectionGuide,
  CommercialProductProfile,
} from '@/app/types/commercial-config'

import {
  buildCompanionDiagnosticInput,
  type CompanionDiagnosticInput,
} from '../companion/diagnostic-input'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

const MAX_CANONICAL_MESSAGES =
  1000

const CYCLE_FIELDS = `
  id,
  company_id,
  status
`

const RECONCILIATION_FIELDS = `
  current_message_id,
  message_key
`

const MESSAGE_FIELDS = `
  id,
  company_id,
  cycle_id,
  conversation_key,
  message_key,
  version,
  direction,
  occurred_at,
  observed_at,
  content_type,
  text_content,
  audio_transcription,
  is_deleted
`

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

const PRODUCT_FIELDS = `
  id,
  company_id,
  name,
  category,
  base_price,
  active
`

type JsonRecord =
  Record<string, unknown>

type QueryError = {
  message?: string
}

type QueryResult = {
  data: unknown
  error: QueryError | null
}

type DiagnosticLeadStatus =
  (typeof LEAD_STATUSES)[number]

type ReconciliationRow = {
  current_message_id: unknown
  message_key: unknown
}

export type CompanionDiagnosticSnapshot = {
  input: CompanionDiagnosticInput

  source: {
    company_id: string
    cycle_id: string
    conversation_key: string
    canonical_message_count: number
    excluded_message_count: number
    commercial_config_version_id:
      | string
      | null
    commercial_config_version_number:
      | number
      | null
  }
}

export class CompanionDiagnosticSnapshotError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean
  readonly details:
    | JsonRecord
    | null

  constructor({
    code,
    message,
    status_code,
    retryable,
    details = null,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
    details?: JsonRecord | null
  }) {
    super(message)

    this.name =
      'CompanionDiagnosticSnapshotError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable

    this.details =
      details
  }
}

function fail({
  code,
  message,
  status_code,
  retryable,
  details,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
  details?: JsonRecord | null
}): never {
  throw new CompanionDiagnosticSnapshotError({
    code,
    message,
    status_code,
    retryable,
    details,
  })
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

function normalizeRequiredString(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_SNAPSHOT_ARGUMENT',

      message:
        `${path} precisa ser um texto.`,

      status_code: 400,
      retryable: false,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length >
      maximumLength
  ) {
    fail({
      code:
        'INVALID_SNAPSHOT_ARGUMENT',

      message:
        `${path} possui um valor inválido.`,

      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function normalizeUuid(
  value: unknown,
  path: string,
): string {
  const normalized =
    normalizeRequiredString(
      value,
      path,
      100,
    )

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    fail({
      code:
        'INVALID_SNAPSHOT_ARGUMENT',

      message:
        `${path} precisa possuir um UUID válido.`,

      status_code: 400,
      retryable: false,
    })
  }

  return normalized.toLowerCase()
}

function normalizeReferenceTime(
  value: unknown,
): string {
  const normalized =
    normalizeRequiredString(
      value,
      'reference_time',
      100,
    )

  const timestamp =
    Date.parse(normalized)

  if (
    !Number.isFinite(timestamp)
  ) {
    fail({
      code:
        'INVALID_SNAPSHOT_ARGUMENT',

      message:
        'reference_time possui uma data inválida.',

      status_code: 400,
      retryable: false,
    })
  }

  return new Date(
    timestamp,
  ).toISOString()
}

function normalizeDatabaseId(
  value: unknown,
  path: string,
): string {
  if (typeof value === 'bigint') {
    if (
      value <= BigInt(0)
    ) {
      fail({
        code:
          'SNAPSHOT_STATE_INCONSISTENT',

        message:
          `${path} possui um identificador inválido.`,

        status_code: 500,
        retryable: false,
      })
    }

    return value.toString()
  }

  if (typeof value === 'number') {
    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      fail({
        code:
          'SNAPSHOT_STATE_INCONSISTENT',

        message:
          `${path} possui um identificador inválido.`,

        status_code: 500,
        retryable: false,
      })
    }

    return String(value)
  }

  if (typeof value === 'string') {
    const normalized =
      value.trim()

    if (
      /^[1-9]\d*$/.test(
        normalized,
      )
    ) {
      return normalized
    }
  }

  fail({
    code:
      'SNAPSHOT_STATE_INCONSISTENT',

    message:
      `${path} possui um identificador inválido.`,

    status_code: 500,
    retryable: false,
  })
}

function normalizeLeadStatus(
  value: unknown,
): DiagnosticLeadStatus {
  if (
    typeof value !== 'string' ||
    !LEAD_STATUSES.includes(
      value as DiagnosticLeadStatus,
    )
  ) {
    fail({
      code:
        'SNAPSHOT_CYCLE_INVALID',

      message:
        'O ciclo possui uma etapa comercial inválida.',

      status_code: 500,
      retryable: false,
    })
  }

  return value as DiagnosticLeadStatus
}

function getRows(
  result: QueryResult,
  table: string,
): JsonRecord[] {
  if (result.error) {
    fail({
      code:
        'SNAPSHOT_QUERY_FAILED',

      message:
        'Não foi possível carregar a fotografia do diagnóstico.',

      status_code: 500,
      retryable: true,

      details: {
        table,
      },
    })
  }

  if (
    result.data === null ||
    result.data === undefined
  ) {
    return []
  }

  if (!Array.isArray(result.data)) {
    fail({
      code:
        'SNAPSHOT_QUERY_INVALID',

      message:
        'O banco retornou uma fotografia com formato inválido.',

      status_code: 500,
      retryable: false,

      details: {
        table,
      },
    })
  }

  return result.data.map(
    (item, index) => {
      if (!isRecord(item)) {
        fail({
          code:
            'SNAPSHOT_QUERY_INVALID',

          message:
            'O banco retornou uma fotografia com formato inválido.',

          status_code: 500,
          retryable: false,

          details: {
            table,
            index,
          },
        })
      }

      return item
    },
  )
}

function getMaybeSingle(
  result: QueryResult,
  table: string,
): JsonRecord | null {
  if (result.error) {
    fail({
      code:
        'SNAPSHOT_QUERY_FAILED',

      message:
        'Não foi possível carregar a fotografia do diagnóstico.',

      status_code: 500,
      retryable: true,

      details: {
        table,
      },
    })
  }

  if (
    result.data === null ||
    result.data === undefined
  ) {
    return null
  }

  if (!isRecord(result.data)) {
    fail({
      code:
        'SNAPSHOT_QUERY_INVALID',

      message:
        'O banco retornou uma fotografia com formato inválido.',

      status_code: 500,
      retryable: false,

      details: {
        table,
      },
    })
  }

  return result.data
}

function validateCanonicalMessages({
  messages,
  reconciliationRows,
  companyId,
  cycleId,
  conversationKey,
}: {
  messages: JsonRecord[]
  reconciliationRows:
    ReconciliationRow[]
  companyId: string
  cycleId: string
  conversationKey: string
}): JsonRecord[] {
  const stateByMessageId =
    new Map<string, string>()

  for (
    let index = 0;
    index <
      reconciliationRows.length;
    index += 1
  ) {
    const state =
      reconciliationRows[index]

    const currentMessageId =
      normalizeDatabaseId(
        state.current_message_id,
        `reconciliation[${index}].current_message_id`,
      )

    const messageKey =
      normalizeRequiredString(
        state.message_key,
        `reconciliation[${index}].message_key`,
      )

    if (
      stateByMessageId.has(
        currentMessageId,
      )
    ) {
      fail({
        code:
          'SNAPSHOT_STATE_INCONSISTENT',

        message:
          'Mais de um estado canônico aponta para a mesma versão de mensagem.',

        status_code: 500,
        retryable: false,
      })
    }

    stateByMessageId.set(
      currentMessageId,
      messageKey,
    )
  }

  const foundIds =
    new Set<string>()

  for (
    let index = 0;
    index < messages.length;
    index += 1
  ) {
    const message =
      messages[index]

    const messageId =
      normalizeDatabaseId(
        message.id,
        `messages[${index}].id`,
      )

    if (foundIds.has(messageId)) {
      fail({
        code:
          'SNAPSHOT_STATE_INCONSISTENT',

        message:
          'A fotografia contém uma mensagem duplicada.',

        status_code: 500,
        retryable: false,
      })
    }

    foundIds.add(messageId)

    if (
      message.company_id !==
        companyId ||
      message.conversation_key !==
        conversationKey
    ) {
      fail({
        code:
          'SNAPSHOT_SCOPE_VIOLATION',

        message:
          'A fotografia contém uma mensagem fora do escopo solicitado.',

        status_code: 500,
        retryable: false,
      })
    }

    const expectedMessageKey =
      stateByMessageId.get(
        messageId,
      )

    if (
      !expectedMessageKey ||
      message.message_key !==
        expectedMessageKey
    ) {
      fail({
        code:
          'SNAPSHOT_STATE_INCONSISTENT',

        message:
          'A versão carregada não corresponde ao estado canônico da mensagem.',

        status_code: 500,
        retryable: false,
      })
    }
  }

  if (
    foundIds.size !==
    stateByMessageId.size
  ) {
    fail({
      code:
        'SNAPSHOT_STATE_INCONSISTENT',

      message:
        'Uma ou mais mensagens canônicas não foram encontradas no ledger.',

      status_code: 500,
      retryable: true,
    })
  }

  return messages.filter(
    (message) =>
      message.cycle_id === cycleId,
  )
}

async function loadCommercialConfig({
  admin,
  companyId,
}: {
  admin: SupabaseClient
  companyId: string
}): Promise<{
  bundle:
    | CommercialConfigBundle
    | null
  products:
    CommercialConfigProductOption[]
}> {
  const versionsResult =
    await admin
      .from(
        'company_commercial_config_versions',
      )
      .select(
        VERSION_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'status',
        'published',
      )
      .order(
        'version_number',
        {
          ascending: false,
        },
      )
      .limit(2)

  const versionRows =
    getRows(
      versionsResult,
      'company_commercial_config_versions',
    )

  if (
    versionRows.length > 1
  ) {
    fail({
      code:
        'SNAPSHOT_MULTIPLE_PUBLISHED_CONFIGS',

      message:
        'A empresa possui mais de uma configuração comercial publicada.',

      status_code: 500,
      retryable: false,
    })
  }

  if (
    versionRows.length === 0
  ) {
    return {
      bundle: null,
      products: [],
    }
  }

  const version =
    versionRows[0] as unknown as
      CommercialConfigVersion

  if (
    version.company_id !==
      companyId ||
    version.status !==
      'published'
  ) {
    fail({
      code:
        'SNAPSHOT_SCOPE_VIOLATION',

      message:
        'A configuração comercial publicada está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  const configVersionId =
    normalizeUuid(
      version.id,
      'commercial_config.version.id',
    )

  const [
    methodStepsResult,
    productProfilesResult,
    factsResult,
    objectionGuidesResult,
    productsResult,
  ] = await Promise.all([
    admin
      .from(
        'company_commercial_method_steps',
      )
      .select(
        METHOD_STEP_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'config_version_id',
        configVersionId,
      )
      .order(
        'step_order',
        {
          ascending: true,
        },
      ),

    admin
      .from(
        'company_commercial_product_profiles',
      )
      .select(
        PRODUCT_PROFILE_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'config_version_id',
        configVersionId,
      ),

    admin
      .from(
        'company_commercial_facts',
      )
      .select(
        FACT_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'config_version_id',
        configVersionId,
      )
      .order(
        'category',
        {
          ascending: true,
        },
      )
      .order(
        'fact_key',
        {
          ascending: true,
        },
      ),

    admin
      .from(
        'company_commercial_objection_guides',
      )
      .select(
        OBJECTION_GUIDE_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'config_version_id',
        configVersionId,
      )
      .order(
        'sort_order',
        {
          ascending: true,
        },
      ),

    admin
      .from('products')
      .select(
        PRODUCT_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .order(
        'active',
        {
          ascending: false,
        },
      )
      .order(
        'name',
        {
          ascending: true,
        },
      ),
  ])

  const methodSteps =
    getRows(
      methodStepsResult,
      'company_commercial_method_steps',
    ) as unknown as
      CommercialMethodStep[]

  const productProfiles =
    getRows(
      productProfilesResult,
      'company_commercial_product_profiles',
    ) as unknown as
      CommercialProductProfile[]

  const facts =
    getRows(
      factsResult,
      'company_commercial_facts',
    ) as unknown as
      CommercialFact[]

  const objectionGuides =
    getRows(
      objectionGuidesResult,
      'company_commercial_objection_guides',
    ) as unknown as
      CommercialObjectionGuide[]

  const products =
    getRows(
      productsResult,
      'products',
    ) as unknown as
      CommercialConfigProductOption[]

  return {
    bundle: {
      version,
      method_steps:
        methodSteps,
      product_profiles:
        productProfiles,
      facts,
      objection_guides:
        objectionGuides,
    },

    products,
  }
}

export async function loadCompanionDiagnosticSnapshot({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
}: {
  admin: SupabaseClient
  company_id: unknown
  cycle_id: unknown
  conversation_key: unknown
  reference_time: unknown
}): Promise<
  CompanionDiagnosticSnapshot
> {
  const companyId =
    normalizeUuid(
      company_id,
      'company_id',
    )

  const cycleId =
    normalizeUuid(
      cycle_id,
      'cycle_id',
    )

  const conversationKey =
    normalizeRequiredString(
      conversation_key,
      'conversation_key',
    )

  const referenceTime =
    normalizeReferenceTime(
      reference_time,
    )

  const cycleResult =
    await admin
      .from('sales_cycles')
      .select(
        CYCLE_FIELDS,
      )
      .eq(
        'id',
        cycleId,
      )
      .eq(
        'company_id',
        companyId,
      )
      .maybeSingle()

  const cycle =
    getMaybeSingle(
      cycleResult,
      'sales_cycles',
    )

  if (!cycle) {
    fail({
      code:
        'SNAPSHOT_CYCLE_NOT_FOUND',

      message:
        'O ciclo comercial não foi encontrado para a empresa informada.',

      status_code: 404,
      retryable: false,
    })
  }

  if (
    cycle.id !== cycleId ||
    cycle.company_id !== companyId
  ) {
    fail({
      code:
        'SNAPSHOT_SCOPE_VIOLATION',

      message:
        'O ciclo retornado está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  const currentCrmStatus =
    normalizeLeadStatus(
      cycle.status,
    )

  const reconciliationResult =
    await admin
      .from(
        'conversation_message_reconciliation_state',
      )
      .select(
        RECONCILIATION_FIELDS,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .order(
        'message_key',
        {
          ascending: true,
        },
      )
      .limit(
        MAX_CANONICAL_MESSAGES +
          1,
      )

  const reconciliationRows =
    getRows(
      reconciliationResult,
      'conversation_message_reconciliation_state',
    ) as unknown as
      ReconciliationRow[]

  if (
    reconciliationRows.length >
    MAX_CANONICAL_MESSAGES
  ) {
    fail({
      code:
        'SNAPSHOT_MESSAGE_LIMIT_EXCEEDED',

      message:
        `A conversa ultrapassa o limite de ${MAX_CANONICAL_MESSAGES} mensagens canônicas por diagnóstico.`,

      status_code: 413,
      retryable: false,
    })
  }

  const currentMessageIds =
    reconciliationRows.map(
      (row, index) =>
        normalizeDatabaseId(
          row.current_message_id,
          `reconciliation[${index}].current_message_id`,
        ),
    )

  let messages:
    JsonRecord[] = []

  if (
    currentMessageIds.length > 0
  ) {
    const messagesResult =
      await admin
        .from(
          'conversation_messages',
        )
        .select(
          MESSAGE_FIELDS,
        )
        .eq(
          'company_id',
          companyId,
        )
        .eq(
          'conversation_key',
          conversationKey,
        )
        .in(
          'id',
          currentMessageIds,
        )

    messages =
      getRows(
        messagesResult,
        'conversation_messages',
      )
  }

  const cycleMessages =
    validateCanonicalMessages({
      messages,
      reconciliationRows,
      companyId,
      cycleId,
      conversationKey,
    })

  const {
    bundle,
    products,
  } = await loadCommercialConfig({
    admin,
    companyId,
  })

  const input =
    buildCompanionDiagnosticInput({
      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      current_crm_status:
        currentCrmStatus,

      reference_time:
        referenceTime,

      messages:
        cycleMessages,

      commercial_config:
        bundle,

      products,
    })

  return {
    input,

    source: {
      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      canonical_message_count:
        input.conversation
          .active_message_ids
          .length,

      excluded_message_count:
        input.conversation
          .excluded_message_ids
          .length,

      commercial_config_version_id:
        bundle?.version.id ??
        null,

      commercial_config_version_number:
        bundle?.version
          .version_number ??
        null,
    },
  }
}
