import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
} from '../companion/commercial-reading-contract.ts'

import {
  loadCanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source.ts'

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'
const CYCLE_ID =
  '30000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY =
  'whatsapp:+5547999990001'
const STATE_RECORD_ID =
  '70000000-0000-4000-8000-000000000001'
const EVENT_ID =
  '80000000-0000-4000-8000-000000000001'
const REFERENCE_TIME =
  '2026-09-09T17:00:00.000Z'

function evidence(
  summary,
  messageIds = ['1'],
  memoryIds = [],
) {
  return {
    summary,
    evidence_message_ids: messageIds,
    memory_ids: memoryIds,
  }
}

function buildValidReading(overrides = {}) {
  return {
    contract_version:
      COMMERCIAL_READING_CONTRACT_VERSION,
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state:
        evidence(
          'A conversa está aberta e sem intervenção útil neste instante.',
        ),
      last_customer_request_or_decision:
        null,
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
    method: null,
    seller_strengths: [],
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision: 'no_intervention',
      reason:
        'Não há ação nova sustentada pelo contexto atual.',
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

function buildStateRead(overrides = {}) {
  return {
    mode: 'found',
    found: true,
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    state_record_id: STATE_RECORD_ID,
    state_version: 4,
    state_updated_at: '2026-09-09T16:59:00.000Z',
    persisted_at: '2026-09-09T16:59:05.000Z',
    state: {},
    ...overrides,
  }
}

function buildEvent(overrides = {}) {
  return {
    id: EVENT_ID,
    state_record_id: STATE_RECORD_ID,
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    candidate_state_version: 4,
    output_contract_version:
      'phase-5.2-stateful-copilot-v4',
    normalized_output: {
      contract_version:
        'phase-5.2-stateful-copilot-v4',
      communication: {
        contract_version:
          'phase-5.2-communication-v5',
        commercial_reading:
          buildValidReading(),
      },
    },
    generated_at:
      '2026-09-09T16:58:00.000Z',
    ...overrides,
  }
}

function createAdmin({
  events = [],
  error = null,
} = {}) {
  let fromCalls = 0

  class Query {
    constructor() {
      this.filters = []
      this.upperBounds = []
      this.maximum = null
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    then(onFulfilled, onRejected) {
      if (error) {
        return Promise.resolve({
          data: null,
          error,
        }).then(onFulfilled, onRejected)
      }

      let rows = events.filter((row) =>
        this.filters.every(
          (filter) =>
            row[filter.column] === filter.value,
        ) &&
        this.upperBounds.every(
          (filter) =>
            Date.parse(row[filter.column]) <=
              Date.parse(filter.value),
        ),
      )

      if (this.maximum !== null) {
        rows = rows.slice(0, this.maximum)
      }

      return Promise.resolve({
        data: rows,
        error: null,
      }).then(onFulfilled, onRejected)
    }
  }

  return {
    admin: {
      from(table) {
        assert.equal(
          table,
          'companion_commercial_state_events',
        )
        fromCalls += 1
        return new Query()
      },
    },
    getFromCalls: () => fromCalls,
  }
}

function load({
  admin,
  stateRead = buildStateRead(),
  referenceTime = REFERENCE_TIME,
  validationContext = {},
}) {
  return loadCanonicalCommercialReadingSource({
    admin,
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: referenceTime,
    state_read: stateRead,
    validation_context: {
      available_message_ids: ['1'],
      available_memory_ids: [],
      seller_message_ids: [],
      current_crm_status: 'respondeu',
      reference_time: referenceTime,
      ...validationContext,
    },
  })
}

test(
  'retorna a Commercial Reading do evento que corresponde exatamente ao estado atual',
  async () => {
    const { admin } = createAdmin({
      events: [buildEvent()],
    })

    const source = await load({ admin })

    assert.notEqual(source, null)
    assert.equal(source.source_event_id, EVENT_ID)
    assert.equal(source.state_record_id, STATE_RECORD_ID)
    assert.equal(source.state_version, 4)
    assert.equal(
      source.reading.contract_version,
      COMMERCIAL_READING_CONTRACT_VERSION,
    )
  },
)

test(
  'não usa leitura stale de uma versão anterior do mesmo state record',
  async () => {
    const { admin } = createAdmin({
      events: [
        buildEvent({
          candidate_state_version: 3,
        }),
      ],
    })

    assert.equal(await load({ admin }), null)
  },
)

test(
  'não escolhe leitura de outro state_record_id mesmo com mesma versão',
  async () => {
    const { admin } = createAdmin({
      events: [
        buildEvent({
          state_record_id:
            '70000000-0000-4000-8000-000000000099',
        }),
      ],
    })

    assert.equal(await load({ admin }), null)
  },
)

test(
  'falha fechado quando existem dois eventos para a mesma identidade canônica',
  async () => {
    const { admin } = createAdmin({
      events: [
        buildEvent(),
        buildEvent({
          id:
            '80000000-0000-4000-8000-000000000002',
        }),
      ],
    })

    assert.equal(await load({ admin }), null)
  },
)

test(
  'não usa evento gerado depois do reference_time',
  async () => {
    const { admin } = createAdmin({
      events: [
        buildEvent({
          generated_at:
            '2026-09-09T17:00:00.001Z',
        }),
      ],
    })

    assert.equal(await load({ admin }), null)
  },
)

test(
  'não consulta eventos quando state_read está missing',
  async () => {
    const { admin, getFromCalls } =
      createAdmin({
        events: [buildEvent()],
      })

    const source = await load({
      admin,
      stateRead: {
        mode: 'missing',
        found: false,
        company_id: COMPANY_ID,
        cycle_id: CYCLE_ID,
        conversation_key: CONVERSATION_KEY,
        state_record_id: null,
        state_version: null,
        state_updated_at: null,
        persisted_at: null,
        state: null,
      },
    })

    assert.equal(source, null)
    assert.equal(getFromCalls(), 0)
  },
)

test(
  'rejeita output, communication ou Commercial Reading com contrato incompatível',
  async () => {
    const badOutput = createAdmin({
      events: [
        buildEvent({
          normalized_output: {
            contract_version: 'old-contract',
          },
        }),
      ],
    })

    assert.equal(
      await load({ admin: badOutput.admin }),
      null,
    )

    const badCommunication = createAdmin({
      events: [
        buildEvent({
          normalized_output: {
            contract_version:
              'phase-5.2-stateful-copilot-v4',
            communication: {
              contract_version: 'old-communication',
              commercial_reading:
                buildValidReading(),
            },
          },
        }),
      ],
    })

    assert.equal(
      await load({ admin: badCommunication.admin }),
      null,
    )

    const badReading = createAdmin({
      events: [
        buildEvent({
          normalized_output: {
            contract_version:
              'phase-5.2-stateful-copilot-v4',
            communication: {
              contract_version:
                'phase-5.2-communication-v5',
              commercial_reading:
                buildValidReading({
                  contract_version:
                    'commercial-reading-invalid',
                }),
            },
          },
        }),
      ],
    })

    assert.equal(
      await load({ admin: badReading.admin }),
      null,
    )
  },
)

test(
  'revalidação rejeita provenance de mensagem que não pertence mais ao contexto canônico',
  async () => {
    const invalidReading =
      buildValidReading({
        evidence_message_ids: ['removed-message'],
      })

    invalidReading.conversation_summary.current_state =
      evidence(
        'Leitura aponta para mensagem removida.',
        ['removed-message'],
      )
    invalidReading.best_approach = {
      ...invalidReading.best_approach,
      evidence_message_ids: [
        'removed-message',
      ],
    }

    const { admin } = createAdmin({
      events: [
        buildEvent({
          normalized_output: {
            contract_version:
              'phase-5.2-stateful-copilot-v4',
            communication: {
              contract_version:
                'phase-5.2-communication-v5',
              commercial_reading:
                invalidReading,
            },
          },
        }),
      ],
    })

    const originalError = console.error
    console.error = () => {}

    try {
      assert.equal(
        await load({ admin }),
        null,
      )
    } finally {
      console.error = originalError
    }
  },
)

test(
  'reference_time da validação precisa representar o mesmo instante da requisição',
  async () => {
    const { admin } = createAdmin({
      events: [buildEvent()],
    })

    assert.equal(
      await load({
        admin,
        validationContext: {
          reference_time:
            '2026-09-09T16:59:00.000Z',
        },
      }),
      null,
    )
  },
)

test(
  'erro de query mantém o loader best-effort e retorna null',
  async () => {
    const originalError = console.error
    console.error = () => {}

    try {
      const { admin } = createAdmin({
        error: new Error('database unavailable'),
      })

      assert.equal(await load({ admin }), null)
    } finally {
      console.error = originalError
    }
  },
)
