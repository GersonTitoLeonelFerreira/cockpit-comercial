import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionDiagnosticModelError,
  executeCompanionDiagnosticPlan,
} from './diagnostic-model.ts'

import {
  buildCompanionDiagnosticExecutionPlan,
} from './diagnostic-execution-plan.ts'

const COMPANY_ID =
  '40fb91ee-f998-4d98-acdf-7d0794369ccf'

const CYCLE_ID =
  '123e4567-e89b-42d3-a456-426614174000'

function buildInput(overrides = {}) {
  return {
    input_version:
      'phase-5-input-v1',

    diagnostic_contract_version:
      'phase-1-v1',

    company_id:
      COMPANY_ID,

    cycle_id:
      CYCLE_ID,

    conversation_key:
      'whatsapp:5511999999999',

    current_crm_status:
      'respondeu',

    reference_time:
      '2026-08-04T20:00:00.000Z',

    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },

    conversation: {
      active_message_ids: [
        '1',
      ],

      excluded_message_ids: [],

      messages: [
        {
          id: '1',
          message_key:
            'message-001',
          version: 1,
          sequence: 1,
          direction: 'incoming',
          occurred_at:
            '2026-08-04T18:00:00.000Z',
          observed_at:
            '2026-08-04T18:00:02.000Z',
          content_type: 'text',
          text_content:
            'Quero conhecer os planos.',
          audio_transcription: null,
        },
      ],

      excluded_messages: [],
    },

    commercial_context: {
      configured: true,

      config_version_id:
        '223e4567-e89b-42d3-a456-426614174000',

      config_version_number: 1,

      config_contract_version:
        'phase-2-v1',

      business_description:
        'Academia com atendimento consultivo.',

      target_audience:
        'Pessoas interessadas em atividade física.',

      value_proposition:
        'Estrutura e acompanhamento.',

      communication_tone:
        'Direto e acolhedor.',

      required_behaviors: [],
      prohibited_behaviors: [],

      sales_method: {
        configured: true,
        name: 'Método Consultivo',

        description:
          'Entender antes de apresentar.',

        steps: [],
      },

      products: [
        {
          product_id:
            '323e4567-e89b-42d3-a456-426614174000',

          name: 'Plano Open',
          category: 'plano',
          base_price: 199.9,
          active: true,

          indicated_audiences: [],
          needs_addressed: [],
          benefits: [],
          verified_differentiators: [],
          limitations: [],
          contract_conditions: [],
          payment_conditions: [],
          allowed_claims: [],
          forbidden_claims: [],
        },
      ],

      facts: [],
      objection_guides: [],
    },

    ...overrides,
  }
}

function buildValidDiagnostic(
  overrides = {},
) {
  return {
    contract_version:
      'phase-1-v1',

    commercial_role: {
      external_contact_role:
        'buyer',

      evidence_message_ids: [
        '1',
      ],
    },

    analysis_status:
      'complete',

    analysis_limitations: [],

    commercial_relevance:
      'commercial',

    confidence:
      'high',

    customer_intent: {
      summary:
        'O cliente quer conhecer os planos.',

      evidence_message_ids: [
        '1',
      ],
    },

    needs: [],
    missing_information: [],
    unanswered_questions: [],
    active_objections: [],

    seller_assessment: {
      strengths: [],
      risks: [],
    },

    sales_method: {
      configured: true,
      current_step: null,
      completed_steps: [],
      skipped_steps: [],
      evidence_message_ids: [],
    },

    solution_fit: {
      status: 'unknown',
      rationale: null,
      evidence_message_ids: [],
    },

    guidance: {
      intervention_required: false,
      next_move: null,
      recommended_question: null,
      suggested_message: null,
    },

    crm_suggestion: {
      should_change_crm_stage: false,
      recommended_status: null,
      next_action_required: false,
      expected_next_action_at: null,

      prohibited_statuses: [
        'ganho',
        'perdido',
      ],

      requires_human_confirmation:
        true,
    },

    evidence_message_ids: [
      '1',
    ],

    ...overrides,
  }
}

function buildProviderResponse(
  diagnostic,
  overrides = {},
) {
  return {
    id:
      'chatcmpl-test',

    model:
      'gpt-4.1-mini-test',

    choices: [
      {
        index: 0,

        message: {
          role:
            'assistant',

          content:
            JSON.stringify(
              diagnostic,
            ),
        },

        finish_reason:
          'stop',
      },
    ],

    usage: {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    },

    ...overrides,
  }
}

function jsonResponse(
  body,
  {
    status = 200,
    headers = {},
  } = {},
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type':
          'application/json',

        ...headers,
      },
    },
  )
}

function assertModelError(
  callback,
  expectedCode,
) {
  return assert.rejects(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CompanionDiagnosticModelError,
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
  'entrada bloqueada retorna diagnóstico determinístico sem chamar o provedor',
  async () => {
    const input =
      buildInput({
        analysis_precondition: {
          status:
            'blocked',

          limitations: [
            'conversation_context_insufficient',
          ],
        },

        conversation: {
          active_message_ids: [],
          excluded_message_ids: [],
          messages: [],
          excluded_messages: [],
        },
      })

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    let providerCalled =
      false

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key: null,

          fetch_impl:
            async () => {
              providerCalled = true

              throw new Error(
                'Não deveria chamar o provedor.',
              )
            },
        },
      })

    assert.equal(
      providerCalled,
      false,
    )

    assert.equal(
      result.execution.mode,
      'blocked',
    )

    assert.equal(
      result.execution.provider,
      'deterministic',
    )

    assert.equal(
      result.diagnostic
        .analysis_status,
      'blocked',
    )
  },
)

test(
  'entrada executável exige chave configurada',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    await assertModelError(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key: null,
          },
        }),

      'MODEL_NOT_CONFIGURED',
    )
  },
)

test(
  'envia o prompt ao provedor e valida o diagnóstico retornado',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    let capturedUrl = null
    let capturedInit = null

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key:
            'test-secret-key',

          model:
            'test-model',

          fetch_impl:
            async (
              url,
              init,
            ) => {
              capturedUrl =
                String(url)

              capturedInit =
                init

              return jsonResponse(
                buildProviderResponse(
                  buildValidDiagnostic(),
                ),
                {
                  headers: {
                    'x-request-id':
                      'req-test-001',
                  },
                },
              )
            },
        },
      })

    assert.equal(
      capturedUrl,
      'https://api.openai.com/v1/chat/completions',
    )

    assert.equal(
      capturedInit.method,
      'POST',
    )

    assert.equal(
      capturedInit.headers
        .Authorization,
      'Bearer test-secret-key',
    )

    const requestBody =
      JSON.parse(
        capturedInit.body,
      )

    assert.equal(
      requestBody.model,
      'test-model',
    )

    assert.deepEqual(
      requestBody.response_format,
      {
        type:
          'json_object',
      },
    )

    assert.equal(
      requestBody.messages[0].role,
      'system',
    )

    assert.equal(
      requestBody.messages[1].role,
      'user',
    )

    assert.equal(
      result.execution.mode,
      'model',
    )

    assert.equal(
      result.execution.provider,
      'openai',
    )

    assert.equal(
      result.execution.model,
      'gpt-4.1-mini-test',
    )

    assert.equal(
      result.execution.request_id,
      'req-test-001',
    )

    assert.deepEqual(
      result.execution.usage,
      {
        input_tokens: 100,
        output_tokens: 200,
        total_tokens: 300,
      },
    )

    assert.equal(
      result.diagnostic
        .customer_intent.summary,
      'O cliente quer conhecer os planos.',
    )
  },
)

test(
  'prioriza pergunta recente de preço sem perder a Agenda',
  async () => {
    const input =
      buildInput()

    input.reference_time =
      '2026-08-05T22:00:00.000Z'

    input.conversation = {
      ...input.conversation,

      active_message_ids: [
        '10',
        '11',
        '12',
        '13',
      ],

      messages: [
        {
          id:
            '10',

          message_key:
            'initial-interest',

          version:
            1,

          sequence:
            10,

          direction:
            'incoming',

          occurred_at:
            '2026-08-04T22:00:00.000Z',

          observed_at:
            '2026-08-04T22:00:02.000Z',

          content_type:
            'text',

          text_content:
            'Quero conhecer a Yolen.',

          audio_transcription:
            null,
        },

        {
          id:
            '11',

          message_key:
            'schedule-confirmation',

          version:
            1,

          sequence:
            11,

          direction:
            'incoming',

          occurred_at:
            '2026-08-05T03:01:00.000Z',

          observed_at:
            '2026-08-05T03:01:02.000Z',

          content_type:
            'text',

          text_content:
            'Funciona. Pode deixar agendado para amanhã às 15h.',

          audio_transcription:
            null,
        },

        {
          id:
            '12',

          message_key:
            'seller-confirmation',

          version:
            1,

          sequence:
            12,

          direction:
            'outgoing',

          occurred_at:
            '2026-08-05T03:02:00.000Z',

          observed_at:
            '2026-08-05T03:02:02.000Z',

          content_type:
            'text',

          text_content:
            'Perfeito. A demonstração está confirmada para amanhã às 15h.',

          audio_transcription:
            null,
        },

        {
          id:
            '13',

          message_key:
            'latest-price-question',

          version:
            1,

          sequence:
            13,

          direction:
            'incoming',

          occurred_at:
            '2026-08-05T21:55:00.000Z',

          observed_at:
            '2026-08-05T21:55:02.000Z',

          content_type:
            'text',

          text_content:
            'Antes da demonstração, preciso saber quanto custa a Yolen. Hoje meu orçamento é de até R$ 300 por mês.',

          audio_transcription:
            null,
        },
      ],
    }

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const diagnostic =
      buildValidDiagnostic({
        commercial_role: {
          external_contact_role:
            'buyer',

          evidence_message_ids: [
            '13',
          ],
        },

        customer_intent: {
          summary:
            'O cliente quer conhecer a Yolen e participar da demonstração.',

          evidence_message_ids: [
            '10',
            '11',
          ],
        },

        unanswered_questions: [],

        guidance: {
          intervention_required:
            true,

          next_move:
            'Confirmar novamente a demonstração de amanhã às 15h.',

          recommended_question:
            'Posso confirmar a demonstração de amanhã às 15h?',

          suggested_message:
            'Sua demonstração está confirmada para amanhã às 15h.',
        },

        crm_suggestion: {
          should_change_crm_stage:
            true,

          recommended_status:
            'negociacao',

          next_action_required:
            true,

          expected_next_action_at:
            '2026-08-06T15:00:00.000Z',

          prohibited_statuses: [
            'ganho',
            'perdido',
          ],

          requires_human_confirmation:
            true,
        },

        evidence_message_ids: [
          '10',
          '11',
        ],
      })

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key:
            'test-key',

          fetch_impl:
            async () =>
              jsonResponse(
                buildProviderResponse(
                  diagnostic,
                ),
              ),
        },
      })

    assert.equal(
      result.diagnostic
        .unanswered_questions
        .length,
      1,
    )

    assert.match(
      result.diagnostic
        .unanswered_questions[0]
        .summary,
      /R\$ 300 por mês/,
    )

    assert.deepEqual(
      result.diagnostic
        .unanswered_questions[0]
        .evidence_message_ids,
      [
        '13',
      ],
    )

    assert.equal(
      result.diagnostic
        .guidance
        .intervention_required,
      true,
    )

    assert.match(
      result.diagnostic
        .guidance
        .next_move,
      /Responder primeiro à pergunta sobre preço/,
    )

    assert.equal(
      result.diagnostic
        .guidance
        .recommended_question,
      null,
    )

    assert.equal(
      result.diagnostic
        .guidance
        .suggested_message,
      null,
    )

    assert.equal(
      result.diagnostic
        .crm_suggestion
        .recommended_status,
      'negociacao',
    )

    assert.equal(
      result.diagnostic
        .crm_suggestion
        .expected_next_action_at,
      '2026-08-06T18:00:00.000Z',
    )
  },
)

test(
  'converte o horário confirmado usando a mesma regra da Agenda',
  async () => {
    const input =
      buildInput()

    input.reference_time =
      '2026-08-05T06:30:00.000Z'

    input.conversation = {
      ...input.conversation,

      active_message_ids: [
        '10',
        '11',
        '12',
      ],

      messages: [
        {
          id:
            '10',

          message_key:
            'message-old',

          version:
            1,

          sequence:
            10,

          direction:
            'incoming',

          occurred_at:
            '2026-08-04T14:00:00.000Z',

          observed_at:
            '2026-08-04T14:00:02.000Z',

          content_type:
            'text',

          text_content:
            'Pode ser amanhã às 10h.',

          audio_transcription:
            null,
        },

        {
          id:
            '11',

          message_key:
            'message-proposal',

          version:
            1,

          sequence:
            11,

          direction:
            'outgoing',

          occurred_at:
            '2026-08-05T04:35:00.000Z',

          observed_at:
            '2026-08-05T04:35:02.000Z',

          content_type:
            'text',

          text_content:
            'Posso deixar a demonstração para amanhã às 14h?',

          audio_transcription:
            null,
        },

        {
          id:
            '12',

          message_key:
            'message-confirmation',

          version:
            1,

          sequence:
            12,

          direction:
            'incoming',

          occurred_at:
            '2026-08-05T04:40:00.000Z',

          observed_at:
            '2026-08-05T04:40:02.000Z',

          content_type:
            'text',

          text_content:
            'Funciona. Pode deixar agendado para amanhã às 15h.',

          audio_transcription:
            null,
        },
      ],
    }

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const diagnostic =
      buildValidDiagnostic({
        commercial_role: {
          external_contact_role:
            'buyer',

          evidence_message_ids: [
            '12',
          ],
        },

        customer_intent: {
          summary:
            'O cliente confirmou a demonstração.',

          evidence_message_ids: [
            '12',
          ],
        },

        crm_suggestion: {
          should_change_crm_stage:
            true,

          recommended_status:
            'negociacao',

          next_action_required:
            true,

          expected_next_action_at:
            '2026-08-06T15:00:00.000Z',

          prohibited_statuses: [
            'ganho',
            'perdido',
          ],

          requires_human_confirmation:
            true,
        },

        evidence_message_ids: [
          '12',
        ],
      })

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key:
            'test-key',

          fetch_impl:
            async () =>
              jsonResponse(
                buildProviderResponse(
                  diagnostic,
                ),
              ),
        },
      })

    assert.equal(
      result.diagnostic
        .crm_suggestion
        .expected_next_action_at,

      '2026-08-06T18:00:00.000Z',
    )
  },
)

test(
  'rebaixa adequação conclusiva sem evidência para desconhecida',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const diagnostic =
      buildValidDiagnostic({
        solution_fit: {
          status:
            'fit',

          rationale:
            'A solução atende à necessidade informada.',

          evidence_message_ids: [],
        },
      })

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key:
            'test-key',

          fetch_impl:
            async () =>
              jsonResponse(
                buildProviderResponse(
                  diagnostic,
                ),
              ),
        },
      })

    assert.deepEqual(
      result.diagnostic
        .solution_fit,
      {
        status:
          'unknown',

        rationale:
          null,

        evidence_message_ids: [],
      },
    )
  },
)

test(
  'converte sequência única em ID canônico de evidência',
  async () => {
    const input =
      buildInput()

    input.conversation = {
      ...input.conversation,

      active_message_ids: [
        '11',
      ],

      messages:
        input.conversation
          .messages
          .map(
            (message) => ({
              ...message,

              id:
                '11',

              sequence:
                1,
            }),
          ),
    }

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const diagnostic =
      buildValidDiagnostic({
        commercial_role: {
          external_contact_role:
            'buyer',

          evidence_message_ids: [
            '1',
          ],
        },

        customer_intent: {
          summary:
            'O contato quer conhecer a solução.',

          evidence_message_ids: [
            '1',
          ],
        },

        solution_fit: {
          status:
            'fit',

          rationale:
            'A necessidade informada é atendida pela solução configurada.',

          evidence_message_ids: [
            '1',
          ],
        },

        evidence_message_ids: [
          '1',
        ],
      })

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key:
            'test-key',

          fetch_impl:
            async () =>
              jsonResponse(
                buildProviderResponse(
                  diagnostic,
                ),
              ),
        },
      })

    assert.deepEqual(
      result.diagnostic
        .customer_intent
        .evidence_message_ids,
      [
        '11',
      ],
    )

    assert.deepEqual(
      result.diagnostic
        .solution_fit
        .evidence_message_ids,
      [
        '11',
      ],
    )

    assert.deepEqual(
      result.diagnostic
        .evidence_message_ids,
      [
        '11',
      ],
    )
  },
)

test(
  'aceita provider somente com todos os blocos comerciais desativados',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const providerDiagnostic =
      buildValidDiagnostic({
        commercial_role: {
          external_contact_role:
            'provider',

          evidence_message_ids: [
            '1',
          ],
        },

        commercial_relevance:
          'non_commercial',

        customer_intent:
          null,
      })

    const result =
      await executeCompanionDiagnosticPlan({
        plan,
        input,

        options: {
          api_key:
            'test-key',

          fetch_impl:
            async () =>
              jsonResponse(
                buildProviderResponse(
                  providerDiagnostic,
                ),
              ),
        },
      })

    assert.equal(
      result.diagnostic
        .commercial_relevance,
      'non_commercial',
    )

    assert.equal(
      'commercial_role' in
        result.diagnostic,
      false,
    )

    assert.equal(
      result.diagnostic
        .crm_suggestion
        .should_change_crm_stage,
      false,
    )
  },
)

test(
  'rejeita provider tratado como comprador comercial',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const invalidDiagnostic =
      buildValidDiagnostic({
        commercial_role: {
          external_contact_role:
            'provider',

          evidence_message_ids: [
            '1',
          ],
        },
      })

    await assert.rejects(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'test-key',

            fetch_impl:
              async () =>
                jsonResponse(
                  buildProviderResponse(
                    invalidDiagnostic,
                  ),
                ),
          },
        }),

      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticModelError,
        )

        assert.equal(
          error.code,
          'INVALID_MODEL_OUTPUT',
        )

        assert.equal(
          error.details
            ?.contract_error_path,
          'commercial_relevance',
        )

        return true
      },
    )
  },
)

test(
  'rejeita papel desconhecido com confiança ou CRM conclusivos',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const invalidDiagnostic =
      buildValidDiagnostic({
        commercial_role: {
          external_contact_role:
            'unknown',

          evidence_message_ids: [],
        },

        commercial_relevance:
          'uncertain',
      })

    await assert.rejects(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'test-key',

            fetch_impl:
              async () =>
                jsonResponse(
                  buildProviderResponse(
                    invalidDiagnostic,
                  ),
                ),
          },
        }),

      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticModelError,
        )

        assert.equal(
          error.code,
          'INVALID_MODEL_OUTPUT',
        )

        assert.equal(
          error.details
            ?.contract_error_path,
          'analysis_status',
        )

        return true
      },
    )
  },
)

test(
  'rejeita conteúdo do modelo que não seja JSON',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    await assertModelError(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'test-key',

            fetch_impl:
              async () =>
                jsonResponse({
                  choices: [
                    {
                      message: {
                        content:
                          'diagnóstico sem JSON',
                      },
                    },
                  ],
                }),
          },
        }),

      'INVALID_MODEL_JSON',
    )
  },
)

test(
  'rejeita diagnóstico que utiliza evidência inexistente',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const invalidDiagnostic =
      buildValidDiagnostic({
        customer_intent: {
          summary:
            'Conclusão inválida.',

          evidence_message_ids: [
            '999',
          ],
        },
      })

    await assertModelError(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'test-key',

            fetch_impl:
              async () =>
                jsonResponse(
                  buildProviderResponse(
                    invalidDiagnostic,
                  ),
                ),
          },
        }),

      'INVALID_MODEL_OUTPUT',
    )
  },
)

test(
  'classifica limite do provedor como falha repetível',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    await assert.rejects(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'token-nao-pode-aparecer',

            fetch_impl:
              async () =>
                jsonResponse(
                  {
                    error: {
                      message:
                        'segredo-interno-do-provedor',
                    },
                  },
                  {
                    status: 429,
                  },
                ),
          },
        }),

      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticModelError,
        )

        assert.equal(
          error.code,
          'MODEL_RATE_LIMITED',
        )

        assert.equal(
          error.status_code,
          429,
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'token-nao-pode-aparecer',
          ),
          false,
        )

        assert.equal(
          error.message.includes(
            'segredo-interno-do-provedor',
          ),
          false,
        )

        assert.equal(
          error.message,
          'O provedor atingiu o limite temporário de solicitações.',
        )

        assert.deepEqual(
          error.details,
          {
            provider_status:
              429,
          },
        )

        return true
      },
    )
  },
)

test(
  'classifica falha de leitura sem expor conteúdo interno da resposta',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    await assert.rejects(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'test-key',

            fetch_impl:
              async () => ({
                ok: true,
                status: 200,

                headers:
                  new Headers(),

                async text() {
                  throw new Error(
                    'conteúdo interno da resposta',
                  )
                },
              }),
          },
        }),

      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticModelError,
        )

        assert.equal(
          error.code,
          'MODEL_RESPONSE_READ_FAILED',
        )

        assert.equal(
          error.status_code,
          502,
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'conteúdo interno da resposta',
          ),
          false,
        )

        assert.deepEqual(
          error.details,
          {
            provider_status:
              200,
          },
        )

        return true
      },
    )
  },
)

test(
  'classifica falha de rede sem expor detalhes internos',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    await assert.rejects(
      () =>
        executeCompanionDiagnosticPlan({
          plan,
          input,

          options: {
            api_key:
              'test-key',

            fetch_impl:
              async () => {
                throw new Error(
                  'socket interno',
                )
              },
          },
        }),

      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticModelError,
        )

        assert.equal(
          error.code,
          'MODEL_NETWORK_ERROR',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'socket interno',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'rejeita plano incompatível com entrada bloqueada',
  async () => {
    const readyInput =
      buildInput()

    const modelPlan =
      buildCompanionDiagnosticExecutionPlan(
        readyInput,
      )

    const blockedInput =
      buildInput({
        analysis_precondition: {
          status:
            'blocked',

          limitations: [
            'conversation_context_insufficient',
          ],
        },
      })

    await assertModelError(
      () =>
        executeCompanionDiagnosticPlan({
          plan:
            modelPlan,

          input:
            blockedInput,

          options: {
            api_key:
              'test-key',
          },
        }),

      'EXECUTION_PLAN_MISMATCH',
    )
  },
)

test(
  'não modifica a entrada nem o plano durante a execução',
  async () => {
    const input =
      buildInput()

    const plan =
      buildCompanionDiagnosticExecutionPlan(
        input,
      )

    const originalInput =
      structuredClone(
        input,
      )

    const originalPlan =
      structuredClone(
        plan,
      )

    await executeCompanionDiagnosticPlan({
      plan,
      input,

      options: {
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            jsonResponse(
              buildProviderResponse(
                buildValidDiagnostic(),
              ),
            ),
      },
    })

    assert.deepEqual(
      input,
      originalInput,
    )

    assert.deepEqual(
      plan,
      originalPlan,
    )
  },
)
