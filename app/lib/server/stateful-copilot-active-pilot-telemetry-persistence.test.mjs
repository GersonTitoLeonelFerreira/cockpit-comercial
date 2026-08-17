import assert from 'node:assert/strict'
import test from 'node:test'

import {
  persistStatefulCopilotActivePilotTelemetry,
  StatefulCopilotActivePilotTelemetryPersistenceError,
} from './stateful-copilot-active-pilot-telemetry-persistence.ts'

const telemetry = {
  phase:
    'phase-5.4',

  channel:
    'active_pilot',

  event:
    'active_success',

  company_id:
    '10000000-0000-4000-8000-000000000001',

  cycle_id:
    '20000000-0000-4000-8000-000000000001',

  runtime_mode:
    'active',

  response_source:
    'stateful',

  stateful_executed:
    true,

  v1_executed:
    false,

  duration_ms:
    900,

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

test(
  'persiste telemetria active usando RPC server-only',
  async () => {
    let capturedFunction =
      null

    let capturedArgs =
      null

    const result =
      await persistStatefulCopilotActivePilotTelemetry({
        admin: {
          async rpc(
            functionName,
            args,
          ) {
            capturedFunction =
              functionName

            capturedArgs =
              args

            return {
              data: [
                {
                  event_id:
                    '30000000-0000-4000-8000-000000000001',

                  recorded_at:
                    '2026-08-17T02:30:00.000Z',
                },
              ],

              error:
                null,
            }
          },
        },

        telemetry,
      })

    assert.equal(
      capturedFunction,
      'rpc_record_companion_active_pilot_event',
    )

    assert.equal(
      capturedArgs
        .p_company_id,
      telemetry.company_id,
    )

    assert.equal(
      capturedArgs
        .p_cycle_id,
      telemetry.cycle_id,
    )

    assert.equal(
      capturedArgs
        .p_telemetry,
      telemetry,
    )

    assert.equal(
      result.persisted,
      true,
    )
  },
)

test(
  'erro interno do banco vira falha segura sem expor mensagem original',
  async () => {
    await assert.rejects(
      () =>
        persistStatefulCopilotActivePilotTelemetry({
          admin: {
            async rpc() {
              return {
                data:
                  null,

                error: {
                  message:
                    'segredo interno do banco',
                },
              }
            },
          },

          telemetry,
        }),

      error => {
        assert.ok(
          error instanceof
            StatefulCopilotActivePilotTelemetryPersistenceError,
        )

        assert.equal(
          error.code,
          'ACTIVE_PILOT_TELEMETRY_PERSISTENCE_FAILED',
        )

        assert.doesNotMatch(
          error.message,
          /segredo interno/,
        )

        return true
      },
    )
  },
)

test(
  'resposta RPC incompleta falha fechado',
  async () => {
    await assert.rejects(
      () =>
        persistStatefulCopilotActivePilotTelemetry({
          admin: {
            async rpc() {
              return {
                data: [
                  {
                    event_id:
                      null,
                  },
                ],

                error:
                  null,
              }
            },
          },

          telemetry,
        }),

      StatefulCopilotActivePilotTelemetryPersistenceError,
    )
  },
)
