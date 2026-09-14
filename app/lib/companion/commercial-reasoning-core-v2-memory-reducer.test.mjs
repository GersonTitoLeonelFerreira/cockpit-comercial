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

function message({
  id = 'm-current',
  direction = 'incoming',
  contentType = 'text',
  text = 'Quero continuar com a contratação.',
  transcription = null,
  occurredAt =
    '2026-09-13T18:00:00-03:00',
} = {}) {
  return {
    id,
    direction,

    occurred_at:
      occurredAt,

    observed_at:
      occurredAt,

    content_type:
      contentType,

    text_content:
      text,

    audio_transcription:
      transcription,
  }
}

function memoryBase({
  id,
  kind,
  summary,
  status = 'active',
  evidence = ['m-old'],
  createdVersion = 1,
  updatedVersion = 1,
  closedVersion = null,
}) {
  return {
    id,
    kind,
    summary,

    evidence_message_ids:
      evidence,

    memory_status:
      status,

    created_in_state_version:
      createdVersion,

    updated_in_state_version:
      updatedVersion,

    closed_in_state_version:
      closedVersion,
  }
}

function buildPreviousState({
  withCommitment = false,
} = {}) {
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
        'Cliente está avaliando a contratação.',

      evidence_message_ids: [
        'm-old',
      ],
    },

    current_priority: {
      summary:
        'Avançar sem perder o contexto já obtido.',

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
        ...memoryBase({
          id:
            'preference-1',

          kind:
            'client.preference',

          summary:
            'Prefere atendimento objetivo.',
        }),

        value:
          null,

        confidence:
          'high',
      },
    ],

    needs: [
      {
        ...memoryBase({
          id:
            'need-1',

          kind:
            'workflow',

          summary:
            'Precisa organizar o acompanhamento.',
        }),

        confidence:
          'high',
      },
    ],

    open_loops: [],

    objections: [],

    commitments:
      withCommitment
        ? [
            {
              ...memoryBase({
                id:
                  'commitment-1',

                kind:
                  'follow_up',

                summary:
                  'Confirmar o próximo passo.',
              }),

              commitment_status:
                'proposed',

              scheduled_at:
                null,

              proposed_at:
                '2026-09-13T17:00:00-03:00',
            },
          ]
        : [],

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
  messages = [
    message(),
  ],
  products = [
    {
      product_id:
        'product-yolen',

      name:
        'Yolen',
    },
  ],
} = {}) {
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
        active_message_ids:
          messages.map(
            item =>
              item.id,
          ),

        excluded_message_ids:
          [],

        messages,

        excluded_messages:
          [],
      },

      commercial_context: {
        products,

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
  role = 'buyer',
  relevance = 'commercial',
  action = 'confirm_next_step',
} = {}) {
  return {
    contract_version:
      'commercial-reasoning-core-v2',

    status:
      'ready',

    commercial_role:
      role,

    commercial_relevance:
      relevance,

    situation: {
      summary:
        'O cliente trouxe informação comercial atual.',

      customer_intent:
        role === 'buyer'
          ? 'Avançar na contratação.'
          : null,

      commercial_stage:
        'negociacao',

      confidence:
        'high',

      evidence_message_ids: [
        'm-current',
      ],
    },

    responsibility: {
      waiting_on:
        role === 'buyer'
          ? 'seller'
          : 'none',

      summary:
        'O próximo passo está definido.',

      evidence_message_ids: [
        'm-current',
      ],
    },

    decision: {
      action,

      objective:
        role === 'buyer'
          ? 'Dar continuidade ao próximo passo comercial.'
          : 'Não realizar ação comercial.',

      reason:
        'A situação atual está suficientemente clara.',

      evidence_message_ids: [
        'm-current',
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
        role === 'buyer' &&
        relevance ===
          'commercial',

      recommended_question:
        null,

      suggested_message:
        null,
    },

    memory_delta:
      createEmptyCommercialReasoningCoreV2MemoryDelta(),

    factuality: {
      facts_used:
        [],

      unknowns:
        [],
    },

    evidence_message_ids: [
      'm-current',
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
  'reducer V2 cria memória de cliente sustentada por mensagem incoming atual',
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
          'Prefere receber uma resposta objetiva.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    const result =
      reduce({
        input,
        output,
      })

    assert.equal(
      result.state.version,
      1,
    )

    assert.equal(
      result
        .state
        .facts
        .length,
      1,
    )

    assert.equal(
      result
        .state
        .facts[0]
        .kind,
      'client.preference',
    )

    assert.equal(
      result
        .state
        .facts[0]
        .id,
      'memory-facts-1-1',
    )

    assert.equal(
      result
        .preserved_previous_commercial_state,
      false,
    )
  },
)

test(
  'reducer V2 rejeita inteligência de cliente sustentada apenas por mensagem outgoing',
  () => {
    const input =
      buildInput({
        messages: [
          message({
            direction:
              'outgoing',
          }),
        ],
      })

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
          'Prefere uma determinada abordagem.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    assert.throws(
      () =>
        reduce({
          input,
          output,
        }),

      error => {
        assert.equal(
          error.code,
          'CUSTOMER_EVIDENCE_REQUIRED',
        )

        return true
      },
    )
  },
)

test(
  'reducer V2 rejeita fechamento de memória inexistente ou inativa',
  () => {
    const previousState =
      buildPreviousState()

    const input =
      buildInput({
        previousState,
      })

    const output =
      buildOutput()

    output
      .memory_delta
      .need_ids_to_resolve
      .push(
        'need-inexistente',
      )

    assert.throws(
      () =>
        reduce({
          input,
          output,
        }),

      error => {
        assert.equal(
          error.code,
          'INACTIVE_MEMORY_REFERENCE',
        )

        return true
      },
    )
  },
)

test(
  'reducer V2 rejeita memory delta em sessão provider mesmo se comercial',
  () => {
    const input =
      buildInput()

    const output =
      buildOutput({
        role:
          'provider',

        relevance:
          'commercial',

        action:
          'no_intervention',
      })

    output
      .memory_delta
      .facts_to_add
      .push({
        kind:
          'client.preference',

        value:
          null,

        summary:
          'Memória indevida de fornecedor.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    assert.throws(
      () =>
        reduce({
          input,
          output,
        }),

      error => {
        assert.equal(
          error.code,
          'NON_ACTIONABLE_MEMORY_DELTA',
        )

        return true
      },
    )
  },
)

test(
  'reducer V2 rejeita áudio sem transcrição como evidência de memória',
  () => {
    const input =
      buildInput({
        messages: [
          message({
            contentType:
              'audio',

            text:
              null,

            transcription:
              null,
          }),
        ],
      })

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
          'Preferência que não pode ser inferida do áudio pendente.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    assert.throws(
      () =>
        reduce({
          input,
          output,
        }),

      error => {
        assert.equal(
          error.code,
          'AUDIO_EVIDENCE_NOT_TRANSCRIBED',
        )

        return true
      },
    )
  },
)

test(
  'sessão não comercial preserva memória comercial anterior e avança bookkeeping',
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

    const result =
      reduce({
        input,
        output,
      })

    assert.equal(
      result.state.version,
      2,
    )

    assert.equal(
      result
        .preserved_previous_commercial_state,
      true,
    )

    assert.equal(
      result
        .state
        .current_moment
        .summary,
      previousState
        .current_moment
        .summary,
    )

    assert.equal(
      result
        .state
        .current_priority
        .summary,
      previousState
        .current_priority
        .summary,
    )

    assert.deepEqual(
      result
        .state
        .last_evidence_message_ids,
      [
        'm-old',
      ],
    )

    assert.ok(
      result
        .state
        .last_analyzed_message_ids
        .includes(
          'm-current',
        ),
    )

    assert.equal(
      result
        .state
        .facts[0]
        .id,
      'preference-1',
    )

    assert.equal(
      result
        .state
        .needs[0]
        .id,
      'need-1',
    )
  },
)

test(
  'reducer V2 atualiza compromisso ativo sem recriar memória',
  () => {
    const previousState =
      buildPreviousState({
        withCommitment:
          true,
      })

    const input =
      buildInput({
        previousState,
      })

    const output =
      buildOutput()

    output
      .memory_delta
      .commitments_to_upsert
      .push({
        commitment_id:
          'commitment-1',

        kind:
          'follow_up',

        status:
          'confirmed',

        scheduled_at:
          '2026-09-14T10:00:00-03:00',

        proposed_at:
          null,

        summary:
          'Próximo passo confirmado.',

        evidence_message_ids: [
          'm-current',
        ],
      })

    const result =
      reduce({
        input,
        output,
      })

    assert.equal(
      result
        .state
        .commitments
        .length,
      1,
    )

    assert.equal(
      result
        .state
        .commitments[0]
        .id,
      'commitment-1',
    )

    assert.equal(
      result
        .state
        .commitments[0]
        .commitment_status,
      'confirmed',
    )

    assert.equal(
      result
        .state
        .commitments[0]
        .scheduled_at,
      '2026-09-14T10:00:00-03:00',
    )

    assert.ok(
      result
        .state
        .commitments[0]
        .evidence_message_ids
        .includes(
          'm-current',
        ),
    )
  },
)

test(
  'reducer V2 preserva distinção entre objetivo e necessidade',
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
          'client.objective',

        value:
          null,

        summary:
          'Organizar o follow-up.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    output
      .memory_delta
      .needs_to_add
      .push({
        kind:
          'workflow',

        summary:
          'Organizar o follow-up.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    assert.throws(
      () =>
        reduce({
          input,
          output,
        }),

      error => {
        assert.equal(
          error.code,
          'CLIENT_CONCEPT_DUPLICATION',
        )

        return true
      },
    )
  },
)

test(
  'reducer V2 rejeita product_id canônico inexistente',
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
          'client.product.catalog.interested',

        value:
          'product-inexistente',

        summary:
          'Demonstrou interesse em produto não existente no catálogo.',

        confidence:
          'high',

        evidence_message_ids: [
          'm-current',
        ],
      })

    assert.throws(
      () =>
        reduce({
          input,
          output,
        }),

      error => {
        assert.equal(
          error.code,
          'UNKNOWN_CANONICAL_PRODUCT',
        )

        return true
      },
    )
  },
)


test(
  'reducer V2 aplica memória durável somente ao primeiro estado do novo ciclo',
  () => {
    const input =
      buildInput()

    const output =
      buildOutput()

    const result =
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
                `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}Prefere contato objetivo.`,

              confidence:
                'medium',
            },
          ],

          objections: [
            {
              kind:
                'price',

              summary:
                `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}Já apresentou objeção de preço.`,

              confidence:
                'medium',
            },
          ],
        },
      })

    assert.equal(
      result
        .durable_memory_seed_applied,
      true,
    )

    assert.equal(
      result
        .state
        .facts
        .length,
      1,
    )

    assert.equal(
      result
        .state
        .facts[0]
        .id,
      'memory-facts-1-1000000',
    )

    assert.equal(
      result
        .state
        .facts[0]
        .summary,
      `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}Prefere contato objetivo.`,
    )

    assert.deepEqual(
      result
        .state
        .facts[0]
        .evidence_message_ids,
      [],
    )

    assert.equal(
      result
        .state
        .objections
        .length,
      1,
    )

    assert.equal(
      result
        .state
        .objections[0]
        .id,
      'memory-objections-1-1000000',
    )
  },
)


test(
  'reducer V2 não reaplica memória durável quando o ciclo já possui estado',
  () => {
    const previousState =
      buildPreviousState()

    const input =
      buildInput({
        previousState,
      })

    const output =
      buildOutput()

    const result =
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
                `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}Memória que não pode ser reaplicada.`,

              confidence:
                'medium',
            },
          ],

          objections:
            [],
        },
      })

    assert.equal(
      result
        .durable_memory_seed_applied,
      false,
    )

    assert.equal(
      result
        .state
        .facts
        .length,
      previousState
        .facts
        .length,
    )

    assert.equal(
      result
        .state
        .facts
        .some(
          fact =>
            fact.summary.includes(
              'Memória que não pode ser reaplicada.',
            ),
        ),
      false,
    )
  },
)
