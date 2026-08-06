import {
  isStatefulCopilotCommercialRole,
  isStatefulCopilotCommitmentStatus,
  isStatefulCopilotConfidence,
  type StatefulCopilotCommercialRole,
  type StatefulCopilotCommitmentStatus,
  type StatefulCopilotConfidence,
  type StatefulCopilotEvidence,
} from './stateful-copilot-contract'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
  isPositiveStateVersion,
  isStatefulCommercialMemoryStatus,
  type StatefulCommercialCommitment,
  type StatefulCommercialFact,
  type StatefulCommercialMemoryBase,
  type StatefulCommercialMemoryStatus,
  type StatefulCommercialObservedItem,
  type StatefulCommercialOpenLoop,
  type StatefulCommercialState,
} from './stateful-commercial-state'

type JsonRecord =
  Record<string, unknown>

export type StatefulCommercialStateNormalizationContext = {
  expected_cycle_id: string

  known_message_ids:
    string[]

  active_message_ids:
    string[]
}

export class StatefulCommercialStateContractError
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
      'StatefulCommercialStateContractError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new StatefulCommercialStateContractError(
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

function requireArray(
  value: unknown,
  path: string,
): unknown[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  return value
}

function requireString(
  value: unknown,
  path: string,
  maximumLength = 4000,
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

function requireNullableString(
  value: unknown,
  path: string,
): string | null {
  if (value === null) {
    return null
  }

  return requireString(
    value,
    path,
  )
}

function requirePositiveVersion(
  value: unknown,
  path: string,
): number {
  if (!isPositiveStateVersion(value)) {
    fail(
      'INVALID_STATE_VERSION',
      path,
      `${path} precisa ser um inteiro positivo.`,
    )
  }

  return value
}

function requireNullableVersion(
  value: unknown,
  path: string,
): number | null {
  if (value === null) {
    return null
  }

  return requirePositiveVersion(
    value,
    path,
  )
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

function requireNullableDateTime(
  value: unknown,
  path: string,
): string | null {
  if (value === null) {
    return null
  }

  return requireDateTime(
    value,
    path,
  )
}

function requireUniqueStringArray(
  value: unknown,
  path: string,
  allowEmpty = true,
): string[] {
  const items =
    requireArray(
      value,
      path,
    )

  const normalized =
    items.map(
      (item, index) =>
        requireString(
          item,
          `${path}[${index}]`,
          500,
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

function requireCommercialRole(
  value: unknown,
  path: string,
): StatefulCopilotCommercialRole {
  if (
    !isStatefulCopilotCommercialRole(
      value,
    )
  ) {
    fail(
      'INVALID_COMMERCIAL_ROLE',
      path,
      `${path} possui um papel comercial inválido.`,
    )
  }

  return value
}

function requireConfidence(
  value: unknown,
  path: string,
): StatefulCopilotConfidence {
  if (
    !isStatefulCopilotConfidence(
      value,
    )
  ) {
    fail(
      'INVALID_CONFIDENCE',
      path,
      `${path} possui uma confiança inválida.`,
    )
  }

  return value
}

function requireCommitmentStatus(
  value: unknown,
  path: string,
): StatefulCopilotCommitmentStatus {
  if (
    !isStatefulCopilotCommitmentStatus(
      value,
    )
  ) {
    fail(
      'INVALID_COMMITMENT_STATUS',
      path,
      `${path} possui um estado de compromisso inválido.`,
    )
  }

  return value
}

function requireMemoryStatus(
  value: unknown,
  path: string,
): StatefulCommercialMemoryStatus {
  if (
    !isStatefulCommercialMemoryStatus(
      value,
    )
  ) {
    fail(
      'INVALID_MEMORY_STATUS',
      path,
      `${path} possui um estado de memória inválido.`,
    )
  }

  return value
}

function normalizeEvidenceIds(
  value: unknown,
  path: string,
  availableMessageIds: Set<string>,
): string[] {
  const ids =
    requireUniqueStringArray(
      value,
      path,
      false,
    )

  for (const id of ids) {
    if (
      !availableMessageIds.has(id)
    ) {
      fail(
        'UNKNOWN_EVIDENCE',
        path,
        `${path} referencia a mensagem inexistente ${id}.`,
      )
    }
  }

  return ids
}

function normalizeEvidence(
  value: unknown,
  path: string,
  availableMessageIds: Set<string>,
): StatefulCopilotEvidence {
  const record =
    requireRecord(
      value,
      path,
    )

  return {
    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    evidence_message_ids:
      normalizeEvidenceIds(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
        availableMessageIds,
      ),
  }
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

function normalizeMemoryBase(
  record: JsonRecord,
  path: string,
  stateVersion: number,
  availableMessageIds: Set<string>,
  usedMemoryIds: Set<string>,
  allowedStatuses:
    StatefulCommercialMemoryStatus[],
): StatefulCommercialMemoryBase {
  const id =
    requireString(
      record.id,
      `${path}.id`,
      500,
    )

  if (usedMemoryIds.has(id)) {
    fail(
      'DUPLICATE_MEMORY_ID',
      `${path}.id`,
      `O identificador ${id} está duplicado no estado comercial.`,
    )
  }

  usedMemoryIds.add(id)

  const memoryStatus =
    requireMemoryStatus(
      record.memory_status,
      `${path}.memory_status`,
    )

  if (
    !allowedStatuses.includes(
      memoryStatus,
    )
  ) {
    fail(
      'MEMORY_STATUS_NOT_ALLOWED',
      `${path}.memory_status`,
      `O estado ${memoryStatus} não é permitido nesta coleção.`,
    )
  }

  const createdVersion =
    requirePositiveVersion(
      record.created_in_state_version,
      `${path}.created_in_state_version`,
    )

  const updatedVersion =
    requirePositiveVersion(
      record.updated_in_state_version,
      `${path}.updated_in_state_version`,
    )

  const closedVersion =
    requireNullableVersion(
      record.closed_in_state_version,
      `${path}.closed_in_state_version`,
    )

  if (
    createdVersion >
    updatedVersion
  ) {
    fail(
      'INVALID_MEMORY_VERSION_ORDER',
      `${path}.updated_in_state_version`,
      'A atualização da memória não pode ser anterior à criação.',
    )
  }

  if (
    updatedVersion >
    stateVersion
  ) {
    fail(
      'MEMORY_VERSION_AHEAD',
      `${path}.updated_in_state_version`,
      'A memória não pode possuir versão superior ao estado.',
    )
  }

  if (
    memoryStatus === 'active' &&
    closedVersion !== null
  ) {
    fail(
      'ACTIVE_MEMORY_CLOSED',
      `${path}.closed_in_state_version`,
      'Memória ativa não pode possuir versão de encerramento.',
    )
  }

  if (
    memoryStatus !== 'active' &&
    closedVersion === null
  ) {
    fail(
      'CLOSED_MEMORY_WITHOUT_VERSION',
      `${path}.closed_in_state_version`,
      'Memória encerrada precisa informar sua versão de encerramento.',
    )
  }

  if (
    closedVersion !== null &&
    closedVersion !== updatedVersion
  ) {
    fail(
      'CLOSED_MEMORY_VERSION_MISMATCH',
      `${path}.closed_in_state_version`,
      'A versão de encerramento precisa coincidir com a última atualização.',
    )
  }

  return {
    id,

    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),

    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    evidence_message_ids:
      normalizeEvidenceIds(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
        availableMessageIds,
      ),

    memory_status:
      memoryStatus,

    created_in_state_version:
      createdVersion,

    updated_in_state_version:
      updatedVersion,

    closed_in_state_version:
      closedVersion,
  }
}

function normalizeFacts(
  value: unknown,
  stateVersion: number,
  availableMessageIds: Set<string>,
  usedMemoryIds: Set<string>,
): StatefulCommercialFact[] {
  return requireArray(
    value,
    'state.facts',
  ).map(
    (item, index) => {
      const path =
        `state.facts[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      const base =
        normalizeMemoryBase(
          record,
          path,
          stateVersion,
          availableMessageIds,
          usedMemoryIds,
          [
            'active',
            'superseded',
          ],
        )

      return {
        ...base,

        value:
          requireNullableString(
            record.value,
            `${path}.value`,
          ),

        confidence:
          requireConfidence(
            record.confidence,
            `${path}.confidence`,
          ),
      }
    },
  )
}

function normalizeObservedItems(
  value: unknown,
  path: string,
  stateVersion: number,
  availableMessageIds: Set<string>,
  usedMemoryIds: Set<string>,
): StatefulCommercialObservedItem[] {
  return requireArray(
    value,
    path,
  ).map(
    (item, index) => {
      const itemPath =
        `${path}[${index}]`

      const record =
        requireRecord(
          item,
          itemPath,
        )

      const base =
        normalizeMemoryBase(
          record,
          itemPath,
          stateVersion,
          availableMessageIds,
          usedMemoryIds,
          [
            'active',
            'resolved',
          ],
        )

      return {
        ...base,

        confidence:
          requireConfidence(
            record.confidence,
            `${itemPath}.confidence`,
          ),
      }
    },
  )
}

function normalizeOpenLoops(
  value: unknown,
  stateVersion: number,
  availableMessageIds: Set<string>,
  usedMemoryIds: Set<string>,
): StatefulCommercialOpenLoop[] {
  return requireArray(
    value,
    'state.open_loops',
  ).map(
    (item, index) => {
      const path =
        `state.open_loops[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      return normalizeMemoryBase(
        record,
        path,
        stateVersion,
        availableMessageIds,
        usedMemoryIds,
        [
          'active',
          'resolved',
        ],
      )
    },
  )
}

function normalizeCommitments(
  value: unknown,
  stateVersion: number,
  availableMessageIds: Set<string>,
  usedMemoryIds: Set<string>,
): StatefulCommercialCommitment[] {
  return requireArray(
    value,
    'state.commitments',
  ).map(
    (item, index) => {
      const path =
        `state.commitments[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      const base =
        normalizeMemoryBase(
          record,
          path,
          stateVersion,
          availableMessageIds,
          usedMemoryIds,
          [
            'active',
            'resolved',
          ],
        )

      const commitmentStatus =
        requireCommitmentStatus(
          record.commitment_status,
          `${path}.commitment_status`,
        )

      const terminal =
        commitmentStatus === 'cancelled' ||
        commitmentStatus === 'completed'

      if (
        terminal &&
        base.memory_status !== 'resolved'
      ) {
        fail(
          'TERMINAL_COMMITMENT_NOT_RESOLVED',
          `${path}.memory_status`,
          'Compromisso encerrado precisa possuir memória resolvida.',
        )
      }

      if (
        !terminal &&
        base.memory_status !== 'active'
      ) {
        fail(
          'OPEN_COMMITMENT_NOT_ACTIVE',
          `${path}.memory_status`,
          'Compromisso em andamento precisa possuir memória ativa.',
        )
      }

      return {
        ...base,

        commitment_status:
          commitmentStatus,

        scheduled_at:
          requireNullableDateTime(
            record.scheduled_at,
            `${path}.scheduled_at`,
          ),

        proposed_at:
          requireNullableDateTime(
            record.proposed_at,
            `${path}.proposed_at`,
          ),
      }
    },
  )
}

export function normalizeStatefulCommercialState(
  value: unknown,
  context:
    StatefulCommercialStateNormalizationContext,
): StatefulCommercialState {
  const expectedCycleId =
    requireString(
      context.expected_cycle_id,
      'context.expected_cycle_id',
      500,
    )

  const knownMessageIds =
    new Set(
      requireUniqueStringArray(
        context.known_message_ids,
        'context.known_message_ids',
        false,
      ),
    )

  const activeMessageIds =
    new Set(
      requireUniqueStringArray(
        context.active_message_ids,
        'context.active_message_ids',
        false,
      ),
    )

  ensureSubset(
    [
      ...activeMessageIds,
    ],
    knownMessageIds,
    'context.active_message_ids',
    'ACTIVE_MESSAGE_NOT_KNOWN',
  )

  const state =
    requireRecord(
      value,
      'state',
    )

  if (
    state.contract_version !==
    STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION
  ) {
    fail(
      'STATE_CONTRACT_VERSION_MISMATCH',
      'state.contract_version',
      'A versão do estado comercial é incompatível.',
    )
  }

  const cycleId =
    requireString(
      state.cycle_id,
      'state.cycle_id',
      500,
    )

  if (
    cycleId !==
    expectedCycleId
  ) {
    fail(
      'STATE_CYCLE_MISMATCH',
      'state.cycle_id',
      'O estado comercial pertence a outro ciclo.',
    )
  }

  const version =
    requirePositiveVersion(
      state.version,
      'state.version',
    )

  const lastAnalyzedMessageIds =
    normalizeEvidenceIds(
      state.last_analyzed_message_ids,
      'state.last_analyzed_message_ids',
      knownMessageIds,
    )

  const lastAnalyzedMessageIdSet =
    new Set(
      lastAnalyzedMessageIds,
    )

  const lastEvidenceMessageIds =
    normalizeEvidenceIds(
      state.last_evidence_message_ids,
      'state.last_evidence_message_ids',
      knownMessageIds,
    )

  ensureSubset(
    lastEvidenceMessageIds,
    lastAnalyzedMessageIdSet,
    'state.last_evidence_message_ids',
    'LAST_EVIDENCE_NOT_ANALYZED',
  )

  const lastEvidenceMessageIdSet =
    new Set(
      lastEvidenceMessageIds,
    )

  const currentMoment =
    normalizeEvidence(
      state.current_moment,
      'state.current_moment',
      knownMessageIds,
    )

  ensureSubset(
    currentMoment.evidence_message_ids,
    lastEvidenceMessageIdSet,
    'state.current_moment.evidence_message_ids',
    'CURRENT_MOMENT_OUTSIDE_LAST_EVIDENCE',
  )

  const currentPriority =
    normalizeEvidence(
      state.current_priority,
      'state.current_priority',
      knownMessageIds,
    )

  ensureSubset(
    currentPriority.evidence_message_ids,
    lastEvidenceMessageIdSet,
    'state.current_priority.evidence_message_ids',
    'CURRENT_PRIORITY_OUTSIDE_LAST_EVIDENCE',
  )

  const usedMemoryIds =
    new Set<string>()

  const facts =
    normalizeFacts(
      state.facts,
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const needs =
    normalizeObservedItems(
      state.needs,
      'state.needs',
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const openLoops =
    normalizeOpenLoops(
      state.open_loops,
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const objections =
    normalizeObservedItems(
      state.objections,
      'state.objections',
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const commitments =
    normalizeCommitments(
      state.commitments,
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const signals =
    normalizeObservedItems(
      state.signals,
      'state.signals',
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const uncertainties =
    normalizeObservedItems(
      state.uncertainties,
      'state.uncertainties',
      version,
      knownMessageIds,
      usedMemoryIds,
    )

  const createdAt =
    requireDateTime(
      state.created_at,
      'state.created_at',
    )

  const updatedAt =
    requireDateTime(
      state.updated_at,
      'state.updated_at',
    )

  if (
    Date.parse(updatedAt) <
    Date.parse(createdAt)
  ) {
    fail(
      'INVALID_STATE_CHRONOLOGY',
      'state.updated_at',
      'A atualização do estado não pode ser anterior à criação.',
    )
  }

  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      cycleId,

    version,

    commercial_role:
      requireCommercialRole(
        state.commercial_role,
        'state.commercial_role',
      ),

    current_moment:
      currentMoment,

    current_priority:
      currentPriority,

    last_analyzed_message_ids:
      lastAnalyzedMessageIds,

    last_evidence_message_ids:
      lastEvidenceMessageIds,

    facts,
    needs,

    open_loops:
      openLoops,

    objections,
    commitments,
    signals,
    uncertainties,

    created_at:
      createdAt,

    updated_at:
      updatedAt,
  }
}
