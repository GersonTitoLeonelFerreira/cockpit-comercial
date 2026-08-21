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
} from './diagnostic-input'

import {
  createStatefulCopilotSupabaseReader,
  type StatefulCopilotStateReadResult,
  type StatefulCopilotStateReader,
  type StatefulCopilotSupabaseReadClient,
} from './stateful-copilot-supabase-reader'

const LEDGER_PAGE_SIZE =
  500

const MAX_LEDGER_ROWS =
  10000

const MAX_CANONICAL_MESSAGES =
  1000

const STATEFUL_DIAGNOSTIC_SESSION_GAP_MS =
  4 * 60 * 60 * 1000

const STATEFUL_DIAGNOSTIC_MAX_MESSAGES =
  80

const STATEFUL_DIAGNOSTIC_CONTEXT_BRIDGE_MESSAGES =
  6

const COMPANY_FIELDS = `
  id,
  name,
  platform_status,
  onboarding_status
`

const CYCLE_FIELDS = `
  id,
  company_id,
  lead_id,
  owner_user_id,
  status,
  next_action,
  next_action_date,
  updated_at
`

const LEAD_FIELDS = `
  id,
  company_id,
  name,
  phone,
  email,
  deleted_at,
  updated_at
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

const CAPTURE_STATE_FIELDS = `
  company_id,
  conversation_key,
  device_key,
  last_observed_message_id,
  last_observed_at,
  last_processed_message_id,
  last_processed_at,
  state_version,
  created_at,
  updated_at
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
  commercial_fact_contract_version,
  commercial_fact_definition,
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
  commercial_objection_contract_version,
  commercial_objection_definition,
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

export type StatefulCopilotContextQueryResult = {
  data: unknown
  error: unknown
}

export type StatefulCopilotContextQuery = PromiseLike<
  StatefulCopilotContextQueryResult
> & {
  select: (
    columns: string,
  ) => StatefulCopilotContextQuery

  eq: (
    column: string,
    value: unknown,
  ) => StatefulCopilotContextQuery

  order: (
    column: string,
    options?: {
      ascending?: boolean
    },
  ) => StatefulCopilotContextQuery

  limit: (
    count: number,
  ) => StatefulCopilotContextQuery

  range: (
    from: number,
    to: number,
  ) => StatefulCopilotContextQuery

  maybeSingle: (
    ) => PromiseLike<StatefulCopilotContextQueryResult>
}

export type StatefulCopilotRealContextSupabaseClient = {
  from: (
    tableName: string,
  ) => StatefulCopilotContextQuery
}

export type StatefulCopilotRealContextLoaderArgs = {
  company_id: unknown
  cycle_id: unknown
  conversation_key: unknown
  device_key: unknown
  reference_time: unknown
}

export type StatefulCopilotRealContextCursor =
  | {
      found: false

      company_id: string
      conversation_key: string
      device_key: string

      last_observed_message_id: null
      last_observed_at: null
      last_processed_message_id: null
      last_processed_at: null
      state_version: null
      created_at: null
      updated_at: null
    }
  | {
      found: true

      company_id: string
      conversation_key: string
      device_key: string

      last_observed_message_id:
        string | null

      last_observed_at:
        string | null

      last_processed_message_id:
        string | null

      last_processed_at:
        string | null

      state_version:
        number

      created_at:
        string

      updated_at:
        string
    }

export type StatefulCopilotRealContext = {
  loaded_at: string

  scope: {
    company: {
      id: string
      name: string
      platform_status: string
      onboarding_status: string
    }

    lead: {
      id: string
      company_id: string
      name: string
      phone: string | null
      email: string | null
      updated_at: string
    }

    cycle: {
      id: string
      company_id: string
      lead_id: string
      owner_user_id: string | null
      status: string
      next_action: string | null
      next_action_date: string | null
      updated_at: string
    }

    conversation_key: string
    device_key: string
  }

  cursor:
    StatefulCopilotRealContextCursor

  commercial_config_status:
    'published' | 'missing'

  commercial_config:
    CommercialConfigBundle | null

  products:
    CommercialConfigProductOption[]

  diagnostic_input:
    CompanionDiagnosticInput

  known_message_ids:
    string[]

  active_message_ids:
    string[]

  state_read:
    StatefulCopilotStateReadResult
}

export type StatefulCopilotRealContextLoader =
  (
    args:
      StatefulCopilotRealContextLoaderArgs,
  ) => Promise<StatefulCopilotRealContext>

export type StatefulCopilotRealContextLoaderDependencies = {
  state_reader?:
    StatefulCopilotStateReader
}

export class StatefulCopilotRealContextLoaderError
  extends Error {
  readonly code:
    string

  readonly status_code:
    number

  readonly retryable:
    boolean

  readonly path:
    string

  constructor({
    code,
    message,
    status_code,
    retryable,
    path,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
    path: string
  }) {
    super(message)

    this.name =
      'StatefulCopilotRealContextLoaderError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable

    this.path =
      path
  }
}

function fail({
  code,
  message,
  statusCode,
  retryable,
  path,
}: {
  code: string
  message: string
  statusCode: number
  retryable: boolean
  path: string
}): never {
  throw new StatefulCopilotRealContextLoaderError({
    code,
    message,
    status_code:
      statusCode,
    retryable,
    path,
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

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (!isRecord(value)) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou um objeto válido.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  return value
}

function requireCanonicalText(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_REAL_CONTEXT_INPUT',

      message:
        `${path} precisa ser um texto.`,

      statusCode:
        400,

      retryable:
        false,

      path,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > maximumLength ||
    normalized !== value
  ) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_INPUT',

      message:
        `${path} possui um valor inválido.`,

      statusCode:
        400,

      retryable:
        false,

      path,
    })
  }

  return normalized
}

function requireUuid(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireCanonicalText(
      value,
      path,
      100,
    ).toLowerCase()

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  if (!uuidPattern.test(normalized)) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_UUID',

      message:
        `${path} precisa ser um UUID válido.`,

      statusCode:
        400,

      retryable:
        false,

      path,
    })
  }

  return normalized
}

function normalizeRequiredDatabaseText(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou um texto válido.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > maximumLength
  ) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou um texto válido.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  return normalized
}

function normalizeNullableText(
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

  return normalizeRequiredDatabaseText(
    value,
    path,
    maximumLength,
  )
}

function normalizeDate(
  value: unknown,
  path: string,
): string {
  const raw =
    normalizeRequiredDatabaseText(
      value,
      path,
      100,
    )

  const timestamp =
    Date.parse(raw)

  if (!Number.isFinite(timestamp)) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou uma data válida.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  return new Date(
    timestamp,
  ).toISOString()
}

function normalizeNullableDate(
  value: unknown,
  path: string,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  return normalizeDate(
    value,
    path,
  )
}

function normalizePositiveInteger(
  value: unknown,
  path: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou um inteiro positivo.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  return parsed
}

function normalizeFiniteNumber(
  value: unknown,
  path: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou um número válido.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  return parsed
}

function normalizeMessageId(
  value: unknown,
  path: string,
): string {
  if (typeof value === 'bigint') {
    if (value <= BigInt(0)) {
      fail({
        code:
          'INVALID_REAL_CONTEXT_RESPONSE',

        message:
          `${path} não retornou um identificador positivo.`,

        statusCode:
          502,

        retryable:
          false,

        path,
      })
    }

    return value.toString()
  }

  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return String(value)
  }

  if (
    typeof value === 'string' &&
    /^[1-9]\d*$/.test(value)
  ) {
    return value
  }

  fail({
    code:
      'INVALID_REAL_CONTEXT_RESPONSE',

    message:
      `${path} não retornou um identificador válido.`,

    statusCode:
      502,

    retryable:
      false,

    path,
  })
}

function normalizeNullableMessageId(
  value: unknown,
  path: string,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  return normalizeMessageId(
    value,
    path,
  )
}

function requireRows(
  value: unknown,
  path: string,
): unknown[] {
  if (!Array.isArray(value)) {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path} não retornou uma lista válida.`,

      statusCode:
        502,

      retryable:
        false,

      path,
    })
  }

  return value
}

function hasReadError(
  error: unknown,
): boolean {
  return (
    error !== null &&
    error !== undefined
  )
}

async function readList(
  query:
    PromiseLike<StatefulCopilotContextQueryResult>,
  path: string,
): Promise<unknown[]> {
  let result:
    StatefulCopilotContextQueryResult

  try {
    result =
      await query
  } catch {
    fail({
      code:
        'REAL_CONTEXT_READ_UNAVAILABLE',

      message:
        'O contexto stateful não pôde ser carregado.',

      statusCode:
        503,

      retryable:
        true,

      path,
    })
  }

  if (hasReadError(result.error)) {
    fail({
      code:
        'REAL_CONTEXT_READ_UNAVAILABLE',

      message:
        'O contexto stateful não pôde ser carregado.',

      statusCode:
        503,

      retryable:
        true,

      path,
    })
  }

  return requireRows(
    result.data,
    path,
  )
}

async function readOptionalSingle(
  query:
    StatefulCopilotContextQuery,
  path: string,
): Promise<unknown | null> {
  let result:
    StatefulCopilotContextQueryResult

  try {
    result =
      await query.maybeSingle()
  } catch {
    fail({
      code:
        'REAL_CONTEXT_READ_UNAVAILABLE',

      message:
        'O contexto stateful não pôde ser carregado.',

      statusCode:
        503,

      retryable:
        true,

      path,
    })
  }

  if (hasReadError(result.error)) {
    fail({
      code:
        'REAL_CONTEXT_READ_UNAVAILABLE',

      message:
        'O contexto stateful não pôde ser carregado.',

      statusCode:
        503,

      retryable:
        true,

      path,
    })
  }

  if (
    result.data === null ||
    result.data === undefined
  ) {
    return null
  }

  return result.data
}

function requireScopeRecord(
  value: unknown,
  path: string,
  missingCode: string,
): JsonRecord {
  if (
    value === null ||
    value === undefined
  ) {
    fail({
      code:
        missingCode,

      message:
        'O escopo comercial solicitado não foi encontrado.',

      statusCode:
        404,

      retryable:
        false,

      path,
    })
  }

  return requireRecord(
    value,
    path,
  )
}

type NormalizedLedgerMessage = {
  id: string
  company_id: string
  cycle_id: string
  conversation_key: string
  message_key: string
  version: number
  direction: string
  occurred_at: string
  observed_at: string
  content_type: string
  text_content: string | null
  audio_transcription: string | null
  is_deleted: boolean
}

function normalizeLedgerMessage(
  value: unknown,
  index: number,
  companyId: string,
  cycleId: string,
  conversationKey: string,
): NormalizedLedgerMessage {
  const path =
    `conversation_messages[${index}]`

  const record =
    requireRecord(
      value,
      path,
    )

  const rowCompanyId =
    requireUuid(
      record.company_id,
      `${path}.company_id`,
    )

  const rowCycleId =
    requireUuid(
      record.cycle_id,
      `${path}.cycle_id`,
    )

  const rowConversationKey =
    normalizeRequiredDatabaseText(
      record.conversation_key,
      `${path}.conversation_key`,
    )

  if (
    rowCompanyId !== companyId ||
    rowCycleId !== cycleId ||
    rowConversationKey !== conversationKey
  ) {
    fail({
      code:
        'REAL_CONTEXT_SCOPE_MISMATCH',

      message:
        'O ledger retornou mensagens pertencentes a outro escopo.',

      statusCode:
        500,

      retryable:
        false,

      path,
    })
  }

  if (typeof record.is_deleted !== 'boolean') {
    fail({
      code:
        'INVALID_REAL_CONTEXT_RESPONSE',

      message:
        `${path}.is_deleted não retornou um booleano.`,

      statusCode:
        502,

      retryable:
        false,

      path:
        `${path}.is_deleted`,
    })
  }

  return {
    id:
      normalizeMessageId(
        record.id,
        `${path}.id`,
      ),

    company_id:
      rowCompanyId,

    cycle_id:
      rowCycleId,

    conversation_key:
      rowConversationKey,

    message_key:
      normalizeRequiredDatabaseText(
        record.message_key,
        `${path}.message_key`,
      ),

    version:
      normalizePositiveInteger(
        record.version,
        `${path}.version`,
      ),

    direction:
      normalizeRequiredDatabaseText(
        record.direction,
        `${path}.direction`,
        50,
      ),

    occurred_at:
      normalizeDate(
        record.occurred_at,
        `${path}.occurred_at`,
      ),

    observed_at:
      normalizeDate(
        record.observed_at,
        `${path}.observed_at`,
      ),

    content_type:
      normalizeRequiredDatabaseText(
        record.content_type,
        `${path}.content_type`,
        50,
      ),

    text_content:
      normalizeNullableText(
        record.text_content,
        `${path}.text_content`,
      ),

    audio_transcription:
      normalizeNullableText(
        record.audio_transcription,
        `${path}.audio_transcription`,
        200000,
      ),

    is_deleted:
      record.is_deleted,
  }
}

async function loadLedgerRows({
  client,
  companyId,
  cycleId,
  conversationKey,
}: {
  client:
    StatefulCopilotRealContextSupabaseClient

  companyId: string
  cycleId: string
  conversationKey: string
}): Promise<unknown[]> {
  const rows:
    unknown[] = []

  let offset =
    0

  while (true) {
    const page =
      await readList(
        client
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
            'cycle_id',
            cycleId,
          )
          .eq(
            'conversation_key',
            conversationKey,
          )
          .order(
            'id',
            {
              ascending:
                true,
            },
          )
          .range(
            offset,
            offset +
              LEDGER_PAGE_SIZE -
              1,
          ),
        'conversation_messages',
      )

    rows.push(
      ...page,
    )

    if (
      rows.length >
      MAX_LEDGER_ROWS
    ) {
      fail({
        code:
          'REAL_CONTEXT_LEDGER_LIMIT_EXCEEDED',

        message:
          'O ledger ultrapassou o limite seguro de carregamento.',

        statusCode:
          409,

        retryable:
          false,

        path:
          'conversation_messages',
      })
    }

    if (
      page.length <
      LEDGER_PAGE_SIZE
    ) {
      break
    }

    offset +=
      LEDGER_PAGE_SIZE
  }

  return rows
}

function buildCanonicalLedger({
  rows,
  companyId,
  cycleId,
  conversationKey,
}: {
  rows: unknown[]
  companyId: string
  cycleId: string
  conversationKey: string
}): {
  knownMessageIds: string[]
  canonicalMessages: NormalizedLedgerMessage[]
} {
  const normalizedRows =
    rows.map(
      (
        row,
        index,
      ) =>
        normalizeLedgerMessage(
          row,
          index,
          companyId,
          cycleId,
          conversationKey,
        ),
    )

  const knownMessageIds:
    string[] = []

  const knownIdSet =
    new Set<string>()

  const latestByMessageKey =
    new Map<
      string,
      NormalizedLedgerMessage
    >()

  for (const message of normalizedRows) {
    if (knownIdSet.has(message.id)) {
      fail({
        code:
          'DUPLICATED_LEDGER_MESSAGE_ID',

        message:
          'O ledger retornou um identificador duplicado.',

        statusCode:
          502,

        retryable:
          false,

        path:
          'conversation_messages',
      })
    }

    knownIdSet.add(
      message.id,
    )

    knownMessageIds.push(
      message.id,
    )

    const current =
      latestByMessageKey.get(
        message.message_key,
      )

    if (
      !current ||
      message.version >
        current.version
    ) {
      latestByMessageKey.set(
        message.message_key,
        message,
      )

      continue
    }

    if (
      message.version ===
      current.version
    ) {
      fail({
        code:
          'DUPLICATED_LEDGER_MESSAGE_VERSION',

        message:
          'O ledger retornou duas versões canônicas iguais.',

        statusCode:
          502,

        retryable:
          false,

        path:
          'conversation_messages',
      })
    }
  }

  const canonicalMessages =
    [
      ...latestByMessageKey.values(),
    ]

  if (
    canonicalMessages.length >
    MAX_CANONICAL_MESSAGES
  ) {
    fail({
      code:
        'REAL_CONTEXT_CANONICAL_LIMIT_EXCEEDED',

      message:
        'A conversa ultrapassou o limite seguro de mensagens canônicas.',

      statusCode:
        409,

      retryable:
        false,

      path:
        'conversation_messages',
    })
  }

  return {
    knownMessageIds,
    canonicalMessages,
  }
}

export function selectStatefulDiagnosticMessages(
  canonicalMessages:
    NormalizedLedgerMessage[],
): NormalizedLedgerMessage[] {
  if (
    canonicalMessages.length === 0
  ) {
    return []
  }

  const orderedByActivity =
    canonicalMessages
      .map((message) => ({
        message,
        activity_timestamp:
          Math.max(
            Date.parse(
              message.occurred_at,
            ),
            Date.parse(
              message.observed_at,
            ),
          ),
      }))
      .sort((left, right) => {
        if (
          left.activity_timestamp !==
          right.activity_timestamp
        ) {
          return (
            left.activity_timestamp -
            right.activity_timestamp
          )
        }

        return left.message.id.localeCompare(
          right.message.id,
          'en',
          {
            numeric: true,
          },
        )
      })

  const currentSession:
    NormalizedLedgerMessage[] = []

  let newerActivityTimestamp:
    number | null = null

  let bridgeEndIndex =
    -1

  for (
    let index =
      orderedByActivity.length - 1;
    index >= 0;
    index -= 1
  ) {
    const current =
      orderedByActivity[index]

    if (
      newerActivityTimestamp !== null &&
      newerActivityTimestamp -
        current.activity_timestamp >
        STATEFUL_DIAGNOSTIC_SESSION_GAP_MS
    ) {
      bridgeEndIndex =
        index
      break
    }

    currentSession.push(
      current.message,
    )

    newerActivityTimestamp =
      current.activity_timestamp

    if (
      currentSession.length >=
      STATEFUL_DIAGNOSTIC_MAX_MESSAGES
    ) {
      break
    }
  }

  const remainingCapacity =
    Math.max(
      0,
      STATEFUL_DIAGNOSTIC_MAX_MESSAGES -
        currentSession.length,
    )

  const bridgeCount =
    Math.min(
      STATEFUL_DIAGNOSTIC_CONTEXT_BRIDGE_MESSAGES,
      remainingCapacity,
    )

  const bridgeMessages =
    bridgeEndIndex >= 0 &&
    bridgeCount > 0
      ? orderedByActivity
          .slice(
            Math.max(
              0,
              bridgeEndIndex -
                bridgeCount +
                1,
            ),
            bridgeEndIndex + 1,
          )
          .map(
            item =>
              item.message,
          )
      : []

  const selectedIds =
    new Set(
      [
        ...bridgeMessages,
        ...currentSession,
      ].map(
        message =>
          message.id,
      ),
    )

  return canonicalMessages.filter(
    message =>
      selectedIds.has(
        message.id,
      ),
  )
}

function normalizeCursor({
  value,
  companyId,
  conversationKey,
  deviceKey,
}: {
  value: unknown | null
  companyId: string
  conversationKey: string
  deviceKey: string
}): StatefulCopilotRealContextCursor {
  if (value === null) {
    return {
      found:
        false,

      company_id:
        companyId,

      conversation_key:
        conversationKey,

      device_key:
        deviceKey,

      last_observed_message_id:
        null,

      last_observed_at:
        null,

      last_processed_message_id:
        null,

      last_processed_at:
        null,

      state_version:
        null,

      created_at:
        null,

      updated_at:
        null,
    }
  }

  const record =
    requireRecord(
      value,
      'conversation_capture_state',
    )

  const rowCompanyId =
    requireUuid(
      record.company_id,
      'conversation_capture_state.company_id',
    )

  const rowConversationKey =
    normalizeRequiredDatabaseText(
      record.conversation_key,
      'conversation_capture_state.conversation_key',
    )

  const rowDeviceKey =
    normalizeRequiredDatabaseText(
      record.device_key,
      'conversation_capture_state.device_key',
    )

  if (
    rowCompanyId !== companyId ||
    rowConversationKey !== conversationKey ||
    rowDeviceKey !== deviceKey
  ) {
    fail({
      code:
        'REAL_CONTEXT_SCOPE_MISMATCH',

      message:
        'O cursor retornado pertence a outro escopo.',

      statusCode:
        500,

      retryable:
        false,

      path:
        'conversation_capture_state',
    })
  }

  return {
    found:
      true,

    company_id:
      rowCompanyId,

    conversation_key:
      rowConversationKey,

    device_key:
      rowDeviceKey,

    last_observed_message_id:
      normalizeNullableMessageId(
        record.last_observed_message_id,
        'conversation_capture_state.last_observed_message_id',
      ),

    last_observed_at:
      normalizeNullableDate(
        record.last_observed_at,
        'conversation_capture_state.last_observed_at',
      ),

    last_processed_message_id:
      normalizeNullableMessageId(
        record.last_processed_message_id,
        'conversation_capture_state.last_processed_message_id',
      ),

    last_processed_at:
      normalizeNullableDate(
        record.last_processed_at,
        'conversation_capture_state.last_processed_at',
      ),

    state_version:
      normalizePositiveInteger(
        record.state_version,
        'conversation_capture_state.state_version',
      ),

    created_at:
      normalizeDate(
        record.created_at,
        'conversation_capture_state.created_at',
      ),

    updated_at:
      normalizeDate(
        record.updated_at,
        'conversation_capture_state.updated_at',
      ),
  }
}

function ensureScopedCommercialRows(
  values: unknown[],
  path: string,
  companyId: string,
  configVersionId: string,
): JsonRecord[] {
  return values.map(
    (
      value,
      index,
    ) => {
      const itemPath =
        `${path}[${index}]`

      const record =
        requireRecord(
          value,
          itemPath,
        )

      const rowCompanyId =
        requireUuid(
          record.company_id,
          `${itemPath}.company_id`,
        )

      const rowVersionId =
        requireUuid(
          record.config_version_id,
          `${itemPath}.config_version_id`,
        )

      if (
        rowCompanyId !== companyId ||
        rowVersionId !== configVersionId
      ) {
        fail({
          code:
            'REAL_CONTEXT_SCOPE_MISMATCH',

          message:
            'A configuração comercial retornou dados de outro escopo.',

          statusCode:
            500,

          retryable:
            false,

          path:
            itemPath,
        })
      }

      return record
    },
  )
}

function normalizeProducts(
  values: unknown[],
  companyId: string,
): CommercialConfigProductOption[] {
  return values.map(
    (
      value,
      index,
    ) => {
      const path =
        `products[${index}]`

      const record =
        requireRecord(
          value,
          path,
        )

      const rowCompanyId =
        requireUuid(
          record.company_id,
          `${path}.company_id`,
        )

      if (rowCompanyId !== companyId) {
        fail({
          code:
            'REAL_CONTEXT_SCOPE_MISMATCH',

          message:
            'O catálogo retornou produto de outra empresa.',

          statusCode:
            500,

          retryable:
            false,

          path,
        })
      }

      if (typeof record.active !== 'boolean') {
        fail({
          code:
            'INVALID_REAL_CONTEXT_RESPONSE',

          message:
            `${path}.active não retornou um booleano.`,

          statusCode:
            502,

          retryable:
            false,

          path:
            `${path}.active`,
        })
      }

      return {
        id:
          requireUuid(
            record.id,
            `${path}.id`,
          ),

        company_id:
          rowCompanyId,

        name:
          normalizeRequiredDatabaseText(
            record.name,
            `${path}.name`,
          ),

        category:
          (
            normalizeNullableText(
              record.category,
              `${path}.category`,
            ) as unknown
          ) as string,

        base_price:
          normalizeFiniteNumber(
            record.base_price,
            `${path}.base_price`,
          ),

        active:
          record.active,
      }
    },
  )
}

async function loadCommercialConfig({
  client,
  companyId,
  versionValue,
}: {
  client:
    StatefulCopilotRealContextSupabaseClient

  companyId: string
  versionValue: unknown | null
}): Promise<CommercialConfigBundle | null> {
  if (versionValue === null) {
    return null
  }

  const versionRecord =
    requireRecord(
      versionValue,
      'commercial_config.version',
    )

  const versionCompanyId =
    requireUuid(
      versionRecord.company_id,
      'commercial_config.version.company_id',
    )

  const versionId =
    requireUuid(
      versionRecord.id,
      'commercial_config.version.id',
    )

  if (
    versionCompanyId !== companyId ||
    versionRecord.status !== 'published'
  ) {
    fail({
      code:
        'REAL_CONTEXT_SCOPE_MISMATCH',

      message:
        'A versão comercial publicada pertence a outro escopo.',

      statusCode:
        500,

      retryable:
        false,

      path:
        'commercial_config.version',
    })
  }

  const [
    methodStepRows,
    productProfileRows,
    factRows,
    objectionGuideRows,
  ] =
    await Promise.all([
      readList(
        client
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
            versionId,
          )
          .order(
            'step_order',
            {
              ascending:
                true,
            },
          ),
        'company_commercial_method_steps',
      ),

      readList(
        client
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
            versionId,
          ),
        'company_commercial_product_profiles',
      ),

      readList(
        client
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
            versionId,
          )
          .order(
            'category',
            {
              ascending:
                true,
            },
          )
          .order(
            'fact_key',
            {
              ascending:
                true,
            },
          ),
        'company_commercial_facts',
      ),

      readList(
        client
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
            versionId,
          )
          .order(
            'sort_order',
            {
              ascending:
                true,
            },
          ),
        'company_commercial_objection_guides',
      ),
    ])

  const methodSteps =
    ensureScopedCommercialRows(
      methodStepRows,
      'commercial_config.method_steps',
      companyId,
      versionId,
    ) as unknown as CommercialMethodStep[]

  const productProfiles =
    ensureScopedCommercialRows(
      productProfileRows,
      'commercial_config.product_profiles',
      companyId,
      versionId,
    ) as unknown as CommercialProductProfile[]

  const facts =
    ensureScopedCommercialRows(
      factRows,
      'commercial_config.facts',
      companyId,
      versionId,
    ) as unknown as CommercialFact[]

  const objectionGuides =
    ensureScopedCommercialRows(
      objectionGuideRows,
      'commercial_config.objection_guides',
      companyId,
      versionId,
    ) as unknown as CommercialObjectionGuide[]

  return {
    version:
      versionRecord as unknown as CommercialConfigVersion,

    method_steps:
      methodSteps,

    product_profiles:
      productProfiles,

    facts,

    objection_guides:
      objectionGuides,
  }
}

export function createStatefulCopilotRealContextLoader(
  client:
    StatefulCopilotRealContextSupabaseClient,
  dependencies:
    StatefulCopilotRealContextLoaderDependencies = {},
): StatefulCopilotRealContextLoader {
  const stateReader =
    dependencies.state_reader ??
    createStatefulCopilotSupabaseReader({
      client:
        client as unknown as
          StatefulCopilotSupabaseReadClient,
    })

  return async ({
    company_id,
    cycle_id,
    conversation_key,
    device_key,
    reference_time,
  }) => {
    const companyId =
      requireUuid(
        company_id,
        'company_id',
      )

    const cycleId =
      requireUuid(
        cycle_id,
        'cycle_id',
      )

    const conversationKey =
      requireCanonicalText(
        conversation_key,
        'conversation_key',
      )

    const deviceKey =
      requireCanonicalText(
        device_key,
        'device_key',
      )

    const referenceTime =
      normalizeDate(
        reference_time,
        'reference_time',
      )

    const [
      companyValue,
      cycleValue,
      ledgerRows,
      cursorValue,
      publishedVersionRows,
      productRows,
    ] =
      await Promise.all([
        readOptionalSingle(
          client
            .from(
              'companies',
            )
            .select(
              COMPANY_FIELDS,
            )
            .eq(
              'id',
              companyId,
            ),
          'companies',
        ),

        readOptionalSingle(
          client
            .from(
              'sales_cycles',
            )
            .select(
              CYCLE_FIELDS,
            )
            .eq(
              'company_id',
              companyId,
            )
            .eq(
              'id',
              cycleId,
            ),
          'sales_cycles',
        ),

        loadLedgerRows({
          client,
          companyId,
          cycleId,
          conversationKey,
        }),

        readOptionalSingle(
          client
            .from(
              'conversation_capture_state',
            )
            .select(
              CAPTURE_STATE_FIELDS,
            )
            .eq(
              'company_id',
              companyId,
            )
            .eq(
              'conversation_key',
              conversationKey,
            )
            .eq(
              'device_key',
              deviceKey,
            ),
          'conversation_capture_state',
        ),

        readList(
          client
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
                ascending:
                  false,
              },
            )
            .limit(
              2,
            ),
          'company_commercial_config_versions',
        ),

        readList(
          client
            .from(
              'products',
            )
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
                ascending:
                  false,
              },
            )
            .order(
              'name',
              {
                ascending:
                  true,
              },
            ),
          'products',
        ),
      ])

    const companyRecord =
      requireScopeRecord(
        companyValue,
        'companies',
        'STATEFUL_COMPANY_NOT_FOUND',
      )

    const cycleRecord =
      requireScopeRecord(
        cycleValue,
        'sales_cycles',
        'STATEFUL_CYCLE_NOT_FOUND',
      )

    const loadedCompanyId =
      requireUuid(
        companyRecord.id,
        'companies.id',
      )

    const cycleCompanyId =
      requireUuid(
        cycleRecord.company_id,
        'sales_cycles.company_id',
      )

    const loadedCycleId =
      requireUuid(
        cycleRecord.id,
        'sales_cycles.id',
      )

    if (
      loadedCompanyId !== companyId ||
      cycleCompanyId !== companyId ||
      loadedCycleId !== cycleId
    ) {
      fail({
        code:
          'REAL_CONTEXT_SCOPE_MISMATCH',

        message:
          'Empresa e ciclo não pertencem ao escopo solicitado.',

        statusCode:
          500,

        retryable:
          false,

        path:
          'scope',
      })
    }

    const leadId =
      requireUuid(
        cycleRecord.lead_id,
        'sales_cycles.lead_id',
      )

    const leadValue =
      await readOptionalSingle(
        client
          .from(
            'leads',
          )
          .select(
            LEAD_FIELDS,
          )
          .eq(
            'company_id',
            companyId,
          )
          .eq(
            'id',
            leadId,
          ),
        'leads',
      )

    const leadRecord =
      requireScopeRecord(
        leadValue,
        'leads',
        'STATEFUL_LEAD_NOT_FOUND',
      )

    const leadCompanyId =
      requireUuid(
        leadRecord.company_id,
        'leads.company_id',
      )

    const loadedLeadId =
      requireUuid(
        leadRecord.id,
        'leads.id',
      )

    if (
      leadCompanyId !== companyId ||
      loadedLeadId !== leadId
    ) {
      fail({
        code:
          'REAL_CONTEXT_SCOPE_MISMATCH',

        message:
          'O lead retornado pertence a outro escopo.',

        statusCode:
          500,

        retryable:
          false,

        path:
          'leads',
      })
    }

    if (
      leadRecord.deleted_at !== null &&
      leadRecord.deleted_at !== undefined
    ) {
      fail({
        code:
          'STATEFUL_LEAD_NOT_AVAILABLE',

        message:
          'O lead vinculado ao ciclo não está disponível.',

        statusCode:
          409,

        retryable:
          false,

        path:
          'leads.deleted_at',
      })
    }

    if (
      publishedVersionRows.length >
      1
    ) {
      fail({
        code:
          'MULTIPLE_PUBLISHED_COMMERCIAL_CONFIGS',

        message:
          'A empresa possui mais de uma configuração comercial publicada.',

        statusCode:
          500,

        retryable:
          false,

        path:
          'company_commercial_config_versions',
      })
    }

    const commercialConfig =
      await loadCommercialConfig({
        client,
        companyId,
        versionValue:
          publishedVersionRows[0] ??
          null,
      })

    const products =
      normalizeProducts(
        productRows,
        companyId,
      )

    const {
      knownMessageIds,
      canonicalMessages,
    } =
      buildCanonicalLedger({
        rows:
          ledgerRows,

        companyId,
        cycleId,
        conversationKey,
      })

    const diagnosticMessages =
      selectStatefulDiagnosticMessages(
        canonicalMessages,
      )

    const diagnosticInput =
      buildCompanionDiagnosticInput({
        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        current_crm_status:
          cycleRecord.status,

        reference_time:
          referenceTime,

        messages:
          diagnosticMessages,

        commercial_config:
          commercialConfig,

        products,
      })

    const activeMessageIds =
      [
        ...diagnosticInput
          .conversation
          .active_message_ids,
      ]

    const stateRead =
      await stateReader({
        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        known_message_ids:
          knownMessageIds,

        active_message_ids:
          activeMessageIds,
      })

    return {
      loaded_at:
        referenceTime,

      scope: {
        company: {
          id:
            loadedCompanyId,

          name:
            normalizeRequiredDatabaseText(
              companyRecord.name,
              'companies.name',
            ),

          platform_status:
            normalizeRequiredDatabaseText(
              companyRecord.platform_status,
              'companies.platform_status',
              100,
            ),

          onboarding_status:
            normalizeRequiredDatabaseText(
              companyRecord.onboarding_status,
              'companies.onboarding_status',
              100,
            ),
        },

        lead: {
          id:
            loadedLeadId,

          company_id:
            leadCompanyId,

          name:
            normalizeRequiredDatabaseText(
              leadRecord.name,
              'leads.name',
            ),

          phone:
            normalizeNullableText(
              leadRecord.phone,
              'leads.phone',
            ),

          email:
            normalizeNullableText(
              leadRecord.email,
              'leads.email',
            ),

          updated_at:
            normalizeDate(
              leadRecord.updated_at,
              'leads.updated_at',
            ),
        },

        cycle: {
          id:
            loadedCycleId,

          company_id:
            cycleCompanyId,

          lead_id:
            leadId,

          owner_user_id:
            cycleRecord.owner_user_id === null ||
            cycleRecord.owner_user_id === undefined
              ? null
              : requireUuid(
                  cycleRecord.owner_user_id,
                  'sales_cycles.owner_user_id',
                ),

          status:
            normalizeRequiredDatabaseText(
              cycleRecord.status,
              'sales_cycles.status',
              100,
            ),

          next_action:
            normalizeNullableText(
              cycleRecord.next_action,
              'sales_cycles.next_action',
            ),

          next_action_date:
            normalizeNullableDate(
              cycleRecord.next_action_date,
              'sales_cycles.next_action_date',
            ),

          updated_at:
            normalizeDate(
              cycleRecord.updated_at,
              'sales_cycles.updated_at',
            ),
        },

        conversation_key:
          conversationKey,

        device_key:
          deviceKey,
      },

      cursor:
        normalizeCursor({
          value:
            cursorValue,

          companyId,
          conversationKey,
          deviceKey,
        }),

      commercial_config_status:
        commercialConfig
          ? 'published'
          : 'missing',

      commercial_config:
        commercialConfig,

      products,

      diagnostic_input:
        diagnosticInput,

      known_message_ids:
        knownMessageIds,

      active_message_ids:
        activeMessageIds,

      state_read:
        stateRead,
    }
  }
}
