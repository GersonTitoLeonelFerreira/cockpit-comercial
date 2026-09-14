import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  createEmptyCommercialReasoningCoreV2MemoryDelta,
} from './commercial-reasoning-core-v2-contract.ts'

import {
  DURABLE_MEMORY_SEED_SUMMARY_PREFIX,
} from './durable-memory-seed.ts'

import {
  reduceCommercialReasoningCoreV2Memory,
} from './commercial-reasoning-core-v2-memory-reducer.ts'

import {
  buildCommercialReasoningCoreV2CommercialReading,
} from './commercial-reasoning-core-v2-commercial-reading-adapter.ts'

function buildPreviousState() {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',

    cycle_id:
      'cycle-a',

    version:
      1,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'Cliente estava em negociação.',

      evidence_message_ids: [
        'm-old',
      ],
    },

    current_priority: {
      summary:
        'Continuar a negociação.',

      evidence_message_ids: [
        'm-old',
      ],
    },

    last_analyzed_message_ids: [
      'm-old',
    ],

    last_evidence_message_ids: [
      'm-old',
    ],

    facts: [
      {
        id:
          'preference-old',

        kind:
          'client.preference',

        value:
          null,

        summary:
          'Prefere contato por texto.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-old',
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
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      '2026-09-13T16:00:00-03:00',

    updated_at:
      '2026-09-13T17:00:00-03:00',
  }
}

function buildInput({
  previousState = null,
} = {}) {
  const messages = [
    {
      id:
        'm1',

      direction:
        'outgoing',

      occurred_at:
        '2026-09-13T18:00:00-03:00',

      observed_at:
        '2026-09-13T18:00:00-03:00',

      content_type:
        'text',

      text_content:
        'Posso seguir com o próximo passo?',

      audio_transcription:
        null,
    },
    {
      id:
        'm2',

      direction:
        'incoming',

      occurred_at:
        '2026-09-13T18:01:00-03:00',

      observed_at:
        '2026-09-13T18:01:00-03:00',

      content_type:
        'text',

      text_content:
        'Sim. Prefiro receber uma resposta objetiva e pode seguir.',

      audio_transcription:
        null,
    },
  ]

  return {
    input_version:
      'phase-5.1-stateful-input-v1',

    output_contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    diagnostic_input: {
      input_version:
        'phase-4-input-v3',

      diagnostic_contract_version:
        'phase-4-diagnostic-v3',

      company_id:
        'company-a',

      cycle_id:
        'cycle-a',

      conversation_key:
        'conversation-a',

      current_crm_status:
        'negociacao',

      reference_time:
        '2026-09-13T18:10:00-03:00',

      analysis_precondition: {
        status:
          'ready',

        limitations:
          [],
      },

      conversation: {
        active_message_ids: [
          'm1',
          'm2',
        ],

        excluded_message_ids:
          [],

        messages,

        excluded_messages:
          [],
      },

      commercial_context: {
        products:
          [],

        communication_tone:
          null,

        required_behaviors:
          [],

        prohibited_behaviors:
          [],

        sales_method: {
          configured:
            false,

          contract_version:
            null,

          name:
            null,

          description:
            null,

          principles:
            [],

          definition:
            null,

          steps:
            [],
        },
      },
    },

    state_context:
      previousState
        ? {
            mode:
              'continuation',

            previous_state_version:
              previousState.version,

            target_state_version:
              previousState.version +
              1,

            previous_state:
              previousState,
          }
        : {
            mode:
              'initial',

            previous_state_version:
              null,

            target_state_version:
              1,

            previous_state:
              null,
          },
  }
}

function buildOutput({
  relevance = 'commercial',
  action = 'confirm_next_step',
} = {}) {
  return {
    contract_version:
      'commercial-reasoning-core-v2',

    status:
      'ready',

    commercial_role:
      'buyer',

    commercial_relevance:
      relevance,

    situation: {
      summary:
        relevance ===
          'commercial'
          ? 'O cliente confirmou que deseja avançar.'
          : 'A mensagem atual não exige ação comercial.',

      customer_intent:
        relevance ===
          'commercial'
          ? 'Avançar.'
          : null,

      commercial_stage:
        relevance ===
          'commercial'
          ? 'negociacao'
          : null,

      confidence:
        'high',

      evidence_message_ids: [
        'm2',
      ],
    },

    responsibility: {
      waiting_on:
        relevance ===
          'commercial'
          ? 'seller'
          : 'none',

      summary:
        relevance ===
          'commercial'
          ? 'O vendedor deve avançar.'
          : 'Nenhuma ação comercial necessária.',

      evidence_message_ids: [
        'm2',
      ],
    },

    decision: {
      action,

      objective:
        relevance ===
          'commercial'
          ? 'Dar continuidade ao próximo passo.'
          : 'Não realizar intervenção comercial.',

      reason:
        'A mensagem atual define a conduta recomendada.',

      evidence_message_ids: [
        'm2',
      ],
    },

    coaching: {
      strengths:
        [],

      improvement_points:
        [],
    },

    method: {
      configured:
        false,

      name:
        null,

      current_stage:
        null,

      adherence:
        'not_configured',

      deviation:
        null,

      recovery_move:
        null,

      evidence_message_ids:
        [],
    },

    technique: {
      name:
        null,

      why_applicable:
        null,

      do_not_do:
        [],
    },

    communication: {
      intervention_needed:
        relevance ===
        'commercial',

      recommended_question:
        null,

      suggested_message:
        relevance ===
          'commercial'
          ? 'Perfeito. Vou seguir com o próximo passo.'
          : null,
    },

    memory_delta:
      createEmptyCommercialReasoningCoreV2MemoryDelta(),

    factuality: {
      facts_used: [
        {
          summary:
            'O cliente respondeu à mensagem atual.',

          evidence_message_ids: [
            'm2',
          ],
        },
      ],

      unknowns:
        [],
    },

    evidence_message_ids: [
      'm1',
      'm2',
    ],
  }
}

function createMemoryId({
  collection,
  state_version,
  item_index,
}) {
  return (
    `memory-${collection}-` +
    `${state_version}-${item_index}`
  )
}

function reduce({
  input,
  output,
  durableMemorySeed = null,
}) {
  return reduceCommercialReasoningCoreV2Memory({
    input,
    output,

    applied_at:
      '2026-09-13T18:10:00-03:00',

    create_memory_id:
      createMemoryId,

    durable_memory_seed:
      durableMemorySeed,
  })
}

test(
  'Commercial Reading usa memória criada pelo Core V2 no mesmo ciclo',
  () => {
    const input =
      buildInput()

    const output =
      buildOutput()

    output
      .memory_delta
      .facts_to_add
      .push({
        kind:
          'client.preference',

        value:
          null,

        summary:
          'Prefere receber respostas objetivas.',

        confidence:
          'high',

        evidence_message_ids: [
          'm2',
        ],
      })

    const memoryReduction =
      reduce({
        input,
        output,
      })

    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input,
        output,

        memory_reduction:
          memoryReduction,
      })

    assert.equal(
      memoryReduction
        .state
        .version,
      1,
    )

    assert.equal(
      result
        .report
        .customer_memory_mode,
      'reduced_state_applied',
    )

    assert.equal(
      result
        .report
        .writes_new_customer_memory,
      true,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences
        .length,
      1,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences[0]
        .summary,
      'Prefere receber respostas objetivas.',
    )

    assert.deepEqual(
      result
        .reading
        .customer
        .preferences[0]
        .memory_ids,
      [
        'memory-facts-1-1',
      ],
    )
  },
)

test(
  'Commercial Reading usa estado reduzido preservado sem declarar escrita quando patch está vazio',
  () => {
    const previousState =
      buildPreviousState()

    const input =
      buildInput({
        previousState,
      })

    const output =
      buildOutput({
        relevance:
          'non_commercial',

        action:
          'no_intervention',
      })

    const memoryReduction =
      reduce({
        input,
        output,
      })

    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input,
        output,

        memory_reduction:
          memoryReduction,
      })

    assert.equal(
      memoryReduction
        .preserved_previous_commercial_state,
      true,
    )

    assert.equal(
      result
        .report
        .customer_memory_mode,
      'reduced_state_applied',
    )

    assert.equal(
      result
        .report
        .writes_new_customer_memory,
      false,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences
        .length,
      1,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences[0]
        .summary,
      'Prefere contato por texto.',
    )

    assert.deepEqual(
      result
        .reading
        .customer
        .preferences[0]
        .memory_ids,
      [
        'preference-old',
      ],
    )
  },
)


test(
  'Commercial Reading expõe memória durável herdada no primeiro ciclo reduzido',
  () => {
    const input =
      buildInput()

    const output =
      buildOutput()

    const memoryReduction =
      reduce({
        input,
        output,

        durableMemorySeed: {
          source_cycle_id:
            'cycle-prior',

          facts: [
            {
              kind:
                'client.preference',

              value:
                null,

              summary:
                `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}Prefere contato por texto.`,

              confidence:
                'medium',
            },
          ],

          objections:
            [],
        },
      })

    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input,
        output,

        memory_reduction:
          memoryReduction,
      })

    assert.equal(
      memoryReduction
        .durable_memory_seed_applied,
      true,
    )

    assert.equal(
      result
        .report
        .writes_new_customer_memory,
      true,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences
        .length,
      1,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences[0]
        .summary,
      `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}Prefere contato por texto.`,
    )

    assert.deepEqual(
      result
        .reading
        .customer
        .preferences[0]
        .memory_ids,
      [
        'memory-facts-1-1000000',
      ],
    )
  },
)
