// Aba CLIENTE vazia depois de uma leitura não comercial.
//
// Caso real (Júlia, HML, versão 2): a leitura uncertain era neutralizada
// mantendo `customer` (memória persistente, que cita 11 memórias do estado)
// mas zerando `memory_ids` global. Na releitura, normalizeCommercialReading
// recusava a própria leitura (MISSING_GLOBAL_MEMORY), a fonte canônica a
// descartava e CLIENTE mostrava "sem leitura". O formato abaixo é o da leitura
// v2 real, com textos trocados e identificadores sintéticos.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeCommercialReading,
} from './commercial-reading-contract.ts'

import {
  buildCustomerViewModel,
} from '../server/customer-view-model.ts'

const memory = (suffix) =>
  `stateful-memory-${suffix.padStart(64, '0')}`

const MEMORIES = {
  need: memory('a1'),
  interest: memory('a2'),
  objective: memory('a3'),
  commitment: memory('a4'),
  preference: memory('a5'),
  open_question: memory('a6'),
  decision_criterion: memory('a7'),
  missing_other: memory('a8'),
  missing_criteria: memory('a9'),
  product: memory('aa'),
}

const PRODUCT_ID = '30000000-0000-4000-8000-000000000001'

const item = (memoryId) => ({
  summary: 'x',
  memory_ids: [memoryId],
  evidence_message_ids: [],
})

function customer() {
  return {
    needs: [item(MEMORIES.need)],
    impacts: [],
    problems: [],
    interests: [item(MEMORIES.interest)],
    objections: [],
    objectives: [item(MEMORIES.objective)],
    commitments: [
      {
        status: 'confirmed',
        summary: 'x',
        memory_ids: [MEMORIES.commitment],
        proposed_at: null,
        scheduled_at: null,
        evidence_message_ids: [],
      },
    ],
    competitors: [],
    preferences: [item(MEMORIES.preference)],
    communication: { events: [], patterns: [] },
    uncertainties: [],
    open_questions: [item(MEMORIES.open_question)],
    decision_criteria: [item(MEMORIES.decision_criterion)],
    missing_discovery: [
      { topic: 'other', ...item(MEMORIES.missing_other) },
      { topic: 'decision_criteria', ...item(MEMORIES.missing_criteria) },
    ],
    discussed_products: [
      {
        name: 'x',
        summary: 'x',
        memory_ids: [MEMORIES.product],
        interest_level: 'primary',
        canonical_product_id: PRODUCT_ID,
        evidence_message_ids: [],
      },
    ],
    resolved_information: [],
    superseded_information: [],
    primary_product_interest: {
      name: 'x',
      summary: 'x',
      memory_ids: [MEMORIES.product],
      interest_level: 'primary',
      canonical_product_id: PRODUCT_ID,
      evidence_message_ids: [],
    },
  }
}

const STAGES = [
  'descoberta',
  'tour',
  'apresentacao',
  'decisao_de_compra',
  'formalizacao',
  'follow_up',
]

// Leitura com o formato exato da v2 gravada: relevância uncertain, momento e
// método neutros, customer vindo do estado. `globalMemoryIds` é a lista
// global de memórias: a leitura antes de neutralizar declara as do customer;
// a v2 gravada tinha [].
function v2ShapedReading({ globalMemoryIds }) {
  return {
    risks: { service_risks: [], customer_objections: [] },
    method: {
      name: 'x',
      stages: STAGES.map((stageKey, index) => ({
        name: 'x',
        status: 'not_applicable',
        stage_key: stageKey,
        memory_ids: [],
        step_order: index + 1,
        explanation: 'x',
        evidence_message_ids: [],
      })),
      adherence: {
        status: 'insufficient_evidence',
        summary: 'x',
        memory_ids: [],
        what_happened: null,
        why_it_matters: null,
        missing_information: [],
        evidence_message_ids: [],
        deviation_stage_order: null,
      },
      configured: true,
      current_stage: null,
      recovery_guidance: null,
    },
    customer: customer(),
    memory_ids: globalMemoryIds,
    operations: {
      crm: {
        rationale: null,
        recommended_status: null,
        should_change_crm_stage: false,
        requires_human_confirmation: true,
      },
      agenda: {
        rationale: null,
        should_change_agenda: false,
        expected_next_action_at: null,
        requires_human_confirmation: true,
      },
    },
    best_approach: {
      reason: 'x',
      channel: 'none',
      decision: 'no_intervention',
      memory_ids: [],
      evidence_message_ids: ['m-last', 'm-customer'],
    },
    communication: {
      intervention_needed: false,
      recommended_message: null,
      recommended_question: null,
    },
    analysis_status: 'complete',
    commercial_role: 'buyer',
    contract_version: 'commercial-reading-v1',
    seller_strengths: [],
    improvement_points: [],
    analysis_limitations: [],
    commercial_evolution: [],
    commercial_relevance: 'uncertain',
    conversation_summary: {
      evolution: null,
      current_state: {
        summary: 'x',
        memory_ids: [],
        evidence_message_ids: ['m-last', 'm-customer'],
      },
      initial_context: null,
      important_events: [],
      last_customer_request_or_decision: null,
    },
    evidence_message_ids: ['m-last', 'm-customer'],
  }
}

const CUSTOMER_MEMORY_IDS = [...new Set(Object.values(MEMORIES))]

const CONTEXT = {
  available_message_ids: ['m-first', 'm-customer', 'm-last'],
  available_memory_ids: CUSTOMER_MEMORY_IDS,
  seller_message_ids: ['m-last'],
  current_crm_status: 'contato',
  reference_time: '2026-09-30T18:40:00.000Z',
}

test('leitura não comercial mantém declaradas as memórias que o CLIENTE cita', () => {
  const neutralized =
    normalizeCommercialReading(
      v2ShapedReading({ globalMemoryIds: CUSTOMER_MEMORY_IDS }),
      CONTEXT,
    )

  assert.equal(neutralized.commercial_relevance, 'uncertain')
  assert.equal(neutralized.best_approach.decision, 'no_intervention')
  assert.deepEqual(
    [...neutralized.memory_ids].sort(),
    [...CUSTOMER_MEMORY_IDS].sort(),
  )
  assert.deepEqual(neutralized.customer.objectives[0].memory_ids, [MEMORIES.objective])
})

test('a leitura neutralizada gravada volta a ser lida (antes: MISSING_GLOBAL_MEMORY)', () => {
  const stored =
    JSON.parse(
      JSON.stringify(
        normalizeCommercialReading(
          v2ShapedReading({ globalMemoryIds: CUSTOMER_MEMORY_IDS }),
          CONTEXT,
        ),
      ),
    )

  const reread =
    normalizeCommercialReading(stored, CONTEXT)

  assert.deepEqual(reread.customer, stored.customer)

  // A v2 já gravada antes desta correção (lista global vazia) continua
  // recusada: a correção vale para leituras gravadas a partir de agora.
  assert.throws(
    () =>
      normalizeCommercialReading(
        v2ShapedReading({ globalMemoryIds: [] }),
        CONTEXT,
      ),
    (error) => error.code === 'MISSING_GLOBAL_MEMORY',
  )
})

test('aba CLIENTE com leitura não comercial mostra os dados do cliente', () => {
  const stored =
    JSON.parse(
      JSON.stringify(
        normalizeCommercialReading(
          v2ShapedReading({ globalMemoryIds: CUSTOMER_MEMORY_IDS }),
          CONTEXT,
        ),
      ),
    )

  const viewModel =
    buildCustomerViewModel({
      company_id: '10000000-0000-4000-8000-000000000001',
      cycle_id: '20000000-0000-4000-8000-000000000001',
      conversation_key: 'phone:5511900000000',
      state_record_id: '40000000-0000-4000-8000-000000000001',
      state_version: 2,
      reading: normalizeCommercialReading(stored, CONTEXT),
      source_event_id: '50000000-0000-4000-8000-000000000001',
      generated_at: '2026-09-30T18:34:25.000Z',
      state_updated_at: '2026-09-30T18:34:03.468Z',
    })

  assert.equal(viewModel.available, true)
  assert.equal(viewModel.unavailable_reason, null)
  assert.equal(viewModel.preferences.length, 1)
  assert.equal(viewModel.opportunity_context.objectives.length, 1)
  assert.equal(viewModel.opportunity_context.needs.length, 1)
  assert.equal(viewModel.opportunity_context.interests.length, 1)
  assert.equal(viewModel.opportunity_context.decision_criteria.length, 1)
  assert.ok(viewModel.knowledge_gaps.length > 0)
})
