import {
  createHash,
} from 'node:crypto'

import type {
  CommercialReasoningCoreV2BlockedPersistencePlan,
  CommercialReasoningCoreV2ModelPersistencePlan,
  CommercialReasoningCoreV2PersistencePlan,
} from './commercial-reasoning-core-v2-persistence-plan'

type JsonRecord =
  Record<string, unknown>

export type CommercialReasoningCoreV2PersistenceWriterRequest = {
  operation_key:
    string

  plan:
    CommercialReasoningCoreV2ModelPersistencePlan
}

export type CommercialReasoningCoreV2PersistenceWriter =
  (
    request:
      CommercialReasoningCoreV2PersistenceWriterRequest,
  ) => Promise<unknown>

export type CommercialReasoningCoreV2PersistenceSkippedResult = {
  mode:
    'skipped'

  persisted:
    false

  reason:
    'blocked_plan'

  operation_key:
    null

  writer_calls:
    0

  limitations:
    string[]
}

export type CommercialReasoningCoreV2PersistencePersistedResult = {
  mode:
    'persisted'

  persisted:
    true

  operation_key:
    string

  writer_calls:
    1

  state_record_id:
    string

  audit_event_id:
    string

  persisted_state_version:
    number

  persisted_at:
    string
}

export type CommercialReasoningCoreV2PersistenceConflictResult = {
  mode:
    'conflict'

  persisted:
    false

  operation_key:
    string

  writer_calls:
    1

  current_state_version:
    number | null

  current_state_updated_at:
    string | null
}

export type CommercialReasoningCoreV2PersistenceExecutionResult =
  | CommercialReasoningCoreV2PersistenceSkippedResult
  | CommercialReasoningCoreV2PersistencePersistedResult
  | CommercialReasoningCoreV2PersistenceConflictResult

export class CommercialReasoningCoreV2PersistenceExecutionError
  extends Error {
  readonly code:
    string

  readonly status_code:
    number

  readonly retryable:
    boolean

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
    super(
      message,
    )

    this.name =
      'CommercialReasoningCoreV2PersistenceExecutionError'

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
  throw new CommercialReasoningCoreV2PersistenceExecutionError({
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
    Boolean(
      value,
    ) &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
}

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (
    !isRecord(
      value,
    )
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

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
): string {
  if (
    typeof value !==
    'string'
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa ser texto.`,

      statusCode:
        502,

      retryable:
        false,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} não pode ficar vazio.`,

      statusCode:
        502,

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
    typeof value !==
      'number' ||
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa ser uma versão positiva.`,

      statusCode:
        502,

      retryable:
        false,
    })
  }

  return value
}

function requireNullableVersion(
  value: unknown,
  path: string,
): number | null {
  if (
    value === null
  ) {
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
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa possuir data válida.`,

      statusCode:
        502,

      retryable:
        false,
    })
  }

  return normalized
}

function requireNullableDateTime(
  value: unknown,
  path: string,
): string | null {
  if (
    value === null
  ) {
    return null
  }

  return requireDateTime(
    value,
    path,
  )
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

function buildOperationKey(
  plan:
    CommercialReasoningCoreV2ModelPersistencePlan,
): string {
  const fingerprint =
    createHash(
      'sha256',
    )
      .update(
        JSON.stringify({
          conversation_key:
            plan.conversation_key,

          expected_previous_state_version:
            plan
              .write_guard
              .expected_previous_state_version,

          expected_previous_state_updated_at:
            plan
              .write_guard
              .expected_previous_state_updated_at,

          state_snapshot:
            plan.state_snapshot,

          normalized_output:
            plan
              .audit_event
              .normalized_output,

          analyzed_message_ids:
            plan
              .audit_event
              .analyzed_message_ids,

          evidence_message_ids:
            plan
              .audit_event
              .evidence_message_ids,

          memory_ids:
            plan
              .audit_event
              .memory_ids,
        }),
      )
      .digest(
        'hex',
      )

  return [
    'commercial-reasoning-core-v2',
    plan.company_id,
    plan.cycle_id,
    `v${plan.write_guard.candidate_state_version}`,
    fingerprint,
  ]
    .map(
      value =>
        encodeURIComponent(
          value,
        ),
    )
    .join(
      ':',
    )
}

function validateModelPlan(
  plan:
    CommercialReasoningCoreV2ModelPersistencePlan,
): void {
  if (
    plan.should_persist !==
    true
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_PLAN',

      message:
        'O plano V2 precisa autorizar persistência.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    plan
      .write_guard
      .requires_compare_and_swap !==
      true ||
    plan
      .write_guard
      .requires_atomic_write !==
      true
  ) {
    fail({
      code:
        'UNSAFE_PERSISTENCE_PLAN',

      message:
        'Persistência V2 exige CAS e gravação atômica.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    plan
      .state_snapshot
      .version !==
    plan
      .write_guard
      .candidate_state_version ||
    plan
      .audit_event
      .candidate_state_version !==
    plan
      .write_guard
      .candidate_state_version
  ) {
    fail({
      code:
        'PERSISTENCE_VERSION_MISMATCH',

      message:
        'Estado, auditoria e write guard precisam possuir a mesma versão candidata.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.company_id !==
      plan.write_guard.company_id ||
    plan.cycle_id !==
      plan.write_guard.cycle_id ||
    plan.conversation_key !==
      plan.write_guard.conversation_key ||
    plan.company_id !==
      plan.audit_event.company_id ||
    plan.cycle_id !==
      plan.audit_event.cycle_id ||
    plan.conversation_key !==
      plan.audit_event.conversation_key
  ) {
    fail({
      code:
        'PERSISTENCE_SCOPE_MISMATCH',

      message:
        'Plano, write guard e auditoria precisam compartilhar o mesmo escopo.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  if (
    plan
      .audit_event
      .normalized_output
      .contract_version !==
      'commercial-reasoning-core-v2'
  ) {
    fail({
      code:
        'PERSISTENCE_OUTPUT_CONTRACT_MISMATCH',

      message:
        'A persistência V2 não aceita output de outro motor.',

      statusCode:
        500,

      retryable:
        false,
    })
  }
}

function buildSkippedResult(
  plan:
    CommercialReasoningCoreV2BlockedPersistencePlan,
): CommercialReasoningCoreV2PersistenceSkippedResult {
  return {
    mode:
      'skipped',

    persisted:
      false,

    reason:
      'blocked_plan',

    operation_key:
      null,

    writer_calls:
      0,

    limitations: [
      ...plan.limitations,
    ],
  }
}

function normalizeWriterResponse({
  value,
  plan,
  operationKey,
}: {
  value:
    unknown

  plan:
    CommercialReasoningCoreV2ModelPersistencePlan

  operationKey:
    string
}): CommercialReasoningCoreV2PersistenceExecutionResult {
  const response =
    requireRecord(
      value,
      'response',
    )

  if (
    response.status ===
    'conflict'
  ) {
    return {
      mode:
        'conflict',

      persisted:
        false,

      operation_key:
        operationKey,

      writer_calls:
        1,

      current_state_version:
        requireNullableVersion(
          response
            .current_state_version,
          'response.current_state_version',
        ),

      current_state_updated_at:
        requireNullableDateTime(
          response
            .current_state_updated_at,
          'response.current_state_updated_at',
        ),
    }
  }

  if (
    response.status !==
    'persisted'
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        'O writer V2 retornou um estado desconhecido.',

      statusCode:
        502,

      retryable:
        false,
    })
  }

  const persistedVersion =
    requirePositiveVersion(
      response
        .persisted_state_version,
      'response.persisted_state_version',
    )

  if (
    persistedVersion !==
    plan
      .write_guard
      .candidate_state_version
  ) {
    fail({
      code:
        'PERSISTED_VERSION_MISMATCH',

      message:
        'A versão persistida não coincide com o candidate state.',

      statusCode:
        502,

      retryable:
        false,
    })
  }

  const persistedAt =
    requireDateTime(
      response.persisted_at,
      'response.persisted_at',
    )

  if (
    Date.parse(
      persistedAt,
    ) <
    Date.parse(
      plan.generated_at,
    )
  ) {
    fail({
      code:
        'PERSISTED_TIME_BEFORE_PLAN',

      message:
        'A confirmação da persistência não pode ser anterior ao plano.',

      statusCode:
        502,

      retryable:
        false,
    })
  }

  return {
    mode:
      'persisted',

    persisted:
      true,

    operation_key:
      operationKey,

    writer_calls:
      1,

    state_record_id:
      requireText(
        response
          .state_record_id,
        'response.state_record_id',
      ),

    audit_event_id:
      requireText(
        response
          .audit_event_id,
        'response.audit_event_id',
      ),

    persisted_state_version:
      persistedVersion,

    persisted_at:
      persistedAt,
  }
}

export async function executeCommercialReasoningCoreV2Persistence({
  plan,
  writer,
}: {
  plan:
    CommercialReasoningCoreV2PersistencePlan

  writer:
    CommercialReasoningCoreV2PersistenceWriter
}): Promise<
  CommercialReasoningCoreV2PersistenceExecutionResult
> {
  if (
    plan.mode ===
    'blocked'
  ) {
    return buildSkippedResult(
      plan,
    )
  }

  validateModelPlan(
    plan,
  )

  const operationKey =
    buildOperationKey(
      plan,
    )

  let response:
    unknown

  try {
    response =
      await writer({
        operation_key:
          operationKey,

        plan:
          cloneValue(
            plan,
          ),
      })
  } catch (error) {
    if (
      error instanceof
      CommercialReasoningCoreV2PersistenceExecutionError
    ) {
      throw error
    }

    fail({
      code:
        'PERSISTENCE_WRITE_FAILED',

      message:
        'Não foi possível concluir a persistência do Core V2.',

      statusCode:
        503,

      retryable:
        true,
    })
  }

  return normalizeWriterResponse({
    value:
      response,

    plan,

    operationKey,
  })
}
