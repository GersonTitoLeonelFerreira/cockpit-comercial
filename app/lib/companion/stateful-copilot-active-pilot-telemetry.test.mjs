import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStatefulCopilotActivePilotTelemetry,
} from './stateful-copilot-active-pilot-telemetry.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const cycleId =
  '20000000-0000-4000-8000-000000000001'

function buildSuccess() {
  return buildStatefulCopilotActivePilotTelemetry({
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
      840,

    execution: {
      engine_mode:
        'model',

      persistence_mode:
        'persisted',

      persisted:
        true,
    },

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  })
}

test(
  'active saudável registra persistência segurança e continuidade do piloto',
  () => {
    const telemetry =
      buildSuccess()

    assert.equal(
      telemetry.phase,
      'phase-5.4',
    )

    assert.equal(
      telemetry.channel,
      'active_pilot',
    )

    assert.equal(
      telemetry.health,
      'healthy',
    )

    assert.equal(
      telemetry.kill_switch_recommended,
      false,
    )

    assert.equal(
      telemetry.persisted,
      true,
    )

    assert.equal(
      telemetry.safety
        .automatic_writes_blocked,
      true,
    )

    assert.equal(
      telemetry.safety
        .persistence_confirmed_before_exposure,
      true,
    )

    assert.deepEqual(
      telemetry.signals,
      [],
    )
  },
)

test(
  'fallback esperado para V1 é degradado mas não aciona kill switch automaticamente',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
        event:
          'active_fallback_v1',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        runtime_mode:
          'active_fallback_v1',

        response_source:
          'v1',

        stateful_executed:
          true,

        v1_executed:
          true,

        duration_ms:
          1300,

        fallback_reason:
          'stateful_state_not_persisted',

        execution: {
          engine_mode:
            'model',

          persistence_mode:
            'conflict',

          persisted:
            false,
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry.health,
      'degraded',
    )

    assert.equal(
      telemetry.kill_switch_recommended,
      false,
    )

    assert.ok(
      telemetry.signals.includes(
        'active_fallback_to_v1',
      ),
    )

    assert.ok(
      telemetry.signals.includes(
        'fallback:stateful_state_not_persisted',
      ),
    )
  },
)

test(
  'falha não tratada recomenda kill switch imediato',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
        event:
          'active_unhandled_fallback_v1',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        v1_executed:
          true,

        duration_ms:
          321,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry.health,
      'critical',
    )

    assert.equal(
      telemetry.kill_switch_recommended,
      true,
    )

    assert.ok(
      telemetry.signals.includes(
        'unhandled_active_runtime_failure',
      ),
    )
  },
)

test(
  'active nunca é saudável sem persistência confirmada',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
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
          700,

        execution: {
          engine_mode:
            'model',

          persistence_mode:
            'conflict',

          persisted:
            false,
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry.health,
      'critical',
    )

    assert.equal(
      telemetry.kill_switch_recommended,
      true,
    )

    assert.ok(
      telemetry.signals.includes(
        'state_not_persisted_before_exposure',
      ),
    )
  },
)

test(
  'qualquer escrita automática é violação crítica do piloto',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
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
          500,

        execution: {
          engine_mode:
            'model',

          persistence_mode:
            'persisted',

          persisted:
            true,
        },

        automatic_crm_write:
          true,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry.health,
      'critical',
    )

    assert.equal(
      telemetry.kill_switch_recommended,
      true,
    )

    assert.equal(
      telemetry.safety
        .automatic_writes_blocked,
      false,
    )

    assert.ok(
      telemetry.signals.includes(
        'automatic_write_safety_violation',
      ),
    )
  },
)

test(
  'telemetria preserva código seguro da falha sem mensagem interna',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
        event:
          'active_fallback_v1',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        runtime_mode:
          'active_fallback_v1',

        response_source:
          'v1',

        stateful_executed:
          true,

        v1_executed:
          true,

        duration_ms:
          -10,

        fallback_reason:
          'stateful_runtime_failed',

        failure: {
          code:
            'STATEFUL_RUNTIME_UNAVAILABLE',

          status_code:
            503,

          retryable:
            true,

          internal_message:
            'não deve aparecer',
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry.duration_ms,
      0,
    )

    assert.equal(
      telemetry.failure_code,
      'STATEFUL_RUNTIME_UNAVAILABLE',
    )

    assert.equal(
      telemetry.failure_status_code,
      503,
    )

    assert.equal(
      telemetry.failure_retryable,
      true,
    )

    assert.equal(
      Object.hasOwn(
        telemetry,
        'internal_message',
      ),
      false,
    )
  },
)

test(
  'telemetria identifica a invariante e o path do output de comunicação inválido',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
        event:
          'active_fallback_v1',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        runtime_mode:
          'active_fallback_v1',

        response_source:
          'v1',

        stateful_executed:
          true,

        v1_executed:
          true,

        duration_ms:
          900,

        fallback_reason:
          'stateful_runtime_failed',

        failure: {
          code:
            'INVALID_COMMUNICATION_OUTPUT',

          status_code:
            502,

          retryable:
            true,

          communication_failure_path:
            'reading.best_approach.channel',

          communication_failure_invariant:
            'NO_INTERVENTION_CHANNEL',

          communication_attempts:
            2,

          conversation_content:
            'não registrar',
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry
        .communication_failure_path,
      'reading.best_approach.channel',
    )

    assert.equal(
      telemetry
        .communication_failure_invariant,
      'NO_INTERVENTION_CHANNEL',
    )

    assert.equal(
      telemetry
        .communication_attempts,
      2,
    )

    assert.equal(
      JSON.stringify(
        telemetry,
      ).includes(
        'não registrar',
      ),
      false,
    )
  },
)

test(
  'telemetria registra recuperação da comunicação após retry',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
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
          950,

        execution: {
          engine_mode:
            'model',

          persistence_mode:
            'persisted',

          persisted:
            true,

          communication_attempts:
            2,

          communication_recovered_after_retry:
            true,
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry.communication_attempts,
      2,
    )

    assert.equal(
      telemetry.recovered_after_retry,
      true,
    )
  },
)


test(
  'telemetria identifica path e invariante do diagnóstico inválido',
  () => {
    const telemetry =
      buildStatefulCopilotActivePilotTelemetry({
        event:
          'active_fallback_v1',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        runtime_mode:
          'active_fallback_v1',

        response_source:
          'v1',

        stateful_executed:
          true,

        v1_executed:
          true,

        duration_ms:
          21708,

        fallback_reason:
          'stateful_runtime_failed',

        failure: {
          code:
            'INVALID_MODEL_OUTPUT',

          status_code:
            502,

          retryable:
            true,

          diagnostic_failure_path:
            'state_patch.commitments_to_upsert[0].status',

          diagnostic_failure_invariant:
            'INVALID_COMMITMENT_STATUS',

          conversation_content:
            'não registrar',
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    assert.equal(
      telemetry
        .diagnostic_failure_path,
      'state_patch.commitments_to_upsert[0].status',
    )

    assert.equal(
      telemetry
        .diagnostic_failure_invariant,
      'INVALID_COMMITMENT_STATUS',
    )

    assert.equal(
      JSON.stringify(
        telemetry,
      ).includes(
        'não registrar',
      ),
      false,
    )
  },
)
