import type {
  StatefulCopilotBlockedPersistencePlan,
  StatefulCopilotModelPersistencePlan,
  StatefulCopilotPersistencePlan,
} from './stateful-copilot-persistence-plan'

type JsonRecord =
  Record<string, unknown>

export type StatefulCopilotPersistenceWriterRequest = {
  operation_key: string

  plan:
    StatefulCopilotModelPersistencePlan
}

export type StatefulCopilotPersistenceWriter =
  (
    request:
      StatefulCopilotPersistenceWriterRequest,
  ) => Promise<unknown>

export type StatefulCopilotPersistenceSkippedResult = {
  mode: 'skipped'

  persisted: false

  reason:
    'blocked_plan'

  operation_key:
    null

  writer_calls:
    0

  limitations:
    string[]
}

export type StatefulCopilotPersistencePersistedResult = {
  mode: 'persisted'

  persisted: true

  operation_key: string

  writer_calls:
    1

  state_record_id: string
  audit_event_id: string

  persisted_state_version:
    number

  persisted_at:
    string
}

export type StatefulCopilotPersistenceConflictResult = {
  mode: 'conflict'

  persisted: false

  operation_key: string

  writer_calls:
    1

  current_state_version:
    number | null

  current_state_updated_at:
    string | null
}

export type StatefulCopilotPersistenceExecutionResult =
  | StatefulCopilotPersistenceSkippedResult
  | StatefulCopilotPersistencePersistedResult
  | StatefulCopilotPersistenceConflictResult

export class StatefulCopilotPersistenceExecutionError
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
      'StatefulCopilotPersistenceExecutionError'

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
  status_code,
  retryable,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
}): never {
  throw new StatefulCopilotPersistenceExecutionError({
    code,
    message,
    status_code,
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
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa ser um objeto.`,

      status_code:
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
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa ser um texto.`,

      status_code:
        502,

      retryable:
        false,
    })
  }

  const normalized =
    value.trim()

  if (!normalized) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} não pode ficar vazio.`,

      status_code:
        502,

      retryable:
        false,
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
      Date.parse(normalized),
    )
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa possuir uma data válida.`,

      status_code:
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
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_RESPONSE',

      message:
        `${path} precisa ser uma versão positiva.`,

      status_code:
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
  if (value === null) {
    return null
  }

  return requirePositiveVersion(
    value,
    path,
  )
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

function cloneValue<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T
}

function buildOperationKey(
  plan:
    StatefulCopilotModelPersistencePlan,
): string {
  const values = [
    'stateful-copilot',
    plan.company_id,
    plan.cycle_id,
    plan.conversation_key,
    `v${plan.write_guard.candidate_state_version}`,
  ]

  return values
    .map(
      (value) =>
        encodeURIComponent(value),
    )
    .join(':')
}

function validateModelPlan(
  plan:
    StatefulCopilotModelPersistencePlan,
): void {
  if (
    plan.should_persist !==
    true
  ) {
    fail({
      code:
        'INVALID_PERSISTENCE_PLAN',

      message:
        'O plano de modelo precisa autorizar a persistência.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.write_guard
      .requires_compare_and_swap !==
      true ||
    plan.write_guard
      .requires_atomic_write !==
      true
  ) {
    fail({
      code:
        'UNSAFE_PERSISTENCE_PLAN',

      message:
        'O plano precisa exigir gravação atômica e controle de versão.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.state_snapshot.version !==
    plan.write_guard
      .candidate_state_version
  ) {
    fail({
      code:
        'PERSISTENCE_PLAN_VERSION_MISMATCH',

      message:
        'A versão do estado não coincide com a trava de gravação.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.audit_event
      .candidate_state_version !==
    plan.write_guard
      .candidate_state_version
  ) {
    fail({
      code:
        'PERSISTENCE_AUDIT_VERSION_MISMATCH',

      message:
        'A auditoria não coincide com a versão que será gravada.',

      status_code:
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
      plan.write_guard.conversation_key
  ) {
    fail({
      code:
        'PERSISTENCE_SCOPE_MISMATCH',

      message:
        'A trava de gravação pertence a outro escopo.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.company_id !==
      plan.audit_event.company_id ||
    plan.cycle_id !==
      plan.audit_event.cycle_id ||
    plan.conversation_key !==
      plan.audit_event.conversation_key
  ) {
    fail({
      code:
        'PERSISTENCE_AUDIT_SCOPE_MISMATCH',

      message:
        'A auditoria pertence a outro escopo.',

      status_code:
        500,

      retryable:
        false,
    })
  }
}

function buildSkippedResult(
  plan:
    StatefulCopilotBlockedPersistencePlan,
): StatefulCopilotPersistenceSkippedResult {
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

function normalizePersistedResult({
  response,
  plan,
  operationKey,
}: {
  response: JsonRecord

  plan:
    StatefulCopilotModelPersistencePlan

  operationKey: string
}): StatefulCopilotPersistencePersistedResult {
  const persistedVersion =
    requirePositiveVersion(
      response.persisted_state_version,
      'response.persisted_state_version',
    )

  if (
    persistedVersion !==
    plan.write_guard
      .candidate_state_version
  ) {
    fail({
      code:
        'PERSISTED_VERSION_MISMATCH',

      message:
        'A versão confirmada pela gravação não coincide com o estado candidato.',

      status_code:
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
    Date.parse(persistedAt) <
    Date.parse(plan.generated_at)
  ) {
    fail({
      code:
        'PERSISTED_TIME_BEFORE_PLAN',

      message:
        'A gravação não pode ser anterior ao plano.',

      status_code:
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
        response.state_record_id,
        'response.state_record_id',
      ),

    audit_event_id:
      requireText(
        response.audit_event_id,
        'response.audit_event_id',
      ),

    persisted_state_version:
      persistedVersion,

    persisted_at:
      persistedAt,
  }
}

function normalizeConflictResult({
  response,
  operationKey,
}: {
  response: JsonRecord
  operationKey: string
}): StatefulCopilotPersistenceConflictResult {
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
        response.current_state_version,
        'response.current_state_version',
      ),

    current_state_updated_at:
      requireNullableDateTime(
        response.current_state_updated_at,
        'response.current_state_updated_at',
      ),
  }
}

function normalizeWriterResponse({
  value,
  plan,
  operationKey,
}: {
  value: unknown

  plan:
    StatefulCopilotModelPersistencePlan

  operationKey: string
}): StatefulCopilotPersistenceExecutionResult {
  const response =
    requireRecord(
      value,
      'response',
    )

  if (
    response.status ===
    'persisted'
  ) {
    return normalizePersistedResult({
      response,
      plan,
      operationKey,
    })
  }

  if (
    response.status ===
    'conflict'
  ) {
    return normalizeConflictResult({
      response,
      operationKey,
    })
  }

  fail({
    code:
      'INVALID_PERSISTENCE_RESPONSE',

    message:
      'A camada de gravação retornou um estado desconhecido.',

    status_code:
      502,

    retryable:
      false,
  })
}

export async function executeStatefulCopilotPersistence({
  plan,
  writer,
}: {
  plan:
    StatefulCopilotPersistencePlan

  writer:
    StatefulCopilotPersistenceWriter
}): Promise<StatefulCopilotPersistenceExecutionResult> {
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

  const safePlan =
    cloneValue(
      plan,
    )

  let response: unknown

  try {
    response =
      await writer({
        operation_key:
          operationKey,

        plan:
          safePlan,
      })
  } catch (error) {
    if (
      error instanceof
      StatefulCopilotPersistenceExecutionError
    ) {
      throw error
    }

    fail({
      code:
        'PERSISTENCE_WRITE_FAILED',

      message:
        'Não foi possível concluir a gravação do estado comercial.',

      status_code:
        503,

      retryable:
        false,
    })
  }

  return normalizeWriterResponse({
    value:
      response,

    plan,

    operationKey,
  })
}
