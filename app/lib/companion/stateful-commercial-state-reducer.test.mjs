import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  normalizeStatefulCopilotOutput,
} from './stateful-copilot-normalizer.ts'

import {
  StatefulCommercialStateReductionError,
  reduceStatefulCommercialState,
} from './stateful-commercial-state-reducer.ts'

function emptyPatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],

    needs_to_add: [],
    need_ids_to_resolve: [],

    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],

    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],

    commitments_to_upsert: [],

    signals_to_add: [],
    signal_ids_to_resolve: [],

    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
  }
}

function buildOutput({
  previousStateVersion = null,
  analyzedMessageIds = [
    'm1',
  ],
  evidenceMessageIds =
    analyzedMessageIds,
  patch = emptyPatch(),
  currentMoment =
    'Cliente está avaliando a solução.',
  memoryIds = [],
  nextMove =
    'Conduzir o próximo passo de forma consultiva.',
} = {}) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      previousStateVersion,

    analyzed_message_ids:
      analyzedMessageIds,

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',

    interpretation: {
      what_changed: {
        summary:
          currentMoment,

        evidence_message_ids:
          evidenceMessageIds,
      },

      what_remains_valid: [],

      current_moment: {
        summary:
          currentMoment,

        evidence_message_ids:
          evidenceMessageIds,

        memory_ids:
          memoryIds,
      },

      customer_need:
        null,

      uncertainties: [],
    },

    state_patch:
      patch,

    strategy: {
      method_application:
        'Aplicar o método comercial configurado.',

      rationale:
        'A estratégia considera o estado acumulado e as mensagens novas.',

      next_move:
        nextMove,

      recommended_question:
        null,

      suggested_message:
        null,

      evidence_message_ids:
        evidenceMessageIds,

      memory_ids:
        memoryIds,
    },

    operational_suggestions: {
      crm: {
        should_change_crm_stage:
          false,

        recommended_status:
          null,

        rationale:
          null,

        requires_human_confirmation:
          true,
      },

      agenda: {
        should_change_agenda:
          false,

        expected_next_action_at:
          null,

        rationale:
          null,

        requires_human_confirmation:
          true,
      },
    },

    evidence_message_ids:
      evidenceMessageIds,

    memory_ids:
      memoryIds,
  }
}

function buildInitialOutput() {
  const patch =
    emptyPatch()

  patch.facts_to_add = [
    {
      kind:
        'declared_budget',

      value:
        'R$ 300 por mês',

      summary:
        'Cliente informou orçamento mensal de R$ 300.',

      confidence:
        'high',

      evidence_message_ids: [
        'm2',
      ],
    },
  ]

  patch.open_loops_to_add = [
    {
      kind:
        'price_information',

      summary:
        'A pergunta sobre o preço permanece pendente.',

      evidence_message_ids: [
        'm2',
      ],
    },
  ]

  patch.commitments_to_upsert = [
    {
      commitment_id:
        null,

      kind:
        'demonstration',

      status:
        'proposed',

      scheduled_at:
        '2026-08-06T15:00:00-03:00',

      proposed_at:
        '2026-08-05T20:00:00-03:00',

      summary:
        'Demonstração proposta para quinta-feira às 15h.',

      evidence_message_ids: [
        'm1',
      ],
    },
  ]

  patch.signals_to_add = [
    {
      kind:
        'possible_price_sensitivity',

      summary:
        'O orçamento pode influenciar a decisão.',

      confidence:
        'medium',

      evidence_message_ids: [
        'm2',
      ],
    },
  ]

  patch.uncertainties_to_add = [
    {
      kind:
        'budget_not_definitive_objection',

      summary:
        'O orçamento ainda não comprova objeção definitiva.',

      confidence:
        'medium',

      evidence_message_ids: [
        'm2',
      ],
    },
  ]

  return buildOutput({
    analyzedMessageIds: [
      'm1',
      'm2',
    ],

    evidenceMessageIds: [
      'm1',
      'm2',
    ],

    patch,

    currentMoment:
      'Cliente mantém interesse, possui demonstração proposta e informou orçamento.',

    nextMove:
      'Conduzir preço e demonstração de forma integrada.',
  })
}

function buildSecondOutput() {
  const patch =
    emptyPatch()

  patch.fact_ids_to_supersede = [
    'facts-1-1',
  ]

  patch.facts_to_add = [
    {
      kind:
        'declared_budget',

      value:
        'R$ 350 por mês',

      summary:
        'Cliente atualizou o orçamento mensal para R$ 350.',

      confidence:
        'high',

      evidence_message_ids: [
        'm3',
      ],
    },
  ]

  patch.open_loop_ids_to_resolve = [
    'open_loops-1-1',
  ]

  patch.commitments_to_upsert = [
    {
      commitment_id:
        'commitments-1-1',

      kind:
        'demonstration',

      status:
        'confirmed',

      scheduled_at:
        null,

      proposed_at:
        null,

      summary:
        'Cliente confirmou a demonstração no horário proposto.',

      evidence_message_ids: [
        'm3',
      ],
    },
  ]

  return buildOutput({
    previousStateVersion:
      1,

    analyzedMessageIds: [
      'm3',
    ],

    evidenceMessageIds: [
      'm3',
    ],

    memoryIds: [
      'facts-1-1',
      'open_loops-1-1',
      'commitments-1-1',
    ],

    patch,

    currentMoment:
      'Cliente confirmou a demonstração e atualizou o orçamento.',

    nextMove:
      'Preservar o compromisso e preparar a demonstração.',
  })
}

function createMemoryId({
  collection,
  state_version,
  item_index,
}) {
  return [
    collection,
    state_version,
    item_index,
  ].join('-')
}

function reduceInitialState() {
  return reduceStatefulCommercialState({
    previous_state:
      null,

    output:
      buildInitialOutput(),

    cycle_id:
      'cycle-1',

    applied_at:
      '2026-08-05T21:00:00-03:00',

    create_memory_id:
      createMemoryId,
  })
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function expectReductionError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCommercialStateReductionError,
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
  'fixtures do redutor respeitam o contrato stateful v3',
  () => {
    const initialOutput =
      buildInitialOutput()

    const normalizedInitialOutput =
      normalizeStatefulCopilotOutput(
        initialOutput,
        {
          available_message_ids: [
            'm1',
            'm2',
          ],

          customer_message_ids: [
            'm1',
            'm2',
          ],

          available_products: [],
          previous_communication_observations: [],

          available_memory_ids: [],
          active_memory_ids: [],

          expected_previous_state_version:
            null,

          current_crm_status:
            'respondeu',

          prohibited_statuses: [
            'ganho',
            'perdido',
          ],

          reference_time:
            '2026-08-05T21:00:00-03:00',
        },
      )

    assert.deepEqual(
      normalizedInitialOutput,
      initialOutput,
    )

    const secondOutput =
      buildSecondOutput()

    const normalizedSecondOutput =
      normalizeStatefulCopilotOutput(
        secondOutput,
        {
          available_message_ids: [
            'm3',
          ],

          customer_message_ids: [
            'm3',
          ],

          available_products: [],
          previous_communication_observations: [],

          available_memory_ids: [
            'facts-1-1',
            'open_loops-1-1',
            'commitments-1-1',
            'signals-1-1',
            'uncertainties-1-1',
          ],

          active_memory_ids: [
            'facts-1-1',
            'open_loops-1-1',
            'commitments-1-1',
            'signals-1-1',
            'uncertainties-1-1',
          ],

          expected_previous_state_version:
            1,

          current_crm_status:
            'negociacao',

          prohibited_statuses: [
            'ganho',
            'perdido',
          ],

          reference_time:
            '2026-08-05T22:00:00-03:00',
        },
      )

    assert.deepEqual(
      normalizedSecondOutput,
      secondOutput,
    )
  },
)

test(
  'cria a primeira versão preservando verdades simultâneas',
  () => {
    const state =
      reduceInitialState()

    assert.equal(
      state.version,
      1,
    )

    assert.equal(
      state.facts[0].id,
      'facts-1-1',
    )

    assert.equal(
      state.open_loops[0].memory_status,
      'active',
    )

    assert.equal(
      state.commitments[0].commitment_status,
      'proposed',
    )

    assert.equal(
      state.signals[0].memory_status,
      'active',
    )

    assert.equal(
      state.uncertainties[0].memory_status,
      'active',
    )

    assert.equal(
      state.created_at,
      '2026-08-05T21:00:00-03:00',
    )

    assert.equal(
      state.updated_at,
      state.created_at,
    )
  },
)

test(
  'aplica nova versão sem apagar o histórico e sem modificar o estado anterior',
  () => {
    const previousState =
      reduceInitialState()

    const original =
      clone(previousState)

    const nextState =
      reduceStatefulCommercialState({
        previous_state:
          previousState,

        output:
          buildSecondOutput(),

        cycle_id:
          'cycle-1',

        applied_at:
          '2026-08-05T22:00:00-03:00',

        create_memory_id:
          createMemoryId,
      })

    assert.deepEqual(
      previousState,
      original,
    )

    assert.equal(
      nextState.version,
      2,
    )

    assert.equal(
      nextState.facts[0].memory_status,
      'superseded',
    )

    assert.equal(
      nextState.facts[0].closed_in_state_version,
      2,
    )

    assert.equal(
      nextState.facts[1].id,
      'facts-2-1',
    )

    assert.equal(
      nextState.facts[1].memory_status,
      'active',
    )

    assert.equal(
      nextState.open_loops[0].memory_status,
      'resolved',
    )

    assert.equal(
      nextState.commitments[0].commitment_status,
      'confirmed',
    )

    assert.deepEqual(
      nextState
        .commitments[0]
        .evidence_message_ids,
      [
        'm1',
        'm3',
      ],
    )

    assert.equal(
      nextState.created_at,
      previousState.created_at,
    )

    assert.equal(
      nextState.updated_at,
      '2026-08-05T22:00:00-03:00',
    )
  },
)

test(
  'rejeita patch produzido para versão antiga',
  () => {
    const previousState =
      reduceInitialState()

    const output =
      buildSecondOutput()

    output.previous_state_version =
      9

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output,

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-05T22:00:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'STALE_STATE_VERSION',
    )
  },
)

test(
  'rejeita resolução de memória inexistente',
  () => {
    const previousState =
      reduceInitialState()

    const patch =
      emptyPatch()

    patch.open_loop_ids_to_resolve = [
      'open-loop-inexistente',
    ]

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output:
            buildOutput({
              previousStateVersion:
                1,

              patch,
            }),

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-05T22:00:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'UNKNOWN_MEMORY_ID',
    )
  },
)

test(
  'rejeita nova resolução de item já encerrado',
  () => {
    const firstState =
      reduceInitialState()

    const secondState =
      reduceStatefulCommercialState({
        previous_state:
          firstState,

        output:
          buildSecondOutput(),

        cycle_id:
          'cycle-1',

        applied_at:
          '2026-08-05T22:00:00-03:00',

        create_memory_id:
          createMemoryId,
      })

    const patch =
      emptyPatch()

    patch.open_loop_ids_to_resolve = [
      'open_loops-1-1',
    ]

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            secondState,

          output:
            buildOutput({
              previousStateVersion:
                2,

              patch,
            }),

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-05T23:00:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'MEMORY_ALREADY_CLOSED',
    )
  },
)

test(
  'rejeita identificador de memória duplicado',
  () => {
    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            null,

          output:
            buildInitialOutput(),

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-05T21:00:00-03:00',

          create_memory_id:
            () =>
              'identificador-repetido',
        }),
      'DUPLICATE_MEMORY_ID',
    )
  },
)

test(
  'rejeita estado pertencente a outro ciclo',
  () => {
    const previousState =
      reduceInitialState()

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output:
            buildSecondOutput(),

          cycle_id:
            'cycle-2',

          applied_at:
            '2026-08-05T22:00:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'STATE_CYCLE_MISMATCH',
    )
  },
)

test(
  'rejeita estado anterior com cronologia inválida',
  () => {
    const previousState =
      reduceInitialState()

    previousState.created_at =
      '2026-08-05T23:00:00-03:00'

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output:
            buildSecondOutput(),

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-06T00:00:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'INVALID_STATE_CHRONOLOGY',
    )
  },
)

test(
  'rejeita aplicação anterior à atualização do estado',
  () => {
    const previousState =
      reduceInitialState()

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output:
            buildSecondOutput(),

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-05T20:59:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'APPLIED_AT_BEFORE_STATE',
    )
  },
)

test(
  'compromisso existente não pode mudar de tipo',
  () => {
    const previousState =
      reduceInitialState()

    const patch =
      emptyPatch()

    patch.commitments_to_upsert = [
      {
        commitment_id:
          'commitments-1-1',

        kind:
          'phone_call',

        status:
          'confirmed',

        scheduled_at:
          null,

        proposed_at:
          null,

        summary:
          'Tentativa de transformar demonstração em ligação.',

        evidence_message_ids: [
          'm3',
        ],
      },
    ]

    expectReductionError(
      () =>
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output:
            buildOutput({
              previousStateVersion:
                1,

              analyzedMessageIds: [
                'm3',
              ],

              evidenceMessageIds: [
                'm3',
              ],

              patch,
            }),

          cycle_id:
            'cycle-1',

          applied_at:
            '2026-08-05T22:00:00-03:00',

          create_memory_id:
            createMemoryId,
        }),
      'COMMITMENT_KIND_MISMATCH',
    )
  },
)
