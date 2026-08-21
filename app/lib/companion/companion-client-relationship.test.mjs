import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeCompanionClientRelationship,
  computeCompanionClientWaiting,
} from './companion-client-relationship.ts'

const REFERENCE_TIME =
  '2026-08-22T12:00:00.000Z'

function customerMessage(
  occurredAt,
) {
  return {
    direction:
      'incoming',

    occurred_at:
      occurredAt,
  }
}

function sellerMessage(
  occurredAt,
) {
  return {
    direction:
      'outgoing',

    occurred_at:
      occurredAt,
  }
}

// Cenário A: cliente escreveu por último → customer_waiting_for_seller.
test(
  'cliente escreveu por último resulta em customer_waiting_for_seller',
  () => {
    const messages = [
      sellerMessage(
        '2026-08-22T09:00:00.000Z',
      ),

      customerMessage(
        '2026-08-22T10:00:00.000Z',
      ),
    ]

    const waiting =
      computeCompanionClientWaiting({
        messages,

        reference_time:
          REFERENCE_TIME,

        cycle_status:
          'negociacao',
      })

    assert.equal(
      waiting.state,
      'customer_waiting_for_seller',
    )

    assert.equal(
      waiting.waiting_since,
      '2026-08-22T10:00:00.000Z',
    )

    assert.equal(
      waiting.waiting_duration_ms,
      2 *
        60 *
        60 *
        1000,
    )
  },
)

// Cenário B: vendedor escreveu por último → seller_waiting_for_customer.
test(
  'vendedor escreveu por último resulta em seller_waiting_for_customer',
  () => {
    const messages = [
      customerMessage(
        '2026-08-22T09:00:00.000Z',
      ),

      sellerMessage(
        '2026-08-22T11:00:00.000Z',
      ),
    ]

    const waiting =
      computeCompanionClientWaiting({
        messages,

        reference_time:
          REFERENCE_TIME,

        cycle_status:
          'negociacao',
      })

    assert.equal(
      waiting.state,
      'seller_waiting_for_customer',
    )

    assert.equal(
      waiting.waiting_since,
      '2026-08-22T11:00:00.000Z',
    )

    assert.equal(
      waiting.waiting_duration_ms,
      1 *
        60 *
        60 *
        1000,
    )
  },
)

// Cenário C: resposta posterior zera a espera anterior.
test(
  'resposta posterior zera a espera anterior',
  () => {
    const beforeReply =
      computeCompanionClientWaiting({
        messages: [
          customerMessage(
            '2026-08-22T08:00:00.000Z',
          ),
        ],

        reference_time:
          '2026-08-22T09:00:00.000Z',

        cycle_status:
          'negociacao',
      })

    assert.equal(
      beforeReply.state,
      'customer_waiting_for_seller',
    )

    const afterReply =
      computeCompanionClientWaiting({
        messages: [
          customerMessage(
            '2026-08-22T08:00:00.000Z',
          ),

          sellerMessage(
            '2026-08-22T08:30:00.000Z',
          ),
        ],

        reference_time:
          '2026-08-22T09:00:00.000Z',

        cycle_status:
          'negociacao',
      })

    assert.equal(
      afterReply.state,
      'seller_waiting_for_customer',
    )

    assert.equal(
      afterReply.waiting_duration_ms,
      30 *
        60 *
        1000,
    )
  },
)

// Cenário D: timestamps fora de ordem são tratados corretamente.
test(
  'timestamps fora de ordem no array de entrada não afetam o resultado',
  () => {
    const messages = [
      customerMessage(
        '2026-08-22T10:00:00.000Z',
      ),

      sellerMessage(
        '2026-08-22T08:00:00.000Z',
      ),

      customerMessage(
        '2026-08-22T09:00:00.000Z',
      ),
    ]

    const waiting =
      computeCompanionClientWaiting({
        messages,

        reference_time:
          REFERENCE_TIME,

        cycle_status:
          'negociacao',
      })

    // A mensagem cronologicamente mais recente é a do cliente às 10h,
    // mesmo estando na primeira posição do array.
    assert.equal(
      waiting.state,
      'customer_waiting_for_seller',
    )

    assert.equal(
      waiting.waiting_since,
      '2026-08-22T10:00:00.000Z',
    )

    const relationship =
      computeCompanionClientRelationship({
        messages,

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      relationship.first_known_interaction_at,
      '2026-08-22T08:00:00.000Z',
    )

    assert.equal(
      relationship.last_interaction_at,
      '2026-08-22T10:00:00.000Z',
    )
  },
)

// Cenário E: sem mensagens suficientes → unknown.
test(
  'sem nenhuma mensagem, o estado de espera é unknown',
  () => {
    const waiting =
      computeCompanionClientWaiting({
        messages: [],

        reference_time:
          REFERENCE_TIME,

        cycle_status:
          'novo',
      })

    assert.equal(
      waiting.state,
      'unknown',
    )

    assert.equal(
      waiting.waiting_since,
      null,
    )

    assert.equal(
      waiting.waiting_duration_ms,
      null,
    )
  },
)

test(
  'ciclo fechado nunca fica em estado de espera, mesmo com mensagens',
  () => {
    const waiting =
      computeCompanionClientWaiting({
        messages: [
          customerMessage(
            '2026-08-22T08:00:00.000Z',
          ),
        ],

        reference_time:
          REFERENCE_TIME,

        cycle_status:
          'ganho',
      })

    assert.equal(
      waiting.state,
      'no_pending_response',
    )

    assert.equal(
      waiting.waiting_since,
      null,
    )
  },
)

// Cenário F: first interaction correto.
test(
  'first_known_interaction_at reflete a mensagem canônica mais antiga',
  () => {
    const relationship =
      computeCompanionClientRelationship({
        messages: [
          sellerMessage(
            '2026-08-10T12:00:00.000Z',
          ),

          customerMessage(
            '2026-08-04T08:30:00.000Z',
          ),

          customerMessage(
            '2026-08-15T08:30:00.000Z',
          ),
        ],

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      relationship.first_known_interaction_at,
      '2026-08-04T08:30:00.000Z',
    )
  },
)

// Cenário G: relationship age correto.
test(
  'relationship_age_ms é a diferença entre o horário de referência e o primeiro contato',
  () => {
    const relationship =
      computeCompanionClientRelationship({
        messages: [
          customerMessage(
            '2026-08-05T12:00:00.000Z',
          ),
        ],

        reference_time:
          '2026-08-22T12:00:00.000Z',
      })

    const expectedMs =
      17 *
      24 *
      60 *
      60 *
      1000

    assert.equal(
      relationship.relationship_age_ms,
      expectedMs,
    )

    assert.equal(
      relationship.known_interaction_count,
      1,
    )
  },
)

test(
  'sem mensagens, o relacionamento não inventa nenhum campo',
  () => {
    const relationship =
      computeCompanionClientRelationship({
        messages: [],

        reference_time:
          REFERENCE_TIME,
      })

    assert.deepEqual(
      relationship,
      {
        first_known_interaction_at:
          null,

        relationship_age_ms:
          null,

        latest_customer_message_at:
          null,

        latest_seller_message_at:
          null,

        last_interaction_at:
          null,

        known_interaction_count:
          0,
      },
    )
  },
)

test(
  'latest_customer_message_at e latest_seller_message_at são independentes',
  () => {
    const relationship =
      computeCompanionClientRelationship({
        messages: [
          customerMessage(
            '2026-08-20T08:00:00.000Z',
          ),

          sellerMessage(
            '2026-08-21T08:00:00.000Z',
          ),

          customerMessage(
            '2026-08-19T08:00:00.000Z',
          ),
        ],

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      relationship.latest_customer_message_at,
      '2026-08-20T08:00:00.000Z',
    )

    assert.equal(
      relationship.latest_seller_message_at,
      '2026-08-21T08:00:00.000Z',
    )

    assert.equal(
      relationship.last_interaction_at,
      '2026-08-21T08:00:00.000Z',
    )
  },
)
