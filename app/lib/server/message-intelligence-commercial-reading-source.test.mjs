import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
} from '../companion/commercial-reading-contract.ts'

import {
  buildTestCommercialState,
  createMessageIntelligenceFakeAdmin,
} from '../companion/e2-test-support/fake-message-intelligence-admin.mjs'

import {
  createMessageIntelligenceSourceLoaderV1,
} from './message-intelligence-source-loader.ts'

const IDS = {
  company: '10000000-0000-4000-8000-000000000001',
  lead: '20000000-0000-4000-8000-000000000001',
  cycle: '30000000-0000-4000-8000-000000000001',
  seller: '40000000-0000-4000-8000-000000000001',
  state: '70000000-0000-4000-8000-000000000001',
  event: '80000000-0000-4000-8000-000000000001',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-08-29T22:00:00.000Z'

function evidence(summary, ids = ['1']) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

function buildValidReading(overrides = {}) {
  return {
    contract_version: COMMERCIAL_READING_CONTRACT_VERSION,
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state: evidence('Conversa aberta sem intervenção útil agora.'),
      last_customer_request_or_decision: null,
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],
      communication: {
        events: [],
        patterns: [],
      },
    },
    commercial_evolution: [],
    method: {
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: {
        status: 'not_configured',
        summary: 'Método comercial não configurado.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths: [],
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision: 'no_intervention',
      reason: 'Não há ação nova sustentada pelo contexto atual.',
      channel: 'none',
      evidence_message_ids: ['1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: false,
      recommended_question: null,
      recommended_message: null,
    },
    operations: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: ['1'],
    memory_ids: [],
    ...overrides,
  }
}

function buildRequest() {
  return {
    contract_version: 'message-intelligence-request-v1',
    request_id: '60000000-0000-4000-8000-000000000001',
    company_id: IDS.company,
    seller_user_id: IDS.seller,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    seller_intent: 'Quero confirmar o próximo passo com o cliente.',
    reference_time: REFERENCE_TIME,
  }
}

function buildBaseRows() {
  return {
    companies: [
      {
        id: IDS.company,
        name: 'Empresa Fixture',
        platform_status: 'active',
        onboarding_status: 'active',
      },
    ],
    leads: [
      {
        id: IDS.lead,
        company_id: IDS.company,
        name: 'Cliente Fixture',
        phone: '+5547999990001',
        email: null,
        deleted_at: null,
        updated_at: '2026-08-29T21:55:00.000Z',
      },
    ],
    cycles: [
      {
        id: IDS.cycle,
        company_id: IDS.company,
        lead_id: IDS.lead,
        owner_user_id: IDS.seller,
        status: 'respondeu',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-08-29T21:55:00.000Z',
        created_at: '2026-08-29T20:00:00.000Z',
        origin_cycle_id: null,
      },
    ],
    reconciliation: [
      {
        company_id: IDS.company,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 1,
        message_key: 'm1',
      },
    ],
    messages: [
      {
        id: 1,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm1',
        version: 1,
        direction: 'incoming',
        occurred_at: '2026-08-29T21:50:00.000Z',
        observed_at: '2026-08-29T21:50:01.000Z',
        content_type: 'text',
        text_content: 'Quero entender a condição comercial.',
        audio_transcription: null,
        is_deleted: false,
      },
    ],
    configVersions: [],
  }
}

function buildCurrentState() {
  return {
    id: IDS.state,
    company_id: IDS.company,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    state_version: 3,
    state_contract_version: 'phase-5.1-commercial-state-v1',
    state_updated_at: '2026-08-29T21:55:00.000Z',
    state_snapshot: buildTestCommercialState({
      cycleId: IDS.cycle,
      version: 3,
      evidenceMessageIds: ['1'],
    }),
    persisted_at: '2026-08-29T21:56:00.000Z',
  }
}

function buildEvent(overrides = {}) {
  return {
    id: IDS.event,
    state_record_id: IDS.state,
    company_id: IDS.company,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    candidate_state_version: 3,
    output_contract_version: 'phase-5.2-stateful-copilot-v4',
    normalized_output: {
      contract_version: 'phase-5.2-stateful-copilot-v4',
      communication: {
        contract_version: 'phase-5.2-communication-v5',
        commercial_reading: buildValidReading(),
      },
    },
    generated_at: '2026-08-29T21:55:30.000Z',
    ...overrides,
  }
}

test('MIE recebe a leitura persistida da versão exata com provenance do evento', async () => {
  const { admin } = createMessageIntelligenceFakeAdmin({
    ...buildBaseRows(),
    commercialStates: [buildCurrentState()],
    commercialStateEvents: [buildEvent()],
  })

  const sources =
    await createMessageIntelligenceSourceLoaderV1({ admin })(buildRequest())

  assert.equal(sources.real_context.state_read.mode, 'found')
  assert.notEqual(sources.commercial_reading, null)
  assert.equal(sources.commercial_reading.source_id, IDS.event)
  assert.equal(
    sources.commercial_reading.observed_at,
    '2026-08-29T21:55:30.000Z',
  )
  assert.equal(
    sources.commercial_reading.reading.contract_version,
    COMMERCIAL_READING_CONTRACT_VERSION,
  )
})

test('MIE não promove leitura stale de versão anterior', async () => {
  const { admin } = createMessageIntelligenceFakeAdmin({
    ...buildBaseRows(),
    commercialStates: [buildCurrentState()],
    commercialStateEvents: [
      buildEvent({ candidate_state_version: 2 }),
    ],
  })

  const sources =
    await createMessageIntelligenceSourceLoaderV1({ admin })(buildRequest())

  assert.equal(sources.real_context.state_read.state_version, 3)
  assert.equal(sources.commercial_reading, null)
})

test('MIE mantém leitura ausente quando não existe estado atual', async () => {
  const { admin } = createMessageIntelligenceFakeAdmin({
    ...buildBaseRows(),
    commercialStates: [],
    commercialStateEvents: [buildEvent()],
  })

  const sources =
    await createMessageIntelligenceSourceLoaderV1({ admin })(buildRequest())

  assert.equal(sources.real_context.state_read.mode, 'missing')
  assert.equal(sources.commercial_reading, null)
})

test('MIE rejeita leitura cuja provenance aponta para mensagem não ativa', async () => {
  const invalidReading = buildValidReading({
    evidence_message_ids: ['removed-message'],
  })
  invalidReading.conversation_summary.current_state =
    evidence('Leitura usa evidência removida.', ['removed-message'])
  invalidReading.best_approach = {
    ...invalidReading.best_approach,
    evidence_message_ids: ['removed-message'],
  }

  const { admin } = createMessageIntelligenceFakeAdmin({
    ...buildBaseRows(),
    commercialStates: [buildCurrentState()],
    commercialStateEvents: [
      buildEvent({
        normalized_output: {
          contract_version: 'phase-5.2-stateful-copilot-v4',
          communication: {
            contract_version: 'phase-5.2-communication-v5',
            commercial_reading: invalidReading,
          },
        },
      }),
    ],
  })

  const originalError = console.error
  console.error = () => {}
  try {
    const sources =
      await createMessageIntelligenceSourceLoaderV1({ admin })(buildRequest())

    assert.equal(sources.commercial_reading, null)
  } finally {
    console.error = originalError
  }
})
