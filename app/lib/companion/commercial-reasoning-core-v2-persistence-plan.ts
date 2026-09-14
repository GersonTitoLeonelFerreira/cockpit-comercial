import {
  COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,
  type CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

import {
  COMMERCIAL_REASONING_CORE_V2_RUNTIME_VERSION,
  type CommercialReasoningCoreV2RuntimeModelResult,
  type CommercialReasoningCoreV2RuntimeResult,
} from './commercial-reasoning-core-v2-runtime'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
  type StatefulCommercialState,
} from './stateful-commercial-state'

export const COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_PLAN_VERSION =
  'commercial-reasoning-core-v2-persistence-plan-v1' as const

export type CommercialReasoningCoreV2PersistedOutput = {
  contract_version:
    typeof COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION

  runtime_version:
    typeof COMMERCIAL_REASONING_CORE_V2_RUNTIME_VERSION

  core_output:
    CommercialReasoningCoreV2Output

  factual_guard:
    CommercialReasoningCoreV2RuntimeModelResult[
      'core_result'
    ]['factual_guard']

  seller_projection:
    CommercialReasoningCoreV2RuntimeModelResult[
      'seller_projection'
    ]

  commercial_reading:
    CommercialReasoningCoreV2RuntimeModelResult[
      'commercial_reading'
    ]['reading']

  commercial_reading_report:
    CommercialReasoningCoreV2RuntimeModelResult[
      'commercial_reading'
    ]['report']
}

export type CommercialReasoningCoreV2PersistenceWriteGuard = {
  company_id:
    string

  cycle_id:
    string

  conversation_key:
    string

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

export type CommercialReasoningCoreV2PersistenceAuditEvent = {
  event_type:
    'stateful_copilot_analysis_completed'

  engine_source:
    'commercial_reasoning_core_v2'

  generated_at:
    string

  company_id:
    string

  cycle_id:
    string

  conversation_key:
    string

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
    CommercialReasoningCoreV2PersistedOutput

  execution: {
    model_calls:
      1

    core:
      CommercialReasoningCoreV2RuntimeModelResult[
        'core_result'
      ]['execution']

    factual_guard:
      CommercialReasoningCoreV2RuntimeModelResult[
        'core_result'
      ]['factual_guard']
  }

  automatic_crm_write:
    false

  automatic_agenda_write:
    false
}

export type CommercialReasoningCoreV2BlockedPersistencePlan = {
  plan_version:
    typeof COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_PLAN_VERSION

  mode:
    'blocked'

  should_persist:
    false

  generated_at:
    string

  company_id:
    string

  cycle_id:
    string

  conversation_key:
    string

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

export type CommercialReasoningCoreV2ModelPersistencePlan = {
  plan_version:
    typeof COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_PLAN_VERSION

  mode:
    'model'

  should_persist:
    true

  generated_at:
    string

  company_id:
    string

  cycle_id:
    string

  conversation_key:
    string

  write_guard:
    CommercialReasoningCoreV2PersistenceWriteGuard

  state_snapshot:
    StatefulCommercialState

  audit_event:
    CommercialReasoningCoreV2PersistenceAuditEvent
}

export type CommercialReasoningCoreV2PersistencePlan =
  | CommercialReasoningCoreV2BlockedPersistencePlan
  | CommercialReasoningCoreV2ModelPersistencePlan

export class CommercialReasoningCoreV2PersistencePlanError
  extends Error {
  readonly code:
    string

  readonly path:
    string

  constructor({
    code,
    path,
    message,
  }: {
    code: string
    path: string
    message: string
  }) {
    super(
      message,
    )

    this.name =
      'CommercialReasoningCoreV2PersistencePlanError'

    this.code =
      code

    this.path =
      path
  }
}

function fail({
  code,
  path,
  message,
}: {
  code: string
  path: string
  message: string
}): never {
  throw new CommercialReasoningCoreV2PersistencePlanError({
    code,
    path,
    message,
  })
}

function requireText(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !==
    'string'
  ) {
    fail({
      code:
        'TEXT_REQUIRED',

      path,

      message:
        `${path} precisa ser texto.`,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized !== value
  ) {
    fail({
      code:
        'CANONICAL_TEXT_REQUIRED',

      path,

      message:
        `${path} precisa ser texto canônico não vazio.`,
    })
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
      Date.parse(
        normalized,
      ),
    )
  ) {
    fail({
      code:
        'DATETIME_REQUIRED',

      path,

      message:
        `${path} precisa possuir data válida.`,
    })
  }

  return normalized
}

function cloneValue<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as T
}

function uniqueStrings(
  values: string[],
): string[] {
  return [
    ...new Set(
      values,
    ),
  ]
}

function collectStateMemoryIds(
  state:
    StatefulCommercialState,
): string[] {
  return uniqueStrings([
    ...state
      .facts
      .map(
        item =>
          item.id,
      ),

    ...state
      .needs
      .map(
        item =>
          item.id,
      ),

    ...state
      .open_loops
      .map(
        item =>
          item.id,
      ),

    ...state
      .objections
      .map(
        item =>
          item.id,
      ),

    ...state
      .commitments
      .map(
        item =>
          item.id,
      ),

    ...state
      .signals
      .map(
        item =>
          item.id,
      ),

    ...state
      .uncertainties
      .map(
        item =>
          item.id,
      ),
  ])
}

function ensureEvidenceSubset({
  analyzed,
  evidence,
}: {
  analyzed:
    string[]

  evidence:
    string[]
}): void {
  const analyzedSet =
    new Set(
      analyzed,
    )

  for (
    const evidenceId of
    evidence
  ) {
    if (
      !analyzedSet.has(
        evidenceId,
      )
    ) {
      fail({
        code:
          'EVIDENCE_NOT_ANALYZED',

        path:
          'runtime_result.memory_reduction.state.last_evidence_message_ids',

        message:
          `A evidência ${evidenceId} não pertence ao conjunto analisado.`,
      })
    }
  }
}

function validateModelRuntime(
  runtimeResult:
    CommercialReasoningCoreV2RuntimeModelResult,
): void {
  const input =
    runtimeResult.input

  const state =
    runtimeResult
      .memory_reduction
      .state

  if (
    runtimeResult.model_calls !==
    1
  ) {
    fail({
      code:
        'SINGLE_MODEL_CALL_REQUIRED',

      path:
        'runtime_result.model_calls',

      message:
        'A persistência V2 só aceita runtime produzido por uma única chamada principal.',
    })
  }

  if (
    runtimeResult
      .core_result
      .output
      .contract_version !==
    COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION
  ) {
    fail({
      code:
        'CORE_CONTRACT_MISMATCH',

      path:
        'runtime_result.core_result.output.contract_version',

      message:
        'O output do Core V2 possui contrato incompatível.',
    })
  }

  if (
    state.contract_version !==
    STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION
  ) {
    fail({
      code:
        'STATE_CONTRACT_MISMATCH',

      path:
        'runtime_result.memory_reduction.state.contract_version',

      message:
        'O estado candidato possui contrato incompatível.',
    })
  }

  if (
    state.cycle_id !==
    input
      .diagnostic_input
      .cycle_id
  ) {
    fail({
      code:
        'CANDIDATE_CYCLE_MISMATCH',

      path:
        'runtime_result.memory_reduction.state.cycle_id',

      message:
        'O estado candidato pertence a outro ciclo.',
    })
  }

  if (
    state.version !==
    input
      .state_context
      .target_state_version
  ) {
    fail({
      code:
        'CANDIDATE_VERSION_MISMATCH',

      path:
        'runtime_result.memory_reduction.state.version',

      message:
        'O estado candidato não corresponde à versão alvo.',
    })
  }

  if (
    state.updated_at !==
    input
      .diagnostic_input
      .reference_time
  ) {
    fail({
      code:
        'CANDIDATE_TIME_MISMATCH',

      path:
        'runtime_result.memory_reduction.state.updated_at',

      message:
        'O horário do estado candidato não coincide com a análise.',
    })
  }

  if (
    state
      .last_analyzed_message_ids
      .length === 0
  ) {
    fail({
      code:
        'ANALYZED_MESSAGES_REQUIRED',

      path:
        'runtime_result.memory_reduction.state.last_analyzed_message_ids',

      message:
        'O estado candidato precisa declarar mensagens analisadas.',
    })
  }

  ensureEvidenceSubset({
    analyzed:
      state
        .last_analyzed_message_ids,

    evidence:
      state
        .last_evidence_message_ids,
  })
}

function buildPersistedOutput(
  runtimeResult:
    CommercialReasoningCoreV2RuntimeModelResult,
): CommercialReasoningCoreV2PersistedOutput {
  return cloneValue({
    contract_version:
      COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,

    runtime_version:
      COMMERCIAL_REASONING_CORE_V2_RUNTIME_VERSION,

    core_output:
      runtimeResult
        .core_result
        .output,

    factual_guard:
      runtimeResult
        .core_result
        .factual_guard,

    seller_projection:
      runtimeResult
        .seller_projection,

    commercial_reading:
      runtimeResult
        .commercial_reading
        .reading,

    commercial_reading_report:
      runtimeResult
        .commercial_reading
        .report,
  })
}

export function buildCommercialReasoningCoreV2PersistencePlan({
  runtime_result,
  generated_at,
}: {
  runtime_result:
    CommercialReasoningCoreV2RuntimeResult

  generated_at:
    unknown
}): CommercialReasoningCoreV2PersistencePlan {
  const generatedAt =
    requireDateTime(
      generated_at,
      'generated_at',
    )

  const input =
    runtime_result.input

  const companyId =
    requireText(
      input
        .diagnostic_input
        .company_id,
      'input.diagnostic_input.company_id',
    )

  const cycleId =
    requireText(
      input
        .diagnostic_input
        .cycle_id,
      'input.diagnostic_input.cycle_id',
    )

  const conversationKey =
    requireText(
      input
        .diagnostic_input
        .conversation_key,
      'input.diagnostic_input.conversation_key',
    )

  const referenceTime =
    requireDateTime(
      input
        .diagnostic_input
        .reference_time,
      'input.diagnostic_input.reference_time',
    )

  if (
    Date.parse(
      generatedAt,
    ) <
    Date.parse(
      referenceTime,
    )
  ) {
    fail({
      code:
        'PLAN_TIME_BEFORE_ANALYSIS',

      path:
        'generated_at',

      message:
        'O plano de persistência não pode ser anterior à análise.',
    })
  }

  const expectedPreviousVersion =
    input
      .state_context
      .previous_state_version

  if (
    runtime_result.mode ===
    'blocked'
  ) {
    return {
      plan_version:
        COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_PLAN_VERSION,

      mode:
        'blocked',

      should_persist:
        false,

      generated_at:
        generatedAt,

      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      expected_previous_state_version:
        expectedPreviousVersion,

      limitations: [
        ...runtime_result
          .limitations,
      ],

      write_guard:
        null,

      state_snapshot:
        null,

      audit_event:
        null,
    }
  }

  validateModelRuntime(
    runtime_result,
  )

  const state =
    runtime_result
      .memory_reduction
      .state

  const previousState =
    input
      .state_context
      .previous_state

  if (
    previousState === null &&
    expectedPreviousVersion !==
      null
  ) {
    fail({
      code:
        'PREVIOUS_STATE_REQUIRED',

      path:
        'input.state_context.previous_state',

      message:
        'A versão anterior exige estado anterior carregado.',
    })
  }

  if (
    previousState !== null &&
    previousState.version !==
      expectedPreviousVersion
  ) {
    fail({
      code:
        'PREVIOUS_STATE_VERSION_MISMATCH',

      path:
        'input.state_context.previous_state.version',

      message:
        'A versão do estado anterior não coincide com a entrada.',
    })
  }

  const normalizedOutput =
    buildPersistedOutput(
      runtime_result,
    )

  const stateSnapshot =
    cloneValue(
      state,
    )

  return {
    plan_version:
      COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_PLAN_VERSION,

    mode:
      'model',

    should_persist:
      true,

    generated_at:
      generatedAt,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    write_guard: {
      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      expected_previous_state_version:
        expectedPreviousVersion,

      expected_previous_state_updated_at:
        previousState
          ?.updated_at ??
        null,

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

      engine_source:
        'commercial_reasoning_core_v2',

      generated_at:
        generatedAt,

      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      previous_state_version:
        expectedPreviousVersion,

      candidate_state_version:
        stateSnapshot.version,

      analyzed_message_ids: [
        ...stateSnapshot
          .last_analyzed_message_ids,
      ],

      evidence_message_ids: [
        ...stateSnapshot
          .last_evidence_message_ids,
      ],

      memory_ids:
        collectStateMemoryIds(
          stateSnapshot,
        ),

      normalized_output:
        normalizedOutput,

      execution: {
        model_calls:
          1,

        core:
          cloneValue(
            runtime_result
              .core_result
              .execution,
          ),

        factual_guard:
          cloneValue(
            runtime_result
              .core_result
              .factual_guard,
          ),
      },

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    },
  }
}
