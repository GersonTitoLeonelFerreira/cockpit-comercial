import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ManagerialIntelligenceHardeningError,
  buildHardenedManagerialIntelligence,
  hardenManagerialEvidenceExtraction,
} from './managerial-intelligence-hardening.ts'
import { extractManagerialEvidence } from './managerial-evidence-extractor.ts'

const clone = value => JSON.parse(JSON.stringify(value))

function reading(summary = 'A descoberta ficou incompleta.') {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    seller_strengths: [],
    improvement_points: [
      {
        kind: 'insufficient_discovery',
        summary,
        impact: 'A recomendação pode ocorrer sem critérios suficientes.',
        evidence_message_ids: ['message-1'],
        memory_ids: [],
      },
    ],
    risks: { customer_objections: [], service_risks: [] },
  }
}

function analysisEvent({
  id = 'analysis-1',
  cycleId = 'cycle-1',
  sellerUserId = 'seller-1',
  generatedAt = '2026-08-20T15:00:00-03:00',
  summary,
} = {}) {
  return {
    id,
    company_id: 'company-1',
    cycle_id: cycleId,
    seller_user_id: sellerUserId,
    generated_at: generatedAt,
    normalized_output: {
      communication: { commercial_reading: reading(summary) },
    },
  }
}

function teamScope({ periodEnd = '2026-08-20' } = {}) {
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
    scope: teamScope(),
    reference_time: '2026-08-20T23:00:00-03:00',
    ...overrides,
  }
}

function extraction() {
  return extractManagerialEvidence({
    expected_company_id: 'company-1',
    commercial_reading_events: [analysisEvent()],
    action_events: [],
    cycle_events: [],
    cycle_snapshots: [],
  })
}

function expectHardeningError(callback, code) {
  assert.throws(callback, error => {
    assert.ok(error instanceof ManagerialIntelligenceHardeningError)
    assert.equal(error.code, code)
    return true
  })
}

test('mantém managerial-intelligence-v1 e canonicaliza generated_at', () => {
  const result = buildHardenedManagerialIntelligence(args())
  assert.equal(result.contract_version, 'managerial-intelligence-v1')
  assert.equal(result.analysis_status, 'complete')
  assert.equal(result.generated_at, '2026-08-21T02:00:00.000Z')
  assert.equal(result.signals.length, 1)
})

test('ordena offsets pelo instante real, não pelo texto', () => {
  const result = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({
          id: 'analysis-later',
          generatedAt: '2026-08-20T18:00:00-03:00',
          summary: 'Resumo realmente mais recente.',
        }),
        analysisEvent({
          id: 'analysis-earlier',
          generatedAt: '2026-08-20T20:30:00Z',
          summary: 'Resumo cronologicamente anterior.',
        }),
      ],
    }),
  )
  const signal = result.signals.find(
    item => item.signal_key === 'semantic:seller_improvement:insufficient_discovery',
  )
  assert.equal(signal?.summary, 'Resumo realmente mais recente.')
})

test('ordem das fontes não altera a inteligência final', () => {
  const events = [
    analysisEvent({ id: 'analysis-a', generatedAt: '2026-08-20T18:00:00-03:00' }),
    analysisEvent({ id: 'analysis-b', generatedAt: '2026-08-20T20:30:00Z' }),
  ]
  const forward = buildHardenedManagerialIntelligence(
    args({ commercial_reading_events: events }),
  )
  const reversed = buildHardenedManagerialIntelligence(
    args({ commercial_reading_events: [...events].reverse() }),
  )
  assert.deepEqual(reversed, forward)
})

test('representações equivalentes do mesmo instante são determinísticas', () => {
  const offset = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({ generatedAt: '2026-08-20T18:00:00-03:00' }),
      ],
    }),
  )
  const utc = buildHardenedManagerialIntelligence(
    args({
      commercial_reading_events: [
        analysisEvent({ generatedAt: '2026-08-20T21:00:00Z' }),
      ],
    }),
  )
  assert.deepEqual(offset, utc)
})

test('evidência futura falha fechada', () => {
  expectHardeningError(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          commercial_reading_events: [
            analysisEvent({ generatedAt: '2026-08-21T03:00:00Z' }),
          ],
        }),
      ),
    'FUTURE_EVIDENCE',
  )
})

test('timestamp sem timezone explícito é rejeitado', () => {
  expectHardeningError(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          commercial_reading_events: [
            analysisEvent({ generatedAt: '2026-08-20T20:00:00' }),
          ],
        }),
      ),
    'NON_CANONICAL_TIME',
  )
})

test('telemetria futura também falha fechada', () => {
  expectHardeningError(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          action_events: [
            {
              id: 'action-1',
              company_id: 'company-1',
              cycle_id: 'cycle-1',
              seller_user_id: 'seller-1',
              action_type: 'suggestion_ignored',
              occurred_at: '2026-08-21T03:00:00Z',
            },
          ],
        }),
      ),
    'FUTURE_EVIDENCE',
  )
})

test('snapshot futuro não contamina o estado gerencial', () => {
  expectHardeningError(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          cycle_snapshots: [
            {
              id: 'cycle-1',
              company_id: 'company-1',
              owner_user_id: 'seller-1',
              status: 'negociacao',
              next_action: null,
              next_action_date: null,
              updated_at: '2026-08-21T03:00:00Z',
            },
          ],
        }),
      ),
    'FUTURE_EVIDENCE',
  )
})

test('handoff não pode emprestar cobertura A4 de outro ciclo', () => {
  const tampered = clone(extraction())
  tampered.semantic_evidence[0].cycle_id = 'cycle-forged'
  expectHardeningError(
    () => hardenManagerialEvidenceExtraction(tampered, '2026-08-21T02:00:00Z'),
    'SEMANTIC_PROVENANCE_MISMATCH',
  )
})

test('handoff não pode trocar vendedor histórico', () => {
  const tampered = clone(extraction())
  tampered.semantic_evidence[0].seller_user_id = 'seller-forged'
  expectHardeningError(
    () => hardenManagerialEvidenceExtraction(tampered, '2026-08-21T02:00:00Z'),
    'SEMANTIC_PROVENANCE_MISMATCH',
  )
})

test('IDs globais adulterados falham fechados', () => {
  const tampered = clone(extraction())
  tampered.analysis_event_ids = ['analysis-forged']
  expectHardeningError(
    () => hardenManagerialEvidenceExtraction(tampered, '2026-08-21T02:00:00Z'),
    'DECLARED_PROVENANCE_MISMATCH',
  )
})

test('contadores de cobertura adulterados falham fechados', () => {
  const tampered = clone(extraction())
  tampered.coverage.commercial_reading_events_compatible = 99
  expectHardeningError(
    () => hardenManagerialEvidenceExtraction(tampered, '2026-08-21T02:00:00Z'),
    'COVERAGE_COUNTER_MISMATCH',
  )
})

test('UTC não pode liberar um período futuro na data local declarada', () => {
  expectHardeningError(
    () =>
      buildHardenedManagerialIntelligence(
        args({
          scope: teamScope({ periodEnd: '2026-08-21' }),
          reference_time: '2026-08-20T23:30:00-03:00',
        }),
      ),
    'PERIOD_IN_FUTURE',
  )
})

test('hardening não muta as fontes recebidas', () => {
  const input = args()
  const before = clone(input)
  buildHardenedManagerialIntelligence(input)
  assert.deepEqual(input, before)
})
