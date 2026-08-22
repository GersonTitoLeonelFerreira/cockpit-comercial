import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
  type CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract'

import {
  normalizeStatefulCommercialState,
} from './stateful-commercial-state-normalizer'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

export const STATEFUL_COPILOT_INPUT_VERSION =
  'phase-5.1-stateful-input-v1' as const

export type StatefulCopilotInputMode =
  | 'initial'
  | 'continuation'

export type StatefulCopilotInput = {
  input_version:
    typeof STATEFUL_COPILOT_INPUT_VERSION

  output_contract_version:
    typeof STATEFUL_COPILOT_CONTRACT_VERSION

  diagnostic_input:
    CompanionDiagnosticInput

  state_context: {
    mode:
      StatefulCopilotInputMode

    previous_state_version:
      number | null

    target_state_version:
      number

    previous_state:
      StatefulCommercialState | null
  }
}

export type BuildStatefulCopilotInputArgs = {
  diagnostic_input:
    CompanionDiagnosticInput

  previous_state:
    unknown | null

  known_message_ids:
    unknown
}

type JsonRecord =
  Record<string, unknown>

export class StatefulCopilotInputError
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
      'StatefulCopilotInputError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new StatefulCopilotInputError(
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

function requireString(
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

  const normalized =
    value.trim()

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
      `${path} excede o limite permitido.`,
    )
  }

  return normalized
}

function requireDateTime(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireString(
      value,
      path,
      100,
    )

  if (
    !Number.isFinite(
      Date.parse(normalized),
    )
  ) {
    fail(
      'INVALID_DATETIME',
      path,
      `${path} precisa possuir uma data válida.`,
    )
  }

  return normalized
}

function requireUniqueStringArray(
  value: unknown,
  path: string,
  allowEmpty = true,
): string[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  const normalized =
    value.map(
      (item, index) =>
        requireString(
          item,
          `${path}[${index}]`,
        ),
    )

  if (
    !allowEmpty &&
    normalized.length === 0
  ) {
    fail(
      'EMPTY_LIST',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    fail(
      'DUPLICATE_VALUE',
      path,
      `${path} não pode conter valores duplicados.`,
    )
  }

  return normalized
}

function collectRecordIds(
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

  const ids =
    value.map(
      (item, index) => {
        const record =
          requireRecord(
            item,
            `${path}[${index}]`,
          )

        return requireString(
          record.id,
          `${path}[${index}].id`,
        )
      },
    )

  if (
    new Set(ids).size !==
    ids.length
  ) {
    fail(
      'DUPLICATE_MESSAGE_ID',
      path,
      `${path} possui identificadores duplicados.`,
    )
  }

  return ids
}

function ensureSubset(
  values: string[],
  allowedValues: Set<string>,
  path: string,
  code: string,
): void {
  for (const value of values) {
    if (!allowedValues.has(value)) {
      fail(
        code,
        path,
        `${path} contém o valor não permitido ${value}.`,
      )
    }
  }
}

function ensureSameValues(
  firstValues: string[],
  secondValues: string[],
  path: string,
  code: string,
): void {
  const first =
    new Set(firstValues)

  const second =
    new Set(secondValues)

  if (
    first.size !==
    second.size
  ) {
    fail(
      code,
      path,
      `${path} não coincide com a fotografia canônica.`,
    )
  }

  for (const value of first) {
    if (!second.has(value)) {
      fail(
        code,
        path,
        `${path} não coincide com a fotografia canônica.`,
      )
    }
  }
}

function ensureDisjoint(
  firstValues: string[],
  secondValues: string[],
  path: string,
): void {
  const second =
    new Set(secondValues)

  for (const value of firstValues) {
    if (second.has(value)) {
      fail(
        'MESSAGE_ACTIVE_AND_EXCLUDED',
        path,
        `A mensagem ${value} não pode estar ativa e excluída ao mesmo tempo.`,
      )
    }
  }
}

export function buildStatefulCopilotInput(
  args: BuildStatefulCopilotInputArgs,
): StatefulCopilotInput {
  const diagnosticInput =
    args.diagnostic_input

  if (
    !diagnosticInput ||
    typeof diagnosticInput !== 'object'
  ) {
    fail(
      'INVALID_DIAGNOSTIC_INPUT',
      'diagnostic_input',
      'A entrada canônica do diagnóstico é inválida.',
    )
  }

  if (
    diagnosticInput.input_version !==
    COMPANION_DIAGNOSTIC_INPUT_VERSION
  ) {
    fail(
      'DIAGNOSTIC_INPUT_VERSION_MISMATCH',
      'diagnostic_input.input_version',
      'A versão da entrada canônica do diagnóstico é incompatível.',
    )
  }

  if (
    diagnosticInput
      .diagnostic_contract_version !==
    COMPANION_DIAGNOSTIC_CONTRACT_VERSION
  ) {
    fail(
      'DIAGNOSTIC_CONTRACT_VERSION_MISMATCH',
      'diagnostic_input.diagnostic_contract_version',
      'A versão do contrato de diagnóstico é incompatível.',
    )
  }

  requireString(
    diagnosticInput.company_id,
    'diagnostic_input.company_id',
  )

  const cycleId =
    requireString(
      diagnosticInput.cycle_id,
      'diagnostic_input.cycle_id',
    )

  requireString(
    diagnosticInput.conversation_key,
    'diagnostic_input.conversation_key',
  )

  const referenceTime =
    requireDateTime(
      diagnosticInput.reference_time,
      'diagnostic_input.reference_time',
    )

  const knownMessageIds =
    requireUniqueStringArray(
      args.known_message_ids,
      'known_message_ids',
    )

  const knownMessageIdSet =
    new Set(
      knownMessageIds,
    )

  const conversation =
    requireRecord(
      diagnosticInput.conversation,
      'diagnostic_input.conversation',
    )

  const activeMessageIds =
    requireUniqueStringArray(
      conversation.active_message_ids,
      'diagnostic_input.conversation.active_message_ids',
    )

  const excludedMessageIds =
    requireUniqueStringArray(
      conversation.excluded_message_ids,
      'diagnostic_input.conversation.excluded_message_ids',
    )

  const canonicalActiveMessageIds =
    collectRecordIds(
      conversation.messages,
      'diagnostic_input.conversation.messages',
    )

  const canonicalExcludedMessageIds =
    collectRecordIds(
      conversation.excluded_messages,
      'diagnostic_input.conversation.excluded_messages',
    )

  ensureSameValues(
    activeMessageIds,
    canonicalActiveMessageIds,
    'diagnostic_input.conversation.active_message_ids',
    'ACTIVE_MESSAGE_SNAPSHOT_MISMATCH',
  )

  ensureSameValues(
    excludedMessageIds,
    canonicalExcludedMessageIds,
    'diagnostic_input.conversation.excluded_message_ids',
    'EXCLUDED_MESSAGE_SNAPSHOT_MISMATCH',
  )

  ensureDisjoint(
    activeMessageIds,
    excludedMessageIds,
    'diagnostic_input.conversation',
  )

  ensureSubset(
    activeMessageIds,
    knownMessageIdSet,
    'diagnostic_input.conversation.active_message_ids',
    'ACTIVE_MESSAGE_NOT_KNOWN',
  )

  ensureSubset(
    excludedMessageIds,
    knownMessageIdSet,
    'diagnostic_input.conversation.excluded_message_ids',
    'EXCLUDED_MESSAGE_NOT_KNOWN',
  )

  let previousState:
    StatefulCommercialState | null =
      null

  if (
    args.previous_state !== null
  ) {
    if (
      knownMessageIds.length === 0
    ) {
      fail(
        'KNOWN_MESSAGES_REQUIRED',
        'known_message_ids',
        'Um estado comercial anterior exige mensagens conhecidas pelo ledger.',
      )
    }

    previousState =
      normalizeStatefulCommercialState(
        args.previous_state,
        {
          expected_cycle_id:
            cycleId,

          known_message_ids:
            knownMessageIds,

          active_message_ids:
            activeMessageIds,

          customer_message_ids:
            diagnosticInput
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
              ),
        },
      )

    if (
      Date.parse(referenceTime) <
      Date.parse(previousState.updated_at)
    ) {
      fail(
        'REFERENCE_TIME_BEFORE_STATE',
        'diagnostic_input.reference_time',
        'A fotografia atual não pode ser anterior ao estado comercial carregado.',
      )
    }
  }

  const previousStateVersion =
    previousState
      ? previousState.version
      : null

  return {
    input_version:
      STATEFUL_COPILOT_INPUT_VERSION,

    output_contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    diagnostic_input:
      diagnosticInput,

    state_context: {
      mode:
        previousState
          ? 'continuation'
          : 'initial',

      previous_state_version:
        previousStateVersion,

      target_state_version:
        previousStateVersion === null
          ? 1
          : previousStateVersion + 1,

      previous_state:
        previousState,
    },
  }
}
