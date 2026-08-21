import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHardenedManagerialIntelligence } from './managerial-intelligence-hardening.ts'

function reading() {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    seller_strengths: [],
    improvement_points: [
      {
        kind: 'insufficient_discovery',
        summary: 'A descoberta ficou incompleta.',
        impact: 'A recomendação pode ocorrer sem critérios suficientes.',
        evidence_message_ids: ['message-1'],
        memory_ids: [],
      },
    ],
    risks: { customer_objections: [], service_risks: [] },
  }
}

function analysisEvent({
  id,
  generatedAt,
  compatible = true,
} = {}) {
  const commercialReading = reading()
  if (!compatible) {
    commercialReading.contract_version = 'commercial-reading-v0'
  }

  return {
    id,
    company_id: 'company-1',
    cycle_id: 'cycle-1',
    seller_user_id: 'seller-1',
    generated_at: generatedAt,
    normalized_output: {
      communication: { commercial_reading: commercialReading },
    },
  }
}

function actionEvent({ id, occurredAt }) {
  return {
    id,
    company_id: 'company-1',
    cycle_id: 'cycle-1',
    seller_user_id: 'seller-1',
    action_type: 'suggestion_ignored',
    occurred_at: occurredAt,
  }
}

function cycleEvent({ id, occurredAt }) {
  return {
    id,
    company_id: 'company-1',
    cycle_id: 'cycle-1',
    created_by: 'seller-1',
    occurred_at: occurredAt,
    event_type: 'status_changed',
    metadata: {},
  }
}

function teamScope({
  periodStart = '2026-08-01',
  periodEnd = '2026-08-31',
} = {}) {
  return {
    period_start: periodStart,
    period_end: periodEnd,
    seller_scope: { type: 'team', seller_user_id: null },
    eligible_cycle_ids: ['cycle-1'],
    seller_user_ids_in_scope: ['seller-1'],
  }
}

function args(overrides = {}) {
  return {
    expected_company_id: 'company-1',
    commercial_reading_events: [],
    action_events: [],
    cycle_events: [],
    cycle_snapshots: [],
    scope: teamScope(),
    reference_time: '2026-08-31T23:00:00-03:00',
    ...overrides,
  }
}

test('leituras fora do período não entram na inteligência gerencial', () => {
  const result = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({
          id: 'analysis-july',
          generatedAt: '2026-07-31T18:00:00-03:00',
        }),
        analysisEvent({
          id: 'analysis-august',
          generatedAt: '2026-08-10T18:00:00-03:00',
        }),
        analysisEvent({
          id: 'analysis-september',
          generatedAt: '2026-09-01T00:30:00-03:00',
        }),
      ],
      reference_time: '2026-09-02T12:00:00-03:00',
    }),
  )

  assert.deepEqual(result.analysis_event_ids, ['analysis-august'])
  assert.equal(result.coverage.commercial_reading_events, 1)
  assert.deepEqual(result.signals[0].analysis_event_ids, ['analysis-august'])
})

test('ações e eventos de ciclo respeitam a mesma janela gerencial', () => {
  const result = buildHardenedManagerialIntelligence(
    args({
      action_events: [
        actionEvent({ id: 'action-before', occurredAt: '2026-07-31T23:59:00-03:00' }),
        actionEvent({ id: 'action-inside', occurredAt: '2026-08-12T12:00:00-03:00' }),
      ],
      cycle_events: [
        cycleEvent({ id: 'cycle-before', occurredAt: '2026-07-30T12:00:00-03:00' }),
        cycleEvent({ id: 'cycle-inside', occurredAt: '2026-08-15T12:00:00-03:00' }),
      ],
    }),
  )

  assert.deepEqual(result.action_event_ids, ['action-inside'])
  assert.deepEqual(result.cycle_event_ids, ['cycle-inside'])
  assert.equal(result.coverage.companion_action_events, 1)
  assert.equal(result.coverage.cycle_events, 1)
})

test('leitura incompatível fora do período não limita o período atual', () => {
  const clean = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({
          id: 'analysis-current',
          generatedAt: '2026-08-10T12:00:00-03:00',
        }),
      ],
    }),
  )

  const withOldIncompatible = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({
          id: 'analysis-old-incompatible',
          generatedAt: '2026-07-10T12:00:00-03:00',
          compatible: false,
        }),
        analysisEvent({
          id: 'analysis-current',
          generatedAt: '2026-08-10T12:00:00-03:00',
        }),
      ],
    }),
  )

  assert.deepEqual(withOldIncompatible, clean)
})

test('fronteira do período usa o offset do reference_time de forma determinística', () => {
  const result = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({
          id: 'analysis-local-day',
          generatedAt: '2026-08-21T02:15:00Z',
        }),
      ],
      scope: teamScope({ periodStart: '2026-08-20', periodEnd: '2026-08-20' }),
      reference_time: '2026-08-20T23:30:00-03:00',
    }),
  )

  assert.deepEqual(result.analysis_event_ids, ['analysis-local-day'])
})

test('fonte inválida continua falhando mesmo quando está fora do período', () => {
  assert.throws(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          commercial_reading_events: [
            analysisEvent({
              id: 'analysis-invalid-old',
              generatedAt: '2026-02-30T12:00:00Z',
            }),
          ],
        }),
      ),
    error =>
      error?.name === 'ManagerialIntelligenceHardeningError' &&
      error?.code === 'INVALID_TIME',
  )
})
