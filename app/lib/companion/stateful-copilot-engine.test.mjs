import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract.ts'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
} from './diagnostic-input.ts'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  StatefulCommercialStateReductionError,
} from './stateful-commercial-state-reducer.ts'

import {
  runStatefulCopilotEngine,
} from './stateful-copilot-engine.ts'

import {
  buildDurableMemorySeedFromPriorState,
} from './durable-memory-seed.ts'

function emptyPatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],

    needs_to_add: [],
    need_ids_to_resolve: [],
    need_ids_to_supersede: [],

    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],
    open_loop_ids_to_supersede: [],

    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],

    commitments_to_upsert: [],

    signals_to_add: [],
    signal_ids_to_resolve: [],

    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
    uncertainty_ids_to_supersede: [],
  }
}

function buildDiagnosticInput({
  messageId = 'm1',
  messageText = 'Tenho interesse em conhecer a solução.',
  referenceTime =
    '2026-08-06T15:00:00-03:00',
  status = 'ready',
  limitations = [],
} = {}) {
  return {
    input_version:
      COMPANION_DIAGNOSTIC_INPUT_VERSION,

    diagnostic_contract_version:
      COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

    company_id:
      'company-1',

    cycle_id:
      'cycle-1',

    conversation_key:
      'conversation-1',

    current_crm_status:
      'respondeu',

    reference_time:
      referenceTime,

    analysis_precondition: {
      status,
      limitations,
    },

    conversation: {
      active_message_ids: [
        messageId,
      ],

      excluded_message_ids: [],

      messages: [
        {
          id:
            messageId,

          message_key:
            `message-${messageId}`,

          version:
            1,

          sequence:
            1,

          direction:
            'incoming',

          occurred_at:
            referenceTime,

          observed_at:
            referenceTime,

          content_type:
            'text',

          text_content:
            messageText,

          audio_transcription:
            null,
        },
      ],

      excluded_messages: [],
    },

    commercial_context: {
      configured:
        false,

      config_version_id:
        null,

      config_version_number:
        null,

      config_contract_version:
        null,

      business_description:
        null,

      target_audience:
        null,

      value_proposition:
        null,

      communication_tone:
        null,

      required_behaviors: [],
      prohibited_behaviors: [],

      sales_method: {
        configured:
          false,

        name:
          null,

        description:
          null,

        steps: [],
      },

      products: [],
      facts: [],
      objection_guides: [],
    },
  }
}

function buildOutput({
  previousStateVersion = null,
  messageId = 'm1',
  addFact = false,
  commercialRelevance = 'commercial',
} = {}) {
  const patch =
    emptyPatch()

  if (addFact) {
    patch.facts_to_add = [
      {
        kind:
          'client.interest',

        value:
          null,

        summary:
          'O cliente declarou interesse em conhecer a solução.',

        confidence:
          'high',

        evidence_message_ids: [
          messageId,
        ],
      },
    ]
  }

  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      previousStateVersion,

    analyzed_message_ids: [
      messageId,
    ],

    commercial_role:
      'buyer',

    commercial_relevance:
      commercialRelevance,

    interpretation: {
      what_changed: {
        summary:
          'O cliente apresentou uma nova informação comercial.',

        evidence_message_ids: [
          messageId,
        ],
      },

      what_remains_valid: [],

      current_moment: {
        summary:
          'O cliente está avaliando a solução.',

        evidence_message_ids: [
          messageId,
        ],

        memory_ids: [],
      },

      customer_need:
        null,

      uncertainties: [],
    },

    state_patch:
      patch,

    strategy: {
      method_application:
        'Conduzir a conversa conforme o contexto disponível.',

      rationale:
        'A estratégia considera somente a mensagem atual comprovada.',

      next_move:
        'Compreender melhor o objetivo do cliente.',

      recommended_question:
        'Qual resultado você pretende alcançar?',

      suggested_message:
        'Para eu te orientar melhor, qual resultado você pretende alcançar?',

      evidence_message_ids: [
        messageId,
      ],

      memory_ids: [],
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

    evidence_message_ids: [
      messageId,
    ],

    memory_ids: [],
  }
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

function buildCommunicationOutput(
  messageId = 'm1',
) {
  const recommendedQuestion =
    'Você prefere que eu retome o contato amanhã?'

  const suggestedMessage =
    'Claro. Você prefere que eu retome o contato amanhã?'

  return {
    intervention_needed:
      true,

    recommended_question:
      recommendedQuestion,

    suggested_message:
      suggestedMessage,

    commercial_reading: {
      conversation_summary: {
        initial_context:
          null,

        evolution:
          null,

        important_events: [],

        current_state: {
          summary:
            'O cliente está avaliando a solução e a conversa permanece aberta.',

          evidence_message_ids: [
            messageId,
          ],

          memory_ids: [],
        },

        last_customer_request_or_decision:
          null,
      },

      commercial_evolution: [],

      method:
        null,

      seller_strengths: [],

      improvement_points: [],

      risks: {
        customer_objections: [],

        service_risks: [],
      },

      best_approach: {
        decision:
          'respond',

        reason:
          'A conversa permanece aberta e uma resposta contextual é apropriada.',

        channel:
          'text',

        evidence_message_ids: [
          messageId,
        ],

        memory_ids: [],
      },

    },
  }
}

function createProvider(
  outputs,
  calls,
) {
  const queue = [
    ...outputs,
  ]

  return async (
    request,
  ) => {
    calls.push(
      structuredClone(
        request,
      ),
    )

    const next =
      queue.shift()

    if (next instanceof Error) {
      throw next
    }

    if (!next) {
      throw new Error(
        'Provider sem resposta preparada.',
      )
    }

    return {
      content:
        JSON.stringify(
          next,
        ),

      provider:
        'test-provider',

      model:
        'test-model',

      request_id:
        `request-${calls.length}`,

      usage: {
        input_tokens:
          10,

        output_tokens:
          20,

        total_tokens:
          30,
      },
    }
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'executa o fluxo completo e cria o primeiro estado em memória',
  async () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const originalInput =
      clone(
        diagnosticInput,
      )

    const calls = []

    const result =
      await runStatefulCopilotEngine({
        diagnostic_input:
          diagnosticInput,

        previous_state:
          null,

        known_message_ids: [
          'm1',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                addFact:
                  true,
              }),
              buildCommunicationOutput(),
            ],
            calls,
          ),

        create_memory_id:
          createMemoryId,
      })

    assert.equal(
      result.mode,
      'model',
    )

    assert.equal(
      result
        .candidate_state
        .version,
      1,
    )

    assert.equal(
      result
        .candidate_state
        .facts
        .length,
      1,
    )

    assert.equal(
      result
        .candidate_state
        .facts[0]
        .id,
      'facts-1-1',
    )

    assert.equal(
      result
        .execution
        .attempts,
      1,
    )

    assert.equal(
      result
        .communication_execution
        .attempts,
      1,
    )

    assert.equal(
      result
        .output
        .strategy
        .suggested_message,
      'Claro. Você prefere que eu retome o contato amanhã?',
    )

    assert.deepEqual(
      result
        .output
        .strategy
        .evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.equal(
      calls.length,
      2,
    )

    const communicationPayload =
      JSON.parse(
        calls[1].user_prompt,
      )

    assert.equal(
      communicationPayload
        .commercial_memory
        .facts[0]
        .id,
      'facts-1-1',
    )

    assert.equal(
      result
        .communication_output
        .commercial_reading
        .customer
        .interests[0]
        .memory_ids[0],
      'facts-1-1',
    )

    assert.deepEqual(
      diagnosticInput,
      originalInput,
    )
  },
)

test(
  'continuação preserva a memória anterior e cria uma nova versão',
  async () => {
    const firstCalls = []

    const firstResult =
      await runStatefulCopilotEngine({
        diagnostic_input:
          buildDiagnosticInput(),

        previous_state:
          null,

        known_message_ids: [
          'm1',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                addFact:
                  true,
              }),
              buildCommunicationOutput(),
            ],
            firstCalls,
          ),

        create_memory_id:
          createMemoryId,
      })

    const previousState =
      firstResult.candidate_state

    const originalPreviousState =
      clone(
        previousState,
      )

    const secondCalls = []

    const secondResult =
      await runStatefulCopilotEngine({
        diagnostic_input:
          buildDiagnosticInput({
            messageId:
              'm2',

            messageText:
              'Quero entender como funciona.',

            referenceTime:
              '2026-08-06T16:00:00-03:00',
          }),

        previous_state:
          previousState,

        known_message_ids: [
          'm1',
          'm2',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                previousStateVersion:
                  1,

                messageId:
                  'm2',
              }),
              buildCommunicationOutput(
                'm2',
              ),
            ],
            secondCalls,
          ),

        create_memory_id:
          createMemoryId,
      })

    assert.equal(
      secondResult.mode,
      'model',
    )

    assert.equal(
      secondResult
        .candidate_state
        .version,
      2,
    )

    assert.equal(
      secondResult
        .candidate_state
        .facts
        .length,
      1,
    )

    assert.equal(
      secondResult
        .candidate_state
        .facts[0]
        .id,
      'facts-1-1',
    )

    assert.notEqual(
      secondResult
        .candidate_state,
      previousState,
    )

    assert.deepEqual(
      previousState,
      originalPreviousState,
    )
  },
)

test(
  'sessão pessoal preserva integralmente o estado comercial anterior e produz silêncio operacional',
  async () => {
    const firstResult =
      await runStatefulCopilotEngine({
        diagnostic_input:
          buildDiagnosticInput(),

        previous_state:
          null,

        known_message_ids: [
          'm1',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                addFact:
                  true,
              }),
              buildCommunicationOutput(),
            ],
            [],
          ),

        create_memory_id:
          createMemoryId,
      })

    const previousState =
      firstResult.candidate_state

    const result =
      await runStatefulCopilotEngine({
        diagnostic_input:
          buildDiagnosticInput({
            messageId:
              'm2',
            messageText:
              'Mais tarde envio meu currículo para você revisar.',
            referenceTime:
              '2026-08-06T16:00:00-03:00',
          }),

        previous_state:
          previousState,

        known_message_ids: [
          'm1',
          'm2',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                previousStateVersion:
                  1,
                messageId:
                  'm2',
                addFact:
                  true,
                commercialRelevance:
                  'non_commercial',
              }),
              buildCommunicationOutput(
                'm2',
              ),
            ],
            [],
          ),

        create_memory_id:
          createMemoryId,
      })

    assert.equal(
      result.mode,
      'model',
    )
    assert.equal(
      result.output
        .commercial_role,
      'buyer',
    )
    assert.equal(
      result.output
        .commercial_relevance,
      'non_commercial',
    )
    assert.equal(
      result.output
        .interpretation
        .current_moment
        .summary,
      'Conversa sem evidência comercial relevante para este ciclo.',
    )
    assert.equal(
      result.output
        .strategy
        .next_move,
      'Nenhuma ação comercial necessária.',
    )
    assert.equal(
      result.output
        .strategy
        .suggested_message,
      null,
    )
    assert.equal(
      result
        .communication_output
        .intervention_needed,
      false,
    )
    assert.equal(
      result
        .communication_output
        .commercial_reading
        .conversation_summary
        .current_state
        .summary,
      'Conversa sem evidência comercial relevante para este ciclo.',
    )
    assert.equal(
      result
        .communication_output
        .commercial_reading
        .operations
        .agenda
        .should_change_agenda,
      false,
    )
    assert.deepEqual(
      result.candidate_state.facts,
      previousState.facts,
    )
    assert.deepEqual(
      result
        .candidate_state
        .current_moment,
      previousState.current_moment,
    )
    assert.deepEqual(
      result
        .candidate_state
        .current_priority,
      previousState.current_priority,
    )

    assert.deepEqual(
      result
        .candidate_state
        .last_evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.deepEqual(
      result
        .candidate_state
        .last_analyzed_message_ids,
      [
        'm1',
        'm2',
      ],
    )

    assert.equal(
      result
        .candidate_state
        .current_moment
        .evidence_message_ids
        .every(
          messageId =>
            result
              .candidate_state
              .last_evidence_message_ids
              .includes(
                messageId,
              ),
        ),
      true,
    )

    assert.equal(
      result
        .candidate_state
        .current_priority
        .evidence_message_ids
        .every(
          messageId =>
            result
              .candidate_state
              .last_evidence_message_ids
              .includes(
                messageId,
              ),
        ),
      true,
    )

    assert.equal(
      result
        .candidate_state
        .last_evidence_message_ids
        .every(
          messageId =>
            result
              .candidate_state
              .last_analyzed_message_ids
              .includes(
                messageId,
              ),
        ),
      true,
    )

    assert.equal(
      result
        .candidate_state
        .version,
      previousState.version + 1,
    )
  },
)

test(
  'entrada bloqueada não chama o provedor nem cria estado candidato',
  async () => {
    let providerCalls = 0
    let memoryIdCalls = 0

    const result =
      await runStatefulCopilotEngine({
        diagnostic_input:
          buildDiagnosticInput({
            status:
              'blocked',

            limitations: [
              'conversation_context_insufficient',
            ],
          }),

        previous_state:
          null,

        known_message_ids: [
          'm1',
        ],

        provider:
          async () => {
            providerCalls += 1

            throw new Error(
              'O provedor não deveria ser chamado.',
            )
          },

        create_memory_id:
          () => {
            memoryIdCalls += 1

            return 'memory-id'
          },
      })

    assert.equal(
      result.mode,
      'blocked',
    )

    assert.equal(
      result.output,
      null,
    )

    assert.equal(
      result.candidate_state,
      null,
    )

    assert.equal(
      result
        .execution
        .attempts,
      0,
    )

    assert.equal(
      providerCalls,
      0,
    )

    assert.equal(
      memoryIdCalls,
      0,
    )
  },
)

test(
  'falha do provedor não altera a entrada recebida',
  async () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const originalInput =
      clone(
        diagnosticInput,
      )

    await assert.rejects(
      () =>
        runStatefulCopilotEngine({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids: [
            'm1',
          ],

          provider:
            async () => {
              throw new Error(
                'falha interna do provedor',
              )
            },

          create_memory_id:
            createMemoryId,
        }),
      (error) => {
        assert.equal(
          error.code,
          'PROVIDER_REQUEST_FAILED',
        )

        return true
      },
    )

    assert.deepEqual(
      diagnosticInput,
      originalInput,
    )
  },
)

test(
  'falha ao criar memória não produz estado parcial',
  async () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const originalInput =
      clone(
        diagnosticInput,
      )

    const calls = []

    await assert.rejects(
      () =>
        runStatefulCopilotEngine({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids: [
            'm1',
          ],

          provider:
            createProvider(
              [
                buildOutput({
                  addFact:
                    true,
                }),
                buildCommunicationOutput(),
              ],
              calls,
            ),

          create_memory_id:
            () => '',
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCommercialStateReductionError,
        )

        assert.equal(
          error.code,
          'INVALID_TEXT',
        )

        return true
      },
    )

    assert.equal(
      calls.length,
      1,
    )

    assert.deepEqual(
      diagnosticInput,
      originalInput,
    )
  },
)

test(
  'Blocker 4: primeiro estado do ciclo herda memória durável de um ciclo anterior via durable_memory_seed',
  async () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const calls = []

    const priorState = {
      contract_version: 'phase-5.1-commercial-state-v1',
      cycle_id: 'cycle-old',
      version: 4,
      commercial_role: 'buyer',
      current_moment: { summary: 'x', evidence_message_ids: [] },
      current_priority: { summary: 'x', evidence_message_ids: [] },
      last_analyzed_message_ids: [],
      last_evidence_message_ids: [],
      facts: [
        {
          id: 'old-fact-objective',
          kind: 'client.objective',
          value: null,
          summary: 'Quer emagrecer para a maratona.',
          confidence: 'high',
          evidence_message_ids: ['old-msg-1'],
          memory_status: 'active',
          created_in_state_version: 2,
          updated_in_state_version: 2,
          closed_in_state_version: null,
        },
      ],
      needs: [],
      open_loops: [],
      objections: [
        {
          id: 'old-objection-price',
          kind: 'client.objection.price',
          summary: 'Achou o plano anterior caro.',
          confidence: 'medium',
          evidence_message_ids: ['old-msg-2'],
          memory_status: 'active',
          created_in_state_version: 3,
          updated_in_state_version: 3,
          closed_in_state_version: null,
        },
      ],
      commitments: [],
      signals: [],
      uncertainties: [],
      created_at: '2026-08-01T10:00:00.000Z',
      updated_at: '2026-08-01T10:00:00.000Z',
    }

    const seed =
      buildDurableMemorySeedFromPriorState(
        priorState,
      )

    assert.ok(seed, 'fixture deveria produzir um seed herdável')

    const result =
      await runStatefulCopilotEngine({
        diagnostic_input:
          diagnosticInput,

        previous_state:
          null,

        known_message_ids: [
          'm1',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                addFact:
                  true,
              }),
              buildCommunicationOutput(),
            ],
            calls,
          ),

        create_memory_id:
          createMemoryId,

        durable_memory_seed:
          seed,
      })

    assert.equal(
      result.candidate_state.facts.length,
      2,
      'preserva o fato observado nesta conversa e acrescenta o herdado',
    )

    const inheritedFact =
      result.candidate_state.facts.find(
        (fact) => fact.kind === 'client.objective',
      )

    assert.ok(inheritedFact, 'o fato herdado deveria estar presente')
    assert.deepEqual(inheritedFact.evidence_message_ids, [])
    assert.equal(inheritedFact.confidence, 'medium')
    assert.match(inheritedFact.summary, /Herdado do ciclo anterior/)

    assert.equal(
      result.candidate_state.objections.length,
      1,
    )

    assert.match(
      result.candidate_state.objections[0].summary,
      /Herdado do ciclo anterior/,
    )
  },
)

test(
  'Blocker 4: uma rodada seguinte (previous_state já existente) nunca re-herda memória durável',
  async () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const calls = []

    const existingState = {
      contract_version: 'phase-5.1-commercial-state-v1',
      cycle_id: 'cycle-1',
      version: 1,
      commercial_role: 'buyer',
      current_moment: { summary: 'x', evidence_message_ids: ['m1'] },
      current_priority: { summary: 'x', evidence_message_ids: ['m1'] },
      last_analyzed_message_ids: ['m1'],
      last_evidence_message_ids: ['m1'],
      facts: [],
      needs: [],
      open_loops: [],
      objections: [],
      commitments: [],
      signals: [],
      uncertainties: [],
      created_at: '2026-08-06T15:00:00-03:00',
      updated_at: '2026-08-06T15:00:00-03:00',
    }

    const seed = {
      source_cycle_id: 'cycle-old',
      facts: [
        {
          kind: 'client.objective',
          value: null,
          summary: 'Não deveria entrar: já existe estado neste ciclo.',
          confidence: 'medium',
        },
      ],
      objections: [],
    }

    const result =
      await runStatefulCopilotEngine({
        diagnostic_input:
          diagnosticInput,

        previous_state:
          existingState,

        known_message_ids: [
          'm1',
        ],

        provider:
          createProvider(
            [
              buildOutput({
                previousStateVersion: 1,
              }),
              buildCommunicationOutput(),
            ],
            calls,
          ),

        create_memory_id:
          createMemoryId,

        durable_memory_seed:
          seed,
      })

    assert.equal(
      result.candidate_state.facts.length,
      0,
      'seed não deve ser aplicado quando o ciclo já possui um estado anterior',
    )
  },
)
