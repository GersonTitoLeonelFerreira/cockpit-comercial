import {
  StatefulCommercialStateContractError,
  normalizeStatefulCommercialState,
} from './stateful-commercial-state-normalizer'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
  type StatefulCommercialState,
} from './stateful-commercial-state'

export const STATEFUL_COPILOT_STATE_TABLE =
  'companion_commercial_states' as const

export const STATEFUL_COPILOT_STATE_SELECT_COLUMNS = [
  'id',
  'company_id',
  'cycle_id',
  'conversation_key',
  'state_version',
  'state_contract_version',
  'state_updated_at',
  'state_snapshot',
  'persisted_at',
].join(',')

type JsonRecord =
  Record<string, unknown>

export type StatefulCopilotStateReadRequest = {
  company_id: string
  cycle_id: string
  conversation_key: string

  known_message_ids:
    string[]

  active_message_ids:
    string[]
}

export type StatefulCopilotSupabaseReadResult = {
  data: unknown
  error: unknown
}

export type StatefulCopilotSupabaseReadQuery = {
  eq: (
    column: string,
    value: unknown,
  ) => StatefulCopilotSupabaseReadQuery

  maybeSingle:
    () => PromiseLike<StatefulCopilotSupabaseReadResult>
}

export type StatefulCopilotSupabaseReadTable = {
  select: (
    columns: string,
  ) => StatefulCopilotSupabaseReadQuery
}

export type StatefulCopilotSupabaseReadClient = {
  from: (
    tableName: string,
  ) => StatefulCopilotSupabaseReadTable
}

export type StatefulCopilotStateMissingResult = {
  mode: 'missing'
  found: false

  company_id: string
  cycle_id: string
  conversation_key: string

  state_record_id:
    null

  state_version:
    null

  state_updated_at:
    null

  persisted_at:
    null

  state:
    null
}

export type StatefulCopilotStateFoundResult = {
  mode: 'found'
  found: true

  company_id: string
  cycle_id: string
  conversation_key: string

  state_record_id:
    string

  state_version:
    number

  state_updated_at:
    string

  persisted_at:
    string

  state:
    StatefulCommercialState
}

export type StatefulCopilotStateReadResult =
  | StatefulCopilotStateMissingResult
  | StatefulCopilotStateFoundResult

export type StatefulCopilotStateReader =
  (
    request:
      StatefulCopilotStateReadRequest,
  ) => Promise<StatefulCopilotStateReadResult>

export class StatefulCopilotStateReadError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

  constructor({
    code,
    message,
    status_code,
    retryable,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
  }) {
    super(message)

    this.name =
      'StatefulCopilotStateReadError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable
  }
}

function fail({
  code,
  message,
  statusCode,
  retryable,
}: {
  code: string
  message: string
  statusCode: number
  retryable: boolean
}): never {
  throw new StatefulCopilotStateReadError({
    code,
    message,
    status_code:
      statusCode,
    retryable,
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
        'INVALID_STATEFUL_STATE_READ_RESPONSE',

      message:
        `${path} precisa ser um objeto.`,

      statusCode:
        502,

      retryable:
        false,
    })
  }

  return value
}

function requireText(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_STATEFUL_STATE_READ_RESPONSE',

      message:
        `${path} precisa ser um texto.`,

      statusCode:
        502,

      retryable:
        false,
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
        'INVALID_STATEFUL_STATE_READ_RESPONSE',

      message:
        `${path} possui um valor inválido.`,

      statusCode:
        502,

      retryable:
        false,
    })
  }

  return normalized
}

function requireRequestText(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_STATEFUL_STATE_READ_REQUEST',

      message:
        `${path} precisa ser um texto.`,

      statusCode:
        500,

      retryable:
        false,
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
        'INVALID_STATEFUL_STATE_READ_REQUEST',

      message:
        `${path} possui um valor inválido.`,

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return normalized
}

function requirePositiveVersion(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    fail({
      code:
        'INVALID_PERSISTED_STATE',

      message:
        `${path} precisa ser uma versão positiva.`,

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return value
}

function requireDateTime(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireText(
      value,
      path,
      100,
    )

  if (
    !Number.isFinite(
      Date.parse(normalized),
    )
  ) {
    fail({
      code:
        'INVALID_PERSISTED_STATE',

      message:
        `${path} precisa possuir uma data válida.`,

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return normalized
}

function readErrorCode(
  error: unknown,
): string | null {
  if (!isRecord(error)) {
    return null
  }

  if (
    typeof error.code === 'string' &&
    error.code.trim()
  ) {
    return error.code.trim()
  }

  return null
}

function readErrorStatus(
  error: unknown,
): number | null {
  if (!isRecord(error)) {
    return null
  }

  const rawStatus =
    error.status ??
    error.statusCode

  const status =
    Number(rawStatus)

  if (
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    return null
  }

  return status
}

function isTransientReadError(
  error: unknown,
): boolean {
  const code =
    readErrorCode(error)

  if (
    code?.startsWith('08')
  ) {
    return true
  }

  if (
    code &&
    [
      '53300',
      '53400',
      '57014',
      '57P01',
      '57P02',
      '57P03',
      'PGRST000',
      'PGRST001',
      'PGRST002',
      'PGRST003',
    ].includes(code)
  ) {
    return true
  }

  const status =
    readErrorStatus(error)

  return (
    status !== null &&
    status >= 500
  )
}

function throwReadError(
  error: unknown,
): never {
  const retryable =
    isTransientReadError(error)

  fail({
    code:
      retryable
        ? 'STATEFUL_STATE_READ_UNAVAILABLE'
        : 'STATEFUL_STATE_READ_REJECTED',

    message:
      retryable
        ? 'A leitura do estado comercial está temporariamente indisponível.'
        : 'A leitura do estado comercial foi rejeitada pelo banco.',

    statusCode:
      retryable
        ? 503
        : 500,

    retryable,
  })
}

function buildMissingResult({
  companyId,
  cycleId,
  conversationKey,
}: {
  companyId: string
  cycleId: string
  conversationKey: string
}): StatefulCopilotStateMissingResult {
  return {
    mode:
      'missing',

    found:
      false,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    state_record_id:
      null,

    state_version:
      null,

    state_updated_at:
      null,

    persisted_at:
      null,

    state:
      null,
  }
}

function normalizePersistedState({
  value,
  request,
  companyId,
  cycleId,
  conversationKey,
}: {
  value: unknown

  request:
    StatefulCopilotStateReadRequest

  companyId: string
  cycleId: string
  conversationKey: string
}): StatefulCopilotStateFoundResult {
  const row =
    requireRecord(
      value,
      'response.data',
    )

  const stateRecordId =
    requireText(
      row.id,
      'response.data.id',
    )

  const persistedCompanyId =
    requireText(
      row.company_id,
      'response.data.company_id',
    )

  const persistedCycleId =
    requireText(
      row.cycle_id,
      'response.data.cycle_id',
    )

  const persistedConversationKey =
    requireText(
      row.conversation_key,
      'response.data.conversation_key',
    )

  if (
    persistedCompanyId !== companyId ||
    persistedCycleId !== cycleId ||
    persistedConversationKey !== conversationKey
  ) {
    fail({
      code:
        'PERSISTED_STATE_SCOPE_MISMATCH',

      message:
        'O estado carregado pertence a outro escopo comercial.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  const stateContractVersion =
    requireText(
      row.state_contract_version,
      'response.data.state_contract_version',
      100,
    )

  if (
    stateContractVersion !==
    STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION
  ) {
    fail({
      code:
        'PERSISTED_STATE_CONTRACT_MISMATCH',

      message:
        'A versão persistida do estado comercial é incompatível.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  const stateVersion =
    requirePositiveVersion(
      row.state_version,
      'response.data.state_version',
    )

  const stateUpdatedAt =
    requireDateTime(
      row.state_updated_at,
      'response.data.state_updated_at',
    )

  const persistedAt =
    requireDateTime(
      row.persisted_at,
      'response.data.persisted_at',
    )

  let state:
    StatefulCommercialState

  try {
    state =
      normalizeStatefulCommercialState(
        row.state_snapshot,
        {
          expected_cycle_id:
            cycleId,

          known_message_ids:
            request.known_message_ids,

          active_message_ids:
            request.active_message_ids,
        },
      )
  } catch (error) {
    if (
      error instanceof
      StatefulCommercialStateContractError
    ) {
      fail({
        code:
          'INVALID_PERSISTED_STATE',

        message:
          'O estado comercial persistido não passou pela validação canônica.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    throw error
  }

  if (
    state.version !==
    stateVersion
  ) {
    fail({
      code:
        'PERSISTED_STATE_VERSION_MISMATCH',

      message:
        'A versão da fotografia comercial não coincide com a versão da linha.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    Date.parse(state.updated_at) !==
    Date.parse(stateUpdatedAt)
  ) {
    fail({
      code:
        'PERSISTED_STATE_TIME_MISMATCH',

      message:
        'O horário da fotografia comercial não coincide com a linha persistida.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return {
    mode:
      'found',

    found:
      true,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    state_record_id:
      stateRecordId,

    state_version:
      stateVersion,

    state_updated_at:
      stateUpdatedAt,

    persisted_at:
      persistedAt,

    state,
  }
}

export function createStatefulCopilotSupabaseReader({
  client,
}: {
  client:
    StatefulCopilotSupabaseReadClient
}): StatefulCopilotStateReader {
  return async (
    request,
  ) => {
    const companyId =
      requireRequestText(
        request.company_id,
        'request.company_id',
      )

    const cycleId =
      requireRequestText(
        request.cycle_id,
        'request.cycle_id',
      )

    const conversationKey =
      requireRequestText(
        request.conversation_key,
        'request.conversation_key',
      )

    let response:
      StatefulCopilotSupabaseReadResult

    try {
      response =
        await client
          .from(
            STATEFUL_COPILOT_STATE_TABLE,
          )
          .select(
            STATEFUL_COPILOT_STATE_SELECT_COLUMNS,
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
          .maybeSingle()
    } catch (error) {
      if (
        error instanceof
        StatefulCopilotStateReadError
      ) {
        throw error
      }

      fail({
        code:
          'STATEFUL_STATE_READ_UNAVAILABLE',

        message:
          'A leitura do estado comercial está temporariamente indisponível.',

        statusCode:
          503,

        retryable:
          true,
      })
    }

    const envelope =
      requireRecord(
        response,
        'response',
      )

    if (envelope.error) {
      throwReadError(
        envelope.error,
      )
    }

    if (envelope.data === null) {
      return buildMissingResult({
        companyId,
        cycleId,
        conversationKey,
      })
    }

    if (
      envelope.data === undefined ||
      Array.isArray(envelope.data)
    ) {
      fail({
        code:
          'INVALID_STATEFUL_STATE_READ_RESPONSE',

        message:
          'A leitura do estado comercial retornou uma resposta inválida.',

        statusCode:
          502,

        retryable:
          false,
      })
    }

    return normalizePersistedState({
      value:
        envelope.data,

      request,

      companyId,
      cycleId,
      conversationKey,
    })
  }
}
