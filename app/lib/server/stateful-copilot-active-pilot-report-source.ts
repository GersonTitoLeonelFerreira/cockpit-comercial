import 'server-only'

import type {
  StatefulCopilotActivePilotTelemetry,
} from '../companion/stateful-copilot-active-pilot-telemetry'

type QueryError = {
  message?:
    string
}

type QueryResult = {
  data:
    unknown

  error:
    QueryError | null
}

export type StatefulCopilotActivePilotTelemetryQuery =
  (args: {
    company_id:
      string

    since:
      string

    limit:
      number
  }) =>
    PromiseLike<QueryResult>

export class StatefulCopilotActivePilotReportSourceError
  extends Error {
  readonly code =
    'ACTIVE_PILOT_REPORT_SOURCE_FAILED'

  constructor(
    message =
      'Falha ao carregar telemetria do piloto active.',
  ) {
    super(
      message,
    )

    this.name =
      'StatefulCopilotActivePilotReportSourceError'
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

function isUuid(
  value:
    string,
) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(
      value,
    )
}

function isBooleanOrNull(
  value:
    unknown,
) {
  return (
    typeof value ===
      'boolean' ||
    value ===
      null
  )
}

function parseTelemetry(
  value:
    unknown,
  companyId:
    string,
): StatefulCopilotActivePilotTelemetry {
  if (
    !isRecord(
      value,
    )
  ) {
    throw new StatefulCopilotActivePilotReportSourceError(
      'Telemetria persistida possui formato inválido.',
    )
  }

  const safety =
    value.safety

  const validEvent =
    value.event ===
      'active_success' ||
    value.event ===
      'active_fallback_v1' ||
    value.event ===
      'active_unhandled_fallback_v1'

  const validHealth =
    value.health ===
      'healthy' ||
    value.health ===
      'degraded' ||
    value.health ===
      'critical'

  if (
    value.phase !==
      'phase-5.4' ||
    value.channel !==
      'active_pilot' ||
    !validEvent ||
    !validHealth ||
    value.company_id !==
      companyId ||
    typeof value.cycle_id !==
      'string' ||
    !isUuid(
      value.cycle_id,
    ) ||
    typeof value.duration_ms !==
      'number' ||
    !Number.isFinite(
      value.duration_ms,
    ) ||
    value.duration_ms <
      0 ||
    typeof value.v1_executed !==
      'boolean' ||
    typeof value.kill_switch_recommended !==
      'boolean' ||
    !isRecord(
      safety,
    ) ||
    typeof safety.automatic_writes_blocked !==
      'boolean' ||
    !isBooleanOrNull(
      safety.persistence_confirmed_before_exposure,
    )
  ) {
    throw new StatefulCopilotActivePilotReportSourceError(
      'Telemetria persistida não atende ao contrato da Fase 5.4.',
    )
  }

  return value as unknown as StatefulCopilotActivePilotTelemetry
}

export async function loadStatefulCopilotActivePilotTelemetry({
  query,
  company_id,
  since,
  limit = 5000,
}: {
  query:
    StatefulCopilotActivePilotTelemetryQuery

  company_id:
    string

  since:
    string

  limit?:
    number
}): Promise<StatefulCopilotActivePilotTelemetry[]> {
  const companyId =
    company_id
      .trim()
      .toLowerCase()

  if (
    !isUuid(
      companyId,
    )
  ) {
    throw new StatefulCopilotActivePilotReportSourceError(
      'company_id precisa ser um UUID válido.',
    )
  }

  if (
    !Number.isFinite(
      Date.parse(
        since,
      ),
    )
  ) {
    throw new StatefulCopilotActivePilotReportSourceError(
      'since precisa ser uma data válida.',
    )
  }

  if (
    !Number.isInteger(
      limit,
    ) ||
    limit <
      1 ||
    limit >
      10000
  ) {
    throw new StatefulCopilotActivePilotReportSourceError(
      'limit precisa ser um inteiro entre 1 e 10000.',
    )
  }

  const {
    data,
    error,
  } =
    await query({
      company_id:
        companyId,

      since,

      limit,
    })

  if (
    error
  ) {
    throw new StatefulCopilotActivePilotReportSourceError()
  }

  if (
    !Array.isArray(
      data,
    )
  ) {
    throw new StatefulCopilotActivePilotReportSourceError(
      'Resposta da auditoria do piloto possui formato inválido.',
    )
  }

  return data.map(
    row => {
      if (
        !isRecord(
          row,
        )
      ) {
        throw new StatefulCopilotActivePilotReportSourceError(
          'Registro da auditoria possui formato inválido.',
        )
      }

      return parseTelemetry(
        row.telemetry,
        companyId,
      )
    },
  )
}
