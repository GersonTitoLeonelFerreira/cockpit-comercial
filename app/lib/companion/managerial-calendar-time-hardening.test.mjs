import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ManagerialIntelligenceHardeningError,
  buildHardenedManagerialIntelligence,
} from './managerial-intelligence-hardening.ts'

function reading() {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    seller_strengths: [],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
  }
}

function analysisEvent(generatedAt = '2026-08-20T15:00:00-03:00') {
  return {
    id: 'analysis-1',
    company_id: 'company-1',
    cycle_id: 'cycle-1',
    seller_user_id: 'seller-1',
    generated_at: generatedAt,
    normalized_output: {
      communication: { commercial_reading: reading() },
    },
  }
}

function scope(periodEnd = '2026-08-20') {
  return {
    period_start: '2026-08-01',
    period_end: periodEnd,
    seller_scope: { type: 'team', seller_user_id: null },
    eligible_cycle_ids: ['cycle-1'],
    seller_user_ids_in_scope: ['seller-1'],
  }
}

function args(overrides = {}) {
  return {
    expected_company_id: 'company-1',
    commercial_reading_events: [analysisEvent()],
    action_events: [],
    cycle_events: [],
    cycle_snapshots: [],
    scope: scope(),
    reference_time: '2026-08-20T23:00:00-03:00',
    ...overrides,
  }
}

function expectInvalidTime(callback, path) {
  assert.throws(callback, error => {
    assert.ok(error instanceof ManagerialIntelligenceHardeningError)
    assert.equal(error.code, 'INVALID_TIME')
    assert.equal(error.path, path)
    return true
  })
}

test('reference_time com dia impossível falha fechado', () => {
  expectInvalidTime(
    () =>
      buildHardenedManagerialIntelligence(
        args({ reference_time: '2026-02-30T12:00:00Z' }),
      ),
    'reference_time',
  )
})

test('leitura comercial com dia impossível não pode ser normalizada para outro mês', () => {
  expectInvalidTime(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          commercial_reading_events: [analysisEvent('2026-02-30T12:00:00Z')],
          reference_time: '2026-03-03T12:00:00Z',
          scope: scope('2026-03-03'),
        }),
      ),
    'extraction.commercial_reading_coverage[0].occurred_at',
  )
})

test('telemetria com dia impossível falha fechado', () => {
  expectInvalidTime(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          commercial_reading_events: [],
          action_events: [
            {
              id: 'action-1',
              company_id: 'company-1',
              cycle_id: 'cycle-1',
              seller_user_id: 'seller-1',
              action_type: 'suggestion_ignored',
              occurred_at: '2026-04-31T12:00:00Z',
            },
          ],
          reference_time: '2026-05-02T12:00:00Z',
          scope: scope('2026-05-02'),
        }),
      ),
    'extraction.action_facts[0].occurred_at',
  )
})

test('snapshot com dia impossível falha fechado', () => {
  expectInvalidTime(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          commercial_reading_events: [],
          cycle_snapshots: [
            {
              id: 'cycle-1',
              company_id: 'company-1',
              owner_user_id: 'seller-1',
              status: 'negociacao',
              next_action: null,
              next_action_date: null,
              updated_at: '2026-02-29T12:00:00Z',
            },
          ],
          reference_time: '2026-03-02T12:00:00Z',
          scope: scope('2026-03-02'),
        }),
      ),
    'extraction.cycle_snapshots[0].updated_at',
  )
})

test('dia bissexto real continua válido', () => {
  const result = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [analysisEvent('2028-02-29T12:00:00Z')],
      reference_time: '2028-02-29T23:00:00Z',
      scope: scope('2028-02-29'),
    }),
  )

  assert.equal(result.contract_version, 'managerial-intelligence-v1')
  assert.equal(result.generated_at, '2028-02-29T23:00:00.000Z')
})
