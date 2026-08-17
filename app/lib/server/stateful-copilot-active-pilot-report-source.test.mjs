import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadStatefulCopilotActivePilotTelemetry,
  StatefulCopilotActivePilotReportSourceError,
} from './stateful-copilot-active-pilot-report-source.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const cycleId =
  '20000000-0000-4000-8000-000000000001'

const since =
  '2026-08-17T00:00:00.000Z'

function telemetry(
  overrides = {},
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

    ...overrides,
  }
}

test(
  'carrega telemetria persistida da empresa e janela solicitadas',
  async () => {
    let captured =
      null

    const result =
      await loadStatefulCopilotActivePilotTelemetry({
        company_id:
          companyId,

        since,

        query:
          async args => {
            captured =
              args

            return {
              data: [
                {
                  telemetry:
                    telemetry(),
                },
              ],

              error:
                null,
            }
          },
      })

    assert.deepEqual(
      captured,
      {
        company_id:
          companyId,

        since,

        limit:
          5000,
      },
    )

    assert.equal(
      result.length,
      1,
    )

    assert.equal(
      result[0].event,
      'active_success',
    )
  },
)

test(
  'erro do banco é convertido em falha segura',
  async () => {
    await assert.rejects(
      () =>
        loadStatefulCopilotActivePilotTelemetry({
          company_id:
            companyId,

          since,

          query:
            async () => ({
              data:
                null,

              error: {
                message:
                  'informação interna sensível',
              },
            }),
        }),

      error => {
        assert.ok(
          error instanceof
            StatefulCopilotActivePilotReportSourceError,
        )

        assert.equal(
          error.code,
          'ACTIVE_PILOT_REPORT_SOURCE_FAILED',
        )

        assert.doesNotMatch(
          error.message,
          /sensível/,
        )

        return true
      },
    )
  },
)

test(
  'telemetria de outra empresa é rejeitada',
  async () => {
    await assert.rejects(
      () =>
        loadStatefulCopilotActivePilotTelemetry({
          company_id:
            companyId,

          since,

          query:
            async () => ({
              data: [
                {
                  telemetry:
                    telemetry({
                      company_id:
                        '10000000-0000-4000-8000-000000000002',
                    }),
                },
              ],

              error:
                null,
            }),
        }),

      StatefulCopilotActivePilotReportSourceError,
    )
  },
)

test(
  'telemetria fora do contrato não é ignorada silenciosamente',
  async () => {
    await assert.rejects(
      () =>
        loadStatefulCopilotActivePilotTelemetry({
          company_id:
            companyId,

          since,

          query:
            async () => ({
              data: [
                {
                  telemetry: {
                    phase:
                      'phase-5.4',
                  },
                },
              ],

              error:
                null,
            }),
        }),

      StatefulCopilotActivePilotReportSourceError,
    )
  },
)

test(
  'company id data e limite inválidos falham antes da consulta',
  async () => {
    let queries =
      0

    const query =
      async () => {
        queries +=
          1

        return {
          data:
            [],

          error:
            null,
        }
      }

    await assert.rejects(
      () =>
        loadStatefulCopilotActivePilotTelemetry({
          company_id:
            'empresa-invalida',

          since,

          query,
        }),
    )

    await assert.rejects(
      () =>
        loadStatefulCopilotActivePilotTelemetry({
          company_id:
            companyId,

          since:
            'data-invalida',

          query,
        }),
    )

    await assert.rejects(
      () =>
        loadStatefulCopilotActivePilotTelemetry({
          company_id:
            companyId,

          since,

          limit:
            0,

          query,
        }),
    )

    assert.equal(
      queries,
      0,
    )
  },
)
