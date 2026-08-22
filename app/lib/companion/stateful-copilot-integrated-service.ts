import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  StatefulCommercialStateContractError,
  normalizeStatefulCommercialState,
} from './stateful-commercial-state-normalizer'

import type {
  StatefulCommercialMemoryIdFactory,
} from './stateful-commercial-state-reducer'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

import {
  runStatefulCopilotEngine,
  type StatefulCopilotEngineResult,
} from './stateful-copilot-engine'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import {
  buildStatefulCopilotPersistencePlan,
  type StatefulCopilotPersistencePlan,
} from './stateful-copilot-persistence-plan'

import {
  executeStatefulCopilotPersistence,
  type StatefulCopilotPersistenceExecutionResult,
  type StatefulCopilotPersistenceWriter,
} from './stateful-copilot-persistence-executor'

import type {
  StatefulCopilotStateReadResult,
  StatefulCopilotStateReader,
} from './stateful-copilot-supabase-reader'

type StatefulCopilotEngineRunner =
  typeof runStatefulCopilotEngine

type StatefulCopilotPersistencePlanBuilder =
  typeof buildStatefulCopilotPersistencePlan

type StatefulCopilotPersistenceExecutor =
  typeof executeStatefulCopilotPersistence

type StatefulCommercialStateNormalizer =
  typeof normalizeStatefulCommercialState

export type StatefulCopilotIntegratedServiceDependencies = {
  run_engine?:
    StatefulCopilotEngineRunner

  build_persistence_plan?:
    StatefulCopilotPersistencePlanBuilder

  execute_persistence?:
    StatefulCopilotPersistenceExecutor

  normalize_state?:
    StatefulCommercialStateNormalizer
}

export type RunStatefulCopilotIntegratedServiceArgs = {
  diagnostic_input:
    CompanionDiagnosticInput

  known_message_ids:
    unknown

  generated_at:
    unknown

  reader:
    StatefulCopilotStateReader

  writer:
    StatefulCopilotPersistenceWriter

  provider:
    StatefulCopilotProvider

  create_memory_id:
    StatefulCommercialMemoryIdFactory

  dependencies?:
    StatefulCopilotIntegratedServiceDependencies
}

export type StatefulCopilotIntegratedServiceResult = {
  state_read:
    StatefulCopilotStateReadResult

  engine_result:
    StatefulCopilotEngineResult

  persistence_plan:
    StatefulCopilotPersistencePlan

  persistence_result:
    StatefulCopilotPersistenceExecutionResult
}

export class StatefulCopilotIntegratedServiceError
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
      'StatefulCopilotIntegratedServiceError'

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
  throw new StatefulCopilotIntegratedServiceError({
    code,
    message,
    status_code:
      statusCode,
    retryable,
  })
}

function requireCanonicalText(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_INTEGRATED_SERVICE_INPUT',

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
    normalized.length > maximumLength ||
    normalized !== value
  ) {
    fail({
      code:
        'INVALID_INTEGRATED_SERVICE_INPUT',

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

function normalizeUniqueTextArray(
  value: unknown,
  path: string,
): string[] {
  if (!Array.isArray(value)) {
    fail({
      code:
        'INVALID_INTEGRATED_SERVICE_INPUT',

      message:
        `${path} precisa ser uma lista.`,

      statusCode:
        500,

      retryable:
        false,
    })
  }

  const normalized =
    value.map(
      (
        item,
        index,
      ) =>
        requireCanonicalText(
          item,
          `${path}[${index}]`,
        ),
    )

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    fail({
      code:
        'INVALID_INTEGRATED_SERVICE_INPUT',

      message:
        `${path} não pode conter valores duplicados.`,

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return normalized
}

function ensureSubset({
  values,
  allowedValues,
  path,
}: {
  values: string[]
  allowedValues: string[]
  path: string
}): void {
  const allowed =
    new Set(
      allowedValues,
    )

  for (const value of values) {
    if (!allowed.has(value)) {
      fail({
        code:
          'ACTIVE_MESSAGE_NOT_KNOWN',

        message:
          `${path} contém uma mensagem que não pertence ao ledger conhecido.`,

        statusCode:
          500,

        retryable:
          false,
      })
    }
  }
}

function normalizeLoadedState({
  stateRead,
  companyId,
  cycleId,
  conversationKey,
  knownMessageIds,
  activeMessageIds,
  customerMessageIds,
  normalizeState,
}: {
  stateRead:
    StatefulCopilotStateReadResult

  companyId: string
  cycleId: string
  conversationKey: string

  knownMessageIds:
    string[]

  activeMessageIds:
    string[]

  customerMessageIds:
    string[]

  normalizeState:
    StatefulCommercialStateNormalizer
}): StatefulCopilotStateReadResult {
  if (
    stateRead.company_id !== companyId ||
    stateRead.cycle_id !== cycleId ||
    stateRead.conversation_key !== conversationKey
  ) {
    fail({
      code:
        'STATE_READ_SCOPE_MISMATCH',

      message:
        'O estado carregado pertence a outro escopo comercial.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    stateRead.mode ===
    'missing'
  ) {
    if (
      stateRead.found !== false ||
      stateRead.state !== null ||
      stateRead.state_version !== null ||
      stateRead.state_updated_at !== null
    ) {
      fail({
        code:
          'INVALID_STATE_READ_RESULT',

        message:
          'O resultado de estado ausente é inconsistente.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    return {
      ...stateRead,
    }
  }

  if (
    stateRead.found !== true ||
    stateRead.state === null
  ) {
    fail({
      code:
        'INVALID_STATE_READ_RESULT',

      message:
        'O resultado de estado encontrado é inconsistente.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  let normalizedState:
    StatefulCommercialState

  try {
    normalizedState =
      normalizeState(
        stateRead.state,
        {
          expected_cycle_id:
            cycleId,

          known_message_ids:
            knownMessageIds,

          active_message_ids:
            activeMessageIds,

          customer_message_ids:
            customerMessageIds,
        },
      )
  } catch (error) {
    if (
      error instanceof
      StatefulCommercialStateContractError
    ) {
      fail({
        code:
          'INVALID_LOADED_STATE',

        message:
          'O estado comercial carregado não passou pela validação canônica.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    throw error
  }

  if (
    normalizedState.version !==
    stateRead.state_version
  ) {
    fail({
      code:
        'LOADED_STATE_VERSION_MISMATCH',

      message:
        'A versão do estado carregado não coincide com os metadados da leitura.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    Date.parse(
      normalizedState.updated_at,
    ) !==
    Date.parse(
      stateRead.state_updated_at,
    )
  ) {
    fail({
      code:
        'LOADED_STATE_TIME_MISMATCH',

      message:
        'O horário do estado carregado não coincide com os metadados da leitura.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return {
    ...stateRead,

    state:
      normalizedState,
  }
}

function normalizeCandidateState({
  engineResult,
  cycleId,
  knownMessageIds,
  activeMessageIds,
  customerMessageIds,
  normalizeState,
}: {
  engineResult:
    StatefulCopilotEngineResult

  cycleId: string

  knownMessageIds:
    string[]

  activeMessageIds:
    string[]

  customerMessageIds:
    string[]

  normalizeState:
    StatefulCommercialStateNormalizer
}): StatefulCopilotEngineResult {
  if (
    engineResult.mode ===
    'blocked'
  ) {
    return engineResult
  }

  let normalizedCandidate:
    StatefulCommercialState

  try {
    normalizedCandidate =
      normalizeState(
        engineResult.candidate_state,
        {
          expected_cycle_id:
            cycleId,

          known_message_ids:
            knownMessageIds,

          active_message_ids:
            activeMessageIds,

          customer_message_ids:
            customerMessageIds,
        },
      )
  } catch (error) {
    if (
      error instanceof
      StatefulCommercialStateContractError
    ) {
      fail({
        code:
          'INVALID_CANDIDATE_STATE',

        message:
          'O estado comercial candidato não passou pela validação canônica.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    throw error
  }

  return {
    ...engineResult,

    candidate_state:
      normalizedCandidate,
  }
}

export async function runStatefulCopilotIntegratedService({
  diagnostic_input,
  known_message_ids,
  generated_at,
  reader,
  writer,
  provider,
  create_memory_id,
  dependencies = {},
}: RunStatefulCopilotIntegratedServiceArgs): Promise<StatefulCopilotIntegratedServiceResult> {
  const runEngine =
    dependencies.run_engine ??
    runStatefulCopilotEngine

  const buildPersistencePlan =
    dependencies.build_persistence_plan ??
    buildStatefulCopilotPersistencePlan

  const executePersistence =
    dependencies.execute_persistence ??
    executeStatefulCopilotPersistence

  const normalizeState =
    dependencies.normalize_state ??
    normalizeStatefulCommercialState

  const companyId =
    requireCanonicalText(
      diagnostic_input.company_id,
      'diagnostic_input.company_id',
    )

  const cycleId =
    requireCanonicalText(
      diagnostic_input.cycle_id,
      'diagnostic_input.cycle_id',
    )

  const conversationKey =
    requireCanonicalText(
      diagnostic_input.conversation_key,
      'diagnostic_input.conversation_key',
    )

  const knownMessageIds =
    normalizeUniqueTextArray(
      known_message_ids,
      'known_message_ids',
    )

  const activeMessageIds =
    normalizeUniqueTextArray(
      diagnostic_input
        .conversation
        .active_message_ids,
      'diagnostic_input.conversation.active_message_ids',
    )

  const customerMessageIds =
    diagnostic_input
      .conversation
      .messages
      .filter(
        message =>
          message.direction ===
          'incoming',
      )
      .map(
        message =>
          message.id,
      )

  ensureSubset({
    values:
      activeMessageIds,

    allowedValues:
      knownMessageIds,

    path:
      'diagnostic_input.conversation.active_message_ids',
  })

  ensureSubset({
    values:
      customerMessageIds,

    allowedValues:
      activeMessageIds,

    path:
      'diagnostic_input.conversation.customer_message_ids',
  })

  const rawStateRead =
    await reader({
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

  const stateRead =
    normalizeLoadedState({
      stateRead:
        rawStateRead,

      companyId,
      cycleId,
      conversationKey,

      knownMessageIds,
      activeMessageIds,
      customerMessageIds,

      normalizeState,
    })

  const rawEngineResult =
    await runEngine({
      diagnostic_input,

      previous_state:
        stateRead.state,

      known_message_ids:
        knownMessageIds,

      provider,

      create_memory_id,
    })

  const engineResult =
    normalizeCandidateState({
      engineResult:
        rawEngineResult,

      cycleId,

      knownMessageIds,
      activeMessageIds,
      customerMessageIds,

      normalizeState,
    })

  const persistencePlan =
    buildPersistencePlan({
      engine_result:
        engineResult,

      company_id:
        companyId,

      conversation_key:
        conversationKey,

      generated_at,
    })

  const persistenceResult =
    await executePersistence({
      plan:
        persistencePlan,

      writer,
    })

  return {
    state_read:
      stateRead,

    engine_result:
      engineResult,

    persistence_plan:
      persistencePlan,

    persistence_result:
      persistenceResult,
  }
}
