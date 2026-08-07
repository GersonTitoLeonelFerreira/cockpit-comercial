import {
  StatefulCopilotPersistenceExecutionError,
} from './stateful-copilot-persistence-executor'

import type {
  StatefulCopilotPersistenceWriter,
  StatefulCopilotPersistenceWriterRequest,
} from './stateful-copilot-persistence-executor'

export const STATEFUL_COPILOT_PERSISTENCE_RPC_NAME =
  'rpc_persist_stateful_copilot_state' as const

type JsonRecord =
  Record<string, unknown>

export type StatefulCopilotSupabaseRpcResult = {
  data: unknown
  error: unknown
}

export type StatefulCopilotSupabaseRpcClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<StatefulCopilotSupabaseRpcResult>
}

 export type StatefulCopilotSupabaseRpcParameters = {
  p_operation_key: string
  p_company_id: string
  p_cycle_id: string
  p_conversation_key: string

  p_expected_previous_state_version:
    number | null

  p_expected_previous_state_updated_at:
    string | null

  p_candidate_state_version:
    number

  p_state_snapshot:
    JsonRecord

  p_audit_event:
    JsonRecord
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
  throw new StatefulCopilotPersistenceExecutionError({
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

function cloneValue<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T
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

  const status =
    Number(error.status)

  if (
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    return null
  }

  return status
}

function isTransientRpcError(
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

function throwRpcError(
  error: unknown,
): never {
  const retryable =
    isTransientRpcError(error)

  fail({
    code:
      retryable
        ? 'STATEFUL_PERSISTENCE_RPC_UNAVAILABLE'
        : 'STATEFUL_PERSISTENCE_RPC_REJECTED',

    message:
      retryable
        ? 'A persistência stateful está temporariamente indisponível.'
        : 'A persistência stateful foi rejeitada pelo banco.',

    statusCode:
      retryable
        ? 503
        : 500,

    retryable,
  })
}

function normalizeRpcRow(
  data: unknown,
): JsonRecord {
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      fail({
        code:
          'INVALID_STATEFUL_PERSISTENCE_RPC_RESPONSE',

        message:
          'A RPC de persistência precisa retornar exatamente um resultado.',

        statusCode:
          502,

        retryable:
          false,
      })
    }

    const row =
      data[0]

    if (!isRecord(row)) {
      fail({
        code:
          'INVALID_STATEFUL_PERSISTENCE_RPC_RESPONSE',

        message:
          'A RPC de persistência retornou um resultado inválido.',

        statusCode:
          502,

        retryable:
          false,
      })
    }

    return cloneValue(row)
  }

  if (!isRecord(data)) {
    fail({
      code:
        'INVALID_STATEFUL_PERSISTENCE_RPC_RESPONSE',

      message:
        'A RPC de persistência não retornou confirmação.',

      statusCode:
        502,

      retryable:
        false,
    })
  }

  return cloneValue(data)
}

export function buildStatefulCopilotSupabaseRpcParameters(
  request:
    StatefulCopilotPersistenceWriterRequest,
): StatefulCopilotSupabaseRpcParameters {
  const plan =
    request.plan

  return {
    p_operation_key:
      request.operation_key,

    p_company_id:
      plan.company_id,

    p_cycle_id:
      plan.cycle_id,

    p_conversation_key:
      plan.conversation_key,

    p_expected_previous_state_version:
      plan
        .write_guard
        .expected_previous_state_version,

    p_expected_previous_state_updated_at:
      plan
        .write_guard
        .expected_previous_state_updated_at,

    p_candidate_state_version:
      plan
        .write_guard
        .candidate_state_version,

    p_state_snapshot:
      cloneValue(
        plan.state_snapshot,
      ) as unknown as JsonRecord,

    p_audit_event:
      cloneValue(
        plan.audit_event,
      ) as unknown as JsonRecord,
  }
}

export function createStatefulCopilotSupabaseWriter({
  client,
}: {
  client:
    StatefulCopilotSupabaseRpcClient
}): StatefulCopilotPersistenceWriter {
  return async (
    request,
  ) => {
    const parameters =
      buildStatefulCopilotSupabaseRpcParameters(
        request,
      )

    let result:
      StatefulCopilotSupabaseRpcResult

    try {
      result =
        await client.rpc(
          STATEFUL_COPILOT_PERSISTENCE_RPC_NAME,
          parameters,
        )
    } catch (error) {
      if (
        error instanceof
        StatefulCopilotPersistenceExecutionError
      ) {
        throw error
      }

      fail({
        code:
          'STATEFUL_PERSISTENCE_RPC_UNAVAILABLE',

        message:
          'A persistência stateful está temporariamente indisponível.',

        statusCode:
          503,

        retryable:
          true,
      })
    }

    if (
      !isRecord(result)
    ) {
      fail({
        code:
          'INVALID_STATEFUL_PERSISTENCE_RPC_ENVELOPE',

        message:
          'O cliente Supabase retornou uma resposta inválida.',

        statusCode:
          502,

        retryable:
          false,
      })
    }

    if (result.error) {
      throwRpcError(
        result.error,
      )
    }

    return normalizeRpcRow(
      result.data,
    )
  }
}
