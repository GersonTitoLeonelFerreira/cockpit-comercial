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

const CONVERSATION_KEY =
  'whatsapp:+5547999990001'
const REFERENCE_TIME =
  '2026-09-09T17:00:00.000Z'

function buildRequest() {
  return {
    contract_version:
      'message-intelligence-request-v1',
    request_id:
      '60000000-0000-4000-8000-000000000001',
    company_id: IDS.company,
    seller_user_id: IDS.seller,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    seller_intent:
      'Quero confirmar o próximo passo com o cliente.',
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
        updated_at:
          '2026-09-09T16:50:00.000Z',
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
        updated_at:
          '2026-09-09T16:50:00.000Z',
        created_at:
          '2026-09-01T10:00:00.000Z',
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
        occurred_at:
          '2026-09-09T16:45:00.000Z',
        observed_at:
          '2026-09-09T16:45:01.000Z',
        content_type: 'text',
        text_content:
          'Quero entender a condição comercial.',
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
    state_contract_version:
      'phase-5.1-commercial-state-v1',
    state_updated_at:
      '2026-09-09T16:50:00.000Z',
    state_snapshot:
      buildTestCommercialState({
        cycleId: IDS.cycle,
        version: 3,
        evidenceMessageIds: ['1'],
      }),
    persisted_at:
      '2026-09-09T16:50:05.000Z',
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
    output_contract_version:
      'phase-5.2-stateful-copilot-v4',
    normalized_output: {
      contract_version:
        'phase-5.2-stateful-copilot-v4',
      communication: {
        contract_version:
          'phase-5.2-communication-v5',
        commercial_reading: {
          contract_version:
            COMMERCIAL_READING_CONTRACT_VERSION,
        },
      },
    },
    generated_at:
      '2026-09-09T16:49:00.000Z',
    ...overrides,
  }
}

test(
  'MIE recebe a Commercial Reading persistida da versão exata do estado atual, com provenance do evento',
  async () => {
    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...buildBaseRows(),
        commercialStates: [
          buildCurrentState(),
        ],
        commercialStateEvents: [
          buildEvent(),
        ],
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources =
      await loadSources(buildRequest())

    assert.equal(
      sources.real_context.state_read.mode,
      'found',
    )
    assert.notEqual(
      sources.commercial_reading,
      null,
    )
    assert.equal(
      sources.commercial_reading.source_id,
      IDS.event,
    )
    assert.equal(
      sources.commercial_reading.observed_at,
      '2026-09-09T16:49:00.000Z',
    )
    assert.equal(
      sources.commercial_reading.reading
        .contract_version,
      COMMERCIAL_READING_CONTRACT_VERSION,
    )
  },
)

test(
  'MIE não promove Commercial Reading stale de uma versão anterior do estado',
  async () => {
    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...buildBaseRows(),
        commercialStates: [
          buildCurrentState(),
        ],
        commercialStateEvents: [
          buildEvent({
            candidate_state_version: 2,
          }),
        ],
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources =
      await loadSources(buildRequest())

    assert.equal(
      sources.real_context.state_read.state_version,
      3,
    )
    assert.equal(
      sources.commercial_reading,
      null,
    )
  },
)

test(
  'MIE mantém Commercial Reading ausente quando não existe estado atual persistido',
  async () => {
    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...buildBaseRows(),
        commercialStates: [],
        commercialStateEvents: [
          buildEvent(),
        ],
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources =
      await loadSources(buildRequest())

    assert.equal(
      sources.real_context.state_read.mode,
      'missing',
    )
    assert.equal(
      sources.commercial_reading,
      null,
    )
  },
)
