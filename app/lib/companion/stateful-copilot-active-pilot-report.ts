import type {
  StatefulCopilotActivePilotTelemetry,
} from './stateful-copilot-active-pilot-telemetry'

export const STATEFUL_COPILOT_ACTIVE_PILOT_REPORT_VERSION =
  'phase-5.4-active-pilot-report-v1' as const

export const STATEFUL_COPILOT_ACTIVE_PILOT_DECISIONS = [
  'CONTINUE_PILOT',
  'OBSERVE',
  'KILL_SWITCH',
] as const

export type StatefulCopilotActivePilotDecision =
  (typeof STATEFUL_COPILOT_ACTIVE_PILOT_DECISIONS)[number]

export type StatefulCopilotActivePilotReportThresholds = {
  minimum_events:
    number

  maximum_fallback_rate:
    number
}

export const DEFAULT_STATEFUL_COPILOT_ACTIVE_PILOT_REPORT_THRESHOLDS:
  StatefulCopilotActivePilotReportThresholds = {
    minimum_events:
      5,

    maximum_fallback_rate:
      0.25,
  }

export type StatefulCopilotActivePilotReport = {
  report_version:
    typeof STATEFUL_COPILOT_ACTIVE_PILOT_REPORT_VERSION

  decision:
    StatefulCopilotActivePilotDecision

  decision_reasons:
    string[]

  thresholds:
    StatefulCopilotActivePilotReportThresholds

  totals: {
    events:
      number

    active_success:
      number

    active_fallback_v1:
      number

    active_unhandled_fallback_v1:
      number

    healthy:
      number

    degraded:
      number

    critical:
      number

    kill_switch_recommended:
      number
  }

  rates: {
    success_rate:
      number | null

    fallback_rate:
      number | null
  }

  latency_ms: {
    measured_events:
      number

    average:
      number | null

    p50:
      number | null

    p95:
      number | null

    max:
      number | null
  }

  fallback_reasons:
    Record<string, number>

  safety: {
    automatic_write_violations:
      number

    persistence_exposure_violations:
      number

    passed:
      boolean
  }
}

function normalizeThresholds(
  input:
    Partial<StatefulCopilotActivePilotReportThresholds> | undefined,
): StatefulCopilotActivePilotReportThresholds {
  const minimumEvents =
    input?.minimum_events ??
    DEFAULT_STATEFUL_COPILOT_ACTIVE_PILOT_REPORT_THRESHOLDS
      .minimum_events

  const maximumFallbackRate =
    input?.maximum_fallback_rate ??
    DEFAULT_STATEFUL_COPILOT_ACTIVE_PILOT_REPORT_THRESHOLDS
      .maximum_fallback_rate

  if (
    !Number.isInteger(
      minimumEvents,
    ) ||
    minimumEvents <
      1
  ) {
    throw new Error(
      'minimum_events precisa ser um inteiro maior ou igual a 1.',
    )
  }

  if (
    !Number.isFinite(
      maximumFallbackRate,
    ) ||
    maximumFallbackRate <
      0 ||
    maximumFallbackRate >
      1
  ) {
    throw new Error(
      'maximum_fallback_rate precisa estar entre 0 e 1.',
    )
  }

  return {
    minimum_events:
      minimumEvents,

    maximum_fallback_rate:
      maximumFallbackRate,
  }
}

function average(
  values:
    number[],
): number | null {
  if (
    values.length ===
    0
  ) {
    return null
  }

  return Math.round(
    values.reduce(
      (
        total,
        value,
      ) =>
        total +
        value,
      0,
    ) /
      values.length,
  )
}

function percentile(
  values:
    number[],
  ratio:
    number,
): number | null {
  if (
    values.length ===
    0
  ) {
    return null
  }

  const ordered =
    [...values]
      .sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      )

  const index =
    Math.min(
      ordered.length -
        1,
      Math.max(
        0,
        Math.ceil(
          ordered.length *
            ratio,
        ) -
          1,
      ),
    )

  return ordered[
    index
  ]
}

function rate(
  amount:
    number,
  total:
    number,
): number | null {
  if (
    total ===
    0
  ) {
    return null
  }

  return Number(
    (
      amount /
      total
    ).toFixed(
      4,
    ),
  )
}

export function buildStatefulCopilotActivePilotReport({
  telemetry = [],
  thresholds,
}: {
  telemetry?:
    ReadonlyArray<StatefulCopilotActivePilotTelemetry>

  thresholds?:
    Partial<StatefulCopilotActivePilotReportThresholds>
} = {}): StatefulCopilotActivePilotReport {
  const normalizedThresholds =
    normalizeThresholds(
      thresholds,
    )

  let success =
    0

  let fallback =
    0

  let unhandledFallback =
    0

  let healthy =
    0

  let degraded =
    0

  let critical =
    0

  let killSwitchRecommended =
    0

  let automaticWriteViolations =
    0

  let persistenceExposureViolations =
    0

  const fallbackReasons:
    Record<string, number> =
      {}

  const latencies:
    number[] =
      []

  for (
    const event
    of telemetry
  ) {
    if (
      Number.isFinite(
        event.duration_ms,
      )
    ) {
      latencies.push(
        Math.max(
          0,
          event.duration_ms,
        ),
      )
    }

    if (
      event.event ===
      'active_success'
    ) {
      success +=
        1
    }

    if (
      event.event ===
      'active_fallback_v1'
    ) {
      fallback +=
        1
    }

    if (
      event.event ===
      'active_unhandled_fallback_v1'
    ) {
      unhandledFallback +=
        1
    }

    if (
      event.health ===
      'healthy'
    ) {
      healthy +=
        1
    }

    if (
      event.health ===
      'degraded'
    ) {
      degraded +=
        1
    }

    if (
      event.health ===
      'critical'
    ) {
      critical +=
        1
    }

    if (
      event.kill_switch_recommended
    ) {
      killSwitchRecommended +=
        1
    }

    if (
      event.safety
        .automatic_writes_blocked ===
      false
    ) {
      automaticWriteViolations +=
        1
    }

    if (
      event.event ===
        'active_success' &&
      event.safety
        .persistence_confirmed_before_exposure !==
        true
    ) {
      persistenceExposureViolations +=
        1
    }

    if (
      event.fallback_reason
    ) {
      fallbackReasons[
        event.fallback_reason
      ] =
        (
          fallbackReasons[
            event.fallback_reason
          ] ??
          0
        ) +
        1
    }
  }

  const total =
    telemetry.length

  const totalFallback =
    fallback +
    unhandledFallback

  const fallbackRate =
    rate(
      totalFallback,
      total,
    )

  const safetyPassed =
    automaticWriteViolations ===
      0 &&
    persistenceExposureViolations ===
      0

  const decisionReasons:
    string[] =
      []

  let decision:
    StatefulCopilotActivePilotDecision =
      'CONTINUE_PILOT'

  if (
    critical >
      0 ||
    killSwitchRecommended >
      0 ||
    !safetyPassed
  ) {
    decision =
      'KILL_SWITCH'

    if (
      critical >
      0
    ) {
      decisionReasons.push(
        'critical_event_detected',
      )
    }

    if (
      killSwitchRecommended >
      0
    ) {
      decisionReasons.push(
        'kill_switch_recommended_by_telemetry',
      )
    }

    if (
      automaticWriteViolations >
      0
    ) {
      decisionReasons.push(
        'automatic_write_safety_violation',
      )
    }

    if (
      persistenceExposureViolations >
      0
    ) {
      decisionReasons.push(
        'state_exposed_without_confirmed_persistence',
      )
    }
  } else if (
    total <
    normalizedThresholds
      .minimum_events
  ) {
    decision =
      'OBSERVE'

    decisionReasons.push(
      'insufficient_sample',
    )
  } else if (
    fallbackRate !==
      null &&
    fallbackRate >
      normalizedThresholds
        .maximum_fallback_rate
  ) {
    decision =
      'OBSERVE'

    decisionReasons.push(
      'fallback_rate_above_limit',
    )
  } else if (
    success ===
    0
  ) {
    decision =
      'OBSERVE'

    decisionReasons.push(
      'no_successful_active_events',
    )
  } else {
    decisionReasons.push(
      'pilot_within_safety_and_fallback_limits',
    )
  }

  return {
    report_version:
      STATEFUL_COPILOT_ACTIVE_PILOT_REPORT_VERSION,

    decision,

    decision_reasons:
      decisionReasons,

    thresholds:
      normalizedThresholds,

    totals: {
      events:
        total,

      active_success:
        success,

      active_fallback_v1:
        fallback,

      active_unhandled_fallback_v1:
        unhandledFallback,

      healthy,

      degraded,

      critical,

      kill_switch_recommended:
        killSwitchRecommended,
    },

    rates: {
      success_rate:
        rate(
          success,
          total,
        ),

      fallback_rate:
        fallbackRate,
    },

    latency_ms: {
      measured_events:
        latencies.length,

      average:
        average(
          latencies,
        ),

      p50:
        percentile(
          latencies,
          0.5,
        ),

      p95:
        percentile(
          latencies,
          0.95,
        ),

      max:
        latencies.length
          ? Math.max(
              ...latencies,
            )
          : null,
    },

    fallback_reasons:
      fallbackReasons,

    safety: {
      automatic_write_violations:
        automaticWriteViolations,

      persistence_exposure_violations:
        persistenceExposureViolations,

      passed:
        safetyPassed,
    },
  }
}
