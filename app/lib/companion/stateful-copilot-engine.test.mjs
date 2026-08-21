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
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract.ts'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
} from './commercial-reading-contract.ts'

import {
  StatefulCommercialStateReductionError,
} from './stateful-commercial-state-reducer.ts'

import {
  runStatefulCopilotEngine,
} from './stateful-copilot-engine.ts'

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

    commitments_to_upsert: [],

    signals_to_add: [],
    signal_ids_to_resolve: [],

    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
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
          'declared_interest',

        value:
          'interesse confirmado',

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
  commercialRelevance = 'commercial',
) {
  const recommendedQuestion =
    'Você prefere que eu retome o contato amanhã?'

  const suggestedMessage =
    'Claro. Você prefere que eu retome o contato amanhã?'

  return {
    contract_version:
      STATEFUL_COMMUNICATION_CONTRACT_VERSION,

    intervention_needed:
      true,

    method_application:
      'Usar o contexto para responder ao ponto atual antes de avançar.',

    guidance:
      'Responder diretamente e confirmar o próximo passo de forma natural.',

    recommended_question:
      recommendedQuestion,

    suggested_message:
      suggestedMessage,

    commercial_reading: {
      contract_version:
        COMMERCIAL_READING_CONTRACT_VERSION,

      analysis_status:
        'complete',

      analysis_limitations: [],

      commercial_role:
        'buyer',

      commercial_relevance:
        commercialRelevance,

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

      customer: {
        needs: [],
        interests: [],
        decision_criteria: [],
        preferences: [],
        open_questions: [],
        objections: [],
        uncertainties: [],
      },

      commercial_evolution: [],

      method: {
        configured:
          false,

        name:
          null,

        stages: [],
      },

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

      communication: {
        intervention_needed:
          true,

        recommended_question:
          recommendedQuestion,

        recommended_message:
          suggestedMessage,
      },

      operations: {
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
                'non_commercial',
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
      2,
    )

    assert.deepEqual(
      diagnosticInput,
      originalInput,
    )
  },
)
