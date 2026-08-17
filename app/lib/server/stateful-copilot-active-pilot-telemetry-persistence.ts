import 'server-only'

import type {
  StatefulCopilotActivePilotTelemetry,
} from '../companion/stateful-copilot-active-pilot-telemetry'

type RpcError = {
  message?:
    string
}

type RpcResult = {
  data:
    unknown

  error:
    RpcError | null
}

export type StatefulCopilotActivePilotTelemetryRpcClient = {
  rpc: (
    functionName:
      'rpc_record_companion_active_pilot_event',

    args: {
      p_company_id:
        string

      p_cycle_id:
        string

      p_telemetry:
        StatefulCopilotActivePilotTelemetry
    },
  ) =>
    PromiseLike<RpcResult>
}

export type StatefulCopilotActivePilotTelemetryPersistenceResult = {
  persisted:
    true

  event_id:
    string

  recorded_at:
    string
}

export class StatefulCopilotActivePilotTelemetryPersistenceError
  extends Error {
  readonly code =
    'ACTIVE_PILOT_TELEMETRY_PERSISTENCE_FAILED'

  constructor() {
    super(
      'Falha ao persistir telemetria operacional do piloto active.',
    )

    this.name =
      'StatefulCopilotActivePilotTelemetryPersistenceError'
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value,
  ) &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
}

function firstRow(
  value: unknown,
): Record<string, unknown> | null {
  if (
    Array.isArray(
      value,
    )
  ) {
    return isRecord(
      value[0],
    )
      ? value[0]
      : null
  }

  return isRecord(
    value,
  )
    ? value
    : null
}

export async function persistStatefulCopilotActivePilotTelemetry({
  admin,
  telemetry,
}: {
  admin:
    StatefulCopilotActivePilotTelemetryRpcClient

  telemetry:
    StatefulCopilotActivePilotTelemetry
}): Promise<StatefulCopilotActivePilotTelemetryPersistenceResult> {
  const {
    data,
    error,
  } =
    await admin.rpc(
      'rpc_record_companion_active_pilot_event',
      {
        p_company_id:
          telemetry.company_id,

        p_cycle_id:
          telemetry.cycle_id,

        p_telemetry:
          telemetry,
      },
    )

  if (
    error
  ) {
    throw new StatefulCopilotActivePilotTelemetryPersistenceError()
  }

  const row =
    firstRow(
      data,
    )

  const eventId =
    typeof row?.event_id ===
      'string'
      ? row.event_id
      : null

  const recordedAt =
    typeof row?.recorded_at ===
      'string'
      ? row.recorded_at
      : null

  if (
    !eventId ||
    !recordedAt
  ) {
    throw new StatefulCopilotActivePilotTelemetryPersistenceError()
  }

  return {
    persisted:
      true,

    event_id:
      eventId,

    recorded_at:
      recordedAt,
  }
}
