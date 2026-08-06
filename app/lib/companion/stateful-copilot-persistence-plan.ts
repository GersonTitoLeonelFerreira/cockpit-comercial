import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

import type {
  StatefulCopilotEngineResult,
} from './stateful-copilot-engine'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

export const STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION =
  'phase-5.1-persistence-plan-v1' as const

export type StatefulCopilotPersistenceExecution = {
  provider: string
  model: string | null
  request_id: string | null

  usage: {
    input_tokens: number | null
    output_tokens: number | null
    total_tokens: number | null
  } | null

  attempts: 1 | 2

  recovered_after_retry:
    boolean
}

export type StatefulCopilotPersistenceWriteGuard = {
  company_id: string
  cycle_id: string
  conversation_key: string

  expected_previous_state_version:
    number | null

  expected_previous_state_updated_at:
    string | null

  candidate_state_version:
    number

  requires_compare_and_swap:
    true

  requires_atomic_write:
    true
}

export type StatefulCopilotPersistenceAuditEvent = {
  event_type:
    'stateful_copilot_analysis_completed'

  generated_at: string

  company_id: string
  cycle_id: string
  conversation_key: string

  previous_state_version:
    number | null

  candidate_state_version:
    number

  analyzed_message_ids:
    string[]

  evidence_message_ids:
    string[]

  memory_ids:
    string[]

  normalized_output:
    StatefulCopilotOutput

  execution:
    StatefulCopilotPersistenceExecution

  automatic_crm_write:
    false

  automatic_agenda_write:
    false
}

export type StatefulCopilotBlockedPersistencePlan = {
  plan_version:
    typeof STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION

  mode: 'blocked'

  should_persist:
    false

  generated_at: string

  company_id: string
  cycle_id: string
  conversation_key: string

  expected_previous_state_version:
    number | null

  limitations:
    string[]

  write_guard:
    null

  state_snapshot:
    null

  audit_event:
    null
}

export type StatefulCopilotModelPersistencePlan = {
  plan_version:
    typeof STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION

  mode: 'model'

  should_persist:
    true

  generated_at: string

  company_id: string
  cycle_id: string
  conversation_key: string

  write_guard:
    StatefulCopilotPersistenceWriteGuard

  state_snapshot:
    StatefulCommercialState

  audit_event:
    StatefulCopilotPersistenceAuditEvent
}

export type StatefulCopilotPersistencePlan =
  | StatefulCopilotBlockedPersistencePlan
  | StatefulCopilotModelPersistencePlan

export type BuildStatefulCopilotPersistencePlanArgs = {
  engine_result:
    StatefulCopilotEngineResult

  company_id:
    unknown

  conversation_key:
    unknown

  generated_at:
    unknown
}

export class StatefulCopilotPersistencePlanError
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
      'StatefulCopilotPersistencePlanError'

    this.code =
      code

    this.path =
      path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new StatefulCopilotPersistencePlanError(
    code,
    path,
    message,
  )
}

function requireText(
  value: unknown,
  path: string,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_TEXT',
      path,
      `${path} precisa ser um texto.`,
    )
  }

  const normalized =
    value.trim()

  if (!normalized) {
    fail(
      'INVALID_TEXT',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  return normalized
}

function requireDateTime(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireText(
      value,
      path,
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

function cloneValue<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T
}

function ensureSameValues(
  first: string[],
  second: string[],
  path: string,
): void {
  if (
    first.length !==
    second.length
  ) {
    fail(
      'VALUE_SET_MISMATCH',
      path,
      `${path} não coincide com a análise normalizada.`,
    )
  }

  for (
    let index = 0;
    index < first.length;
    index += 1
  ) {
    if (
      first[index] !==
      second[index]
    ) {
      fail(
        'VALUE_SET_MISMATCH',
        path,
        `${path} não coincide com a análise normalizada.`,
      )
    }
  }
}

function validatePreviousState(
  result:
    StatefulCopilotEngineResult,
): void {
  const expectedVersion =
    result
      .input
      .state_context
      .previous_state_version

  if (
    result.previous_state ===
    null
  ) {
    if (
      expectedVersion !==
      null
    ) {
      fail(
        'PREVIOUS_STATE_REQUIRED',
        'engine_result.previous_state',
        'A versão anterior declarada exige um estado anterior.',
      )
    }

    return
  }

  if (
    result
      .previous_state
      .version !==
    expectedVersion
  ) {
    fail(
      'PREVIOUS_STATE_VERSION_MISMATCH',
      'engine_result.previous_state.version',
      'O estado anterior não coincide com a versão esperada.',
    )
  }
}

function validateModelResult(
  result:
    Extract<
      StatefulCopilotEngineResult,
      {
        mode: 'model'
      }
    >,
): void {
  if (
    result.plan.mode !==
    'model'
  ) {
    fail(
      'ENGINE_PLAN_RESULT_MISMATCH',
      'engine_result.plan.mode',
      'O resultado de modelo precisa possuir um plano de modelo.',
    )
  }

  const input =
    result.input

  const output =
    result.output

  const candidate =
    result.candidate_state

  if (
    candidate.cycle_id !==
    input.diagnostic_input.cycle_id
  ) {
    fail(
      'CANDIDATE_CYCLE_MISMATCH',
      'engine_result.candidate_state.cycle_id',
      'O estado candidato pertence a outro ciclo.',
    )
  }

  if (
    candidate.version !==
    input
      .state_context
      .target_state_version
  ) {
    fail(
      'CANDIDATE_VERSION_MISMATCH',
      'engine_result.candidate_state.version',
      'O estado candidato não possui a versão esperada.',
    )
  }

  if (
    output.previous_state_version !==
    input
      .state_context
      .previous_state_version
  ) {
    fail(
      'OUTPUT_VERSION_MISMATCH',
      'engine_result.output.previous_state_version',
      'A análise foi produzida para outra versão do estado.',
    )
  }

  if (
    candidate.updated_at !==
    input.diagnostic_input.reference_time
  ) {
    fail(
      'CANDIDATE_TIME_MISMATCH',
      'engine_result.candidate_state.updated_at',
      'O horário do estado candidato não coincide com a análise.',
    )
  }

  ensureSameValues(
    candidate.last_analyzed_message_ids,
    output.analyzed_message_ids,
    'engine_result.candidate_state.last_analyzed_message_ids',
  )

  ensureSameValues(
    candidate.last_evidence_message_ids,
    output.evidence_message_ids,
    'engine_result.candidate_state.last_evidence_message_ids',
  )
}

export function buildStatefulCopilotPersistencePlan(
  args:
    BuildStatefulCopilotPersistencePlanArgs,
): StatefulCopilotPersistencePlan {
  const result =
    args.engine_result

  const companyId =
    requireText(
      args.company_id,
      'company_id',
    )

  const conversationKey =
    requireText(
      args.conversation_key,
      'conversation_key',
    )

  const generatedAt =
    requireDateTime(
      args.generated_at,
      'generated_at',
    )

  const diagnosticInput =
    result.input.diagnostic_input

  if (
    diagnosticInput.company_id !==
    companyId
  ) {
    fail(
      'COMPANY_MISMATCH',
      'company_id',
      'A empresa informada não coincide com a análise.',
    )
  }

  if (
    diagnosticInput.conversation_key !==
    conversationKey
  ) {
    fail(
      'CONVERSATION_MISMATCH',
      'conversation_key',
      'A conversa informada não coincide com a análise.',
    )
  }

  if (
    Date.parse(generatedAt) <
    Date.parse(
      diagnosticInput.reference_time,
    )
  ) {
    fail(
      'PLAN_TIME_BEFORE_ANALYSIS',
      'generated_at',
      'O plano não pode ser criado antes da análise.',
    )
  }

  validatePreviousState(
    result,
  )

  const expectedPreviousVersion =
    result
      .input
      .state_context
      .previous_state_version

  if (
    result.mode ===
    'blocked'
  ) {
    if (
      result.plan.mode !==
      'blocked'
    ) {
      fail(
        'ENGINE_PLAN_RESULT_MISMATCH',
        'engine_result.plan.mode',
        'O resultado bloqueado precisa possuir um plano bloqueado.',
      )
    }

    return {
      plan_version:
        STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

      mode:
        'blocked',

      should_persist:
        false,

      generated_at:
        generatedAt,

      company_id:
        companyId,

      cycle_id:
        diagnosticInput.cycle_id,

      conversation_key:
        conversationKey,

      expected_previous_state_version:
        expectedPreviousVersion,

      limitations: [
        ...result.limitations,
      ],

      write_guard:
        null,

      state_snapshot:
        null,

      audit_event:
        null,
    }
  }

  validateModelResult(
    result,
  )

  const stateSnapshot =
    cloneValue(
      result.candidate_state,
    )

  const normalizedOutput =
    cloneValue(
      result.output,
    )

  return {
    plan_version:
      STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

    mode:
      'model',

    should_persist:
      true,

    generated_at:
      generatedAt,

    company_id:
      companyId,

    cycle_id:
      diagnosticInput.cycle_id,

    conversation_key:
      conversationKey,

    write_guard: {
      company_id:
        companyId,

      cycle_id:
        diagnosticInput.cycle_id,

      conversation_key:
        conversationKey,

      expected_previous_state_version:
        expectedPreviousVersion,

      expected_previous_state_updated_at:
        result.previous_state
          ?.updated_at ?? null,

      candidate_state_version:
        stateSnapshot.version,

      requires_compare_and_swap:
        true,

      requires_atomic_write:
        true,
    },

    state_snapshot:
      stateSnapshot,

    audit_event: {
      event_type:
        'stateful_copilot_analysis_completed',

      generated_at:
        generatedAt,

      company_id:
        companyId,

      cycle_id:
        diagnosticInput.cycle_id,

      conversation_key:
        conversationKey,

      previous_state_version:
        expectedPreviousVersion,

      candidate_state_version:
        stateSnapshot.version,

      analyzed_message_ids: [
        ...normalizedOutput
          .analyzed_message_ids,
      ],

      evidence_message_ids: [
        ...normalizedOutput
          .evidence_message_ids,
      ],

      memory_ids: [
        ...normalizedOutput
          .memory_ids,
      ],

      normalized_output:
        normalizedOutput,

      execution:
        cloneValue(
          result.execution,
        ),

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    },
  }
}
