import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStatefulCopilotActivePilotReport,
} from './stateful-copilot-active-pilot-report.ts'

import {
  DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS,
} from './stateful-copilot-cycle-deadline.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const cycleId =
  '20000000-0000-4000-8000-000000000001'

function healthy(
  duration = 1000,
) {
  return {
    phase:
      'phase-5.4',

    channel:
      'active_pilot',

    event:
      'active_success',

    company_id:
      companyId,

    cycle_id:
      cycleId,

    runtime_mode:
      'active',

    response_source:
      'stateful',

    stateful_executed:
      true,

    v1_executed:
      false,

    duration_ms:
      duration,

    fallback_reason:
      null,

    failure_code:
      null,

    failure_status_code:
      null,

    failure_retryable:
      null,

    engine_mode:
      'model',

    persistence_mode:
      'persisted',

    persisted:
      true,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,

    safety: {
      automatic_writes_blocked:
        true,

      persistence_confirmed_before_exposure:
        true,
    },

    health:
      'healthy',

    kill_switch_recommended:
      false,

    signals:
      [],
  }
}

function fallback(
  reason =
    'stateful_state_not_persisted',
) {
  return {
    ...healthy(
      1500,
    ),

    event:
      'active_fallback_v1',

    runtime_mode:
      'active_fallback_v1',

    response_source:
      'v1',

    v1_executed:
      true,

    fallback_reason:
      reason,

    persistence_mode:
      'conflict',

    persisted:
      false,

    safety: {
      automatic_writes_blocked:
        true,

      persistence_confirmed_before_exposure:
        null,
    },

    health:
      'degraded',

    signals: [
      'active_fallback_to_v1',
    ],
  }
}

test(
  'piloto saudável com amostra mínima autoriza continuidade',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(
            800,
          ),
          healthy(
            900,
          ),
          healthy(
            1000,
          ),
          healthy(
            1100,
          ),
          healthy(
            1200,
          ),
        ],
      })

    assert.equal(
      report.decision,
      'CONTINUE_PILOT',
    )

    assert.equal(
      report.totals.events,
      5,
    )

    assert.equal(
      report.rates
        .fallback_rate,
      0,
    )

    assert.equal(
      report.safety
        .passed,
      true,
    )

    assert.equal(
      report.latency_ms
        .p95,
      1200,
    )
  },
)

test(
  'amostra pequena permanece em observação',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(),
          healthy(),
          healthy(),
          healthy(),
        ],
      })

    assert.equal(
      report.decision,
      'OBSERVE',
    )

    assert.ok(
      report
        .decision_reasons
        .includes(
          'insufficient_sample',
        ),
    )
  },
)

test(
  'fallback acima do limite mantém piloto em observação',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(),
          healthy(),
          healthy(),
          fallback(),
          fallback(),
        ],
      })

    assert.equal(
      report.rates
        .fallback_rate,
      0.4,
    )

    assert.equal(
      report.decision,
      'OBSERVE',
    )

    assert.ok(
      report
        .decision_reasons
        .includes(
          'fallback_rate_above_limit',
        ),
    )
  },
)

test(
  'fallback dentro do limite não bloqueia continuidade',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(),
          healthy(),
          healthy(),
          healthy(),
          fallback(),
        ],
      })

    assert.equal(
      report.rates
        .fallback_rate,
      0.2,
    )

    assert.equal(
      report.decision,
      'CONTINUE_PILOT',
    )
  },
)

test(
  'qualquer evento crítico determina kill switch',
  () => {
    const critical = {
      ...healthy(),

      health:
        'critical',

      kill_switch_recommended:
        true,

      signals: [
        'unhandled_active_runtime_failure',
      ],
    }

    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(),
          healthy(),
          healthy(),
          healthy(),
          critical,
        ],
      })

    assert.equal(
      report.decision,
      'KILL_SWITCH',
    )

    assert.ok(
      report
        .decision_reasons
        .includes(
          'critical_event_detected',
        ),
    )
  },
)

test(
  'escrita automática determina kill switch',
  () => {
    const unsafe = {
      ...healthy(),

      automatic_crm_write:
        true,

      safety: {
        automatic_writes_blocked:
          false,

        persistence_confirmed_before_exposure:
          true,
      },

      health:
        'critical',

      kill_switch_recommended:
        true,
    }

    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          unsafe,
        ],
      })

    assert.equal(
      report.decision,
      'KILL_SWITCH',
    )

    assert.equal(
      report
        .safety
        .automatic_write_violations,
      1,
    )
  },
)

test(
  'V2 exposto sem persistência confirmada determina kill switch',
  () => {
    const unsafe = {
      ...healthy(),

      persisted:
        false,

      safety: {
        automatic_writes_blocked:
          true,

        persistence_confirmed_before_exposure:
          false,
      },

      health:
        'critical',

      kill_switch_recommended:
        true,
    }

    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          unsafe,
        ],
      })

    assert.equal(
      report.decision,
      'KILL_SWITCH',
    )

    assert.equal(
      report
        .safety
        .persistence_exposure_violations,
      1,
    )
  },
)

test(
  'relatório vazio não inventa aprovação',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport()

    assert.equal(
      report.decision,
      'OBSERVE',
    )

    assert.equal(
      report.totals.events,
      0,
    )

    assert.equal(
      report.rates
        .success_rate,
      null,
    )
  },
)

test(
  'limites operacionais podem ser configurados explicitamente',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(),
          healthy(),
          fallback(),
        ],

        thresholds: {
          minimum_events:
            3,

          maximum_fallback_rate:
            0.5,
        },
      })

    assert.equal(
      report.decision,
      'CONTINUE_PILOT',
    )

    assert.equal(
      report.thresholds
        .minimum_events,
      3,
    )

    assert.equal(
      report.thresholds
        .maximum_fallback_rate,
      0.5,
    )
  },
)

test(
  'fallbacks são agrupados por motivo',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          fallback(
            'stateful_state_not_persisted',
          ),
          fallback(
            'stateful_state_not_persisted',
          ),
          fallback(
            'stateful_runtime_failed',
          ),
        ],
      })

    assert.deepEqual(
      report.fallback_reasons,
      {
        stateful_state_not_persisted:
          2,

        stateful_runtime_failed:
          1,
      },
    )
  },
)

test(
  'p95 de latência acima do limite gera OBSERVE, nunca KILL_SWITCH',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(
            80_000,
          ),
          healthy(
            80_000,
          ),
          healthy(
            80_000,
          ),
          healthy(
            80_000,
          ),
          healthy(
            80_000,
          ),
          healthy(
            80_000,
          ),
        ],
      })

    assert.equal(
      report.decision,
      'OBSERVE',
    )

    assert.ok(
      report.decision_reasons.includes(
        'p95_latency_above_limit',
      ),
    )

    assert.equal(
      report.latency_ms.p95,
      80_000,
    )

    assert.equal(
      report.safety.passed,
      true,
    )
  },
)

test(
  'o limite default de p95 acompanha o deadline de ciclo stateful',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport()

    assert.equal(
      report.thresholds
        .maximum_p95_latency_ms,
      DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS,
    )
  },
)

test(
  'latência abaixo do limite não afeta a decisão',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(
            1_000,
          ),
          healthy(
            2_000,
          ),
          healthy(
            1_500,
          ),
          healthy(
            1_800,
          ),
          healthy(
            1_200,
          ),
        ],
      })

    assert.equal(
      report.decision,
      'CONTINUE_PILOT',
    )

    assert.ok(
      !report.decision_reasons.includes(
        'p95_latency_above_limit',
      ),
    )
  },
)

test(
  'o limite de p95 pode ser desabilitado explicitamente com null',
  () => {
    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry: [
          healthy(
            200_000,
          ),
          healthy(
            200_000,
          ),
          healthy(
            200_000,
          ),
          healthy(
            200_000,
          ),
          healthy(
            200_000,
          ),
        ],

        thresholds: {
          maximum_p95_latency_ms:
            null,
        },
      })

    assert.equal(
      report.decision,
      'CONTINUE_PILOT',
    )

    assert.equal(
      report.thresholds
        .maximum_p95_latency_ms,
      null,
    )
  },
)

test(
  'latência alta nunca produz KILL_SWITCH sozinha, mesmo com muitos eventos',
  () => {
    const events = []

    for (
      let index = 0;
      index < 20;
      index += 1
    ) {
      events.push(
        healthy(
          150_000,
        ),
      )
    }

    const report =
      buildStatefulCopilotActivePilotReport({
        telemetry:
          events,
      })

    assert.notEqual(
      report.decision,
      'KILL_SWITCH',
    )

    assert.equal(
      report.decision,
      'OBSERVE',
    )
  },
)
