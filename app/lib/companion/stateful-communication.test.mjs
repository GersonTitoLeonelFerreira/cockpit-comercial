import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
} from './commercial-reading-contract.ts'

import {
  STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS,
} from './stateful-communication-contract.ts'

import {
  STATEFUL_COMMUNICATION_PROMPT_VERSION,
  buildStatefulCommunicationExecutionPlan,
} from './stateful-communication-execution-plan.ts'

import {
  executeStatefulCommunicationPlan,
} from './stateful-communication-executor.ts'

import {
  STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-communication-json-schema.ts'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

function buildCandidateState(
  overrides = {},
) {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      'cycle-1',

    version:
      1,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'O cliente pediu clareza sobre a retomada.',
      evidence_message_ids: ['m2'],
    },

    current_priority: {
      summary:
        'Esclarecer a retomada.',
      evidence_message_ids: ['m2'],
    },

    last_analyzed_message_ids: ['m2'],
    last_evidence_message_ids: ['m2'],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at:
      '2026-08-06T15:30:00-03:00',
    updated_at:
      '2026-08-06T15:30:00-03:00',

    ...overrides,
  }
}

function buildDiagnosticOutput({
  commercialRole = 'buyer',
  commercialRelevance = 'commercial',
} = {}) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      null,

    analyzed_message_ids: [
      'm2',
    ],

    commercial_role:
      commercialRole,

    commercial_relevance:
      commercialRelevance,

    interpretation: {
      what_changed: {
        summary:
          'O cliente pediu para saber quem deveria retomar o contato.',

        evidence_message_ids: [
          'm2',
        ],
      },

      what_remains_valid: [],

      current_moment: {
        summary:
          'A conversa precisa esclarecer a responsabilidade pela retomada.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [],
      },

      customer_need:
        null,

      uncertainties: [],
    },

    state_patch: {},

    strategy: {
      method_application:
        'Estratégia antiga que não deve alimentar a camada de comunicação.',

      rationale:
        'Racional antigo.',

      next_move:
        'Perguntar funcionalidades.',

      recommended_question:
        'Quais funcionalidades você procura?',

      suggested_message:
        'Quais funcionalidades você procura?',

      evidence_message_ids: [
        'm2',
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
      'm2',
    ],

    memory_ids: [],
  }
}

function buildInput() {
  return {
    diagnostic_input: {
      reference_time:
        '2026-08-06T15:30:00-03:00',

      current_crm_status:
        'respondeu',

      analysis_precondition: {
        status:
          'ready',

        limitations: [],
      },

      conversation: {
        active_message_ids: [
          'm1',
          'm2',
        ],

        messages: [
          {
            id:
              'm1',

            direction:
              'outgoing',

            occurred_at:
              '2026-08-06T14:00:00-03:00',

            observed_at:
              '2026-08-06T14:00:01-03:00',

            content_type:
              'text',

            text_content:
              'Posso retomar com você amanhã.',

            audio_transcription:
              null,
          },
          {
            id:
              'm2',

            direction:
              'incoming',

            occurred_at:
              '2026-08-06T15:00:00-03:00',

            observed_at:
              '2026-08-06T15:00:01-03:00',

            content_type:
              'text',

            text_content:
              'Saber quem deveria retomar',

            audio_transcription:
              null,
          },
        ],
      },

      commercial_context: {
        communication_tone:
          'natural e objetivo',

        required_behaviors: [
          'Responder perguntas pendentes antes de avançar.',
        ],

        prohibited_behaviors: [
          'Não inventar condição comercial.',
        ],

        sales_method: {
          configured:
            true,

          contract_version:
            'commercial-method-v1',

          name:
            'SPIN',

          description:
            'Método consultivo configurado.',

          principles: [],

          definition:
            null,

          steps: [
            {
              step_order:
                1,

              name:
                'Contexto',

              objective:
                'Compreender a situação relevante.',

              completion_criteria: [
                'Contexto comercial compreendido.',
              ],

              recommended_questions: [],

              is_required:
                true,
            },
          ],
        },

        products: [],
      },
    },

    state_context: {
      previous_state:
        null,
    },
  }
}

function buildPlan({
  commercialRole = 'buyer',
  commercialRelevance = 'commercial',
  candidateState =
    buildCandidateState(),
} = {}) {
  return buildStatefulCommunicationExecutionPlan({
    input:
      buildInput(),

    diagnostic_output:
      buildDiagnosticOutput({
        commercialRole,
        commercialRelevance,
      }),

    candidate_state:
      candidateState,
  })
}

function buildCommercialReadingOutput({
  commercialRole = 'buyer',
  commercialRelevance = 'commercial',
  interventionNeeded = true,
} = {}) {
  const canIntervene =
    commercialRole ===
      'buyer' &&
    commercialRelevance ===
      'commercial' &&
    interventionNeeded

  const canAssessMethod =
    commercialRole ===
      'buyer' &&
    commercialRelevance ===
      'commercial'

  return {
    conversation_summary: {
      initial_context: {
        summary:
          'O vendedor havia informado que poderia retomar o contato.',

        evidence_message_ids: [
          'm1',
        ],

        memory_ids: [],
      },

      evolution: {
        summary:
          'O cliente respondeu pedindo clareza sobre quem fará a retomada.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [],
      },

      important_events: [],

      current_state: {
        summary:
          'Existe uma dúvida objetiva sobre a responsabilidade pela retomada.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [],
      },

      last_customer_request_or_decision: {
        summary:
          'O cliente quer saber quem deverá retomar o contato.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [],
      },
    },

    commercial_evolution: [
      {
        key:
          'customer_replied',

        label:
          'Cliente respondeu',

        status:
          'completed',

        explanation:
          'Há resposta explícita do cliente.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [],
      },
    ],

    method:
      canAssessMethod
        ? {
            stages: [
              {
                step_order:
                  1,

                status:
                  'completed',

                explanation:
                  'A necessidade imediata de esclarecer a retomada está compreendida.',

                evidence_message_ids: [
                  'm2',
                ],

                memory_ids: [],
              },
            ],

            adherence: {
              status:
                'on_method',

              summary:
                'A conversa permanece dentro do método configurado.',

              deviation_stage_order:
                null,

              what_happened:
                null,

              missing_information: [],

              why_it_matters:
                null,

              evidence_message_ids: [
                'm2',
              ],

              memory_ids: [],
            },

            recovery_guidance:
              null,
          }
        : null,

    seller_strengths: [],
    improvement_points: [],

    risks: {
      customer_objections: [],
      service_risks: [],
    },

    best_approach: {
      decision:
        canIntervene
          ? 'respond'
          : 'no_intervention',

      reason:
        canIntervene
          ? 'A pergunta objetiva do cliente precisa ser respondida antes de qualquer avanço.'
          : 'Nenhuma intervenção comercial deve ser realizada para este papel.',

      channel:
        canIntervene
          ? 'text'
          : 'none',

      evidence_message_ids: [
        'm2',
      ],

      memory_ids: [],
    },

  }
}

function buildCommunicationOutput({
  commercialRole = 'buyer',
  commercialRelevance = 'commercial',
  interventionNeeded = true,
  recommendedQuestion =
    'Você prefere que eu retome o contato ou que outra pessoa fale com você?',
  suggestedMessage =
    'Claro. Você prefere que eu retome o contato ou que outra pessoa fale com você?',
  } = {}) {
  return {
    intervention_needed:
      interventionNeeded,

    recommended_question:
      recommendedQuestion,

    suggested_message:
      suggestedMessage,

    commercial_reading:
      buildCommercialReadingOutput({
        commercialRole,
        commercialRelevance,
        interventionNeeded,
        recommendedQuestion,
        suggestedMessage,
      }),
  }
}

function createProvider(
  outputs,
  calls = [],
) {
  const queue = [
    ...outputs,
  ]

  return {
    calls,

    provider:
      async request => {
        calls.push(
          structuredClone(
            request,
          ),
        )

        const output =
          queue.shift()

        return {
          content:
            typeof output === 'string'
              ? output
              : JSON.stringify(output),

          provider:
            'test-provider',

          model:
            'test-model',

          request_id:
            `request-${calls.length}`,

          usage: {
            input_tokens: 30,
            output_tokens: 20,
            total_tokens: 50,
          },
        }
      },
  }
}

async function executeTwiceExpectingFailure({
  output,
  plan = buildPlan(),
}) {
  const provider =
    createProvider([
      structuredClone(output),
      structuredClone(output),
    ])

  try {
    await executeStatefulCommunicationPlan({
      plan,
      provider:
        provider.provider,
    })
  } catch (error) {
    return error
  }

  assert.fail(
    'A execução deveria rejeitar as duas saídas inválidas.',
  )
}

async function assertDerivedFieldCannotBeRedecided({
  field,
  value,
}) {
  const output =
    buildCommunicationOutput()

  output.commercial_reading[field] =
    value

  const error =
    await executeTwiceExpectingFailure({
      output,
    })

  assert.equal(
    error.code,
    'INVALID_COMMUNICATION_OUTPUT',
  )

  assert.equal(
    error.details
      .communication_failure_path,
    'reading',
  )

  assert.equal(
    error.details
      .communication_failure_invariant,
    'ADDITIONAL_FIELD_NOT_ALLOWED',
  )

  assert.equal(
    error.details
      .communication_attempts,
    2,
  )
}

test(
  'plano usa diagnóstico validado e não encaminha a estratégia antiga',
  () => {
    const plan =
      buildPlan()

    const payload =
      JSON.parse(
        plan.user_prompt,
      )

    assert.equal(
      plan.prompt_version,
      STATEFUL_COMMUNICATION_PROMPT_VERSION,
    )

    assert.equal(
      STATEFUL_COMMUNICATION_PROMPT_VERSION,
      'phase-5.2-communication-prompt-v10',
    )

    assert.match(
      plan.system_prompt,
      /revise silenciosamente o texto em português do Brasil/,
    )

    assert.match(
      plan.system_prompt,
      /Coaching e método devem consumir essa memória canônica/,
    )

    assert.match(
      plan.system_prompt,
      /não redescubra uma lacuna em paralelo/,
    )

    assert.equal(
      payload
        .diagnostic_context
        .commercial_role,
      'buyer',
    )

    assert.equal(
      payload
        .diagnostic_context
        .strategy,
      undefined,
    )

    assert.equal(
      payload
        .conversation
        .current_messages[0]
        .id,
      'm2',
    )

    assert.deepEqual(
      payload
        .seller_evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.match(
      plan.system_prompt,
      /seller_evidence_message_ids contém exclusivamente IDs de mensagens outgoing do vendedor/,
    )

    assert.equal(
      payload
        .conversation
        .context_bridge_messages[0]
        .id,
      undefined,
    )

    assert.equal(
      payload
        .commercial_context
        .sales_method
        .name,
      'SPIN',
    )
  },
)

test(
  'executor normaliza uma intervenção e envia o schema próprio',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput(),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .output
        .suggested_message,
      'Claro. Você prefere que eu retome o contato ou que outra pessoa fale com você?',
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .contract_version,
      COMMERCIAL_READING_CONTRACT_VERSION,
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .best_approach
        .decision,
      'respond',
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .method
        .name,
      'SPIN',
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .method
        .current_stage
        .name,
      'Contexto',
    )

    assert.equal(
      result
        .output
        .method_application,
      'Etapa atual: Contexto. A conversa permanece dentro do método configurado.',
    )

    assert.equal(
      result
        .output
        .guidance,
      result
        .output
        .commercial_reading
        .best_approach
        .reason,
    )

    assert.equal(
      result
        .execution
        .attempts,
      1,
    )

    assert.deepEqual(
      provider
        .calls[0]
        .structured_output_format,
      STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
    )
  },
)

test(
  'executor aceita silêncio explícito sem pergunta nem mensagem',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput({
          interventionNeeded:
            false,

          recommendedQuestion:
            null,

          suggestedMessage:
            null,
        }),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .output
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .output
        .suggested_message,
      null,
    )
  },
)

test(
  'customer é derivado do estado candidato sem ser regenerado pelo modelo',
  async () => {
    const candidateState =
      buildCandidateState({
        facts: [
          {
            id:
              'objective-1',
            kind:
              'client.objective',
            value:
              null,
            confidence:
              'high',
            summary:
              'Aumentar a conversão comercial.',
            evidence_message_ids: [
              'm2',
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
      })

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan({
            candidateState,
          }),

        provider:
          createProvider([
            buildCommunicationOutput(),
          ]).provider,
      })

    assert.deepEqual(
      result
        .output
        .commercial_reading
        .customer
        .objectives,
      [
        {
          summary:
            'Aumentar a conversão comercial.',
          evidence_message_ids: [],
          memory_ids: [
            'objective-1',
          ],
        },
      ],
    )

    assert.deepEqual(
      result
        .output
        .commercial_reading
        .memory_ids,
      [
        'objective-1',
      ],
    )
  },
)

test(
  'executor repete uma vez quando a primeira saída é inválida',
  async () => {
    const provider =
      createProvider([
        'não é json',
        buildCommunicationOutput(),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .execution
        .attempts,
      2,
    )

    assert.equal(
      result
        .execution
        .recovered_after_retry,
      true,
    )
  },
)

test(
  'executor neutraliza intervenção de venda para papel não comprador em vez de rejeitar',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput({
          commercialRole:
            'provider',
        }),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan({
            commercialRole:
              'provider',
          }),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .output
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .output
        .recommended_question,
      null,
    )

    assert.equal(
      result
        .output
        .suggested_message,
      null,
    )

    assert.equal(
      provider.calls.length,
      1,
    )
  },
)

test(
  'buyer non_commercial neutraliza orientação mesmo quando o modelo já declarou silêncio',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput({
          commercialRelevance:
            'non_commercial',

          interventionNeeded:
            false,

          recommendedQuestion:
            null,

          suggestedMessage:
            null,
        }),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan({
            commercialRelevance:
              'non_commercial',
          }),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .output
        .method_application,
      'Nenhuma aplicação comercial ao assunto atual.',
    )

    assert.equal(
      result
        .output
        .guidance,
      'Nenhuma ação comercial necessária.',
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .best_approach
        .decision,
      'no_intervention',
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .commercial_relevance,
      'non_commercial',
    )

    assert.equal(
      provider.calls.length,
      1,
    )
  },
)


test(
  'comunicação v10 integra coaching método tom comportamentos limites e escalonamento',
  () => {
    const input =
      buildInput()

    input
      .diagnostic_input
      .commercial_context
      .required_behaviors = [
        'Responder perguntas pendentes antes de avançar.',
      ]

    input
      .diagnostic_input
      .commercial_context
      .prohibited_behaviors = [
        'Criar urgência artificial.',
      ]

    const plan =
      buildStatefulCommunicationExecutionPlan({
        input,

        diagnostic_output:
          buildDiagnosticOutput(),

        candidate_state:
          buildCandidateState(),
      })

    assert.equal(
      plan.prompt_version,
      'phase-5.2-communication-prompt-v10',
    )

    assert.match(
      plan.system_prompt,
      /communication_tone controla somente forma/,
    )

    assert.match(
      plan.system_prompt,
      /Comportamento correto não exige mensagem/,
    )

    assert.match(
      plan.system_prompt,
      /orientar confirmação ou escalonamento humano/,
    )

    assert.match(
      plan.system_prompt,
      /Não crie urgência artificial/,
    )

    assert.match(
      plan.system_prompt,
      /Nenhuma regra comportamental, isoladamente, autoriza alteração automática de CRM, Agenda/,
    )

    assert.match(
      plan.system_prompt,
      /recovery_guidance torna-se obrigatório/,
    )

    assert.match(
      plan.system_prompt,
      /Aplique o método comercial configurado como orientação estratégica/,
    )
  },
)

test(
  'schema da comunicação pede ao modelo somente campos de leitura não deriváveis',
  () => {
    const schema =
      STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT
        .schema

    assert.deepEqual(
      Object.keys(
        schema.properties,
      ),
      [
        ...STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS,
      ],
    )

    assert.equal(
      schema.properties
        .method_application,
      undefined,
    )

    assert.equal(
      schema.properties.guidance,
      undefined,
    )

    assert.deepEqual(
      Object.keys(
        schema
          .properties
          .commercial_reading
          .properties,
      ),
      [
        'conversation_summary',
        'commercial_evolution',
        'method',
        'seller_strengths',
        'improvement_points',
        'risks',
        'best_approach',
      ],
    )

    const promptPayload =
      JSON.parse(
        buildPlan().user_prompt,
      )

    assert.deepEqual(
      promptPayload
        .commercial_reading_model_fields,
      Object.keys(
        schema
          .properties
          .commercial_reading
          .properties,
      ),
    )
  },
)

test(
  'A: commercial_reading incompatível informa path e invariante exatos',
  async () => {
    const output =
      buildCommunicationOutput()

    delete output
      .commercial_reading
      .conversation_summary

    const error =
      await executeTwiceExpectingFailure({
        output,
      })

    assert.equal(
      error.code,
      'INVALID_COMMUNICATION_OUTPUT',
    )

    assert.equal(
      error.details.reading_code,
      'MISSING_REQUIRED_FIELD',
    )

    assert.equal(
      error.details.reading_path,
      'reading.conversation_summary',
    )

    assert.equal(
      error.details
        .communication_attempts,
      2,
    )
  },
)

test(
  'B: commercial_role não pode ser redecidido pela camada de comunicação',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'commercial_role',

      value:
        'provider',
    })
  },
)

test(
  'customer não pode ser redecidido pela camada de comunicação',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'customer',

      value: {
        objectives: [],
      },
    })
  },
)

test(
  'C: analysis_status não pode divergir do precondicionado',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'analysis_status',

      value:
        'limited',
    })
  },
)

test(
  'D: analysis_limitations não pode ser regenerado pela comunicação',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'analysis_limitations',

      value: [
        'limitação inventada',
      ],
    })
  },
)

test(
  'E: CRM não pode ser redecidido pela camada de comunicação',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'operations',

      value: {
        crm: {
          should_change_crm_stage:
            true,

          recommended_status:
            'ganho',

          rationale:
            'Decisão paralela.',

          requires_human_confirmation:
            true,
        },
      },
    })
  },
)

test(
  'F: Agenda não pode ser redecidida pela camada de comunicação',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'operations',

      value: {
        agenda: {
          should_change_agenda:
            true,

          expected_next_action_at:
            '2026-08-07T10:00:00-03:00',

          rationale:
            'Decisão paralela.',

          requires_human_confirmation:
            true,
        },
      },
    })
  },
)

test(
  'G: communication interna é derivada da resposta externa',
  async () => {
    await assertDerivedFieldCannotBeRedecided({
      field:
        'communication',

      value: {
        intervention_needed:
          false,

        recommended_question:
          null,

        recommended_message:
          null,
      },
    })

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          createProvider([
            buildCommunicationOutput(),
          ]).provider,
      })

    assert.deepEqual(
      result
        .output
        .commercial_reading
        .communication,
      {
        intervention_needed:
          result.output
            .intervention_needed,

        recommended_question:
          result.output
            .recommended_question,

        recommended_message:
          result.output
            .suggested_message,
      },
    )
  },
)

test(
  'H: campo externo ausente ou excedente é rejeitado com diagnóstico seguro',
  async () => {
    const missing =
      buildCommunicationOutput()

    delete missing.recommended_question

    const missingError =
      await executeTwiceExpectingFailure({
        output:
          missing,
      })

    assert.equal(
      missingError.details
        .communication_failure_path,
      'communication.recommended_question',
    )

    assert.equal(
      missingError.details
        .communication_failure_invariant,
      'REQUIRED_FIELD_MISSING',
    )

    const extra =
      buildCommunicationOutput()

    extra.campo_imprevisto =
      'não registrar este conteúdo'

    const extraError =
      await executeTwiceExpectingFailure({
        output:
          extra,
      })

    assert.equal(
      extraError.details
        .communication_failure_path,
      'communication',
    )

    assert.equal(
      extraError.details
        .communication_failure_invariant,
      'ADDITIONAL_FIELD_NOT_ALLOWED',
    )

    assert.equal(
      JSON.stringify(
        extraError.details,
      ).includes(
        'campo_imprevisto',
      ),
      false,
    )

    const nestedExtra =
      buildCommunicationOutput()

    nestedExtra
      .commercial_reading
      .best_approach
      .campo_imprevisto =
      'também não registrar'

    const nestedExtraError =
      await executeTwiceExpectingFailure({
        output:
          nestedExtra,
      })

    assert.equal(
      nestedExtraError.details
        .communication_failure_path,
      'reading.best_approach',
    )

    assert.equal(
      nestedExtraError.details
        .communication_failure_invariant,
      'ADDITIONAL_FIELD_NOT_ALLOWED',
    )
  },
)

test(
  'I: JSON válido com contrato semântico inválido informa a regra violada',
  async () => {
    const output =
      buildCommunicationOutput({
        interventionNeeded:
          false,

        recommendedQuestion:
          null,

        suggestedMessage:
          null,
      })

    output
      .commercial_reading
      .best_approach = {
      ...output
        .commercial_reading
        .best_approach,

      decision:
        'no_intervention',

      channel:
        'text',
    }

    const error =
      await executeTwiceExpectingFailure({
        output,
      })

    assert.equal(
      error.details
        .communication_failure_path,
      'reading.best_approach.channel',
    )

    assert.equal(
      error.details
        .communication_failure_invariant,
      'NO_INTERVENTION_CHANNEL',
    )
  },
)

test(
  'J: suggested_message com valor/percentual não sustentado pelo estado ou catálogo é rejeitada',
  async () => {
    const output =
      buildCommunicationOutput({
        suggestedMessage:
          'Vou te garantir 50% de desconto se você fechar hoje.',
      })

    const error =
      await executeTwiceExpectingFailure({
        output,
      })

    assert.equal(
      error.code,
      'INVALID_COMMUNICATION_OUTPUT',
    )

    assert.equal(
      error.details
        .communication_failure_path,
      'communication.suggested_message',
    )

    assert.equal(
      error.details
        .communication_failure_invariant,
      'UNSUPPORTED_PROTECTED_FACT',
    )
  },
)

test(
  'K: recommended_question com valor não sustentado é rejeitada mesmo com suggested_message limpa',
  async () => {
    const output =
      buildCommunicationOutput({
        recommendedQuestion:
          'Posso confirmar o agendamento para as 14h30?',

        suggestedMessage:
          null,

        interventionNeeded:
          true,
      })

    const error =
      await executeTwiceExpectingFailure({
        output,
      })

    assert.equal(
      error.code,
      'INVALID_COMMUNICATION_OUTPUT',
    )

    assert.equal(
      error.details
        .communication_failure_path,
      'communication.recommended_question',
    )

    assert.equal(
      error.details
        .communication_failure_invariant,
      'UNSUPPORTED_PROTECTED_FACT',
    )
  },
)

test(
  'L: valor citado na mensagem é aceito quando já está sustentado pelo estado comercial acumulado',
  async () => {
    const candidateState =
      buildCandidateState({
        facts: [
          {
            id:
              'fact-price-1',

            kind:
              'client.commercial.decision_criteria',

            value:
              'Cliente foi informado do valor de R$ 300 mensais.',

            memory_status:
              'active',

            confidence:
              'high',

            evidence_message_ids: [
              'm2',
            ],

            created_at:
              '2026-08-06T15:30:00-03:00',

            updated_at:
              '2026-08-06T15:30:00-03:00',
          },
        ],
      })

    const output =
      buildCommunicationOutput({
        suggestedMessage:
          'Como conversamos, o valor é R$ 300 mensais.',
      })

    const plan =
      buildPlan({
        candidateState,
      })

    const provider =
      createProvider([
        structuredClone(
          output,
        ),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan,

        provider:
          provider.provider,
      })

    assert.equal(
      result.output
        .suggested_message,
      'Como conversamos, o valor é R$ 300 mensais.',
    )
  },
)

test(
  'campos derivados reproduzem papel relevância completude CRM Agenda e referências validados',
  async () => {
    const plan =
      buildPlan()

    plan
      .normalization_context
      .expected_analysis_status =
      'limited'

    plan
      .normalization_context
      .expected_analysis_limitations = [
      'Janela histórica parcial.',
    ]

    plan
      .normalization_context
      .expected_crm = {
      should_change_crm_stage:
        true,

      recommended_status:
        'negociacao',

      rationale:
        'Diagnóstico confirmou negociação.',

      requires_human_confirmation:
        true,
    }

    plan
      .normalization_context
      .expected_agenda = {
      should_change_agenda:
        true,

      expected_next_action_at:
        '2026-08-07T10:00:00-03:00',

      rationale:
        'Diagnóstico confirmou retorno comercial.',

      requires_human_confirmation:
        true,
    }

    const result =
      await executeStatefulCommunicationPlan({
        plan,

        provider:
          createProvider([
            buildCommunicationOutput(),
          ]).provider,
      })

    const reading =
      result.output
        .commercial_reading

    assert.equal(
      reading.commercial_role,
      'buyer',
    )

    assert.equal(
      reading.commercial_relevance,
      'commercial',
    )

    assert.equal(
      reading.analysis_status,
      'limited',
    )

    assert.deepEqual(
      reading.analysis_limitations,
      [
        'Janela histórica parcial.',
      ],
    )

    assert.deepEqual(
      reading.operations.crm,
      plan
        .normalization_context
        .expected_crm,
    )

    assert.deepEqual(
      reading.operations.agenda,
      plan
        .normalization_context
        .expected_agenda,
    )

    assert.deepEqual(
      reading.evidence_message_ids,
      [
        'm1',
        'm2',
      ],
    )

    assert.deepEqual(
      reading.memory_ids,
      [],
    )
  },
)

test(
  'memory_ids globais são agregados deterministicamente sem permitir memória desconhecida',
  async () => {
    const plan =
      buildPlan()

    plan
      .normalization_context
      .commercial_reading
      .available_memory_ids = [
      'memory-1',
    ]

    const output =
      buildCommunicationOutput()

    output
      .commercial_reading
      .conversation_summary
      .initial_context
      .memory_ids = [
      'memory-1',
    ]

    const result =
      await executeStatefulCommunicationPlan({
        plan,

        provider:
          createProvider([
            output,
          ]).provider,
      })

    assert.deepEqual(
      result
        .output
        .commercial_reading
        .memory_ids,
      [
        'memory-1',
      ],
    )

    const unknown =
      buildCommunicationOutput()

    unknown
      .commercial_reading
      .conversation_summary
      .initial_context
      .memory_ids = [
      'memory-unknown',
    ]

    const error =
      await executeTwiceExpectingFailure({
        output:
          unknown,

        plan:
          buildPlan(),
      })

    assert.equal(
      error.details
        .communication_failure_invariant,
      'UNKNOWN_MEMORY',
    )
  },
)

test(
  'retry recebe contexto estrutural seguro da primeira falha',
  async () => {
    const calls = []

    const provider =
      createProvider(
        [
          'não é json',
          buildCommunicationOutput(),
        ],
        calls,
      )

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    const repairPayload =
      JSON.parse(
        calls[1].user_prompt,
      )

    assert.equal(
      result
        .execution
        .recovered_after_retry,
      true,
    )

    assert.deepEqual(
      repairPayload.repair_context,
      {
        previous_failure_code:
          'INVALID_COMMUNICATION_JSON',

        previous_failure_path:
          'communication',

        previous_failure_invariant:
          'VALID_JSON_OBJECT',

        instruction:
          'Repare somente o caminho indicado e retorne novamente o objeto completo conforme o schema. Se previous_failure_invariant=SELLER_EVIDENCE_REQUIRED, use somente IDs presentes em seller_evidence_message_ids que sustentem diretamente o item; se nenhum ID dessa lista sustentar o item, remova o item em vez de inventar ou reutilizar evidência do cliente.',
      },
    )
  },
)

test(
  'duas saídas inválidas preservam path invariante e número de tentativas',
  async () => {
    const provider =
      createProvider([
        'não é json',
        'continua inválido',
      ])

    await assert.rejects(
      () =>
        executeStatefulCommunicationPlan({
          plan:
            buildPlan(),

          provider:
            provider.provider,
        }),
      error => {
        assert.equal(
          error.code,
          'INVALID_COMMUNICATION_JSON',
        )

        assert.deepEqual(
          error.details,
          {
            communication_failure_path:
              'communication',

            communication_failure_invariant:
              'VALID_JSON_OBJECT',

            communication_attempts:
              2,

            first_failure_code:
              'INVALID_COMMUNICATION_JSON',

            first_failure_path:
              'communication',

            first_failure_invariant:
              'VALID_JSON_OBJECT',
          },
        )

        return true
      },
    )
  },
)


test(
  'repair de SELLER_EVIDENCE_REQUIRED usa somente evidência do vendedor',
  async () => {
    const invalidOutput =
      buildCommunicationOutput()

    invalidOutput
      .commercial_reading
      .improvement_points = [
        {
          kind:
            'missing_next_commitment',

          summary:
            'O vendedor não consolidou o próximo compromisso.',

          why_it_matters:
            'Sem compromisso explícito, a continuidade pode ficar ambígua.',

          impact:
            'A retomada pode perder clareza.',

          how_to_improve:
            'Confirmar de forma objetiva quem retoma e quando.',

          evidence_message_ids: [
            'm2',
          ],

          memory_ids: [],
        },
      ]

    const repairedOutput =
      structuredClone(
        invalidOutput,
      )

    repairedOutput
      .commercial_reading
      .improvement_points[0]
      .evidence_message_ids = [
        'm1',
      ]

    const calls = []

    const provider =
      createProvider(
        [
          invalidOutput,
          repairedOutput,
        ],
        calls,
      )

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .execution
        .attempts,
      2,
    )

    assert.equal(
      result
        .execution
        .recovered_after_retry,
      true,
    )

    assert.equal(
      result
        .output
        .commercial_reading
        .improvement_points[0]
        .evidence_message_ids[0],
      'm1',
    )

    assert.equal(
      calls.length,
      2,
    )

    const repairPayload =
      JSON.parse(
        calls[1]
          .user_prompt,
      )

    assert.deepEqual(
      repairPayload
        .seller_evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.equal(
      repairPayload
        .repair_context
        .previous_failure_code,
      'INVALID_COMMUNICATION_OUTPUT',
    )

    assert.equal(
      repairPayload
        .repair_context
        .previous_failure_path,
      'reading.improvement_points[0].evidence_message_ids',
    )

    assert.equal(
      repairPayload
        .repair_context
        .previous_failure_invariant,
      'SELLER_EVIDENCE_REQUIRED',
    )

    assert.match(
      repairPayload
        .repair_context
        .instruction,
      /seller_evidence_message_ids/,
    )
  },
)
