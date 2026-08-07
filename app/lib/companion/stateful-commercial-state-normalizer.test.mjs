import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  StatefulCommercialStateContractError,
  normalizeStatefulCommercialState,
} from './stateful-commercial-state-normalizer.ts'

const normalizationContext = {
  expected_cycle_id:
    'cycle-1',

  known_message_ids: [
    'm1',
    'm2',
    'm3',
  ],

  active_message_ids: [
    'm2',
    'm3',
  ],
}

function buildValidState() {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      'cycle-1',

    version:
      2,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'Cliente confirmou a demonstração e atualizou o orçamento.',

      evidence_message_ids: [
        'm3',
      ],
    },

    current_priority: {
      summary:
        'Preservar o compromisso e preparar a demonstração.',

      evidence_message_ids: [
        'm3',
      ],
    },

    last_analyzed_message_ids: [
      'm2',
      'm3',
    ],

    last_evidence_message_ids: [
      'm3',
    ],

    facts: [
      {
        id:
          'fact-1',

        kind:
          'declared_budget',

        value:
          'R$ 300 por mês',

        summary:
          'Cliente informou orçamento mensal de R$ 300.',

        confidence:
          'high',

        evidence_message_ids: [
          'm1',
        ],

        memory_status:
          'active',

        created_in_state_version:
          1,

        updated_in_state_version:
          1,

        closed_in_state_version:
          null,
      },
    ],

    needs: [],

    open_loops: [
      {
        id:
          'loop-1',

        kind:
          'price_information',

        summary:
          'A pergunta sobre preço ainda precisa ser respondida.',

        evidence_message_ids: [
          'm2',
        ],

        memory_status:
          'active',

        created_in_state_version:
          2,

        updated_in_state_version:
          2,

        closed_in_state_version:
          null,
      },
    ],

    objections: [],

    commitments: [
      {
        id:
          'commitment-1',

        kind:
          'demonstration',

        summary:
          'Demonstração confirmada para o horário combinado.',

        commitment_status:
          'confirmed',

        scheduled_at:
          '2026-08-06T15:00:00-03:00',

        proposed_at:
          '2026-08-05T20:00:00-03:00',

        evidence_message_ids: [
          'm2',
        ],

        memory_status:
          'active',

        created_in_state_version:
          1,

        updated_in_state_version:
          2,

        closed_in_state_version:
          null,
      },
    ],

    signals: [],
    uncertainties: [],

    created_at:
      '2026-08-05T21:00:00-03:00',

    updated_at:
      '2026-08-05T22:00:00-03:00',
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function expectContractError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCommercialStateContractError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

test(
  'normaliza estado válido preservando evidência histórica conhecida',
  () => {
    const normalized =
      normalizeStatefulCommercialState(
        buildValidState(),
        normalizationContext,
      )

    assert.equal(
      normalized.version,
      2,
    )

    assert.deepEqual(
      normalized
        .facts[0]
        .evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.ok(
      !normalizationContext
        .active_message_ids
        .includes('m1'),
    )
  },
)

test(
  'rejeita estado pertencente a outro ciclo',
  () => {
    const candidate =
      buildValidState()

    candidate.cycle_id =
      'cycle-2'

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'STATE_CYCLE_MISMATCH',
    )
  },
)

test(
  'rejeita mensagem ativa desconhecida pelo ledger',
  () => {
    const context = {
      ...normalizationContext,

      active_message_ids: [
        'm2',
        'm4',
      ],
    }

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          buildValidState(),
          context,
        ),
      'ACTIVE_MESSAGE_NOT_KNOWN',
    )
  },
)

test(
  'estado anterior preserva momento sustentado por evidência histórica conhecida',
  () => {
    const candidate =
      buildValidState()

    candidate.last_analyzed_message_ids = [
      'm1',
    ]

    candidate.last_evidence_message_ids = [
      'm1',
    ]

    candidate
      .current_moment
      .evidence_message_ids = [
        'm1',
      ]

    candidate
      .current_priority
      .evidence_message_ids = [
        'm1',
      ]

    const normalized =
      normalizeStatefulCommercialState(
        candidate,
        normalizationContext,
      )

    assert.deepEqual(
      normalized
        .current_moment
        .evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.ok(
      !normalizationContext
        .active_message_ids
        .includes('m1'),
    )
  },
)

test(
  'momento do estado anterior não pode citar mensagem desconhecida',
  () => {
    const candidate =
      buildValidState()

    candidate
      .current_moment
      .evidence_message_ids = [
        'm9',
      ]

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'UNKNOWN_EVIDENCE',
    )
  },
)

test(
  'rejeita identificador duplicado entre coleções',
  () => {
    const candidate =
      buildValidState()

    candidate.open_loops[0].id =
      'fact-1'

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'DUPLICATE_MEMORY_ID',
    )
  },
)

test(
  'memória ativa não pode possuir versão de encerramento',
  () => {
    const candidate =
      buildValidState()

    candidate
      .facts[0]
      .closed_in_state_version =
        2

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'ACTIVE_MEMORY_CLOSED',
    )
  },
)

test(
  'memória resolvida precisa declarar versão de encerramento',
  () => {
    const candidate =
      buildValidState()

    candidate
      .open_loops[0]
      .memory_status =
        'resolved'

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'CLOSED_MEMORY_WITHOUT_VERSION',
    )
  },
)

test(
  'memória não pode possuir versão superior ao estado',
  () => {
    const candidate =
      buildValidState()

    candidate
      .facts[0]
      .updated_in_state_version =
        3

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'MEMORY_VERSION_AHEAD',
    )
  },
)

test(
  'compromisso terminal precisa possuir memória resolvida',
  () => {
    const candidate =
      buildValidState()

    candidate
      .commitments[0]
      .commitment_status =
        'cancelled'

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'TERMINAL_COMMITMENT_NOT_RESOLVED',
    )
  },
)

test(
  'última evidência precisa pertencer às mensagens analisadas',
  () => {
    const candidate =
      buildValidState()

    candidate.last_analyzed_message_ids = [
      'm2',
    ]

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'LAST_EVIDENCE_NOT_ANALYZED',
    )
  },
)

test(
  'memória histórica não pode citar mensagem desconhecida',
  () => {
    const candidate =
      buildValidState()

    candidate
      .facts[0]
      .evidence_message_ids = [
        'm9',
      ]

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'UNKNOWN_EVIDENCE',
    )
  },
)

test(
  'aceita fotografia atual sem mensagens ativas quando o histórico permanece conhecido',
  () => {
    const context = {
      ...normalizationContext,

      active_message_ids: [],
    }

    const normalized =
      normalizeStatefulCommercialState(
        buildValidState(),
        context,
      )

    assert.equal(
      normalized.version,
      2,
    )

    assert.deepEqual(
      normalized
        .current_moment
        .evidence_message_ids,
      [
        'm3',
      ],
    )
  },
)

test(
  'rejeita cronologia inválida do estado',
  () => {
    const candidate =
      buildValidState()

    candidate.created_at =
      '2026-08-05T23:00:00-03:00'

    expectContractError(
      () =>
        normalizeStatefulCommercialState(
          candidate,
          normalizationContext,
        ),
      'INVALID_STATE_CHRONOLOGY',
    )
  },
)
