export const STATEFUL_COPILOT_ACTIVE_PILOT_TELEMETRY_PHASE =
  'phase-5.4' as const

export const STATEFUL_COPILOT_ACTIVE_PILOT_TELEMETRY_CHANNEL =
  'active_pilot' as const

export type StatefulCopilotActivePilotTelemetryEvent =
  | 'active_success'
  | 'active_fallback_v1'
  | 'active_unhandled_fallback_v1'

export type StatefulCopilotActivePilotHealth =
  | 'healthy'
  | 'degraded'
  | 'critical'

export type StatefulCopilotActivePilotTelemetryArgs = {
  event:
    StatefulCopilotActivePilotTelemetryEvent

  company_id:
    string

  cycle_id:
    string

  runtime_mode?:
    string | null

  response_source?:
    string | null

  stateful_executed?:
    boolean | null

  v1_executed:
    boolean

  duration_ms:
    number

  fallback_reason?:
    string | null

  failure?: {
    code?: unknown
    status_code?: unknown
    retryable?: unknown
    diagnostic_failure_path?: unknown
    diagnostic_failure_invariant?: unknown
    communication_failure_path?: unknown
    communication_failure_invariant?: unknown
    communication_attempts?: unknown
  } | null

  execution?: {
    engine_mode?: unknown
    persistence_mode?: unknown
    persisted?: unknown
    communication_attempts?: unknown
    communication_recovered_after_retry?: unknown
  } | null

  automatic_crm_write?:
    boolean | null

  automatic_agenda_write?:
    boolean | null
}

export type StatefulCopilotActivePilotTelemetry = {
  phase:
    typeof STATEFUL_COPILOT_ACTIVE_PILOT_TELEMETRY_PHASE

  channel:
    typeof STATEFUL_COPILOT_ACTIVE_PILOT_TELEMETRY_CHANNEL

  event:
    StatefulCopilotActivePilotTelemetryEvent

  company_id:
    string

  cycle_id:
    string

  runtime_mode:
    string | null

  response_source:
    string | null

  stateful_executed:
    boolean | null

  v1_executed:
    boolean

  duration_ms:
    number

  fallback_reason:
    string | null

  failure_code:
    string | null

  failure_status_code:
    number | null

  failure_retryable:
    boolean | null

  diagnostic_failure_path:
    string | null

  diagnostic_failure_invariant:
    string | null

  communication_failure_path:
    string | null

  communication_failure_invariant:
    string | null

  communication_attempts:
    1 | 2 | null

  recovered_after_retry:
    boolean | null

  engine_mode:
    string | null

  persistence_mode:
    string | null

  persisted:
    boolean | null

  automatic_crm_write:
    boolean | null

  automatic_agenda_write:
    boolean | null

  safety: {
    automatic_writes_blocked:
      boolean

    persistence_confirmed_before_exposure:
      boolean | null
  }

  health:
    StatefulCopilotActivePilotHealth

  kill_switch_recommended:
    boolean

  signals:
    string[]
}

function getString(
  value: unknown,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const normalized =
    value.trim()

  return normalized ||
    null
}

function getNumber(
  value: unknown,
): number | null {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
  )
    ? value
    : null
}

function getBoolean(
  value: unknown,
): boolean | null {
  return typeof value ===
    'boolean'
    ? value
    : null
}

function getCommunicationAttempts(
  value: unknown,
): 1 | 2 | null {
  return value === 1 ||
    value === 2
    ? value
    : null
}

function getTechnicalPath(
  value: unknown,
): string | null {
  const path =
    getString(value)

  return path &&
    path.length <= 300 &&
    /^[a-zA-Z0-9_.\[\]-]+$/.test(
      path,
    )
    ? path
    : null
}

function getTechnicalInvariant(
  value: unknown,
): string | null {
  const invariant =
    getString(value)

  return invariant &&
    invariant.length <= 120 &&
    /^[A-Z0-9_]+$/.test(
      invariant,
    )
    ? invariant
    : null
}

export function buildStatefulCopilotActivePilotTelemetry(
  args:
    StatefulCopilotActivePilotTelemetryArgs,
): StatefulCopilotActivePilotTelemetry {
  const durationMs =
    Number.isFinite(
      args.duration_ms,
    )
      ? Math.max(
          0,
          Math.trunc(
            args.duration_ms,
          ),
        )
      : 0

  const failureCode =
    getString(
      args.failure?.code,
    )

  const failureStatusCode =
    getNumber(
      args.failure
        ?.status_code,
    )

  const failureRetryable =
    getBoolean(
      args.failure
        ?.retryable,
    )

  const diagnosticFailurePath =
    getTechnicalPath(
      args.failure
        ?.diagnostic_failure_path,
    )

  const diagnosticFailureInvariant =
    getTechnicalInvariant(
      args.failure
        ?.diagnostic_failure_invariant,
    )

  const communicationFailurePath =
    getTechnicalPath(
      args.failure
        ?.communication_failure_path,
    )

  const communicationFailureInvariant =
    getTechnicalInvariant(
      args.failure
        ?.communication_failure_invariant,
    )

  const communicationAttempts =
    getCommunicationAttempts(
      args.execution
        ?.communication_attempts,
    ) ??
    getCommunicationAttempts(
      args.failure
        ?.communication_attempts,
    )

  const recoveredAfterRetry =
    getBoolean(
      args.execution
        ?.communication_recovered_after_retry,
    )

  const engineMode =
    getString(
      args.execution
        ?.engine_mode,
    )

  const persistenceMode =
    getString(
      args.execution
        ?.persistence_mode,
    )

  const persisted =
    getBoolean(
      args.execution
        ?.persisted,
    )

  const automaticCrmWrite =
    getBoolean(
      args.automatic_crm_write,
    )

  const automaticAgendaWrite =
    getBoolean(
      args.automatic_agenda_write,
    )

  const automaticWritesBlocked =
    automaticCrmWrite ===
      false &&
    automaticAgendaWrite ===
      false

  const persistenceConfirmedBeforeExposure =
    args.event ===
      'active_success'
      ? persisted ===
        true
      : null

  const signals:
    string[] =
      []

  let health:
    StatefulCopilotActivePilotHealth =
      'healthy'

  let killSwitchRecommended =
    false

  if (
    !automaticWritesBlocked
  ) {
    signals.push(
      'automatic_write_safety_violation',
    )

    health =
      'critical'

    killSwitchRecommended =
      true
  }

  if (
    args.event ===
    'active_success'
  ) {
    if (
      args.runtime_mode !==
      'active'
    ) {
      signals.push(
        'unexpected_runtime_mode_on_success',
      )
    }

    if (
      args.response_source !==
      'stateful'
    ) {
      signals.push(
        'unexpected_response_source_on_success',
      )
    }

    if (
      args.stateful_executed !==
      true
    ) {
      signals.push(
        'stateful_not_executed_on_success',
      )
    }

    if (
      args.v1_executed !==
      false
    ) {
      signals.push(
        'v1_executed_during_active_success',
      )
    }

    if (
      persisted !==
      true
    ) {
      signals.push(
        'state_not_persisted_before_exposure',
      )
    }

    if (
      signals.length >
      0
    ) {
      health =
        'critical'

      killSwitchRecommended =
        true
    }
  }

  if (
    args.event ===
    'active_fallback_v1'
  ) {
    signals.push(
      'active_fallback_to_v1',
    )

    if (
      args.fallback_reason
    ) {
      signals.push(
        `fallback:${args.fallback_reason}`,
      )
    }

    if (
      health !==
      'critical'
    ) {
      health =
        'degraded'
    }
  }

  if (
    args.event ===
    'active_unhandled_fallback_v1'
  ) {
    signals.push(
      'unhandled_active_runtime_failure',
    )

    health =
      'critical'

    killSwitchRecommended =
      true
  }

  return {
    phase:
      STATEFUL_COPILOT_ACTIVE_PILOT_TELEMETRY_PHASE,

    channel:
      STATEFUL_COPILOT_ACTIVE_PILOT_TELEMETRY_CHANNEL,

    event:
      args.event,

    company_id:
      args.company_id,

    cycle_id:
      args.cycle_id,

    runtime_mode:
      getString(
        args.runtime_mode,
      ),

    response_source:
      getString(
        args.response_source,
      ),

    stateful_executed:
      getBoolean(
        args.stateful_executed,
      ),

    v1_executed:
      args.v1_executed,

    duration_ms:
      durationMs,

    fallback_reason:
      getString(
        args.fallback_reason,
      ),

    failure_code:
      failureCode,

    failure_status_code:
      failureStatusCode,

    failure_retryable:
      failureRetryable,

    diagnostic_failure_path:
      diagnosticFailurePath,

    diagnostic_failure_invariant:
      diagnosticFailureInvariant,

    communication_failure_path:
      communicationFailurePath,

    communication_failure_invariant:
      communicationFailureInvariant,

    communication_attempts:
      communicationAttempts,

    recovered_after_retry:
      recoveredAfterRetry,

    engine_mode:
      engineMode,

    persistence_mode:
      persistenceMode,

    persisted,

    automatic_crm_write:
      automaticCrmWrite,

    automatic_agenda_write:
      automaticAgendaWrite,

    safety: {
      automatic_writes_blocked:
        automaticWritesBlocked,

      persistence_confirmed_before_exposure:
        persistenceConfirmedBeforeExposure,
    },

    health,

    kill_switch_recommended:
      killSwitchRecommended,

    signals,
  }
}
