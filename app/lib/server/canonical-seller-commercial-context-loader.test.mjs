import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from '@/app/lib/companion/stateful-commercial-state.ts'

import {
  loadCanonicalSellerCommercialContext,
} from './canonical-seller-commercial-context-loader.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const CYCLE_ID = '20000000-0000-4000-8000-000000000001'
const USER_ID = '30000000-0000-4000-8000-000000000001'
const STATE_ID = '40000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REQUEST_TIME = '2026-09-10T10:10:00.000Z'

function buildToken() {
  return {
    sub: USER_ID,
    company_id: COMPANY_ID,
    role: 'member',
    iat: 1,
    exp: 9_999_999_999,
  }
}

function buildState({
  version,
  updatedAt,
  evidenceMessageId,
}) {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
    cycle_id: CYCLE_ID,
    version,
    commercial_role: 'buyer',
    current_moment: {
      summary: 'A venda possui contexto comercial persistido.',
      evidence_message_ids: [evidenceMessageId],
    },
    current_priority: {
      summary: 'Preservar a decisão até existir fato novo.',
      evidence_message_ids: [evidenceMessageId],
    },
    last_analyzed_message_ids: [evidenceMessageId],
    last_evidence_message_ids: [evidenceMessageId],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-09-10T09:00:00.000Z',
    updated_at: updatedAt,
  }
}

function buildStateRow({
  version = 2,
  updatedAt = '2026-09-10T10:00:00.000Z',
  evidenceMessageId = 'm1',
} = {}) {
  return {
    id: STATE_ID,
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    state_version: version,
    state_contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
    state_updated_at: updatedAt,
    state_snapshot: buildState({
      version,
      updatedAt,
      evidenceMessageId,
    }),
    persisted_at: updatedAt,
  }
}

function buildMessage({
  id,
  occurredAt,
  observedAt,
  direction = 'outgoing',
  text = 'mensagem',
}) {
  return {
    id,
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    message_key: id,
    version: 1,
    direction,
    occurred_at: occurredAt,
    observed_at: observedAt,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
  }
}

function createFakeAdmin({
  stateRow,
  messages,
}) {
  const reconciliation =
    messages.map((message) => ({
      company_id: COMPANY_ID,
      conversation_key: CONVERSATION_KEY,
      current_message_id: message.id,
    }))

  const tables = {
    company_memberships: [
      {
        company_id: COMPANY_ID,
        user_id: USER_ID,
        role: 'member',
        is_active: true,
      },
    ],
    sales_cycles: [
      {
        id: CYCLE_ID,
        company_id: COMPANY_ID,
        owner_user_id: USER_ID,
        status: 'negociacao',
        stage_entered_at: '2026-09-10T09:00:00.000Z',
      },
    ],
    conversation_message_reconciliation_state:
      reconciliation,
    conversation_messages: messages,
    cycle_events: [],
    sla_rules: [],
    companion_commercial_states:
      stateRow ? [stateRow] : [],
    companion_commercial_state_events: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.inFilters = []
      this.upperBounds = []
      this.maximum = null
      this.rangeFrom = null
      this.rangeTo = null
      this.orderBy = []
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    in(column, values) {
      this.inFilters.push({ column, values })
      return this
    }

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    order(column, options = {}) {
      this.orderBy.push({
        column,
        ascending: options.ascending !== false,
      })
      return this
    }

    range(from, to) {
      this.rangeFrom = from
      this.rangeTo = to
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    resolveRows() {
      let rows = [...(tables[this.table] ?? [])]
        .filter((row) =>
          this.filters.every(
            (filter) =>
              row[filter.column] === filter.value,
          ),
        )
        .filter((row) =>
          this.inFilters.every(
            (filter) =>
              filter.values.includes(
                row[filter.column],
              ),
          ),
        )
        .filter((row) =>
          this.upperBounds.every(
            (filter) =>
              Date.parse(row[filter.column]) <=
              Date.parse(filter.value),
          ),
        )

      for (
        const order of
          [...this.orderBy].reverse()
      ) {
        rows.sort((left, right) => {
          const comparison =
            String(left[order.column]).localeCompare(
              String(right[order.column]),
            )

          return order.ascending
            ? comparison
            : -comparison
        })
      }

      if (
        this.rangeFrom !== null &&
        this.rangeTo !== null
      ) {
        rows = rows.slice(
          this.rangeFrom,
          this.rangeTo + 1,
        )
      }

      if (this.maximum !== null) {
        rows = rows.slice(0, this.maximum)
      }

      return {
        data: rows,
        error: null,
      }
    }

    maybeSingle() {
      const result = this.resolveRows()

      return Promise.resolve({
        data: result.data[0] ?? null,
        error: null,
      })
    }

    then(onFulfilled, onRejected) {
      return Promise.resolve(
        this.resolveRows(),
      ).then(onFulfilled, onRejected)
    }
  }

  return {
    from(table) {
      return new Query(table)
    },

    rpc() {
      return Promise.resolve({
        data: [],
        error: null,
      })
    },
  }
}

test('scroll que apenas observa mensagem antiga depois do estado não altera o ledger que valida a fotografia comercial', async () => {
  const stateUpdatedAt =
    '2026-09-10T10:00:00.000Z'

  const messages = [
    buildMessage({
      id: 'm1',
      occurredAt:
        '2026-09-10T09:55:00.000Z',
      observedAt:
        '2026-09-10T09:55:05.000Z',
      text: 'Qual o próximo passo?',
    }),
    buildMessage({
      id: 'm-scroll-antiga',
      occurredAt:
        '2026-09-09T15:00:00.000Z',
      observedAt:
        '2026-09-10T10:05:00.000Z',
      text: 'Mensagem antiga materializada ao rolar a tela.',
    }),
  ]

  const result =
    await loadCanonicalSellerCommercialContext({
      admin: createFakeAdmin({
        stateRow: buildStateRow({
          updatedAt: stateUpdatedAt,
          evidenceMessageId: 'm1',
        }),
        messages,
      }),
      token: buildToken(),
      cycle_id: CYCLE_ID,
      conversation_key: CONVERSATION_KEY,
      reference_time: REQUEST_TIME,
    })

  assert.equal(
    result.ledger_reference_time,
    stateUpdatedAt,
  )
  assert.deepEqual(
    result.known_message_ids,
    ['m1'],
  )
  assert.equal(
    result.known_message_ids.includes(
      'm-scroll-antiga',
    ),
    false,
  )
  assert.equal(result.state_read.mode, 'found')
})

test('nova mensagem só muda a fotografia quando uma nova versão comercial persistida avança a referência', async () => {
  const nextStateUpdatedAt =
    '2026-09-10T10:06:00.000Z'

  const messages = [
    buildMessage({
      id: 'm1',
      occurredAt:
        '2026-09-10T09:55:00.000Z',
      observedAt:
        '2026-09-10T09:55:05.000Z',
    }),
    buildMessage({
      id: 'm2',
      occurredAt:
        '2026-09-10T10:05:30.000Z',
      observedAt:
        '2026-09-10T10:05:31.000Z',
      direction: 'incoming',
      text: 'Pode fechar para mim.',
    }),
  ]

  const result =
    await loadCanonicalSellerCommercialContext({
      admin: createFakeAdmin({
        stateRow: buildStateRow({
          version: 3,
          updatedAt: nextStateUpdatedAt,
          evidenceMessageId: 'm2',
        }),
        messages,
      }),
      token: buildToken(),
      cycle_id: CYCLE_ID,
      conversation_key: CONVERSATION_KEY,
      reference_time: REQUEST_TIME,
    })

  assert.equal(
    result.ledger_reference_time,
    nextStateUpdatedAt,
  )
  assert.equal(
    result.known_message_ids.includes('m2'),
    true,
  )
  assert.equal(result.state_read.mode, 'found')
  assert.equal(result.state_read.state_version, 3)
})
